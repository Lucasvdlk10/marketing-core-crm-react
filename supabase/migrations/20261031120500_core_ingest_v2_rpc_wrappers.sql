-- Forward-only source-of-truth migration for the server-only v2 RPC wrappers
-- used by the deployed core-webhook-v2 Edge Function. Existing staging functions
-- are preserved semantically; this migration makes clean installs reproducible.
begin;

create or replace function public.core_ingest_authorize_v2(p_key text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare k record; bucket_time timestamptz; hit_count int;
begin
 if auth.role()<>'service_role' then raise exception 'Server-only endpoint' using errcode='42501'; end if;
 if length(coalesce(p_key,''))<>64 or p_key !~ '^[a-f0-9]{64}$' then return null; end if;
 select k0.id,k0.workspace_id into k from core_private.ingest_keys k0 join public.core_workspaces w on w.id=k0.workspace_id
 where k0.key_digest=encode(extensions.digest(p_key,'sha256'),'hex') and k0.enabled and k0.revoked_at is null
 and (k0.expires_at is null or k0.expires_at>now()) and w.state='active';
 if not found then return null; end if;
 bucket_time=date_trunc('minute',now());
 insert into core_private.webhook_rate(key_id,bucket,hits) values(k.id,bucket_time,1)
 on conflict(key_id,bucket) do update set hits=core_private.webhook_rate.hits+1 returning hits into hit_count;
 if hit_count>60 then raise exception 'Rate limit exceeded' using errcode='P0001'; end if;
 update core_private.ingest_keys set last_used_at=now() where id=k.id;
 return k.workspace_id;
end
$function$;
revoke all on function public.core_ingest_authorize_v2(text) from public, anon, authenticated;
grant execute on function public.core_ingest_authorize_v2(text) to service_role;

create or replace function public.core_ingest_lead_v2(p_workspace uuid,p_key text,p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
begin
 if auth.role()<>'service_role' then raise exception 'Server-only endpoint' using errcode='42501'; end if;
 if not exists(select 1 from public.core_workspaces where id=p_workspace and state='active') then raise exception 'Inactive workspace' using errcode='42501'; end if;
 return public.core_ingest_lead(p_workspace,p_key,p_payload);
end
$function$;
revoke all on function public.core_ingest_lead_v2(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.core_ingest_lead_v2(uuid,text,jsonb) to service_role;

commit;
