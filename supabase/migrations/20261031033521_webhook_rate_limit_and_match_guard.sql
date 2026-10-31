begin;

-- Existing-project rollout: apply this migration while Edge v6 remains active.
-- Until v7 is deployed, v6 rejects a rate_limited object without workspace_id
-- as unauthorized (no lead is ingested); then deploy v7 to return HTTP 429.
-- Fresh installs must complete the migration chain before exposing the Edge function.
-- Only webhook authorization, event identity, and matching change here. The
-- validator's additive source_label contract remains defined by the preceding
-- migration, so this forward migration does not replace that function.

-- Return the authenticated webhook identity to the edge function without exposing its token.
create or replace function public.core_workspace_webhook_authorize_v2(p_public_id text,p_token text)
returns jsonb
language plpgsql security definer set search_path='' as $fn$
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
  if current_hits>60 then return pg_catalog.jsonb_build_object('rate_limited',true,'retry_after_seconds',60); end if;
  update core_private.workspace_webhooks set last_used_at=now() where id=found_id;
  return pg_catalog.jsonb_build_object('workspace_id',found_workspace,'webhook_id',found_id);
end $fn$;
revoke all on function public.core_workspace_webhook_authorize_v2(text,text) from public,anon,authenticated;
grant execute on function public.core_workspace_webhook_authorize_v2(text,text) to service_role;

-- Require authenticated webhook identity for exact, wildcard, and legacy sources.
create or replace function public.core_automation_match_active(p_event_id uuid,p_worker_id uuid)
returns table(rule_id uuid,revision_id uuid,creator_id uuid,graph jsonb)
language plpgsql security definer set search_path='' as $fn$
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 return query
 select r.id,v.id,r.creator_id,v.graph
 from public.core_automation_events e
 join public.core_automation_rules r on r.workspace_id=e.workspace_id and r.enabled and r.active_revision_id is not null
 join public.core_automation_rule_revisions v on v.workspace_id=r.workspace_id and v.rule_id=r.id and v.id=r.active_revision_id
 cross join lateral (select n from pg_catalog.jsonb_array_elements(v.graph->'nodes') n where n->>'type'='trigger' limit 1) trigger_row
 where e.id=p_event_id and e.status='processing' and e.worker_id=p_worker_id and e.lease_until>now()
 and trigger_row.n->>'subtype'=e.event_type
 and (e.context->>'target_revision_id' is null or e.context->>'target_revision_id'=v.id::text)
 and (e.context->>'target_rule_id' is null or e.context->>'target_rule_id'=r.id::text)
 and (
  trigger_row.n->'config'->>'source_type' is distinct from 'segment'
  or exists(
   select 1 from public.core_segment_list_members m
   where m.workspace_id=e.workspace_id
    and m.list_id=(trigger_row.n->'config'->>'source_id')::uuid
    and m.contact_id=e.aggregate_id
  )
 )
 and (
  trigger_row.n->'config'->>'source_type' is distinct from 'webhook'
  or (e.context ? 'source_webhook_id' and (
       trigger_row.n->'config'->>'source_id'='webhook-lead-created'
       or trigger_row.n->'config'->>'source_id'='webhook-all'
       or trigger_row.n->'config'->>'source_id'=e.context->>'source_webhook_id'
  ))
 );
 if not found and not exists(select 1 from public.core_automation_events where id=p_event_id and status='processing' and worker_id=p_worker_id and lease_until>now())
  then raise exception 'Worker lease lost' using errcode='55000'; end if;
end $fn$;
revoke all on function public.core_automation_match_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.core_automation_match_active(uuid,uuid) to service_role;

commit;
