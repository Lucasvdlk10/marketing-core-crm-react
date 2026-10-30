begin;
do $$
begin
  if exists(
    select 1 from public.core_memberships
    where role='owner' and active
    group by workspace_id having count(*)>1
  ) then
    raise exception 'Cannot enforce one master owner: duplicate active owners exist';
  end if;
end $$;
create unique index if not exists core_memberships_one_active_owner
on public.core_memberships(workspace_id)
where role='owner' and active;
create or replace function public.core_protect_master_membership()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.role='owner' and old.active then
    if tg_op='DELETE' then
      raise exception 'Master account cannot be removed from team management' using errcode='42501';
    end if;
    if new.role is distinct from old.role
       or new.active is distinct from old.active
       or new.user_id is distinct from old.user_id
       or new.workspace_id is distinct from old.workspace_id then
      raise exception 'Master account role and access are immutable' using errcode='42501';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;
revoke all on function public.core_protect_master_membership() from public,anon,authenticated;
drop trigger if exists core_protect_master_membership on public.core_memberships;
create trigger core_protect_master_membership
before update or delete on public.core_memberships
for each row execute function public.core_protect_master_membership();
create or replace function public.core_team_member_directory(w uuid)
returns table(user_id uuid, full_name text, email text)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'team.manage')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  return query
  select m.user_id,
         coalesce(nullif(btrim(p.full_name),''),nullif(btrim(left(u.raw_user_meta_data->>'full_name',120)),''),'Membro')::text,
         u.email::text
  from public.core_memberships m
  join auth.users u on u.id=m.user_id
  left join public.core_user_profiles p on p.user_id=m.user_id
  where m.workspace_id=w and m.role<>'owner'
  order by m.joined_at asc;
end $$;
create or replace function public.core_team_update_member_profile(
  w uuid,
  p_user uuid,
  p_full_name text,
  p_role text,
  p_active boolean
) returns void
language plpgsql security definer set search_path='' as $$
declare clean_name text; current_role text;
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'team.manage')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  select role into current_role from public.core_memberships where workspace_id=w and user_id=p_user;
  if current_role='owner' or p_role='owner' then
    raise exception 'Master account is managed outside the team directory' using errcode='42501';
  end if;
  clean_name=nullif(btrim(left(coalesce(p_full_name,''),120)),'');
  if clean_name is null then raise exception 'Member name is required' using errcode='22023'; end if;
  perform public.core_team_update_member(w,p_user,p_role,p_active);
  insert into public.core_user_profiles(user_id,full_name)
  values(p_user,clean_name)
  on conflict(user_id) do update set full_name=excluded.full_name,updated_at=now();
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata)
  values(auth.uid(),'member_profile_updated',w,pg_catalog.jsonb_build_object('user_id',p_user,'active',p_active,'role',p_role));
end $$;
create or replace function public.core_limit_master_invitations()
returns trigger language plpgsql set search_path='' as $$
begin
  if new.role='owner' and new.status='pending' and (
    exists(select 1 from public.core_memberships where workspace_id=new.workspace_id and role='owner' and active)
    or exists(select 1 from public.core_invitations where workspace_id=new.workspace_id and role='owner' and status='pending' and id<>new.id)
  ) then
    raise exception 'Workspace already has a master account' using errcode='23505';
  end if;
  return new;
end $$;
revoke all on function public.core_limit_master_invitations() from public,anon,authenticated;
drop trigger if exists core_limit_master_invitations on public.core_invitations;
create trigger core_limit_master_invitations
before insert or update of role,status on public.core_invitations
for each row execute function public.core_limit_master_invitations();
revoke all on function public.core_team_member_directory(uuid) from public,anon,authenticated;
revoke all on function public.core_team_update_member_profile(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.core_team_member_directory(uuid) to authenticated;
grant execute on function public.core_team_update_member_profile(uuid,uuid,text,text,boolean) to authenticated;
commit;
