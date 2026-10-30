-- P3 forward repair: owner/requester authorization, durable imports, immutable report snapshots.
begin;
-- Private durable payload; only service routines can read it.
create table if not exists public.core_import_payloads(
  job_id uuid primary key references public.core_import_jobs(id) on delete cascade,
  workspace_id uuid not null,
  rows jsonb not null check(jsonb_typeof(rows)='array' and jsonb_array_length(rows) between 1 and 2000 and octet_length(rows::text)<=2097152),
  next_row integer not null default 0 check(next_row>=0), attempts integer not null default 0 check(attempts>=0),
  lease_until timestamptz, worker_id uuid, last_error text,
  foreign key(workspace_id,job_id) references public.core_import_jobs(workspace_id,id) on delete cascade
);
alter table public.core_import_payloads enable row level security;
revoke all on public.core_import_payloads from public,anon,authenticated;
grant select,insert,update,delete on public.core_import_payloads to service_role;
alter table public.core_import_jobs add column if not exists lease_until timestamptz;
alter table public.core_import_jobs add column if not exists worker_id uuid;
alter table public.core_import_jobs add column if not exists attempts integer not null default 0;
alter table public.core_import_jobs add column if not exists last_error text;
-- Old idempotency omitted the requester and could disclose another user's job id.
do $drop$ declare c text; begin
 select conname into c from pg_constraint where conrelid='public.core_import_jobs'::regclass and contype='u'
 and pg_get_constraintdef(oid) ilike '%source_digest%' and pg_get_constraintdef(oid) ilike '%mapping_hash%' limit 1;
 if c is not null then execute format('alter table public.core_import_jobs drop constraint %I',c); end if;
end $drop$;
create unique index if not exists core_import_jobs_requester_idempotency
 on public.core_import_jobs(workspace_id,requested_by,source_digest,mapping_hash,duplicate_policy,commit_policy);
create index if not exists core_import_jobs_worker_claim on public.core_import_jobs(created_at,id)
 where status in('UPLOADED','PARSING','READY','COMMITTING');
