begin;

create table if not exists public.core_workspace_roles(
  workspace_id uuid not null references public.core_workspaces(id) on delete cascade,
  id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(workspace_id,id),
  check(id ~ '^custom-[a-z0-9-]{1,48}$'),
  check(length(btrim(name)) between 2 and 80)
);
alter table public.core_workspace_roles enable row level security;
revoke all on public.core_workspace_roles from public,anon;
grant select on public.core_workspace_roles to authenticated;
grant all on public.core_workspace_roles to service_role;
create policy core_workspace_roles_read on public.core_workspace_roles for select to authenticated
 using(public.core_has_permission(workspace_id,'team.manage') or public.core_has_permission(workspace_id,'roles.manage'));

alter table public.core_memberships drop constraint if exists core_memberships_role_v2_chk;
alter table public.core_memberships add constraint core_memberships_role_v3_chk
 check(role in('owner','admin','marketing_manager','sdr','closer','viewer') or role ~ '^custom-[a-z0-9-]{1,48}$');
alter table public.core_invitations drop constraint if exists core_invitations_role_check;
alter table public.core_invitations add constraint core_invitations_role_v2_check
 check(role in('owner','admin','marketing_manager','sdr','closer','viewer') or role ~ '^custom-[a-z0-9-]{1,48}$');
alter table public.core_role_permissions drop constraint if exists core_role_permissions_role_check;
alter table public.core_role_permissions add constraint core_role_permissions_role_v2_check
 check(role in('admin','marketing_manager','sdr','closer','viewer') or role ~ '^custom-[a-z0-9-]{1,48}$');

create or replace function public.core_member_has_permission(w uuid,p_user uuid,p text)
returns boolean language sql stable security definer set search_path='' as $fn$
 select public.core_supported_permission(p) and exists(
  select 1 from public.core_memberships m join public.core_workspaces x on x.id=m.workspace_id
  where m.workspace_id=w and m.user_id=p_user and m.active and x.state='active'
   and (m.role='owner' or exists(select 1 from public.core_role_permissions rp where rp.workspace_id=m.workspace_id and rp.role=m.role and rp.permission=p and rp.enabled))
 )
$fn$;

