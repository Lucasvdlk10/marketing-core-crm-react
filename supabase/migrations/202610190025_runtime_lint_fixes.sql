-- Runtime lint corrections discovered against staging.
begin;
create or replace function public.core_accept_my_pending_invitations()
returns uuid[] language plpgsql security definer set search_path='' as $$
declare
 verified_email text; inv public.core_invitations%rowtype; max_users int; accepted_workspaces uuid[]='{}'::uuid[];
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if verified_email is null then raise exception 'Verified email required' using errcode='42501'; end if;
 for inv in
  select invitation.* from public.core_invitations invitation
   where invitation.status='pending' and invitation.expires_at>now() and lower(invitation.email)=verified_email
   order by invitation.created_at
   for update
 loop
  perform 1 from public.core_workspaces where id=inv.workspace_id and state='active' for update;
  if not found then continue; end if;
  if exists(select 1 from public.core_memberships where workspace_id=inv.workspace_id and user_id=auth.uid() and active) then
   update public.core_invitations set status='accepted',accepted_by=auth.uid(),accepted_at=now() where id=inv.id;
   accepted_workspaces=pg_catalog.array_append(accepted_workspaces,inv.workspace_id);
   continue;
  end if;
  select max_members into max_users from public.core_workspaces where id=inv.workspace_id;
  if (select count(*) from public.core_memberships where workspace_id=inv.workspace_id and active)>=max_users then continue; end if;
  insert into public.core_memberships(workspace_id,user_id,role,active) values(inv.workspace_id,auth.uid(),inv.role,true)
  on conflict(workspace_id,user_id) do update set role=excluded.role,active=true;
  update public.core_invitations set status='accepted',accepted_by=auth.uid(),accepted_at=now() where id=inv.id;
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata)
  values(auth.uid(),'invitation_accepted',inv.workspace_id,pg_catalog.jsonb_build_object('invitation_id',inv.id,'automatic',true));
  accepted_workspaces=pg_catalog.array_append(accepted_workspaces,inv.workspace_id);
 end loop;
 return accepted_workspaces;
end $$;
create or replace function public.core_automation_graph_v1_valid(g jsonb) returns boolean
language plpgsql stable set search_path='' as $fn$
declare n jsonb; e jsonb; ids text[] := '{}'::text[]; edge_ids text[] := '{}'::text[]; pairs text[] := '{}'::text[];
 trigger_id text; trigger_count integer := 0; action_count integer := 0; reached integer := 0; x numeric; y numeric;
begin
 if jsonb_typeof(g)<>'object' or (select count(*) from pg_catalog.jsonb_object_keys(g))<>3
  or not(g?'schema_version' and g?'nodes' and g?'edges') or g->>'schema_version'<>'1' then return false; end if;
 if jsonb_typeof(g->'nodes')<>'array' or jsonb_typeof(g->'edges')<>'array'
  or jsonb_array_length(g->'nodes') not between 2 and 35
  or jsonb_array_length(g->'edges')<>jsonb_array_length(g->'nodes')-1
  or pg_catalog.octet_length(g::text)>65536 then return false; end if;
 for n in select value from pg_catalog.jsonb_array_elements(g->'nodes') loop
  if jsonb_typeof(n)<>'object' or (select count(*) from pg_catalog.jsonb_object_keys(n))<>5
   or not(n?'id' and n?'type' and n?'subtype' and n?'position' and n?'config') then return false; end if;
  if pg_catalog.length(n->>'id') not between 1 and 90 or n->>'id'=any(ids)
   or jsonb_typeof(n->'position')<>'object' or jsonb_typeof(n->'config')<>'object' then return false; end if;
  begin x=(n->'position'->>'x')::numeric; y=(n->'position'->>'y')::numeric; exception when others then return false; end;
  if x::text in('NaN','Infinity','-Infinity') or y::text in('NaN','Infinity','-Infinity') or abs(x)>100000 or abs(y)>100000 then return false; end if;
  if n->>'type'='trigger' and n->>'subtype'=any(array['LEAD_CREATED','WEBHOOK_RECEIVED','STAGE_CHANGED','DEAL_LOST']) then trigger_count=trigger_count+1; trigger_id=n->>'id';
  elsif n->>'type'='condition' and n->>'subtype'=any(array['SOURCE_EQUALS','CAMPAIGN_EQUALS','STAGE_EQUALS']) then null;
  elsif n->>'type'='action' and n->>'subtype'=any(array['CREATE_TASK','CREATE_FOLLOWUP','COMPLETE_TASKS','DISTRIBUTE_LEAD','ADD_TO_SEGMENT_LIST','NOTIFY_USER']) then action_count=action_count+1;
  else return false; end if;
  ids=array_append(ids,n->>'id');
 end loop;
 if trigger_count<>1 or action_count<1 then return false; end if;
 for e in select value from pg_catalog.jsonb_array_elements(g->'edges') loop
  if jsonb_typeof(e)<>'object' or (select count(*) from pg_catalog.jsonb_object_keys(e))<>3 or not(e?'id' and e?'source' and e?'target') then return false; end if;
  if pg_catalog.length(e->>'id') not between 1 and 90 or e->>'id'=any(edge_ids)
   or not(e->>'source'=any(ids) and e->>'target'=any(ids)) or e->>'source'=e->>'target' then return false; end if;
  if jsonb_build_array(e->>'source',e->>'target')::text=any(pairs) then return false; end if;
  edge_ids=array_append(edge_ids,e->>'id'); pairs=array_append(pairs,jsonb_build_array(e->>'source',e->>'target')::text);
 end loop;
 -- A linear graph has no joins/forks, trigger indegree zero, and all others indegree one.
 if exists(select 1 from unnest(ids) id where
   (id=trigger_id and (select count(*) from jsonb_array_elements(g->'edges') z where z->>'target'=id)<>0)
   or (id<>trigger_id and (select count(*) from jsonb_array_elements(g->'edges') z where z->>'target'=id)<>1)
   or (select count(*) from jsonb_array_elements(g->'edges') z where z->>'source'=id)>1) then return false; end if;
 select count(distinct id) into reached from (with recursive walk(id) as (
  select trigger_id union select edge->>'target' from walk w cross join lateral jsonb_array_elements(g->'edges') edge where edge->>'source'=w.id
 ) select id from walk) q;
 return reached=cardinality(ids);
exception when others then return false;
end $fn$;
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
   encode(extensions.digest((x.ord::text||':'||x.v::text)::bytea,'sha256'),'hex')
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
commit;