create or replace function public.core_job_owner_or_admin(w uuid,requester uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and (auth.uid()=requester or public.core_is_super_admin() or exists(
   select 1 from public.core_memberships m where m.workspace_id=w and m.user_id=auth.uid() and m.active and m.role in('owner','admin')))
$$;
revoke all on function public.core_job_owner_or_admin(uuid,uuid) from public,anon;
grant execute on function public.core_job_owner_or_admin(uuid,uuid) to authenticated;
-- Server-derived digests are supplied by the Edge function after canonicalization; rows are persisted atomically with the job.
create or replace function public.core_import_enqueue(p_workspace uuid,p_source_digest text,p_source_bytes bigint,p_mapping_hash text,p_duplicate_policy text,p_commit_policy text,p_confirm_partial boolean,p_rows jsonb)
returns uuid language plpgsql security invoker set search_path='' as $fn$
declare job_id uuid;
begin
 if auth.uid() is null or not public.core_has_permission(p_workspace,'contacts.write') then raise exception 'Permission denied' using errcode='42501'; end if;
 if p_source_digest !~ '^[a-f0-9]{64}$' or p_mapping_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid server digest' using errcode='22023'; end if;
 if p_source_bytes not between 1 and 2097152 or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 2000 or octet_length(p_rows::text)>2097152 then raise exception 'Payload too large or empty' using errcode='22023'; end if;
 if p_duplicate_policy not in('SKIP','UPDATE') or p_commit_policy not in('ATOMIC','PARTIAL') or (p_commit_policy='PARTIAL' and not p_confirm_partial) then raise exception 'Invalid import policy' using errcode='22023'; end if;
 select id into job_id from public.core_import_jobs where workspace_id=p_workspace and requested_by=auth.uid() and source_digest=p_source_digest and mapping_hash=p_mapping_hash and duplicate_policy=p_duplicate_policy and commit_policy=p_commit_policy;
 if job_id is not null then return job_id; end if;
 insert into public.core_import_jobs(workspace_id,requested_by,source_digest,source_bytes,source_type,parser_version,mapping_hash,duplicate_policy,commit_policy,partial_confirmed)
 values(p_workspace,auth.uid(),p_source_digest,p_source_bytes,'CSV','edge-csv-v2',p_mapping_hash,p_duplicate_policy,p_commit_policy,p_confirm_partial) returning id into job_id;
 insert into public.core_import_payloads(job_id,workspace_id,rows) values(job_id,p_workspace,p_rows);
 return job_id;
exception when unique_violation then
 select id into job_id from public.core_import_jobs where workspace_id=p_workspace and requested_by=auth.uid() and source_digest=p_source_digest and mapping_hash=p_mapping_hash and duplicate_policy=p_duplicate_policy and commit_policy=p_commit_policy;
 return job_id;
end $fn$;
create or replace function public.core_import_claim(p_worker_id uuid) returns uuid
language plpgsql security definer set search_path='' as $fn$
declare claimed uuid;
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 with candidate as (select j.id from public.core_import_jobs j where j.status in('UPLOADED','PARSING') and (j.lease_until is null or j.lease_until<now()) and j.attempts<8 order by j.created_at,j.id for update skip locked limit 1)
 update public.core_import_jobs j set status='PARSING',worker_id=p_worker_id,lease_until=now()+interval '2 minutes',attempts=attempts+1,updated_at=now() from candidate c where j.id=c.id returning j.id into claimed;
 return claimed;
end $fn$;
-- One bounded set-based staging call replaces per-row RPCs and is retry-safe by (job,row).
create or replace function public.core_import_process_batch(p_job_id uuid,p_worker_id uuid,p_batch_size integer default 200) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare j public.core_import_jobs%rowtype; p public.core_import_payloads%rowtype; total integer; stop_at integer; rejected integer;
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 if p_batch_size not between 1 and 500 then raise exception 'Invalid batch size'; end if;
 select * into j from public.core_import_jobs where id=p_job_id and status='PARSING' and worker_id=p_worker_id and lease_until>now() for update;
 if not found then raise exception 'Import lease lost' using errcode='55000'; end if;
 select * into p from public.core_import_payloads where job_id=p_job_id for update; total=jsonb_array_length(p.rows); stop_at=least(total,p.next_row+p_batch_size);
 insert into public.core_import_rows(workspace_id,job_id,source_row,normalized_data,validation_status,error_codes,row_digest)
 select j.workspace_id,j.id,x.ord,
   jsonb_build_object('name',btrim(coalesce(x.v->>'name','')),'email',lower(btrim(coalesce(x.v->>'email',''))),'phone',btrim(coalesce(x.v->>'phone','')),'company',btrim(coalesce(x.v->>'company',''))),
   case when btrim(coalesce(x.v->>'name',''))='' and btrim(coalesce(x.v->>'email',''))='' and btrim(coalesce(x.v->>'phone',''))='' and btrim(coalesce(x.v->>'company',''))='' then 'BLANK'
        when btrim(coalesce(x.v->>'name',''))='' or (btrim(coalesce(x.v->>'email',''))='' and btrim(coalesce(x.v->>'phone',''))='') or (btrim(coalesce(x.v->>'email',''))<>'' and btrim(x.v->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then 'REJECTED' else 'VALID' end,
   case when btrim(coalesce(x.v->>'name',''))='' and btrim(coalesce(x.v->>'email',''))='' and btrim(coalesce(x.v->>'phone',''))='' and btrim(coalesce(x.v->>'company',''))='' then array['BLANK_ROW']::text[]
        when btrim(coalesce(x.v->>'name',''))='' then array['NAME_REQUIRED']::text[]
        when btrim(coalesce(x.v->>'email',''))='' and btrim(coalesce(x.v->>'phone',''))='' then array['CONTACT_REQUIRED']::text[]
        when btrim(coalesce(x.v->>'email',''))<>'' and btrim(x.v->>'email') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then array['EMAIL_INVALID']::text[] else '{}'::text[] end,
   encode(digest((x.ord::text||':'||x.v::text)::bytea,'sha256'),'hex')
 from jsonb_array_elements(p.rows) with ordinality x(v,ord) where x.ord>p.next_row and x.ord<=stop_at
 on conflict(job_id,source_row) do update set normalized_data=excluded.normalized_data,validation_status=excluded.validation_status,error_codes=excluded.error_codes,row_digest=excluded.row_digest;
 update public.core_import_payloads set next_row=stop_at,lease_until=j.lease_until,worker_id=p_worker_id where job_id=j.id;
 update public.core_import_jobs set lease_until=now()+interval '2 minutes',updated_at=now() where id=j.id;
 if stop_at<total then return jsonb_build_object('done',false,'processed',stop_at,'total',total); end if;
 select count(*) into rejected from public.core_import_rows where job_id=j.id and validation_status='REJECTED';
 if j.commit_policy='ATOMIC' and rejected>0 then perform public.core_import_worker_reject(j.id);
 else perform public.core_import_worker_ready(j.id,total); perform public.core_import_commit(j.id); end if;
 delete from public.core_import_payloads where job_id=j.id;
 return jsonb_build_object('done',true,'processed',total,'total',total);
end $fn$;
-- Materialized rows make the export immutable even when source rows are later updated/deleted.
create table if not exists public.core_report_snapshot_rows(
 job_id uuid not null references public.core_report_jobs(id) on delete cascade, workspace_id uuid not null,
 ordinal bigint not null check(ordinal>0), row_data jsonb not null check(jsonb_typeof(row_data)='object'),
 primary key(job_id,ordinal), foreign key(workspace_id,job_id) references public.core_report_jobs(workspace_id,id) on delete cascade
);
create table if not exists public.core_report_parts(
 job_id uuid not null references public.core_report_jobs(id) on delete cascade, part_no integer not null check(part_no>0),
 artifact_path text not null, artifact_bytes bigint not null check(artifact_bytes>0), artifact_sha256 text not null check(artifact_sha256~'^[a-f0-9]{64}$'), row_count integer not null check(row_count>=0),
 primary key(job_id,part_no), unique(artifact_path)
);
alter table public.core_report_snapshot_rows enable row level security;
alter table public.core_report_parts enable row level security;
revoke all on public.core_report_snapshot_rows,public.core_report_parts from public,anon,authenticated;
grant select,insert,update,delete on public.core_report_snapshot_rows,public.core_report_parts to service_role;
create or replace function public.core_report_create(p_workspace uuid,p_kind text,p_format text,p_filters jsonb,p_filter_hash text)
returns uuid language plpgsql security invoker set search_path='' as $fn$
declare v_job_id uuid; snap timestamptz:=clock_timestamp(); expected bigint;
begin
 if auth.uid() is null or not public.core_has_permission(p_workspace,'reports.read') or not exists(select 1 from public.core_memberships where workspace_id=p_workspace and user_id=auth.uid() and active and role<>'viewer') then raise exception 'Export permission denied' using errcode='42501'; end if;
 if p_kind not in('contacts','deals','tasks') or p_format<>'CSV' or coalesce(p_filters,'{}')<>'{}'::jsonb then raise exception 'Unsupported report request' using errcode='22023'; end if;
 insert into public.core_report_jobs(workspace_id,requested_by,report_kind,format,filters,filter_hash,snapshot_at,expected_row_count) values(p_workspace,auth.uid(),p_kind,'CSV','{}',p_filter_hash,snap,0) returning id into v_job_id;
 if p_kind='contacts' then insert into public.core_report_snapshot_rows(job_id,workspace_id,ordinal,row_data) select v_job_id,p_workspace,row_number() over(order by created_at desc,id desc),to_jsonb(x) from (select id,name,email,phone,company,source,campaign,status,owner_id,created_at from public.core_contacts where workspace_id=p_workspace) x;
 elsif p_kind='deals' then insert into public.core_report_snapshot_rows(job_id,workspace_id,ordinal,row_data) select v_job_id,p_workspace,row_number() over(order by created_at desc,id desc),to_jsonb(x) from (select id,name,value,status,owner_id,stage_id,pipeline_id,created_at from public.core_deals where workspace_id=p_workspace) x;
 else insert into public.core_report_snapshot_rows(job_id,workspace_id,ordinal,row_data) select v_job_id,p_workspace,row_number() over(order by created_at desc,id desc),to_jsonb(x) from (select id,title,priority,status,assigned_to,due_at,created_at from public.core_tasks where workspace_id=p_workspace) x; end if;
 select count(*) into expected from public.core_report_snapshot_rows r where r.job_id=v_job_id;
 update public.core_report_jobs set expected_row_count=expected where id=v_job_id; return v_job_id;
end $fn$;
create or replace function public.core_report_claim(p_worker_id uuid,p_limit integer default 10) returns setof public.core_report_jobs
language plpgsql security definer set search_path='' as $fn$
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 return query with jobs as (
  select id from public.core_report_jobs where (status='QUEUED' or (status='PROCESSING' and lease_until<now()))
  order by created_at,id for update skip locked limit greatest(1,least(coalesce(p_limit,10),25))
 ) update public.core_report_jobs j set status='PROCESSING',worker_id=p_worker_id,lease_until=now()+interval '2 minutes'
 from jobs where j.id=jobs.id returning j.*;
end $fn$;
create or replace function public.core_report_next_part(p_job_id uuid,p_worker_id uuid,p_page_size integer default 1000) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare j public.core_report_jobs%rowtype; start_at bigint; result jsonb;
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 if p_page_size not between 1 and 2000 then raise exception 'Invalid page size'; end if;
 select * into j from public.core_report_jobs where id=p_job_id and status='PROCESSING' and worker_id=p_worker_id and lease_until>now() for update;
 if not found then raise exception 'Report lease lost' using errcode='55000'; end if;
 start_at=j.emitted_row_count;
 select coalesce(jsonb_agg(row_data order by ordinal),'[]') into result from (select ordinal,row_data from public.core_report_snapshot_rows where job_id=j.id and ordinal>start_at order by ordinal limit p_page_size) s;
 update public.core_report_jobs set lease_until=now()+interval '2 minutes' where id=j.id;
 return jsonb_build_object('job_id',j.id,'workspace_id',j.workspace_id,'kind',j.report_kind,'part_no',j.page_count+1,'offset',start_at,'total',j.expected_row_count,'rows',result);
end $fn$;
create or replace function public.core_report_checkpoint_part(p_job_id uuid,p_worker_id uuid,p_part_no integer,p_rows integer,p_path text,p_bytes bigint,p_sha256 text) returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare j public.core_report_jobs%rowtype; done boolean;
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 select * into j from public.core_report_jobs where id=p_job_id and status='PROCESSING' and worker_id=p_worker_id and lease_until>now() for update;
 if not found or p_part_no<>j.page_count+1 or p_rows<0 or j.emitted_row_count+p_rows>j.expected_row_count then raise exception 'Invalid report checkpoint' using errcode='23514'; end if;
 insert into public.core_report_parts values(j.id,p_part_no,p_path,p_bytes,p_sha256,p_rows) on conflict(job_id,part_no) do nothing;
 update public.core_report_jobs set emitted_row_count=emitted_row_count+p_rows,page_count=page_count+1,lease_until=now()+interval '2 minutes' where id=j.id;
 done=(j.emitted_row_count+p_rows=j.expected_row_count);
 if done then update public.core_report_jobs set status='COMPLETED',artifact_path=null,artifact_bytes=(select sum(artifact_bytes) from public.core_report_parts where job_id=j.id),artifact_sha256=null,
 manifest=jsonb_build_object('schema_version',2,'snapshot','materialized','expected_row_count',j.expected_row_count,'parts',(select jsonb_agg(jsonb_build_object('part_no',part_no,'path',artifact_path,'bytes',artifact_bytes,'sha256',artifact_sha256,'row_count',row_count) order by part_no) from public.core_report_parts where job_id=j.id)),completed_at=now(),lease_until=null where id=j.id;
 end if;
 return jsonb_build_object('done',done,'emitted',j.emitted_row_count+p_rows,'total',j.expected_row_count);
end $fn$;
-- Requester-only by default; owners/admins can supervise. Viewers never export or download.
drop policy if exists core_report_jobs_read on public.core_report_jobs;
create policy core_report_jobs_read on public.core_report_jobs for select to authenticated using(public.core_job_owner_or_admin(workspace_id,requested_by));
drop policy if exists core_import_jobs_read on public.core_import_jobs;
create policy core_import_jobs_read on public.core_import_jobs for select to authenticated using(public.core_job_owner_or_admin(workspace_id,requested_by));
drop policy if exists core_import_rows_read on public.core_import_rows;
create policy core_import_rows_read on public.core_import_rows for select to authenticated using(exists(select 1 from public.core_import_jobs j where j.id=job_id and public.core_job_owner_or_admin(j.workspace_id,j.requested_by)));
drop policy if exists core_import_receipts_read on public.core_import_row_receipts;
create policy core_import_receipts_read on public.core_import_row_receipts for select to authenticated using(exists(select 1 from public.core_import_jobs j where j.id=job_id and public.core_job_owner_or_admin(j.workspace_id,j.requested_by)));
create or replace function public.core_report_job_status(p_job_id uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare j public.core_report_jobs%rowtype; begin select * into j from public.core_report_jobs where id=p_job_id; if not found or not public.core_job_owner_or_admin(j.workspace_id,j.requested_by) then raise exception 'Permission denied' using errcode='42501'; end if; return jsonb_build_object('id',j.id,'workspace_id',j.workspace_id,'status',j.status,'expected_row_count',j.expected_row_count,'emitted_row_count',j.emitted_row_count,'page_count',j.page_count,'manifest',j.manifest,'created_at',j.created_at,'completed_at',j.completed_at); end $fn$;
create or replace function public.core_report_download_authorize(p_job_id uuid) returns jsonb language plpgsql stable security invoker set search_path='' as $fn$
declare j public.core_report_jobs%rowtype; begin select * into j from public.core_report_jobs where id=p_job_id and status='COMPLETED'; if not found or not public.core_job_owner_or_admin(j.workspace_id,j.requested_by) or exists(select 1 from public.core_memberships where workspace_id=j.workspace_id and user_id=auth.uid() and active and role='viewer') then raise exception 'Permission denied' using errcode='42501'; end if; return jsonb_build_object('workspace_id',j.workspace_id,'row_count',j.emitted_row_count,'parts',(select jsonb_agg(jsonb_build_object('path',artifact_path,'sha256',artifact_sha256,'byte_count',artifact_bytes,'row_count',row_count) order by part_no) from public.core_report_parts where job_id=j.id)); end $fn$;
revoke all on function public.core_import_enqueue(uuid,text,bigint,text,text,text,boolean,jsonb),public.core_import_claim(uuid),public.core_import_process_batch(uuid,uuid,integer),public.core_report_next_part(uuid,uuid,integer),public.core_report_checkpoint_part(uuid,uuid,integer,integer,text,bigint,text) from public,anon,authenticated;
grant execute on function public.core_import_enqueue(uuid,text,bigint,text,text,text,boolean,jsonb) to authenticated;
grant execute on function public.core_import_claim(uuid),public.core_import_process_batch(uuid,uuid,integer),public.core_report_next_part(uuid,uuid,integer),public.core_report_checkpoint_part(uuid,uuid,integer,integer,text,bigint,text) to service_role;
commit;
