begin;
create table core_private.workspace_webhooks (
  id uuid primary key default gen_random_uuid(),
  public_id text not null unique,
  workspace_id uuid not null references public.core_workspaces(id) on delete cascade,
  name text not null,
  token_digest bytea not null,
  vault_secret_id uuid not null,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz,
  disabled_at timestamptz,
  constraint workspace_webhooks_public_id_format check (public_id ~ '^[a-f0-9]{32}$'),
  constraint workspace_webhooks_name_length check (char_length(btrim(name)) between 2 and 80)
);
create index workspace_webhooks_workspace_idx on core_private.workspace_webhooks(workspace_id, created_at desc);
revoke all on core_private.workspace_webhooks from public, anon, authenticated;
create table core_private.workspace_webhook_rate (
  webhook_id uuid not null references core_private.workspace_webhooks(id) on delete cascade,
  bucket timestamptz not null,
  hits integer not null default 0,
  primary key(webhook_id, bucket)
);
revoke all on core_private.workspace_webhook_rate from public, anon, authenticated;
create or replace function public.core_workspace_webhook_list(w uuid)
returns table(id uuid, public_id text, name text, enabled boolean, created_at timestamptz, last_used_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'integration.manage')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  return query
  select x.id,x.public_id,x.name,x.enabled,x.created_at,x.last_used_at
  from core_private.workspace_webhooks x
  where x.workspace_id=w
  order by x.created_at desc,x.id;
end $$;
create or replace function public.core_workspace_webhook_create(w uuid, p_name text)
returns table(id uuid, public_id text, name text, enabled boolean, created_at timestamptz, token text)
language plpgsql security definer set search_path='' as $$
declare
  clean_name text;
  new_id uuid:=gen_random_uuid();
  new_public_id text:=pg_catalog.encode(extensions.gen_random_bytes(16),'hex');
  new_token text:=pg_catalog.encode(extensions.gen_random_bytes(32),'hex');
  secret_id uuid;
  created_time timestamptz:=now();
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'integration.manage')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  clean_name=nullif(btrim(left(coalesce(p_name,''),80)),'');
  if clean_name is null or char_length(clean_name)<2 then
    raise exception 'Webhook name must have at least 2 characters' using errcode='22023';
  end if;
  select vault.create_secret(new_token,'crm_webhook_'||new_id::text,'CRM workspace webhook token') into secret_id;
  insert into core_private.workspace_webhooks(id,public_id,workspace_id,name,token_digest,vault_secret_id,created_by,created_at,updated_at)
  values(new_id,new_public_id,w,clean_name,extensions.digest(pg_catalog.convert_to(new_token,'UTF8'),'sha256'),secret_id,auth.uid(),created_time,created_time);
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata)
  values(auth.uid(),'workspace_webhook_created',w,pg_catalog.jsonb_build_object('webhook_id',new_id,'name',clean_name));
  return query select new_id,new_public_id,clean_name,true,created_time,new_token;
end $$;
create or replace function public.core_workspace_webhook_reveal(w uuid, p_webhook uuid)
returns text
language plpgsql security definer set search_path='' as $$
declare secret_value text;
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'integration.manage')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  select d.decrypted_secret into secret_value
  from core_private.workspace_webhooks x
  join vault.decrypted_secrets d on d.id=x.vault_secret_id
  where x.id=p_webhook and x.workspace_id=w;
  if secret_value is null then raise exception 'Webhook not found' using errcode='P0002'; end if;
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata)
  values(auth.uid(),'workspace_webhook_token_revealed',w,pg_catalog.jsonb_build_object('webhook_id',p_webhook));
  return secret_value;
end $$;
create or replace function public.core_workspace_webhook_rename(w uuid, p_webhook uuid, p_name text)
returns void
language plpgsql security definer set search_path='' as $$
declare clean_name text;
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'integration.manage')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  clean_name=nullif(btrim(left(coalesce(p_name,''),80)),'');
  if clean_name is null or char_length(clean_name)<2 then raise exception 'Webhook name must have at least 2 characters' using errcode='22023'; end if;
  update core_private.workspace_webhooks set name=clean_name,updated_at=now() where id=p_webhook and workspace_id=w;
  if not found then raise exception 'Webhook not found' using errcode='P0002'; end if;
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata)
  values(auth.uid(),'workspace_webhook_renamed',w,pg_catalog.jsonb_build_object('webhook_id',p_webhook,'name',clean_name));
