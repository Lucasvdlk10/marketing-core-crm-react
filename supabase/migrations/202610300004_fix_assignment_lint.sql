begin;

create or replace function public.core_automation_choose_deal_assignee(p_workspace uuid,p_revision_id uuid,p_node_id text,p_team_id uuid,p_distribution jsonb)
returns uuid language plpgsql security definer set search_path='' as $fn$
declare seq bigint; total int; slot int; chosen uuid;
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 if not exists(select 1 from public.core_automation_rule_revisions r where r.workspace_id=p_workspace and r.id=p_revision_id) then raise exception 'REVISION_NOT_FOUND'; end if;
 if not exists(select 1 from public.core_team_groups g where g.workspace_id=p_workspace and g.id=p_team_id) then raise exception 'TEAM_NOT_FOUND'; end if;
 if jsonb_typeof(p_distribution)<>'array' then raise exception 'INVALID_DISTRIBUTION'; end if;
 with eligible as(
  select (d->>'user_id')::uuid user_id,(d->>'percentage')::int weight
  from pg_catalog.jsonb_array_elements(p_distribution) d
  join public.core_team_group_members gm on gm.workspace_id=p_workspace and gm.team_id=p_team_id and gm.user_id=(d->>'user_id')::uuid
  join public.core_memberships m on m.workspace_id=p_workspace and m.user_id=gm.user_id and m.active
  where (d->>'percentage')::int>0
 ) select coalesce(sum(weight),0) into total from eligible;
 if total<=0 then raise exception 'NO_ELIGIBLE_ASSIGNEE'; end if;
 insert into public.core_automation_assignment_state(workspace_id,rule_revision_id,node_id,sequence) values(p_workspace,p_revision_id,p_node_id,0)
 on conflict(workspace_id,rule_revision_id,node_id) do nothing;
 select sequence into seq from public.core_automation_assignment_state where workspace_id=p_workspace and rule_revision_id=p_revision_id and node_id=p_node_id for update;
 slot=(seq%total)::int;
 with eligible as(
  select (d->>'user_id')::uuid user_id,(d->>'percentage')::int weight
  from pg_catalog.jsonb_array_elements(p_distribution) d
  join public.core_team_group_members gm on gm.workspace_id=p_workspace and gm.team_id=p_team_id and gm.user_id=(d->>'user_id')::uuid
  join public.core_memberships m on m.workspace_id=p_workspace and m.user_id=gm.user_id and m.active
  where (d->>'percentage')::int>0
 ), weighted as(
  select user_id,weight,coalesce(sum(weight) over(order by user_id rows between unbounded preceding and 1 preceding),0) start_at from eligible
 ) select user_id into chosen from weighted where slot>=start_at and slot<start_at+weight order by user_id limit 1;
 update public.core_automation_assignment_state set sequence=sequence+1,updated_at=now() where workspace_id=p_workspace and rule_revision_id=p_revision_id and node_id=p_node_id;
 if chosen is null then raise exception 'NO_ELIGIBLE_ASSIGNEE'; end if;
 return chosen;
end $fn$;

revoke all on function public.core_automation_choose_deal_assignee(uuid,uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.core_automation_choose_deal_assignee(uuid,uuid,text,uuid,jsonb) to service_role;

commit;
