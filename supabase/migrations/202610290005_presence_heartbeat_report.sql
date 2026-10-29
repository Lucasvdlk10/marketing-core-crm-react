begin;

create or replace function public.core_presence_heartbeat(p_workspace uuid)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare result jsonb;
begin
 if auth.uid() is null or not public.core_has_access(p_workspace) then raise exception 'Forbidden' using errcode='42501'; end if;
 insert into public.core_user_presence(workspace_id,user_id,status,updated_at)
 values(p_workspace,auth.uid(),'online',now())
 on conflict(workspace_id,user_id) do update set updated_at=excluded.updated_at;
 select pg_catalog.jsonb_build_object('status',p.status,'updated_at',p.updated_at) into result
 from public.core_user_presence p where p.workspace_id=p_workspace and p.user_id=auth.uid();
 return result;
end $fn$;

create or replace function public.core_presence_report(p_workspace uuid,p_since timestamptz default null)
returns table(user_id uuid,full_name text,status text,updated_at timestamptz,is_online boolean)
language plpgsql stable security definer set search_path='' as $fn$
begin
 if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(p_workspace,'reports.read')) then
  raise exception 'Forbidden' using errcode='42501';
 end if;
 return query
 select m.user_id,
        coalesce(nullif(btrim(up.full_name),''),split_part(au.email,'@',1),'Usuário') as full_name,
        case when p.updated_at>=now()-interval '2 minutes' then p.status else 'offline' end as status,
        case when p_since is null or p.updated_at>=p_since then p.updated_at else null end as updated_at,
        coalesce(p.updated_at>=now()-interval '2 minutes' and p.status<>'offline',false) as is_online
 from public.core_memberships m
 left join public.core_user_profiles up on up.user_id=m.user_id
 left join auth.users au on au.id=m.user_id
 left join public.core_user_presence p on p.workspace_id=m.workspace_id and p.user_id=m.user_id
 where m.workspace_id=p_workspace and m.active
 order by lower(coalesce(nullif(btrim(up.full_name),''),au.email,'')),m.user_id;
end $fn$;

revoke all on function public.core_presence_heartbeat(uuid),public.core_presence_report(uuid,timestamptz) from public,anon;
grant execute on function public.core_presence_heartbeat(uuid),public.core_presence_report(uuid,timestamptz) to authenticated;

commit;
