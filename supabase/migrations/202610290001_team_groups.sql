begin;
create table if not exists public.core_team_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.core_workspaces(id) on delete cascade,
  name text not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint core_team_groups_name_length check (char_length(btrim(name)) between 2 and 80)
);
create unique index if not exists core_team_groups_workspace_name_unique
on public.core_team_groups(workspace_id, lower(btrim(name)));
create index if not exists core_team_groups_workspace_idx
on public.core_team_groups(workspace_id, created_at);
create table if not exists public.core_team_group_members (
  workspace_id uuid not null references public.core_workspaces(id) on delete cascade,
  team_id uuid not null references public.core_team_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  added_by uuid references auth.users(id) on delete set null default auth.uid(),
  added_at timestamptz not null default now(),
  primary key(team_id, user_id)
);
create index if not exists core_team_group_members_workspace_idx
on public.core_team_group_members(workspace_id, user_id);
alter table public.core_team_groups enable row level security;
alter table public.core_team_group_members enable row level security;
revoke all on public.core_team_groups from public, anon, authenticated;
revoke all on public.core_team_group_members from public, anon, authenticated;
create or replace function public.core_team_groups(w uuid)
returns table(id uuid, name text, member_ids uuid[], created_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not (
    public.core_is_super_admin()
    or exists(select 1 from public.core_memberships m where m.workspace_id=w and m.user_id=auth.uid() and m.active)
  ) then
    raise exception 'Permission denied' using errcode='42501';
  end if;

  return query
  select g.id,
         g.name,
         coalesce(array_agg(gm.user_id order by gm.added_at) filter(where gm.user_id is not null), array[]::uuid[]) as member_ids,
         g.created_at
  from public.core_team_groups g
  left join public.core_team_group_members gm on gm.team_id=g.id and gm.workspace_id=g.workspace_id
  where g.workspace_id=w
  group by g.id, g.name, g.created_at
  order by g.name asc, g.id asc;
end $$;
create or replace function public.core_team_group_create(w uuid, p_name text)
returns uuid
language plpgsql security definer set search_path='' as $$
declare clean_name text; new_id uuid;
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'team.manage')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  clean_name=nullif(btrim(left(coalesce(p_name,''),80)),'');
  if clean_name is null or char_length(clean_name)<2 then
    raise exception 'Team name must have at least 2 characters' using errcode='22023';
  end if;
  insert into public.core_team_groups(workspace_id,name,created_by)
  values(w,clean_name,auth.uid()) returning id into new_id;
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata)
  values(auth.uid(),'team_group_created',w,pg_catalog.jsonb_build_object('team_id',new_id,'name',clean_name));
  return new_id;
end $$;
create or replace function public.core_team_group_rename(w uuid, p_team uuid, p_name text)
returns void
language plpgsql security definer set search_path='' as $$
declare clean_name text;
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'team.manage')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  clean_name=nullif(btrim(left(coalesce(p_name,''),80)),'');
  if clean_name is null or char_length(clean_name)<2 then
    raise exception 'Team name must have at least 2 characters' using errcode='22023';
  end if;
  update public.core_team_groups set name=clean_name,updated_at=now()
  where id=p_team and workspace_id=w;
  if not found then raise exception 'Team not found' using errcode='P0002'; end if;
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata)
  values(auth.uid(),'team_group_renamed',w,pg_catalog.jsonb_build_object('team_id',p_team,'name',clean_name));
end $$;
create or replace function public.core_team_group_delete(w uuid, p_team uuid)
returns void
language plpgsql security definer set search_path='' as $$
declare deleted_name text;
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'team.manage')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  delete from public.core_team_groups where id=p_team and workspace_id=w returning name into deleted_name;
  if deleted_name is null then raise exception 'Team not found' using errcode='P0002'; end if;
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata)
  values(auth.uid(),'team_group_deleted',w,pg_catalog.jsonb_build_object('team_id',p_team,'name',deleted_name));
end $$;
create or replace function public.core_team_group_add_member(w uuid, p_team uuid, p_user uuid)
returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'team.manage')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if not exists(select 1 from public.core_team_groups where id=p_team and workspace_id=w) then
    raise exception 'Team not found' using errcode='P0002';
  end if;
  if not exists(select 1 from public.core_memberships where workspace_id=w and user_id=p_user and active and role<>'owner') then
    raise exception 'Active team member not found' using errcode='22023';
  end if;
  insert into public.core_team_group_members(workspace_id,team_id,user_id,added_by)
  values(w,p_team,p_user,auth.uid()) on conflict(team_id,user_id) do nothing;
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata)
  values(auth.uid(),'team_group_member_added',w,pg_catalog.jsonb_build_object('team_id',p_team,'user_id',p_user));
end $$;
create or replace function public.core_team_group_remove_member(w uuid, p_team uuid, p_user uuid)
returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'team.manage')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  if not exists(select 1 from public.core_team_groups where id=p_team and workspace_id=w) then
    raise exception 'Team not found' using errcode='P0002';
  end if;
  delete from public.core_team_group_members where workspace_id=w and team_id=p_team and user_id=p_user;
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata)
  values(auth.uid(),'team_group_member_removed',w,pg_catalog.jsonb_build_object('team_id',p_team,'user_id',p_user));
end $$;
revoke all on function public.core_team_groups(uuid) from public,anon,authenticated;
revoke all on function public.core_team_group_create(uuid,text) from public,anon,authenticated;
revoke all on function public.core_team_group_rename(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.core_team_group_delete(uuid,uuid) from public,anon,authenticated;
revoke all on function public.core_team_group_add_member(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.core_team_group_remove_member(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.core_team_groups(uuid) to authenticated;
grant execute on function public.core_team_group_create(uuid,text) to authenticated;
grant execute on function public.core_team_group_rename(uuid,uuid,text) to authenticated;
grant execute on function public.core_team_group_delete(uuid,uuid) to authenticated;
grant execute on function public.core_team_group_add_member(uuid,uuid,uuid) to authenticated;
grant execute on function public.core_team_group_remove_member(uuid,uuid,uuid) to authenticated;
commit;
