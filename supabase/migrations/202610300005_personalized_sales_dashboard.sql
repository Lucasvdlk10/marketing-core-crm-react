begin;

create table public.core_dashboard_preferences(
 workspace_id uuid not null references public.core_workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 layout jsonb not null default '[]'::jsonb check(jsonb_typeof(layout)='array' and pg_catalog.octet_length(layout::text)<=32768),
 selected_team_id uuid,
 updated_at timestamptz not null default now(),
 primary key(workspace_id,user_id),
 foreign key(workspace_id,selected_team_id) references public.core_team_groups(workspace_id,id) on delete set null
);
alter table public.core_dashboard_preferences enable row level security;
create policy core_dashboard_preferences_own on public.core_dashboard_preferences for all to authenticated
 using(user_id=auth.uid() and public.core_has_permission(workspace_id,'reports.read'))
 with check(user_id=auth.uid() and public.core_has_permission(workspace_id,'reports.read'));
revoke all on public.core_dashboard_preferences from public,anon;
grant select,insert,update on public.core_dashboard_preferences to authenticated;
grant all on public.core_dashboard_preferences to service_role;

create table public.core_sales_goals(
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.core_workspaces(id) on delete cascade,
 name text not null check(length(btrim(name)) between 2 and 100),
 metric text not null check(metric in('revenue','deals','leads')),
 target_value numeric(16,2) not null check(target_value>0),
 team_id uuid,
 notify_role text,
 starts_on date not null,
 ends_on date not null,
 created_by uuid not null default auth.uid() references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(workspace_id,id),
 foreign key(workspace_id,team_id) references public.core_team_groups(workspace_id,id) on delete cascade,
 check(ends_on>=starts_on),
 check(notify_role is null or length(notify_role) between 2 and 56)
);
create index core_sales_goals_period on public.core_sales_goals(workspace_id,starts_on,ends_on);
alter table public.core_sales_goals enable row level security;
create policy core_sales_goals_read on public.core_sales_goals for select to authenticated using(public.core_has_permission(workspace_id,'reports.read'));
revoke all on public.core_sales_goals from public,anon,authenticated;
grant all on public.core_sales_goals to service_role;

