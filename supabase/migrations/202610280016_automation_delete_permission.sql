-- Tighten automation deletion to the dedicated delete capability.
begin;
create or replace function public.core_automation_delete(p_workspace uuid,p_rule_id uuid) returns void
language plpgsql security definer set search_path='' as $fn$
declare affected_events uuid[];
begin
 if auth.uid() is null then raise exception 'Login required' using errcode='28000'; end if;
 if not public.core_has_permission(p_workspace,'automations.delete') then raise exception 'Forbidden' using errcode='42501'; end if;
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
