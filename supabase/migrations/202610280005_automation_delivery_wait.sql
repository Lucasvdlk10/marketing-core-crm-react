-- Durable waits, delivery outbox, and CRM-mutating automation actions.
begin;
create or replace function public.core_automation_node_config_v1_valid(p_type text,p_subtype text,c jsonb) returns boolean
language plpgsql immutable set search_path='' as $fn$
declare allowed text[]; k text; amount numeric;
begin
 if jsonb_typeof(c)<>'object' or pg_catalog.octet_length(c::text)>8192 then return false; end if;
 allowed=case
  when p_type='trigger' then array['source','form_id','stage_id','loss_reason','days','timeframe','source_type','source_id']
  when p_subtype='CREATE_TASK' then array['title','delay','unit','business_hours','assignee','user_id']
  when p_subtype='CREATE_FOLLOWUP' then array['title','delay','unit','business_hours','assignee','user_id']
  when p_subtype='COMPLETE_TASKS' then array['only_automation'] when p_subtype='DISTRIBUTE_LEAD' then array['mode','team','members']
  when p_subtype='ADD_TO_SEGMENT_LIST' then array['list_id','reason'] when p_subtype='NOTIFY_USER' then array['title','body','user_id']
  when p_subtype='SEND_EMAIL' then array['subject','body','text','html','reply_to'] when p_subtype='SEND_WHATSAPP' then array['message','template_name','language','components']
  when p_subtype='WAIT' then array['delay','amount','unit'] when p_subtype='MOVE_STAGE' then array['stage_id'] when p_subtype='ADD_TAG' then array['tag_id','tag_name']
  when p_subtype='SOURCE_EQUALS' then array['value','stage_id','days'] when p_subtype='CAMPAIGN_EQUALS' then array['value','stage_id','days']
  when p_subtype='STAGE_EQUALS' then array['value','stage_id','days'] else array[]::text[] end;
 for k in select pg_catalog.jsonb_object_keys(c) loop if not(k=any(allowed)) then return false; end if; end loop;
 if p_subtype='SEND_EMAIL' then
  return pg_catalog.length(c->>'subject') between 1 and 200 and (pg_catalog.length(c->>'body') between 1 and 10000 or pg_catalog.length(c->>'text') between 1 and 10000 or pg_catalog.length(c->>'html') between 1 and 20000);
 elsif p_subtype='SEND_WHATSAPP' then
  return pg_catalog.length(c->>'message') between 1 and 4000 or (pg_catalog.length(c->>'template_name') between 1 and 120 and pg_catalog.length(c->>'language') between 1 and 20 and (not(c?'components') or jsonb_typeof(c->'components')='array'));
 elsif p_subtype='WAIT' then
  begin amount=coalesce(c->>'amount',c->>'delay')::numeric; exception when others then return false; end;
  return amount between 1 and 365 and c->>'unit'=any(array['minutes','hours','days']);
 elsif p_subtype='MOVE_STAGE' then return coalesce(c->>'stage_id','')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
 elsif p_subtype='ADD_TAG' then return coalesce(c->>'tag_id','')~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' or pg_catalog.length(c->>'tag_name') between 1 and 100;
 end if;
 return true;
