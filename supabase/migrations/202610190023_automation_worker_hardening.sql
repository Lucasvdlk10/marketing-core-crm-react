-- Harden automation worker ownership, graph semantics, and idempotent creates.
begin;
alter table public.core_tasks add column if not exists automation_execution_key text;
alter table public.core_notifications add column if not exists automation_execution_key text;
create unique index if not exists core_tasks_automation_execution_once
 on public.core_tasks(workspace_id,automation_execution_key) where automation_execution_key is not null;
create unique index if not exists core_notifications_automation_execution_once
 on public.core_notifications(workspace_id,automation_execution_key) where automation_execution_key is not null;
alter table public.core_automation_events drop constraint if exists core_automation_events_event_type_check;
alter table public.core_automation_events add constraint core_automation_events_event_type_check
 check(event_type=any(array['LEAD_CREATED','WEBHOOK_RECEIVED','STAGE_CHANGED','DEAL_LOST'])) not valid;
-- Publication is deliberately restricted to one linear path. The executor keeps
-- one condition state, so accepting a branching DAG would produce wrong results.
create or replace function public.core_automation_graph_v1_valid(g jsonb) returns boolean
language plpgsql immutable set search_path='' as $fn$
declare n jsonb; e jsonb; ids text[] := '{}'; edge_ids text[] := '{}'; pairs text[] := '{}';
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
-- Previously published non-linear/unsupported revisions cannot execute safely.
update public.core_automation_rules r set enabled=false,updated_at=now()
where r.enabled and r.active_revision_id is not null and exists(
 select 1 from public.core_automation_rule_revisions v
 where v.id=r.active_revision_id and v.workspace_id=r.workspace_id and not public.core_automation_graph_v1_valid(v.graph)
);
-- Remove callable legacy overloads before installing lease-bound contracts.
drop function if exists public.core_automation_match_active(uuid);
drop function if exists public.core_automation_authorize_action(uuid,uuid,text);
drop function if exists public.core_automation_record_action(uuid,uuid,text,text,text);
drop function if exists public.core_automation_finish(uuid,boolean,boolean,text);
create function public.core_automation_match_active(p_event_id uuid,p_worker_id uuid)
returns table(rule_id uuid,revision_id uuid,creator_id uuid,graph jsonb)
language plpgsql security definer set search_path='' as $fn$
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 return query select r.id,v.id,r.creator_id,v.graph from public.core_automation_events e
 join public.core_automation_rules r on r.workspace_id=e.workspace_id and r.enabled and r.active_revision_id is not null
 join public.core_automation_rule_revisions v on v.workspace_id=r.workspace_id and v.rule_id=r.id and v.id=r.active_revision_id
 where e.id=p_event_id and e.status='processing' and e.worker_id=p_worker_id and e.lease_until>now()
 and exists(select 1 from jsonb_array_elements(v.graph->'nodes') n where n->>'type'='trigger' and n->>'subtype'=e.event_type);
 if not found and not exists(select 1 from public.core_automation_events where id=p_event_id and status='processing' and worker_id=p_worker_id and lease_until>now())
  then raise exception 'Worker lease lost' using errcode='55000'; end if;
