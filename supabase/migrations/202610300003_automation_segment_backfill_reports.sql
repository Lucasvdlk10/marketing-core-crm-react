begin;

create or replace function public.core_automation_activate(p_workspace uuid,p_rule_id uuid,p_revision_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare graph_data jsonb; trigger_node jsonb; source_type text; source_id uuid; queued integer:=0;
begin
 if auth.uid() is null then raise exception 'Login required' using errcode='28000'; end if;
 if not public.core_has_permission(p_workspace,'automations.write') then raise exception 'Forbidden' using errcode='42501'; end if;
 select graph into graph_data from public.core_automation_rule_revisions where workspace_id=p_workspace and rule_id=p_rule_id and id=p_revision_id;
 if graph_data is null then raise exception 'Revision not found'; end if;
 update public.core_automation_rules set active_revision_id=p_revision_id,enabled=true,updated_at=now()
  where workspace_id=p_workspace and id=p_rule_id and creator_id=auth.uid();
 if not found then raise exception 'Rule creator mismatch' using errcode='42501'; end if;
 insert into public.core_automation_settings(workspace_id,automation_enabled,updated_by) values(p_workspace,true,auth.uid())
  on conflict(workspace_id) do update set automation_enabled=true,updated_by=auth.uid(),updated_at=now();
 select n into trigger_node from pg_catalog.jsonb_array_elements(graph_data->'nodes') n where n->>'type'='trigger' limit 1;
 source_type=trigger_node->'config'->>'source_type';
 if source_type='segment' then
  begin source_id=(trigger_node->'config'->>'source_id')::uuid; exception when others then raise exception 'Invalid segment source'; end;
  if not exists(select 1 from public.core_segment_lists where workspace_id=p_workspace and id=source_id) then raise exception 'Segment list not found'; end if;
  insert into public.core_automation_events(workspace_id,event_type,aggregate_type,aggregate_id,source_version,context,idempotency_key,max_attempts)
  select p_workspace,'LEAD_CREATED','contact',m.contact_id,'activation:'||p_revision_id::text,
   pg_catalog.jsonb_build_object('target_rule_id',p_rule_id,'target_revision_id',p_revision_id,'source_type','segment','source_id',source_id),
   'ACTIVATE:'||p_revision_id::text||':'||m.contact_id::text,
   coalesce((select max_attempts from public.core_automation_settings where workspace_id=p_workspace),5)
  from public.core_segment_list_members m
  join public.core_contacts c on c.workspace_id=m.workspace_id and c.id=m.contact_id
  where m.workspace_id=p_workspace and m.list_id=source_id
  on conflict(workspace_id,idempotency_key) do nothing;
  get diagnostics queued=row_count;
 end if;
 return pg_catalog.jsonb_build_object('rule_id',p_rule_id,'revision_id',p_revision_id,'enabled',true,'queued_count',queued);
end $fn$;

create or replace function public.core_automation_match_active(p_event_id uuid,p_worker_id uuid)
returns table(rule_id uuid,revision_id uuid,creator_id uuid,graph jsonb)
language plpgsql security definer set search_path='' as $fn$
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 return query
 select r.id,v.id,r.creator_id,v.graph
 from public.core_automation_events e
 join public.core_automation_rules r on r.workspace_id=e.workspace_id and r.enabled and r.active_revision_id is not null
 join public.core_automation_rule_revisions v on v.workspace_id=r.workspace_id and v.rule_id=r.id and v.id=r.active_revision_id
 cross join lateral (select n from pg_catalog.jsonb_array_elements(v.graph->'nodes') n where n->>'type'='trigger' limit 1) trigger_row
 where e.id=p_event_id and e.status='processing' and e.worker_id=p_worker_id and e.lease_until>now()
 and trigger_row.n->>'subtype'=e.event_type
 and (e.context->>'target_revision_id' is null or e.context->>'target_revision_id'=v.id::text)
 and (e.context->>'target_rule_id' is null or e.context->>'target_rule_id'=r.id::text)
 and (
  trigger_row.n->'config'->>'source_type' is distinct from 'segment'
  or exists(
   select 1 from public.core_segment_list_members m
   where m.workspace_id=e.workspace_id
    and m.list_id=(trigger_row.n->'config'->>'source_id')::uuid
    and m.contact_id=e.aggregate_id
  )
 );
 if not found and not exists(select 1 from public.core_automation_events where id=p_event_id and status='processing' and worker_id=p_worker_id and lease_until>now())
  then raise exception 'Worker lease lost' using errcode='55000'; end if;
end $fn$;

create or replace function public.core_automation_metrics(p_workspace uuid)
returns table(rule_id uuid,entered_count bigint,running_count bigint,completed_count bigint,failed_count bigint)
language plpgsql stable security definer set search_path='' as $fn$
begin
 if auth.uid() is null or not public.core_has_permission(p_workspace,'automations.read') then raise exception 'Forbidden' using errcode='42501'; end if;
 return query
 with revisions as(
  select r.id rule_id,r.active_revision_id revision_id,
   (select count(*) from pg_catalog.jsonb_array_elements(v.graph->'nodes') n where n->>'type'='action') action_count
  from public.core_automation_rules r left join public.core_automation_rule_revisions v on v.id=r.active_revision_id and v.workspace_id=r.workspace_id
  where r.workspace_id=p_workspace
 ), per_event as(
  select rev.rule_id,x.event_id,rev.action_count,
   count(*) filter(where x.status='succeeded') succeeded,
   count(*) filter(where x.status in('failed','skipped_permission','skipped_disabled')) failed
  from revisions rev join public.core_automation_action_executions x on x.workspace_id=p_workspace and x.rule_revision_id=rev.revision_id
  group by rev.rule_id,x.event_id,rev.action_count
 )
 select rev.rule_id,count(pe.event_id),count(pe.event_id) filter(where pe.failed=0 and pe.succeeded<rev.action_count),
  count(pe.event_id) filter(where pe.failed=0 and pe.succeeded>=rev.action_count),count(pe.event_id) filter(where pe.failed>0)
 from revisions rev left join per_event pe on pe.rule_id=rev.rule_id group by rev.rule_id;
end $fn$;

create or replace function public.core_automation_report(p_workspace uuid,p_rule_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare result jsonb; rev public.core_automation_rule_revisions%rowtype; action_count integer;
begin
 if auth.uid() is null or not public.core_has_permission(p_workspace,'automations.read') then raise exception 'Forbidden' using errcode='42501'; end if;
 select v.* into rev from public.core_automation_rules r join public.core_automation_rule_revisions v on v.id=r.active_revision_id and v.workspace_id=r.workspace_id where r.workspace_id=p_workspace and r.id=p_rule_id;
 if not found then raise exception 'Active automation revision not found' using errcode='P0002'; end if;
 select count(*) into action_count from pg_catalog.jsonb_array_elements(rev.graph->'nodes') n where n->>'type'='action';
 with nodes as(
  select n->>'id' node_id,n->>'subtype' subtype,
   case n->>'subtype' when 'ADD_TAG' then 'Adicionar tag' when 'CREATE_DEAL' then 'Criar negociação' when 'MOVE_STAGE' then 'Mover etapa' when 'CREATE_TASK' then 'Criar tarefa' when 'WAIT' then 'Aguardar' when 'SEND_EMAIL' then 'Enviar e-mail' when 'SEND_WHATSAPP' then 'Enviar WhatsApp' else n->>'subtype' end label,
   ordinality position
  from pg_catalog.jsonb_array_elements(rev.graph->'nodes') with ordinality a(n,ordinality) where n->>'type'='action'
 ), per_event as(
  select x.event_id,count(*) filter(where x.status='succeeded') succeeded,count(*) filter(where x.status in('failed','skipped_permission','skipped_disabled')) failed
  from public.core_automation_action_executions x where x.workspace_id=p_workspace and x.rule_revision_id=rev.id group by x.event_id
 ), latest as(
  select distinct on(x.event_id) x.event_id,x.node_id,x.status,x.error_code from public.core_automation_action_executions x
  where x.workspace_id=p_workspace and x.rule_revision_id=rev.id order by x.event_id,x.created_at desc,x.id desc
 ), lead_rows as(
  select e.aggregate_id contact_id,coalesce(c.name,'Lead removido') contact_name,
   case when pe.failed>0 then 'failed' when pe.succeeded>=action_count then 'completed' else 'running' end status,
   coalesce(n.label,'Aguardando processamento') current_step,l.error_code
  from per_event pe join public.core_automation_events e on e.id=pe.event_id and e.workspace_id=p_workspace
  left join public.core_contacts c on c.id=e.aggregate_id and c.workspace_id=e.workspace_id
  left join latest l on l.event_id=e.id left join nodes n on n.node_id=l.node_id
 )
 select pg_catalog.jsonb_build_object(
  'summary',pg_catalog.jsonb_build_object('entered',count(*),'running',count(*) filter(where status='running'),'completed',count(*) filter(where status='completed'),'failed',count(*) filter(where status='failed')),
  'steps',(select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('node_id',n.node_id,'label',n.label,'reached',(select count(*) from public.core_automation_action_executions x where x.workspace_id=p_workspace and x.rule_revision_id=rev.id and x.node_id=n.node_id),'completed',(select count(*) from public.core_automation_action_executions x where x.workspace_id=p_workspace and x.rule_revision_id=rev.id and x.node_id=n.node_id and x.status='succeeded'),'failed',(select count(*) from public.core_automation_action_executions x where x.workspace_id=p_workspace and x.rule_revision_id=rev.id and x.node_id=n.node_id and x.status in('failed','skipped_permission','skipped_disabled'))) order by n.position),'[]'::jsonb) from nodes n),
  'leads',coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('contact_id',contact_id,'contact_name',contact_name,'status',status,'current_step',current_step,'error_code',error_code) order by contact_name),'[]'::jsonb)
 ) into result from lead_rows;
 return coalesce(result,pg_catalog.jsonb_build_object('summary',pg_catalog.jsonb_build_object('entered',0,'running',0,'completed',0,'failed',0),'steps','[]'::jsonb,'leads','[]'::jsonb));