exception when others then return false;
end $fn$;
create or replace function public.core_automation_graph_v1_valid(g jsonb) returns boolean
language plpgsql stable set search_path='' as $fn$
declare n jsonb; e jsonb; ids text[]:='{}'; edge_ids text[]:='{}'; pairs text[]:='{}'; trigger_id text; trigger_count int:=0; action_count int:=0; reached int:=0; x numeric; y numeric;
begin
 if jsonb_typeof(g)<>'object' or (select count(*) from pg_catalog.jsonb_object_keys(g))<>3 or not(g?'schema_version' and g?'nodes' and g?'edges') or g->>'schema_version'<>'1' then return false; end if;
 if jsonb_typeof(g->'nodes')<>'array' or jsonb_typeof(g->'edges')<>'array' or jsonb_array_length(g->'nodes') not between 2 and 35 or jsonb_array_length(g->'edges')<>jsonb_array_length(g->'nodes')-1 or pg_catalog.octet_length(g::text)>65536 then return false; end if;
 for n in select value from pg_catalog.jsonb_array_elements(g->'nodes') loop
  if jsonb_typeof(n)<>'object' or (select count(*) from pg_catalog.jsonb_object_keys(n))<>5 or not(n?'id' and n?'type' and n?'subtype' and n?'position' and n?'config') then return false; end if;
  if pg_catalog.length(n->>'id') not between 1 and 90 or n->>'id'=any(ids) or jsonb_typeof(n->'position')<>'object' or jsonb_typeof(n->'config')<>'object' then return false; end if;
  begin x=(n->'position'->>'x')::numeric; y=(n->'position'->>'y')::numeric; exception when others then return false; end;
  if x::text in('NaN','Infinity','-Infinity') or y::text in('NaN','Infinity','-Infinity') or abs(x)>100000 or abs(y)>100000 then return false; end if;
  if n->>'type'='trigger' and n->>'subtype'=any(array['LEAD_CREATED','WEBHOOK_RECEIVED','STAGE_CHANGED','DEAL_LOST']) then trigger_count=trigger_count+1; trigger_id=n->>'id';
  elsif n->>'type'='condition' and n->>'subtype'=any(array['SOURCE_EQUALS','CAMPAIGN_EQUALS','STAGE_EQUALS']) then null;
  elsif n->>'type'='action' and n->>'subtype'=any(array['CREATE_TASK','CREATE_FOLLOWUP','COMPLETE_TASKS','DISTRIBUTE_LEAD','ADD_TO_SEGMENT_LIST','NOTIFY_USER','SEND_EMAIL','SEND_WHATSAPP','WAIT','MOVE_STAGE','ADD_TAG']) then action_count=action_count+1;
  else return false; end if;
  if not public.core_automation_node_config_v1_valid(n->>'type',n->>'subtype',n->'config') then return false; end if;
  ids=array_append(ids,n->>'id');
 end loop;
 if trigger_count<>1 or action_count<1 then return false; end if;
 for e in select value from pg_catalog.jsonb_array_elements(g->'edges') loop
  if jsonb_typeof(e)<>'object' or (select count(*) from pg_catalog.jsonb_object_keys(e))<>3 or not(e?'id' and e?'source' and e?'target') then return false; end if;
  if pg_catalog.length(e->>'id') not between 1 and 90 or e->>'id'=any(edge_ids) or not(e->>'source'=any(ids) and e->>'target'=any(ids)) or e->>'source'=e->>'target' then return false; end if;
  if pg_catalog.jsonb_build_array(e->>'source',e->>'target')::text=any(pairs) then return false; end if;
  edge_ids=array_append(edge_ids,e->>'id'); pairs=array_append(pairs,pg_catalog.jsonb_build_array(e->>'source',e->>'target')::text);
 end loop;
 if exists(select 1 from unnest(ids) id where (id=trigger_id and (select count(*) from pg_catalog.jsonb_array_elements(g->'edges') z where z->>'target'=id)<>0) or (id<>trigger_id and (select count(*) from pg_catalog.jsonb_array_elements(g->'edges') z where z->>'target'=id)<>1) or (select count(*) from pg_catalog.jsonb_array_elements(g->'edges') z where z->>'source'=id)>1) then return false; end if;
 select count(distinct id) into reached from (with recursive walk(id) as (select trigger_id union select edge->>'target' from walk w cross join lateral pg_catalog.jsonb_array_elements(g->'edges') edge where edge->>'source'=w.id) select id from walk) q;
 return reached=cardinality(ids);