end $fn$;
create function public.core_automation_authorize_action(p_event_id uuid,p_worker_id uuid,p_revision_id uuid,p_node_id text) returns text
language plpgsql security definer set search_path='' as $fn$
declare e public.core_automation_events%rowtype; r public.core_automation_rules%rowtype; action_permission text; action_execution_key text;
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 select * into e from public.core_automation_events where id=p_event_id and status='processing' and worker_id=p_worker_id and lease_until>now() for update;
 if not found then raise exception 'Worker lease lost' using errcode='55000'; end if;
 select rule.* into r from public.core_automation_rule_revisions rev join public.core_automation_rules rule on rule.id=rev.rule_id and rule.workspace_id=rev.workspace_id
  where rev.id=p_revision_id and rev.workspace_id=e.workspace_id and rule.enabled and rule.active_revision_id=rev.id;
 if not found or not coalesce((select automation_enabled from public.core_automation_settings where workspace_id=e.workspace_id),false)
  then raise exception 'Automation disabled' using errcode='42501'; end if;
 action_permission=case (select n->>'subtype' from public.core_automation_rule_revisions rev cross join lateral jsonb_array_elements(rev.graph->'nodes') n where rev.id=p_revision_id and n->>'id'=p_node_id and n->>'type'='action')
  when 'CREATE_TASK' then 'tasks.write' when 'CREATE_FOLLOWUP' then 'tasks.write' when 'COMPLETE_TASKS' then 'tasks.write'
  when 'DISTRIBUTE_LEAD' then 'contacts.write' when 'ADD_TO_SEGMENT_LIST' then 'contacts.write' when 'NOTIFY_USER' then 'automations.write' else null end;
 if action_permission is null or r.creator_id is null or not exists(select 1 from public.core_memberships m where m.workspace_id=e.workspace_id and m.user_id=r.creator_id and m.active
  and (m.role in('owner','admin') or (public.core_role_ceiling(m.role,action_permission) and coalesce((select rp.enabled from public.core_role_permissions rp where rp.workspace_id=m.workspace_id and rp.role=m.role and rp.permission=action_permission),true))))
  then raise exception 'Rule creator lacks current action permission' using errcode='42501'; end if;
 action_execution_key=e.id::text||':'||p_revision_id::text||':'||p_node_id;
 insert into public.core_automation_action_executions(workspace_id,event_id,rule_revision_id,node_id,execution_key,status,attempts)
 values(e.workspace_id,e.id,p_revision_id,p_node_id,action_execution_key,'started',1)
 on conflict(workspace_id,execution_key) do update set status='started',attempts=public.core_automation_action_executions.attempts+1,error_code=null,finished_at=null
 where public.core_automation_action_executions.status in('failed','skipped_permission','skipped_disabled');
 return action_execution_key;
end $fn$;
create function public.core_automation_record_action(p_event_id uuid,p_worker_id uuid,p_revision_id uuid,p_node_id text,p_status text,p_error_code text default null)
returns void language plpgsql security definer set search_path='' as $fn$
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 if p_status not in('succeeded','failed','skipped_permission','skipped_disabled') then raise exception 'Invalid action status'; end if;
 update public.core_automation_action_executions x set status=p_status,error_code=left(p_error_code,80),finished_at=now()
 from public.core_automation_events e where x.event_id=p_event_id and x.rule_revision_id=p_revision_id and x.node_id=p_node_id
  and e.id=x.event_id and e.workspace_id=x.workspace_id and e.status='processing' and e.worker_id=p_worker_id and e.lease_until>now() and x.status='started';
 if not found and not exists(select 1 from public.core_automation_action_executions x join public.core_automation_events e on e.id=x.event_id and e.workspace_id=x.workspace_id
  where x.event_id=p_event_id and x.rule_revision_id=p_revision_id and x.node_id=p_node_id and x.status='succeeded'
   and e.status='processing' and e.worker_id=p_worker_id and e.lease_until>now()) then raise exception 'Worker lease lost or action not authorized' using errcode='55000'; end if;
end $fn$;
create function public.core_automation_finish(p_event_id uuid,p_worker_id uuid,p_succeeded boolean,p_retryable boolean,p_error_code text default null) returns void
language plpgsql security definer set search_path='' as $fn$
declare e public.core_automation_events%rowtype;
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 select * into e from public.core_automation_events where id=p_event_id and status='processing' and worker_id=p_worker_id and lease_until>now() for update;
 if not found then raise exception 'Worker lease lost' using errcode='55000'; end if;
 if p_succeeded then update public.core_automation_events set status='completed',lease_until=null,worker_id=null,last_error_code=null where id=e.id;
 elsif p_retryable and e.attempts<e.max_attempts then update public.core_automation_events set status='retry',available_at=now()+make_interval(secs=>least(3600,(power(2,e.attempts)*15)::int)),lease_until=null,worker_id=null,last_error_code=left(p_error_code,80) where id=e.id;
 else update public.core_automation_events set status='dead',lease_until=null,worker_id=null,last_error_code=left(p_error_code,80) where id=e.id; end if;
end $fn$;
revoke all on function public.core_automation_match_active(uuid,uuid),public.core_automation_authorize_action(uuid,uuid,uuid,text),public.core_automation_record_action(uuid,uuid,uuid,text,text,text),public.core_automation_finish(uuid,uuid,boolean,boolean,text) from public,anon,authenticated;
grant execute on function public.core_automation_match_active(uuid,uuid),public.core_automation_authorize_action(uuid,uuid,uuid,text),public.core_automation_record_action(uuid,uuid,uuid,text,text,text),public.core_automation_finish(uuid,uuid,boolean,boolean,text) to service_role;
commit;
