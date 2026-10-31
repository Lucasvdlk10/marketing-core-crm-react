begin;

create or replace function public.core_automation_node_config_v1_valid(p_type text,p_subtype text,c jsonb) returns boolean
language plpgsql immutable set search_path='' as $fn$
declare allowed text[]; k text; amount numeric; deal_value numeric; distribution_total numeric; distribution_count int; uuid_pattern constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
 if jsonb_typeof(c)<>'object' or pg_catalog.octet_length(c::text)>8192 then return false; end if;
 allowed=case
  when p_type='trigger' then array['source','form_id','stage_id','loss_reason','days','timeframe','source_type','source_id','source_label']
  when p_subtype='CREATE_TASK' then array['title','delay','unit','business_hours','assignee','user_id']
  when p_subtype='CREATE_FOLLOWUP' then array['title','delay','unit','business_hours','assignee','user_id']
  when p_subtype='COMPLETE_TASKS' then array['only_automation'] when p_subtype='DISTRIBUTE_LEAD' then array['mode','team','members']
  when p_subtype='ADD_TO_SEGMENT_LIST' then array['list_id','reason'] when p_subtype='NOTIFY_USER' then array['title','body','user_id']
  when p_subtype='SEND_EMAIL' then array['subject','body','text','html','reply_to'] when p_subtype='SEND_WHATSAPP' then array['message','template_name','language','components']
  when p_subtype='WAIT' then array['delay','amount','unit'] when p_subtype='MOVE_STAGE' then array['stage_id'] when p_subtype='ADD_TAG' then array['tag_id','tag_name']
  when p_subtype='CREATE_DEAL' then array['owner_id','team_id','distribution','pipeline_id','stage_id','name','value']
  when p_subtype='SOURCE_EQUALS' then array['value','stage_id','days'] when p_subtype='CAMPAIGN_EQUALS' then array['value','stage_id','days']
  when p_subtype='STAGE_EQUALS' then array['value','stage_id','days'] else array[]::text[] end;
 for k in select pg_catalog.jsonb_object_keys(c) loop if not(k=any(allowed)) then return false; end if; end loop;
 if p_type='trigger' and c?'source_label' and (jsonb_typeof(c->'source_label')<>'string' or pg_catalog.length(c->>'source_label') not between 1 and 80) then return false; end if;
 if p_subtype='SEND_EMAIL' then return pg_catalog.length(c->>'subject') between 1 and 200 and (pg_catalog.length(c->>'body') between 1 and 10000 or pg_catalog.length(c->>'text') between 1 and 10000 or pg_catalog.length(c->>'html') between 1 and 20000);
 elsif p_subtype='SEND_WHATSAPP' then return pg_catalog.length(c->>'message') between 1 and 4000 or (pg_catalog.length(c->>'template_name') between 1 and 120 and pg_catalog.length(c->>'language') between 1 and 20 and (not(c?'components') or jsonb_typeof(c->'components')='array'));
 elsif p_subtype='WAIT' then begin amount=coalesce(c->>'amount',c->>'delay')::numeric; exception when others then return false; end; return amount between 1 and 365 and c->>'unit'=any(array['minutes','hours','days']);
 elsif p_subtype='MOVE_STAGE' then return coalesce(c->>'stage_id','')~*uuid_pattern;
 elsif p_subtype='ADD_TAG' then return coalesce(c->>'tag_id','')~*uuid_pattern or pg_catalog.length(c->>'tag_name') between 1 and 100;
 elsif p_subtype='CREATE_DEAL' then
  if (c?'owner_id')=(c?'team_id') or ((c?'pipeline_id')<>(c?'stage_id')) then return false; end if;
  if c?'owner_id' and c->>'owner_id'!~*uuid_pattern then return false; end if;
  if c?'team_id' then
   if c->>'team_id'!~*uuid_pattern or jsonb_typeof(c->'distribution')<>'array' then return false; end if;
   select count(*),coalesce(sum((x->>'percentage')::numeric),0) into distribution_count,distribution_total from pg_catalog.jsonb_array_elements(c->'distribution') x where (x->>'user_id')~*uuid_pattern and jsonb_typeof(x->'percentage')='number' and (x->>'percentage')::numeric>0;
   if distribution_count<>jsonb_array_length(c->'distribution') or distribution_count<1 or distribution_total<>100 then return false; end if;
  elsif c?'distribution' then return false; end if;
  if c?'pipeline_id' and (c->>'pipeline_id'!~*uuid_pattern or c->>'stage_id'!~*uuid_pattern) then return false; end if;
  if c?'name' and pg_catalog.length(c->>'name') not between 1 and 200 then return false; end if;
  if c?'value' then begin deal_value=(c->>'value')::numeric; exception when others then return false; end; if deal_value<0 or deal_value>99999999999999.99 then return false; end if; end if;
 end if;
 return true;
