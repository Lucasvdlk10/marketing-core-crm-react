begin;

-- Keep sales goals as monthly visual references. Creates and edits are limited
-- to the current calendar month in the CRM's business timezone.
create or replace function public.core_dashboard_goal_upsert(
  p_workspace uuid,
  p_id uuid,
  p_name text,
  p_metric text,
  p_target_value numeric,
  p_team_id uuid,
  p_notify_role text,
  p_starts_on date,
  p_ends_on date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  goal_id uuid;
  existing_goal public.core_sales_goals%rowtype;
  business_today date := (pg_catalog.timezone('America/Sao_Paulo', pg_catalog.now()))::date;
  month_start date;
  month_end date;
begin
  if auth.uid() is null or not (
    public.core_is_super_admin()
    or public.core_has_permission(p_workspace, 'workspace.manage')
    or exists (
      select 1
      from public.core_memberships m
      where m.workspace_id = p_workspace
        and m.user_id = auth.uid()
        and m.active
        and m.role = 'owner'
    )
  ) then
    raise exception 'Goal management denied' using errcode = '42501';
  end if;

  month_start := pg_catalog.date_trunc('month', business_today::timestamp)::date;
  month_end := (month_start + interval '1 month' - interval '1 day')::date;

  if p_metric is null
     or p_metric not in ('revenue', 'deals', 'leads')
     or p_target_value is null
     or p_target_value <= 0
     or p_name is null
     or pg_catalog.length(pg_catalog.btrim(p_name)) not between 2 and 100
     or p_starts_on is distinct from month_start
     or p_ends_on is distinct from month_end then
    raise exception 'Goal must be valid and cover the current calendar month' using errcode = '22023';
  end if;

  if p_team_id is not null and not exists (
    select 1
    from public.core_team_groups t
    where t.workspace_id = p_workspace
      and t.id = p_team_id
  ) then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;

  if p_id is null then
    insert into public.core_sales_goals(
      workspace_id, name, metric, target_value, team_id, notify_role, starts_on, ends_on
    ) values (
      p_workspace,
      pg_catalog.btrim(p_name),
      p_metric,
      p_target_value,
      p_team_id,
      nullif(pg_catalog.btrim(p_notify_role), ''),
      month_start,
      month_end
    ) returning id into goal_id;
  else
    select g.* into existing_goal
    from public.core_sales_goals g
    where g.workspace_id = p_workspace
      and g.id = p_id
    for update;

    if not found then
      raise exception 'Goal not found' using errcode = 'P0002';
    end if;

    if existing_goal.starts_on is distinct from month_start
       or existing_goal.ends_on is distinct from month_end then
      raise exception 'Only current-month goals can be edited' using errcode = '42501';
    end if;

    update public.core_sales_goals
    set name = pg_catalog.btrim(p_name),
        metric = p_metric,
        target_value = p_target_value,
        team_id = p_team_id,
        notify_role = nullif(pg_catalog.btrim(p_notify_role), ''),
        starts_on = month_start,
        ends_on = month_end,
        updated_at = pg_catalog.now()
    where workspace_id = p_workspace
      and id = p_id
    returning id into goal_id;
  end if;

  insert into core_private.platform_audit(actor_id, action, workspace_id, metadata)
  values (
    auth.uid(),
    case when p_id is null then 'sales_goal_created' else 'sales_goal_updated' end,
    p_workspace,
    pg_catalog.jsonb_build_object('goal_id', goal_id, 'metric', p_metric, 'team_id', p_team_id, 'month', month_start)
  );

  return pg_catalog.jsonb_build_object('id', goal_id);
end
$fn$;

create or replace function public.core_dashboard_goal_delete(p_workspace uuid, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  existing_goal public.core_sales_goals%rowtype;
begin
  if auth.uid() is null or not (
    public.core_is_super_admin()
    or public.core_has_permission(p_workspace, 'workspace.manage')
    or exists (
      select 1
      from public.core_memberships m
      where m.workspace_id = p_workspace
        and m.user_id = auth.uid()
        and m.active
        and m.role = 'owner'
    )
  ) then
    raise exception 'Goal management denied' using errcode = '42501';
  end if;

  select g.* into existing_goal
  from public.core_sales_goals g
  where g.workspace_id = p_workspace
    and g.id = p_id
  for update;

  if not found then
    raise exception 'Goal not found' using errcode = 'P0002';
  end if;

  delete from public.core_sales_goals
  where workspace_id = p_workspace
    and id = p_id;

  insert into core_private.platform_audit(actor_id, action, workspace_id, metadata)
  values (
    auth.uid(),
    'sales_goal_deleted',
    p_workspace,
    pg_catalog.jsonb_build_object('goal_id', p_id, 'metric', existing_goal.metric, 'month', existing_goal.starts_on)
  );

  return pg_catalog.jsonb_build_object('id', p_id, 'deleted', true);
end
$fn$;

revoke all on function public.core_dashboard_goal_upsert(uuid, uuid, text, text, numeric, uuid, text, date, date) from public, anon;
grant execute on function public.core_dashboard_goal_upsert(uuid, uuid, text, text, numeric, uuid, text, date, date) to authenticated;
revoke all on function public.core_dashboard_goal_delete(uuid, uuid) from public, anon;
grant execute on function public.core_dashboard_goal_delete(uuid, uuid) to authenticated;

-- Targets are no longer operational alert rules; they remain visible only in the dashboard.
revoke all on function public.core_dashboard_refresh_goal_notifications(uuid) from public, anon, authenticated;

commit;
