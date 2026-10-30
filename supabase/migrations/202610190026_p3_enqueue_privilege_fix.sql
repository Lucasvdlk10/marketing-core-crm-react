-- Allow authenticated enqueue/create RPCs to write private worker tables after in-function authorization.
begin;
create or replace function public.core_import_enqueue(p_workspace uuid,p_source_digest text,p_source_bytes bigint,p_mapping_hash text,p_duplicate_policy text,p_commit_policy text,p_confirm_partial boolean,p_rows jsonb)
returns uuid language plpgsql security definer set search_path='' as $fn$
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
create or replace function public.core_report_create(p_workspace uuid,p_kind text,p_format text,p_filters jsonb,p_filter_hash text)
returns uuid language plpgsql security definer set search_path='' as $fn$
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
commit;