exception when others then return false;
end $fn$;

-- Identify each signed workspace webhook on the queued automation event.
create or replace function public.core_enqueue_automation_event()
returns trigger
language plpgsql
security definer
set search_path=''
set row_security='off'
as $fn$
declare
  w uuid;
  aggregate uuid;
  event_name text;
  version text;
  event_key text;
  webhook_source_id text;
  bounded_context jsonb:='{}'::jsonb;
begin
  w=new.workspace_id;
  aggregate=new.id;
  if tg_table_name='core_contacts' then
    event_name='LEAD_CREATED'; version='created';
  elsif tg_table_name='core_ingestion_events' then
    event_name='WEBHOOK_RECEIVED'; aggregate=coalesce(new.contact_id,new.id); version=new.id::text;
    webhook_source_id=nullif(current_setting('app.core_webhook_id',true),'');
    bounded_context=pg_catalog.jsonb_build_object('ingestion_event_id',new.id)
      || case when webhook_source_id is null then '{}'::jsonb
              else pg_catalog.jsonb_build_object('source_webhook_id',webhook_source_id) end;
  elsif tg_table_name='core_deals' and (tg_op='INSERT' or new.stage_id is distinct from old.stage_id) then
    event_name='STAGE_CHANGED'; version=new.stage_id::text||':'||new.updated_at::text;
  elsif tg_table_name='core_deals' and new.status='lost' and old.status is distinct from 'lost' then
    event_name='DEAL_LOST'; version='lost:'||new.updated_at::text;
  else
    return new;
  end if;
  event_key=event_name||':'||aggregate::text||':'||version;
  insert into public.core_automation_events(workspace_id,event_type,aggregate_type,aggregate_id,source_version,context,idempotency_key,max_attempts)
  values(
    w,event_name,
    case when tg_table_name='core_deals' then 'deal' when tg_table_name='core_ingestion_events' then 'ingestion_event' else 'contact' end,
    aggregate,version,bounded_context,event_key,
    coalesce((select s.max_attempts from public.core_automation_settings s where s.workspace_id=w),5)
  )
  on conflict(workspace_id,idempotency_key) do nothing;
  return new;
end
$fn$;
revoke all on function public.core_enqueue_automation_event() from public,anon,authenticated;

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
  if current_hits>60 then raise exception 'Rate limit'; end if;
  update core_private.workspace_webhooks set last_used_at=now() where id=found_id;
  return pg_catalog.jsonb_build_object('workspace_id',found_workspace,'webhook_id',found_id);
end $fn$;
revoke all on function public.core_workspace_webhook_authorize_v2(text,text) from public,anon,authenticated;
grant execute on function public.core_workspace_webhook_authorize_v2(text,text) to service_role;

-- Keep the old RPC path for API-key ingestion; signed webhook ingestion sets a
-- transaction-local source id which the outbox trigger copies into event context.
create or replace function public.core_ingest_webhook_lead_v2(p_workspace uuid,p_key text,p_payload jsonb,p_webhook_id uuid)
returns jsonb
language plpgsql security definer set search_path='' as $fn$
declare result jsonb;
begin
  if auth.role()<>'service_role' then raise exception 'Server-only endpoint' using errcode='42501'; end if;
  if not exists(
    select 1 from core_private.workspace_webhooks x
    join public.core_workspaces w on w.id=x.workspace_id and w.state='active'
    where x.id=p_webhook_id and x.workspace_id=p_workspace and x.enabled
  ) then raise exception 'Webhook inactive or outside workspace' using errcode='42501'; end if;
  perform pg_catalog.set_config('app.core_webhook_id',p_webhook_id::text,true);
  result:=public.core_ingest_lead(p_workspace,p_key,p_payload);
  perform pg_catalog.set_config('app.core_webhook_id','',true);
  return result;
end $fn$;
revoke all on function public.core_ingest_webhook_lead_v2(uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.core_ingest_webhook_lead_v2(uuid,text,jsonb,uuid) to service_role;

-- Match a selected webhook id, while preserving legacy wildcard rules.
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
  or trigger_row.n->'config'->>'source_id'='webhook-lead-created'
  or (trigger_row.n->'config'->>'source_id'='webhook-all' and e.context ? 'source_webhook_id')
  or trigger_row.n->'config'->>'source_id'=e.context->>'source_webhook_id'
 );
 if not found and not exists(select 1 from public.core_automation_events where id=p_event_id and status='processing' and worker_id=p_worker_id and lease_until>now())
  then raise exception 'Worker lease lost' using errcode='55000'; end if;
end $fn$;
revoke all on function public.core_automation_match_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.core_automation_match_active(uuid,uuid) to service_role;

commit;
