-- CREATE_DEAL automation action and secure rule deletion.
begin;
alter table public.core_deals add column if not exists automation_execution_key text;
create unique index if not exists core_deals_automation_execution_once
  on public.core_deals(workspace_id,automation_execution_key) where automation_execution_key is not null;
create or replace function public.core_automation_node_config_v1_valid(p_type text,p_subtype text,c jsonb) returns boolean
language plpgsql immutable set search_path='' as $fn$
declare allowed text[]; k text; amount numeric; deal_value numeric; uuid_pattern constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
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
  when p_subtype='CREATE_DEAL' then array['owner_id','pipeline_id','stage_id','name','value']
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
 elsif p_subtype='MOVE_STAGE' then return coalesce(c->>'stage_id','')~*uuid_pattern;
 elsif p_subtype='ADD_TAG' then return coalesce(c->>'tag_id','')~*uuid_pattern or pg_catalog.length(c->>'tag_name') between 1 and 100;
 elsif p_subtype='CREATE_DEAL' then
  if coalesce(c->>'owner_id','')!~*uuid_pattern or ((c?'pipeline_id')<>(c?'stage_id')) then return false; end if;
  if c?'pipeline_id' and (c->>'pipeline_id'!~*uuid_pattern or c->>'stage_id'!~*uuid_pattern) then return false; end if;
  if c?'name' and pg_catalog.length(c->>'name') not between 1 and 200 then return false; end if;
  if c?'value' then begin deal_value=(c->>'value')::numeric; exception when others then return false; end; if deal_value<0 or deal_value>99999999999999.99 then return false; end if; end if;
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
  elsif n->>'type'='action' and n->>'subtype'=any(array['CREATE_TASK','CREATE_FOLLOWUP','COMPLETE_TASKS','DISTRIBUTE_LEAD','ADD_TO_SEGMENT_LIST','NOTIFY_USER','SEND_EMAIL','SEND_WHATSAPP','WAIT','MOVE_STAGE','ADD_TAG','CREATE_DEAL']) then action_count=action_count+1;
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
  when 'MOVE_STAGE' then 'deals.write' when 'CREATE_DEAL' then 'deals.write' when 'ADD_TAG' then 'tags.write' else null end;
 if action_permission is null or r.creator_id is null or not exists(select 1 from public.core_memberships m where m.workspace_id=e.workspace_id and m.user_id=r.creator_id and m.active and (m.role in('owner','admin') or (public.core_role_ceiling(m.role,action_permission) and coalesce((select rp.enabled from public.core_role_permissions rp where rp.workspace_id=m.workspace_id and rp.role=m.role and rp.permission=action_permission),true)))) then raise exception 'Rule creator lacks current action permission' using errcode='42501'; end if;
 action_execution_key=e.id::text||':'||p_revision_id::text||':'||p_node_id;
 insert into public.core_automation_action_executions(workspace_id,event_id,rule_revision_id,node_id,execution_key,status,attempts) values(e.workspace_id,e.id,p_revision_id,p_node_id,action_execution_key,'started',1)
 on conflict(workspace_id,execution_key) do update set status='started',attempts=public.core_automation_action_executions.attempts+1,error_code=null,finished_at=null where public.core_automation_action_executions.status in('failed','skipped_permission','skipped_disabled');
 return action_execution_key;
end $fn$;
create or replace function public.core_automation_delete(p_workspace uuid,p_rule_id uuid) returns void
language plpgsql security definer set search_path='' as $fn$
declare affected_events uuid[];
begin
 if auth.uid() is null then raise exception 'Login required' using errcode='28000'; end if;
 if not public.core_has_permission(p_workspace,'automations.write') then raise exception 'Forbidden' using errcode='42501'; end if;
 if not exists(select 1 from public.core_automation_rules where workspace_id=p_workspace and id=p_rule_id) then raise exception 'Automation rule not found' using errcode='P0002'; end if;
 select pg_catalog.array_agg(distinct x.event_id) into affected_events
 from public.core_automation_action_executions x join public.core_automation_rule_revisions r on r.workspace_id=x.workspace_id and r.id=x.rule_revision_id
 where r.workspace_id=p_workspace and r.rule_id=p_rule_id;
 update public.core_automation_rules set active_revision_id=null,enabled=false where workspace_id=p_workspace and id=p_rule_id;
 delete from public.core_automation_runs where workspace_id=p_workspace and rule_id=p_rule_id;
 delete from public.core_automation_rules where workspace_id=p_workspace and id=p_rule_id;
 if affected_events is not null then
  delete from public.core_automation_events e where e.workspace_id=p_workspace and e.id=any(affected_events)
   and not exists(select 1 from public.core_automation_action_executions x where x.workspace_id=e.workspace_id and x.event_id=e.id)
   and not exists(select 1 from public.core_automation_runs r where r.workspace_id=e.workspace_id and r.event_id=e.id);
 end if;
end $fn$;
revoke all on function public.core_automation_delete(uuid,uuid) from public,anon;
grant execute on function public.core_automation_delete(uuid,uuid) to authenticated;
commit;
