begin;

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
  where m.workspace_id=w
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
declare clean_name text;
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'team.manage')) then
    raise exception 'Permission denied' using errcode='42501';
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

revoke all on function public.core_team_member_directory(uuid) from public,anon,authenticated;
revoke all on function public.core_team_update_member_profile(uuid,uuid,text,text,boolean) from public,anon,authenticated;
grant execute on function public.core_team_member_directory(uuid) to authenticated;
grant execute on function public.core_team_update_member_profile(uuid,uuid,text,text,boolean) to authenticated;

commit;