create or replace function public.core_dashboard_preferences_get(p_workspace uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare result jsonb;
begin
 if auth.uid() is null or not public.core_has_permission(p_workspace,'reports.read') then raise exception 'Forbidden' using errcode='42501'; end if;
 select pg_catalog.jsonb_build_object('layout',layout,'selected_team_id',selected_team_id) into result
 from public.core_dashboard_preferences where workspace_id=p_workspace and user_id=auth.uid();
 return coalesce(result,pg_catalog.jsonb_build_object('layout',null,'selected_team_id',null));
end $fn$;

create or replace function public.core_dashboard_preferences_save(p_workspace uuid,p_layout jsonb,p_selected_team_id uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $fn$
begin
 if auth.uid() is null or not public.core_has_permission(p_workspace,'reports.read') then raise exception 'Forbidden' using errcode='42501'; end if;
 if jsonb_typeof(p_layout)<>'array' or pg_catalog.octet_length(p_layout::text)>32768 then raise exception 'Invalid dashboard layout' using errcode='22023'; end if;
 if p_selected_team_id is not null and not exists(select 1 from public.core_team_groups where workspace_id=p_workspace and id=p_selected_team_id) then raise exception 'Team not found' using errcode='P0002'; end if;
 insert into public.core_dashboard_preferences(workspace_id,user_id,layout,selected_team_id) values(p_workspace,auth.uid(),p_layout,p_selected_team_id)
 on conflict(workspace_id,user_id) do update set layout=excluded.layout,selected_team_id=excluded.selected_team_id,updated_at=now();
 return pg_catalog.jsonb_build_object('layout',p_layout,'selected_team_id',p_selected_team_id);
end $fn$;

create or replace function public.core_dashboard_goals_list(p_workspace uuid)
returns setof public.core_sales_goals language plpgsql stable security definer set search_path='' as $fn$
begin
 if auth.uid() is null or not public.core_has_permission(p_workspace,'reports.read') then raise exception 'Forbidden' using errcode='42501'; end if;
 return query select * from public.core_sales_goals where workspace_id=p_workspace order by ends_on,name,id;
end $fn$;

create or replace function public.core_dashboard_goal_upsert(p_workspace uuid,p_id uuid,p_name text,p_metric text,p_target_value numeric,p_team_id uuid,p_notify_role text,p_starts_on date,p_ends_on date)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare goal_id uuid;
begin
 if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(p_workspace,'workspace.manage') or exists(select 1 from public.core_memberships where workspace_id=p_workspace and user_id=auth.uid() and active and role='owner')) then raise exception 'Goal management denied' using errcode='42501'; end if;
 if p_metric not in('revenue','deals','leads') or p_target_value<=0 or p_ends_on<p_starts_on or length(btrim(p_name)) not between 2 and 100 then raise exception 'Invalid goal' using errcode='22023'; end if;
 if p_team_id is not null and not exists(select 1 from public.core_team_groups where workspace_id=p_workspace and id=p_team_id) then raise exception 'Team not found' using errcode='P0002'; end if;
 if p_id is null then
  insert into public.core_sales_goals(workspace_id,name,metric,target_value,team_id,notify_role,starts_on,ends_on)
  values(p_workspace,btrim(p_name),p_metric,p_target_value,p_team_id,nullif(btrim(p_notify_role),''),p_starts_on,p_ends_on) returning id into goal_id;
 else
  update public.core_sales_goals set name=btrim(p_name),metric=p_metric,target_value=p_target_value,team_id=p_team_id,notify_role=nullif(btrim(p_notify_role),''),starts_on=p_starts_on,ends_on=p_ends_on,updated_at=now()
  where workspace_id=p_workspace and id=p_id returning id into goal_id;
  if goal_id is null then raise exception 'Goal not found' using errcode='P0002'; end if;
 end if;
 insert into core_private.platform_audit(actor_id,action,workspace_id,metadata) values(auth.uid(),'sales_goal_saved',p_workspace,pg_catalog.jsonb_build_object('goal_id',goal_id,'metric',p_metric,'team_id',p_team_id));
 return pg_catalog.jsonb_build_object('id',goal_id);
end $fn$;

create or replace function public.core_dashboard_refresh_goal_notifications(p_workspace uuid)
returns integer language plpgsql security definer set search_path='' as $fn$
declare g public.core_sales_goals%rowtype; actual numeric; elapsed numeric; projected numeric; alert_status text; affected integer:=0; inserted integer;
begin
 if auth.uid() is null or not public.core_has_permission(p_workspace,'reports.read') then raise exception 'Forbidden' using errcode='42501'; end if;
 for g in select * from public.core_sales_goals where workspace_id=p_workspace and current_date between starts_on and ends_on loop
  if g.metric='leads' then
   select count(*) into actual from public.core_contacts c where c.workspace_id=p_workspace and c.created_at::date between g.starts_on and g.ends_on
    and (g.team_id is null or exists(select 1 from public.core_team_group_members gm where gm.workspace_id=p_workspace and gm.team_id=g.team_id and gm.user_id=c.owner_id));
  elsif g.metric='deals' then
   select count(*) into actual from public.core_deals d where d.workspace_id=p_workspace and d.status='won' and d.updated_at::date between g.starts_on and g.ends_on
    and (g.team_id is null or exists(select 1 from public.core_team_group_members gm where gm.workspace_id=p_workspace and gm.team_id=g.team_id and gm.user_id=d.owner_id));
  else
   select coalesce(sum(d.value),0) into actual from public.core_deals d where d.workspace_id=p_workspace and d.status='won' and d.updated_at::date between g.starts_on and g.ends_on
    and (g.team_id is null or exists(select 1 from public.core_team_group_members gm where gm.workspace_id=p_workspace and gm.team_id=g.team_id and gm.user_id=d.owner_id));
  end if;
  elapsed=greatest(1,current_date-g.starts_on+1); projected=actual/nullif(elapsed,0)*greatest(1,g.ends_on-g.starts_on+1);
  alert_status=case when actual>=g.target_value then 'success' when projected<g.target_value*0.85 then 'risk' else null end;
  if alert_status is not null then
   insert into public.core_notifications(workspace_id,user_id,kind,title,body,automation_execution_key)
   select p_workspace,m.user_id,'goal_'||alert_status,
    case when alert_status='success' then 'Meta atingida: '||g.name else 'Risco na meta: '||g.name end,
    case when alert_status='success' then 'A equipe alcançou a meta definida.' else 'A projeção atual está abaixo de 85% da meta. Revise gargalos e distribuição.' end,
    'goal:'||g.id::text||':'||current_date::text||':'||alert_status||':'||m.user_id::text
   from public.core_memberships m
   where m.workspace_id=p_workspace and m.active and (g.notify_role is null or m.role=g.notify_role)
    and (g.team_id is null or exists(select 1 from public.core_team_group_members gm where gm.workspace_id=p_workspace and gm.team_id=g.team_id and gm.user_id=m.user_id))
   on conflict(workspace_id,automation_execution_key) where automation_execution_key is not null do nothing;
   get diagnostics inserted=row_count; affected=affected+inserted;
  end if;
 end loop;
 return affected;
end $fn$;

revoke all on function public.core_dashboard_preferences_get(uuid) from public,anon;
revoke all on function public.core_dashboard_preferences_save(uuid,jsonb,uuid) from public,anon;
revoke all on function public.core_dashboard_goals_list(uuid) from public,anon;
revoke all on function public.core_dashboard_goal_upsert(uuid,uuid,text,text,numeric,uuid,text,date,date) from public,anon;
revoke all on function public.core_dashboard_refresh_goal_notifications(uuid) from public,anon;
grant execute on function public.core_dashboard_preferences_get(uuid) to authenticated;
grant execute on function public.core_dashboard_preferences_save(uuid,jsonb,uuid) to authenticated;
grant execute on function public.core_dashboard_goals_list(uuid) to authenticated;
grant execute on function public.core_dashboard_goal_upsert(uuid,uuid,text,text,numeric,uuid,text,date,date) to authenticated;
grant execute on function public.core_dashboard_refresh_goal_notifications(uuid) to authenticated;

commit;