exception when others then return false;
end $fn$;
create table public.core_automation_continuations(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, event_id uuid not null, rule_revision_id uuid not null,
 wait_node_id text not null, next_node_id text not null, execution_key text not null, context jsonb not null default '{}'::jsonb,
 resume_at timestamptz not null, status text not null default 'pending' check(status in('pending','processing','retry','completed','dead')),
 attempts smallint not null default 0 check(attempts between 0 and 10), max_attempts smallint not null default 5 check(max_attempts between 1 and 10),
 worker_id uuid, lease_until timestamptz, last_error_code text, created_at timestamptz not null default now(), completed_at timestamptz,
 unique(workspace_id,execution_key), unique(workspace_id,id),
 foreign key(workspace_id,event_id) references public.core_automation_events(workspace_id,id) on delete cascade,
 foreign key(workspace_id,rule_revision_id) references public.core_automation_rule_revisions(workspace_id,id) on delete cascade,
 check(pg_catalog.octet_length(context::text)<=4096)
);
create index core_automation_continuations_claim on public.core_automation_continuations(resume_at,created_at) where status in('pending','retry');
create table public.core_automation_deliveries(
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.core_workspaces(id) on delete cascade,
 event_id uuid not null, rule_revision_id uuid not null, node_id text not null, execution_key text not null,
 channel text not null check(channel in('email','whatsapp')), provider text not null, recipient text not null,
 subject text, payload jsonb not null default '{}'::jsonb check(pg_catalog.octet_length(payload::text)<=32768),
 status text not null default 'pending' check(status in('pending','sending','sent','failed')),
 attempts smallint not null default 0 check(attempts between 0 and 10), provider_message_id text, error_code text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), sent_at timestamptz,
 unique(workspace_id,execution_key), unique(workspace_id,id),
 foreign key(workspace_id,event_id) references public.core_automation_events(workspace_id,id) on delete cascade,
 foreign key(workspace_id,rule_revision_id) references public.core_automation_rule_revisions(workspace_id,id) on delete cascade
);
create index core_automation_deliveries_status on public.core_automation_deliveries(workspace_id,status,updated_at desc);
create or replace function public.core_automation_schedule_continuation(p_event_id uuid,p_worker_id uuid,p_revision_id uuid,p_wait_node_id text,p_next_node_id text,p_execution_key text,p_resume_at timestamptz,p_context jsonb) returns uuid
language plpgsql security definer set search_path='' as $fn$
declare e public.core_automation_events%rowtype; cid uuid;
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 select * into e from public.core_automation_events where id=p_event_id and ((status='processing' and worker_id=p_worker_id and lease_until>now()) or (status='completed' and exists(select 1 from public.core_automation_continuations c where c.event_id=p_event_id and c.status='processing' and c.worker_id=p_worker_id and c.lease_until>now()))) for update;
 if not found then raise exception 'Worker lease lost' using errcode='55000'; end if;
 if p_resume_at<=now() or pg_catalog.octet_length(coalesce(p_context,'{}')::text)>4096 or not exists(select 1 from public.core_automation_rule_revisions r cross join lateral pg_catalog.jsonb_array_elements(r.graph->'nodes') n where r.id=p_revision_id and r.workspace_id=e.workspace_id and n->>'id'=p_next_node_id) then raise exception 'Invalid continuation' using errcode='22023'; end if;
 insert into public.core_automation_continuations(workspace_id,event_id,rule_revision_id,wait_node_id,next_node_id,execution_key,context,resume_at,max_attempts)
 values(e.workspace_id,e.id,p_revision_id,p_wait_node_id,p_next_node_id,p_execution_key,coalesce(p_context,'{}'),p_resume_at,e.max_attempts)
 on conflict(workspace_id,execution_key) do update set resume_at=least(public.core_automation_continuations.resume_at,excluded.resume_at)
 returning id into cid;
 return cid;