create or replace function public.core_team_set_permission(w uuid,p_role text,p_permission text,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $fn$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not (public.core_is_super_admin() or exists(select 1 from public.core_memberships m join public.core_workspaces x on x.id=m.workspace_id where m.workspace_id=w and m.user_id=auth.uid() and m.active and m.role='owner' and x.state='active')) then raise exception 'Owner permission required' using errcode='42501'; end if;
 if p_role='owner' or not (p_role in('admin','marketing_manager','sdr','closer','viewer') or exists(select 1 from public.core_workspace_roles r where r.workspace_id=w and r.id=p_role)) then raise exception 'Invalid configurable role' using errcode='22023'; end if;
 if not public.core_supported_permission(p_permission) then raise exception 'Unsupported permission' using errcode='22023'; end if;
 insert into public.core_role_permissions(workspace_id,role,permission,enabled) values(w,p_role,p_permission,p_enabled)
 on conflict(workspace_id,role,permission) do update set enabled=excluded.enabled;
 insert into core_private.platform_audit(actor_id,action,workspace_id,metadata) values(auth.uid(),'role_permission_changed',w,pg_catalog.jsonb_build_object('role',p_role,'permission',p_permission,'enabled',p_enabled));
end $fn$;

create or replace function public.core_workspace_roles_replace(w uuid,p_roles jsonb)
returns void language plpgsql security definer set search_path='' as $fn$
declare item jsonb; role_id text; role_name text; incoming text[]:=array[]::text[]; removed text;
begin
 if auth.uid() is null or not (public.core_is_super_admin() or exists(select 1 from public.core_memberships m where m.workspace_id=w and m.user_id=auth.uid() and m.active and m.role='owner')) then raise exception 'Owner permission required' using errcode='42501'; end if;
 if jsonb_typeof(p_roles)<>'array' or jsonb_array_length(p_roles)>20 then raise exception 'Invalid roles payload' using errcode='22023'; end if;
 for item in select value from pg_catalog.jsonb_array_elements(p_roles) loop
  role_id=btrim(item->>'id'); role_name=btrim(item->>'name');
  if role_id !~ '^custom-[a-z0-9-]{1,48}$' or length(role_name) not between 2 and 80 then raise exception 'Invalid custom role' using errcode='22023'; end if;
  if role_id=any(incoming) then raise exception 'Duplicate custom role' using errcode='23505'; end if;
  incoming=array_append(incoming,role_id);
  insert into public.core_workspace_roles(workspace_id,id,name) values(w,role_id,role_name)
  on conflict(workspace_id,id) do update set name=excluded.name,updated_at=now();
 end loop;
 for removed in select id from public.core_workspace_roles where workspace_id=w and not(id=any(incoming)) loop
  if exists(select 1 from public.core_memberships where workspace_id=w and role=removed) or exists(select 1 from public.core_invitations where workspace_id=w and role=removed and status='pending') then raise exception 'Role is assigned and cannot be deleted: %',removed using errcode='23503'; end if;
  delete from public.core_role_permissions where workspace_id=w and role=removed;
  delete from public.core_workspace_roles where workspace_id=w and id=removed;
 end loop;
 insert into core_private.platform_audit(actor_id,action,workspace_id,metadata) values(auth.uid(),'workspace_roles_replaced',w,pg_catalog.jsonb_build_object('count',cardinality(incoming)));
end $fn$;

create or replace function public.core_team_update_member(w uuid,p_user uuid,p_role text,p_active boolean)
returns void language plpgsql security definer set search_path='' as $fn$
declare old_row public.core_memberships%rowtype; actor_owner boolean; occupied int; max_users int; owner_count int;
begin
 if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'team.manage')) then raise exception 'Permission denied' using errcode='42501'; end if;
 if not (p_role in('owner','admin','marketing_manager','sdr','closer','viewer') or exists(select 1 from public.core_workspace_roles r where r.workspace_id=w and r.id=p_role)) then raise exception 'Invalid role' using errcode='22023'; end if;
 select max_members into max_users from public.core_workspaces where id=w and state='active' for update; if not found then raise exception 'Workspace inactive' using errcode='42501'; end if;
 select * into old_row from public.core_memberships where workspace_id=w and user_id=p_user for update; if not found then raise exception 'Member not found' using errcode='P0002'; end if;
 actor_owner=public.core_is_super_admin() or exists(select 1 from public.core_memberships where workspace_id=w and user_id=auth.uid() and active and role='owner');
 if (old_row.role='owner' or p_role='owner') and not actor_owner then raise exception 'Owner-only operation' using errcode='42501'; end if;
 if p_active and not old_row.active then select count(*) into occupied from public.core_memberships where workspace_id=w and active; occupied=occupied+(select count(*) from public.core_invitations where workspace_id=w and status='pending' and expires_at>now()); if occupied>=max_users then raise exception 'Workspace seat limit reached' using errcode='23514'; end if; end if;
 select count(*) into owner_count from public.core_memberships where workspace_id=w and role='owner' and active;
 if old_row.role='owner' and old_row.active and (p_role<>'owner' or not p_active) and owner_count<=1 then raise exception 'Last active owner cannot be removed' using errcode='23514'; end if;
 update public.core_memberships set role=p_role,active=p_active where workspace_id=w and user_id=p_user;
 insert into core_private.platform_audit(actor_id,action,workspace_id,metadata) values(auth.uid(),'member_updated',w,pg_catalog.jsonb_build_object('active',p_active,'role',p_role));
end $fn$;

revoke all on function public.core_workspace_roles_replace(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.core_workspace_roles_replace(uuid,jsonb) to authenticated;

commit;
