-- Workspace-scoped user presence persisted in Supabase.
begin;
create table if not exists public.core_user_presence(
  workspace_id uuid not null references public.core_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'online' check(status in('online','meeting','away','offline')),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,user_id),
  foreign key(workspace_id,user_id) references public.core_memberships(workspace_id,user_id) on delete cascade
);
alter table public.core_user_presence enable row level security;
drop policy if exists core_user_presence_read on public.core_user_presence;
create policy core_user_presence_read on public.core_user_presence for select to authenticated
 using(public.core_has_access(workspace_id));
create or replace function public.core_presence_get(p_workspace uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $fn$
declare result jsonb;
begin
 if auth.uid() is null or not public.core_has_access(p_workspace) then raise exception 'Forbidden' using errcode='42501'; end if;
 select pg_catalog.jsonb_build_object('status',p.status,'updated_at',p.updated_at) into result
 from public.core_user_presence p where p.workspace_id=p_workspace and p.user_id=auth.uid();
 return coalesce(result,pg_catalog.jsonb_build_object('status','online','updated_at',null));
end $fn$;
create or replace function public.core_presence_set(p_workspace uuid,p_status text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare result jsonb;
begin
 if auth.uid() is null or not public.core_has_access(p_workspace) then raise exception 'Forbidden' using errcode='42501'; end if;
 if p_status not in('online','meeting','away','offline') then raise exception 'Invalid presence status' using errcode='22023'; end if;
 insert into public.core_user_presence(workspace_id,user_id,status,updated_at)
 values(p_workspace,auth.uid(),p_status,now())
 on conflict(workspace_id,user_id) do update set status=excluded.status,updated_at=excluded.updated_at;
 select pg_catalog.jsonb_build_object('status',p.status,'updated_at',p.updated_at) into result
 from public.core_user_presence p where p.workspace_id=p_workspace and p.user_id=auth.uid();
 return result;
end $fn$;
revoke all on public.core_user_presence from public,anon,authenticated;
grant select on public.core_user_presence to authenticated;
revoke all on function public.core_presence_get(uuid),public.core_presence_set(uuid,text) from public,anon;
grant execute on function public.core_presence_get(uuid),public.core_presence_set(uuid,text) to authenticated;
commit;