end $fn$;
create or replace function public.core_automation_claim_continuations(p_worker_id uuid,p_limit integer default 25) returns setof public.core_automation_continuations
language plpgsql security definer set search_path='' as $fn$
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 return query with candidates as (
  select c.id from public.core_automation_continuations c join public.core_automation_settings s on s.workspace_id=c.workspace_id and s.automation_enabled
  join public.core_automation_rules r on r.workspace_id=c.workspace_id and r.active_revision_id=c.rule_revision_id and r.enabled
  where c.status in('pending','retry') and c.resume_at<=now() and (c.lease_until is null or c.lease_until<now())
  order by c.resume_at,c.created_at,c.id for update of c skip locked limit greatest(1,least(coalesce(p_limit,25),100))
 ) update public.core_automation_continuations c set status='processing',worker_id=p_worker_id,lease_until=now()+interval '2 minutes',attempts=c.attempts+1 from candidates x where c.id=x.id returning c.*;
end $fn$;
create or replace function public.core_automation_finish_continuation(p_continuation_id uuid,p_worker_id uuid,p_succeeded boolean,p_retryable boolean,p_error_code text default null) returns void
language plpgsql security definer set search_path='' as $fn$
declare c public.core_automation_continuations%rowtype;
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 select * into c from public.core_automation_continuations where id=p_continuation_id and status='processing' and worker_id=p_worker_id and lease_until>now() for update;
 if not found then raise exception 'Continuation lease lost' using errcode='55000'; end if;
 if p_succeeded then update public.core_automation_continuations set status='completed',worker_id=null,lease_until=null,last_error_code=null,completed_at=now() where id=c.id;
 elsif p_retryable and c.attempts<c.max_attempts then update public.core_automation_continuations set status='retry',resume_at=now()+make_interval(secs=>least(3600,(power(2,c.attempts)*15)::int)),worker_id=null,lease_until=null,last_error_code=left(p_error_code,80) where id=c.id;
 else update public.core_automation_continuations set status='dead',worker_id=null,lease_until=null,last_error_code=left(p_error_code,80) where id=c.id; end if;
end $fn$;
create or replace function public.core_automation_authorize_action(p_event_id uuid,p_worker_id uuid,p_revision_id uuid,p_node_id text) returns text
language plpgsql security definer set search_path='' as $fn$
declare e public.core_automation_events%rowtype; r public.core_automation_rules%rowtype; action_permission text; action_execution_key text;
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 select * into e from public.core_automation_events where id=p_event_id and ((status='processing' and worker_id=p_worker_id and lease_until>now()) or (status='completed' and exists(select 1 from public.core_automation_continuations c where c.event_id=p_event_id and c.status='processing' and c.worker_id=p_worker_id and c.lease_until>now()))) for update;
 if not found then raise exception 'Worker lease lost' using errcode='55000'; end if;
 select rule.* into r from public.core_automation_rule_revisions rev join public.core_automation_rules rule on rule.id=rev.rule_id and rule.workspace_id=rev.workspace_id where rev.id=p_revision_id and rev.workspace_id=e.workspace_id and rule.enabled and rule.active_revision_id=rev.id;
 if not found or not coalesce((select automation_enabled from public.core_automation_settings where workspace_id=e.workspace_id),false) then raise exception 'Automation disabled' using errcode='42501'; end if;
 action_permission=case (select n->>'subtype' from public.core_automation_rule_revisions rev cross join lateral pg_catalog.jsonb_array_elements(rev.graph->'nodes') n where rev.id=p_revision_id and n->>'id'=p_node_id and n->>'type'='action')
  when 'CREATE_TASK' then 'tasks.write' when 'CREATE_FOLLOWUP' then 'tasks.write' when 'COMPLETE_TASKS' then 'tasks.write'
  when 'DISTRIBUTE_LEAD' then 'contacts.write' when 'ADD_TO_SEGMENT_LIST' then 'contacts.write' when 'NOTIFY_USER' then 'automations.write'
  when 'SEND_EMAIL' then 'automations.write' when 'SEND_WHATSAPP' then 'automations.write' when 'WAIT' then 'automations.write'
  when 'MOVE_STAGE' then 'deals.write' when 'ADD_TAG' then 'tags.write' else null end;
 if action_permission is null or r.creator_id is null or not exists(select 1 from public.core_memberships m where m.workspace_id=e.workspace_id and m.user_id=r.creator_id and m.active and (m.role in('owner','admin') or (public.core_role_ceiling(m.role,action_permission) and coalesce((select rp.enabled from public.core_role_permissions rp where rp.workspace_id=m.workspace_id and rp.role=m.role and rp.permission=action_permission),true)))) then raise exception 'Rule creator lacks current action permission' using errcode='42501'; end if;
 action_execution_key=e.id::text||':'||p_revision_id::text||':'||p_node_id;
 insert into public.core_automation_action_executions(workspace_id,event_id,rule_revision_id,node_id,execution_key,status,attempts) values(e.workspace_id,e.id,p_revision_id,p_node_id,action_execution_key,'started',1)
 on conflict(workspace_id,execution_key) do update set status='started',attempts=public.core_automation_action_executions.attempts+1,error_code=null,finished_at=null where public.core_automation_action_executions.status in('failed','skipped_permission','skipped_disabled');
 return action_execution_key;