end $$;
create or replace function public.core_workspace_webhook_set_enabled(w uuid, p_webhook uuid, p_enabled boolean)
returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'integration.manage')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  update core_private.workspace_webhooks
  set enabled=p_enabled,disabled_at=case when p_enabled then null else now() end,updated_at=now()
  where id=p_webhook and workspace_id=w;
  if not found then raise exception 'Webhook not found' using errcode='P0002'; end if;
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata)
  values(auth.uid(),case when p_enabled then 'workspace_webhook_enabled' else 'workspace_webhook_disabled' end,w,pg_catalog.jsonb_build_object('webhook_id',p_webhook));
end $$;
create or replace function public.core_workspace_webhook_delete(w uuid, p_webhook uuid)
returns void
language plpgsql security definer set search_path='' as $$
declare secret_id uuid;
begin
  if auth.uid() is null or not (public.core_is_super_admin() or public.core_has_permission(w,'integration.manage')) then
    raise exception 'Permission denied' using errcode='42501';
  end if;
  delete from core_private.workspace_webhooks where id=p_webhook and workspace_id=w returning vault_secret_id into secret_id;
  if secret_id is null then raise exception 'Webhook not found' using errcode='P0002'; end if;
  delete from vault.secrets where id=secret_id;
  insert into core_private.platform_audit(actor_id,action,workspace_id,metadata)
  values(auth.uid(),'workspace_webhook_deleted',w,pg_catalog.jsonb_build_object('webhook_id',p_webhook));
end $$;
create or replace function public.core_workspace_webhook_authorize(p_public_id text,p_token text)
returns uuid
language plpgsql security definer set search_path='' as $$
declare found_id uuid; found_workspace uuid; current_hits integer; minute_bucket timestamptz:=date_trunc('minute',now());
begin
  if p_public_id !~ '^[a-f0-9]{32}$' or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
  select x.id,x.workspace_id into found_id,found_workspace
  from core_private.workspace_webhooks x
  join public.core_workspaces w on w.id=x.workspace_id and w.active
  where x.public_id=p_public_id and x.enabled and x.token_digest=extensions.digest(pg_catalog.convert_to(p_token,'UTF8'),'sha256')
  for update of x;
  if found_id is null then return null; end if;
  insert into core_private.workspace_webhook_rate(webhook_id,bucket,hits) values(found_id,minute_bucket,1)
  on conflict(webhook_id,bucket) do update set hits=core_private.workspace_webhook_rate.hits+1 returning hits into current_hits;
  if current_hits>60 then raise exception 'Rate limit'; end if;
  update core_private.workspace_webhooks set last_used_at=now() where id=found_id;
  return found_workspace;
end $$;
revoke all on function public.core_workspace_webhook_list(uuid) from public,anon,authenticated;
revoke all on function public.core_workspace_webhook_create(uuid,text) from public,anon,authenticated;
revoke all on function public.core_workspace_webhook_reveal(uuid,uuid) from public,anon,authenticated;
revoke all on function public.core_workspace_webhook_rename(uuid,uuid,text) from public,anon,authenticated;
revoke all on function public.core_workspace_webhook_set_enabled(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function public.core_workspace_webhook_delete(uuid,uuid) from public,anon,authenticated;
revoke all on function public.core_workspace_webhook_authorize(text,text) from public,anon,authenticated;
grant execute on function public.core_workspace_webhook_list(uuid) to authenticated;
grant execute on function public.core_workspace_webhook_create(uuid,text) to authenticated;
grant execute on function public.core_workspace_webhook_reveal(uuid,uuid) to authenticated;
grant execute on function public.core_workspace_webhook_rename(uuid,uuid,text) to authenticated;
grant execute on function public.core_workspace_webhook_set_enabled(uuid,uuid,boolean) to authenticated;
grant execute on function public.core_workspace_webhook_delete(uuid,uuid) to authenticated;
grant execute on function public.core_workspace_webhook_authorize(text,text) to service_role;
commit;
