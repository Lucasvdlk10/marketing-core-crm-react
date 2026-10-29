begin;
create or replace function public.core_workspace_webhook_authorize(p_public_id text,p_token text)
returns uuid
language plpgsql security definer set search_path='' as $$
declare found_id uuid; found_workspace uuid; current_hits integer; minute_bucket timestamptz:=date_trunc('minute',now());
begin
  if p_public_id !~ '^[a-f0-9]{32}$' or p_token !~ '^[a-f0-9]{64}$' then return null; end if;
  select x.id,x.workspace_id into found_id,found_workspace
  from core_private.workspace_webhooks x
  join public.core_workspaces w on w.id=x.workspace_id and w.state='active'
  where x.public_id=p_public_id and x.enabled and x.token_digest=extensions.digest(pg_catalog.convert_to(p_token,'UTF8'),'sha256')
  for update of x;
  if found_id is null then return null; end if;
  insert into core_private.workspace_webhook_rate(webhook_id,bucket,hits) values(found_id,minute_bucket,1)
  on conflict(webhook_id,bucket) do update set hits=core_private.workspace_webhook_rate.hits+1 returning hits into current_hits;
  if current_hits>60 then raise exception 'Rate limit'; end if;
  update core_private.workspace_webhooks set last_used_at=now() where id=found_id;
  return found_workspace;
end $$;
revoke all on function public.core_workspace_webhook_authorize(text,text) from public,anon,authenticated;
grant execute on function public.core_workspace_webhook_authorize(text,text) to service_role;
commit;