end $fn$;
create or replace function public.core_automation_record_action(p_event_id uuid,p_worker_id uuid,p_revision_id uuid,p_node_id text,p_status text,p_error_code text default null)
returns void language plpgsql security definer set search_path='' as $fn$
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 if p_status not in('succeeded','failed','skipped_permission','skipped_disabled') then raise exception 'Invalid action status'; end if;
 if not exists(select 1 from public.core_automation_events e where e.id=p_event_id and ((e.status='processing' and e.worker_id=p_worker_id and e.lease_until>now()) or (e.status='completed' and exists(select 1 from public.core_automation_continuations c where c.event_id=e.id and c.status='processing' and c.worker_id=p_worker_id and c.lease_until>now())))) then raise exception 'Worker lease lost' using errcode='55000'; end if;
 update public.core_automation_action_executions set status=p_status,error_code=left(p_error_code,80),finished_at=now() where event_id=p_event_id and rule_revision_id=p_revision_id and node_id=p_node_id and status='started';
 if not found and not exists(select 1 from public.core_automation_action_executions where event_id=p_event_id and rule_revision_id=p_revision_id and node_id=p_node_id and status='succeeded') then raise exception 'Action not authorized' using errcode='55000'; end if;
end $fn$;
create or replace function public.core_segment_list_automation_links(p_workspace uuid)
returns table(list_id uuid,rule_id uuid,rule_name text,enabled boolean)
language sql stable security definer set search_path='' as $fn$
 select distinct l.id,r.id,r.name,r.enabled
 from public.core_segment_lists l
 join public.core_automation_rules r on r.workspace_id=l.workspace_id
 join public.core_automation_rule_revisions v on v.workspace_id=r.workspace_id and v.rule_id=r.id
 cross join lateral pg_catalog.jsonb_array_elements(v.graph->'nodes') n
 where l.workspace_id=p_workspace
  and public.core_has_permission(p_workspace,'contacts.read')
  and ((n->>'type'='trigger' and n->'config'->>'source_type'='segment' and n->'config'->>'source_id'=l.id::text)
    or (n->>'type'='action' and n->>'subtype'='ADD_TO_SEGMENT_LIST' and n->'config'->>'list_id'=l.id::text));
$fn$;
create or replace function public.core_segment_list_update(p_workspace uuid,p_list_id uuid,p_name text,p_description text)
returns public.core_segment_lists language plpgsql security definer set search_path='' as $fn$
declare result public.core_segment_lists%rowtype;
begin
 if auth.uid() is null then raise exception 'Login required' using errcode='28000'; end if;
 if not public.core_has_permission(p_workspace,'contacts.write') then raise exception 'Forbidden' using errcode='42501'; end if;
 if pg_catalog.length(pg_catalog.btrim(p_name)) not between 1 and 200 or pg_catalog.length(coalesce(p_description,''))>2000 then raise exception 'Invalid segment list fields' using errcode='22023'; end if;
 update public.core_segment_lists set name=pg_catalog.btrim(p_name),description=nullif(pg_catalog.btrim(p_description),'') where workspace_id=p_workspace and id=p_list_id returning * into result;
 if not found then raise exception 'Segment list not found' using errcode='P0002'; end if;
 return result;
