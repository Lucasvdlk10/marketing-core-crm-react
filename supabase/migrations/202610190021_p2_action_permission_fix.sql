-- Remove PL/pgSQL ambiguity between action permission variable and table columns.
begin;
create or replace function public.core_automation_authorize_action(p_event_id uuid,p_revision_id uuid,p_node_id text) returns text
language plpgsql security definer set search_path='' as $fn$
declare e public.core_automation_events%rowtype; r public.core_automation_rules%rowtype; action_permission text; execution_key text;
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 select * into e from public.core_automation_events where id=p_event_id and status='processing' for update;
 if not found then raise exception 'Event is not claimable' using errcode='55000'; end if;
 select rule.* into r from public.core_automation_rule_revisions rev join public.core_automation_rules rule on rule.id=rev.rule_id and rule.workspace_id=rev.workspace_id
  where rev.id=p_revision_id and rev.workspace_id=e.workspace_id and rule.enabled and rule.active_revision_id=rev.id;
 if not found or not coalesce((select automation_enabled from public.core_automation_settings where workspace_id=e.workspace_id),false) then raise exception 'Automation disabled' using errcode='42501'; end if;
 action_permission=case (select n->>'subtype' from public.core_automation_rule_revisions rev cross join lateral jsonb_array_elements(rev.graph->'nodes') n where rev.id=p_revision_id and n->>'id'=p_node_id and n->>'type'='action')
  when 'CREATE_TASK' then 'tasks.write' when 'CREATE_FOLLOWUP' then 'tasks.write' when 'COMPLETE_TASKS' then 'tasks.write'
  when 'DISTRIBUTE_LEAD' then 'contacts.write' when 'ADD_TO_SEGMENT_LIST' then 'contacts.write' when 'SET_SCORE' then 'contacts.write' when 'NOTIFY_USER' then 'automations.write' else null end;
 if action_permission is null or r.creator_id is null or not exists(select 1 from public.core_memberships m where m.workspace_id=e.workspace_id and m.user_id=r.creator_id and m.active
   and (m.role in('owner','admin') or (public.core_role_ceiling(m.role,action_permission) and coalesce((select rp.enabled from public.core_role_permissions rp where rp.workspace_id=m.workspace_id and rp.role=m.role and rp.permission=action_permission),true))))
 then raise exception 'Rule creator lacks current action permission' using errcode='42501'; end if;
 execution_key=e.id::text||':'||p_revision_id::text||':'||p_node_id;
 insert into public.core_automation_action_executions(workspace_id,event_id,rule_revision_id,node_id,execution_key,status,attempts)
  values(e.workspace_id,e.id,p_revision_id,p_node_id,execution_key,'started',1)
  on conflict(workspace_id,execution_key) do update set status='started',attempts=public.core_automation_action_executions.attempts+1,error_code=null,finished_at=null
  where public.core_automation_action_executions.status in('failed','skipped_permission','skipped_disabled');
 return execution_key;
end $fn$;
commit;