end $fn$;

revoke all on function public.core_automation_metrics(uuid) from public,anon;
revoke all on function public.core_automation_report(uuid,uuid) from public,anon;
grant execute on function public.core_automation_metrics(uuid) to authenticated;
grant execute on function public.core_automation_report(uuid,uuid) to authenticated;

-- Repair already-active segment automations once. Targeted context prevents other rules from consuming these events.
insert into public.core_automation_events(workspace_id,event_type,aggregate_type,aggregate_id,source_version,context,idempotency_key,max_attempts)
select r.workspace_id,'LEAD_CREATED','contact',m.contact_id,'activation:'||v.id::text,
 pg_catalog.jsonb_build_object('target_rule_id',r.id,'target_revision_id',v.id,'source_type','segment','source_id',(trigger_node.n->'config'->>'source_id')::uuid),
 'ACTIVATE:'||v.id::text||':'||m.contact_id::text,coalesce(s.max_attempts,5)
from public.core_automation_rules r
join public.core_automation_rule_revisions v on v.workspace_id=r.workspace_id and v.id=r.active_revision_id
cross join lateral(select n from pg_catalog.jsonb_array_elements(v.graph->'nodes') n where n->>'type'='trigger' limit 1) trigger_node
join public.core_segment_list_members m on m.workspace_id=r.workspace_id and m.list_id=(trigger_node.n->'config'->>'source_id')::uuid
join public.core_contacts c on c.workspace_id=m.workspace_id and c.id=m.contact_id
left join public.core_automation_settings s on s.workspace_id=r.workspace_id
where r.enabled and trigger_node.n->'config'->>'source_type'='segment'
on conflict(workspace_id,idempotency_key) do nothing;

commit;
