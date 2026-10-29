begin;

create unique index if not exists core_team_groups_workspace_id_unique
on public.core_team_groups(workspace_id,id);

alter table public.core_team_group_members
  drop constraint if exists core_team_group_members_team_workspace_fk;

alter table public.core_team_group_members
  add constraint core_team_group_members_team_workspace_fk
  foreign key(workspace_id,team_id)
  references public.core_team_groups(workspace_id,id) on delete cascade;

create or replace function public.core_team_groups(w uuid)
returns table(id uuid, name text, member_ids uuid[], created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'team.manage')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  return query
  select g.id,g.name,
         coalesce(array_agg(gm.user_id order by gm.added_at) filter(where gm.user_id is not null),array[]::uuid[]) as member_ids,
         g.created_at
  from public.core_team_groups g
  left join public.core_team_group_members gm on gm.team_id=g.id and gm.workspace_id=g.workspace_id
  where g.workspace_id=w
  group by g.id,g.name,g.created_at
  order by g.name asc,g.id asc;
end $$;

create or replace function public.core_team_group_add_member(w uuid,p_team uuid,p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'team.manage')) then raise exception 'Permission denied' using errcode='42501'; end if;
  if not exists(select 1 from public.core_team_groups where id=p_team and workspace_id=w) then raise exception 'Team not found' using errcode='P0002'; end if;
  if not exists(select 1 from public.core_memberships where workspace_id=w and user_id=p_user and active and role<>'owner') then raise exception 'Active team member not found' using errcode='22023'; end if;
  insert into public.core_team_group_members(workspace_id,team_id,user_id,added_by) values(w,p_team,p_user,auth.uid()) on conflict(team_id,user_id) do nothing;
  if not found then return; end if;
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata) values(auth.uid(),'team_group_member_added',w,pg_catalog.jsonb_build_object('team_id',p_team,'user_id',p_user));
end $$;

create or replace function public.core_team_group_remove_member(w uuid,p_team uuid,p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'team.manage')) then raise exception 'Permission denied' using errcode='42501'; end if;
  if not exists(select 1 from public.core_team_groups where id=p_team and workspace_id=w) then raise exception 'Team not found' using errcode='P0002'; end if;
  delete from public.core_team_group_members where workspace_id=w and team_id=p_team and user_id=p_user;
  if not found then return; end if;
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata) values(auth.uid(),'team_group_member_removed',w,pg_catalog.jsonb_build_object('team_id',p_team,'user_id',p_user));
end $$;

create or replace function public.core_team_group_set_members(w uuid,p_team uuid,p_users uuid[])
returns void language plpgsql security definer set search_path='' as $$
declare clean_users uuid[]; invalid_count integer;
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'team.manage')) then raise exception 'Permission denied' using errcode='42501'; end if;
  if not exists(select 1 from public.core_team_groups where id=p_team and workspace_id=w) then raise exception 'Team not found' using errcode='P0002'; end if;
  select coalesce(array_agg(distinct user_id),array[]::uuid[]) into clean_users from unnest(coalesce(p_users,array[]::uuid[])) as requested(user_id);
  select count(*) into invalid_count from unnest(clean_users) as requested(user_id)
  where not exists(select 1 from public.core_memberships m where m.workspace_id=w and m.user_id=requested.user_id and m.active and m.role<>'owner');
  if invalid_count>0 then raise exception 'One or more active team members were not found' using errcode='22023'; end if;
  delete from public.core_team_group_members where workspace_id=w and team_id=p_team and not(user_id=any(clean_users));
  insert into public.core_team_group_members(workspace_id,team_id,user_id,added_by)
  select w,p_team,user_id,auth.uid() from unnest(clean_users) as requested(user_id) on conflict(team_id,user_id) do nothing;
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata)
  values(auth.uid(),'team_group_members_replaced',w,pg_catalog.jsonb_build_object('team_id',p_team,'member_ids',to_jsonb(clean_users)));
end $$;

revoke all on function public.core_team_group_set_members(uuid,uuid,uuid[]) from public,anon,authenticated;
grant execute on function public.core_team_group_set_members(uuid,uuid,uuid[]) to authenticated;

commit;