end $fn$;
create or replace function public.core_segment_list_delete_guard() returns trigger
language plpgsql security definer set search_path='' as $fn$
declare linked text;
begin
 select pg_catalog.string_agg(distinct r.name||case when r.enabled then ' (active)' else ' (published)' end,', ' order by r.name||case when r.enabled then ' (active)' else ' (published)' end) into linked
 from public.core_automation_rules r join public.core_automation_rule_revisions v on v.workspace_id=r.workspace_id and v.rule_id=r.id
 cross join lateral pg_catalog.jsonb_array_elements(v.graph->'nodes') n
 where r.workspace_id=old.workspace_id and ((n->>'type'='trigger' and n->'config'->>'source_type'='segment' and n->'config'->>'source_id'=old.id::text)
  or (n->>'type'='action' and n->>'subtype'='ADD_TO_SEGMENT_LIST' and n->'config'->>'list_id'=old.id::text));
 if linked is not null then raise exception 'Segment list is referenced by automation(s): %',linked using errcode='23503',hint='Remove the segment-list references from every published automation revision before deleting the list.'; end if;
 return old;
end $fn$;
drop trigger if exists core_segment_list_automation_delete_guard on public.core_segment_lists;
create trigger core_segment_list_automation_delete_guard before delete on public.core_segment_lists for each row execute function public.core_segment_list_delete_guard();
create or replace function public.core_segment_list_delete(p_workspace uuid,p_list_id uuid) returns void
language plpgsql security definer set search_path='' as $fn$
begin
 if auth.uid() is null then raise exception 'Login required' using errcode='28000'; end if;
 if not public.core_has_permission(p_workspace,'contacts.delete') then raise exception 'Forbidden' using errcode='42501'; end if;
 delete from public.core_segment_lists where workspace_id=p_workspace and id=p_list_id;
 if not found then raise exception 'Segment list not found' using errcode='P0002'; end if;
end $fn$;
alter table public.core_automation_continuations enable row level security;
alter table public.core_automation_deliveries enable row level security;
create policy core_automation_continuations_read on public.core_automation_continuations for select to authenticated using(public.core_has_permission(workspace_id,'automations.read'));
create policy core_automation_deliveries_read on public.core_automation_deliveries for select to authenticated using(public.core_has_permission(workspace_id,'automations.read'));
revoke all on public.core_automation_continuations,public.core_automation_deliveries from public,anon,authenticated;
grant select on public.core_automation_continuations,public.core_automation_deliveries to authenticated;
revoke all on function public.core_automation_node_config_v1_valid(text,text,jsonb),public.core_automation_schedule_continuation(uuid,uuid,uuid,text,text,text,timestamptz,jsonb),public.core_automation_claim_continuations(uuid,integer),public.core_automation_finish_continuation(uuid,uuid,boolean,boolean,text),public.core_segment_list_automation_links(uuid),public.core_segment_list_update(uuid,uuid,text,text),public.core_segment_list_delete(uuid,uuid),public.core_segment_list_delete_guard() from public,anon,authenticated;
grant execute on function public.core_automation_schedule_continuation(uuid,uuid,uuid,text,text,text,timestamptz,jsonb),public.core_automation_claim_continuations(uuid,integer),public.core_automation_finish_continuation(uuid,uuid,boolean,boolean,text) to service_role;
grant execute on function public.core_segment_list_automation_links(uuid),public.core_segment_list_update(uuid,uuid,text,text),public.core_segment_list_delete(uuid,uuid) to authenticated;
commit;
