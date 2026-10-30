begin;
create table if not exists public.core_workspace_settings(
  workspace_id uuid not null references public.core_workspaces(id) on delete cascade,
  setting_key text not null check(setting_key in ('loss_reasons','deal_actions')),
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key(workspace_id,setting_key)
);
alter table public.core_workspace_settings enable row level security;
revoke all on public.core_workspace_settings from public,anon,authenticated;
create or replace function public.core_workspace_setting_read(w uuid,p_key text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.core_has_access(w) then raise exception 'Permission denied' using errcode='42501'; end if;
  if p_key not in ('loss_reasons','deal_actions') then raise exception 'Invalid setting key' using errcode='22023'; end if;
  select value into result from public.core_workspace_settings where workspace_id=w and setting_key=p_key;
  return result;
end $$;
create or replace function public.core_workspace_setting_write(w uuid,p_key text,p_value jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare clean jsonb;
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'workspace.manage')) then raise exception 'Permission denied' using errcode='42501'; end if;
  if p_key not in ('loss_reasons','deal_actions') then raise exception 'Invalid setting key' using errcode='22023'; end if;
  if jsonb_typeof(p_value)<>'array' or jsonb_array_length(p_value)<1 then raise exception 'Setting must be a non-empty array' using errcode='22023'; end if;
  select jsonb_agg(value order by ordinality) into clean
  from jsonb_array_elements_text(p_value) with ordinality as items(value,ordinality)
  where length(btrim(value)) between 1 and 120;
  if clean is null or jsonb_array_length(clean)<>jsonb_array_length(p_value) then raise exception 'Invalid setting value' using errcode='22023'; end if;
  insert into public.core_workspace_settings(workspace_id,setting_key,value,updated_at,updated_by)
  values(w,p_key,clean,now(),auth.uid())
  on conflict(workspace_id,setting_key) do update set value=excluded.value,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata)
  values(auth.uid(),'workspace_setting_updated',w,pg_catalog.jsonb_build_object('setting_key',p_key));
  return clean;
end $$;
revoke all on function public.core_workspace_setting_read(uuid,text) from public,anon,authenticated;
revoke all on function public.core_workspace_setting_write(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.core_workspace_setting_read(uuid,text) to authenticated;
grant execute on function public.core_workspace_setting_write(uuid,text,jsonb) to authenticated;
commit;
