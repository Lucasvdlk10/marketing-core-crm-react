-- Allow authenticated CRM writes to enqueue automation events without granting
-- direct INSERT access to the protected outbox table.
begin;
create or replace function public.core_enqueue_automation_event()
returns trigger
language plpgsql
security definer
set search_path=''
as $fn$
declare
  w uuid;
  aggregate uuid;
  event_name text;
  version text;
  event_key text;
  bounded_context jsonb:='{}'::jsonb;
begin
  w=new.workspace_id;
  aggregate=new.id;
  if tg_table_name='core_contacts' then
    event_name='LEAD_CREATED'; version='created';
  elsif tg_table_name='core_ingestion_events' then
    event_name='WEBHOOK_RECEIVED'; aggregate=coalesce(new.contact_id,new.id); version=new.id::text;
    bounded_context=pg_catalog.jsonb_build_object('ingestion_event_id',new.id);
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
commit;
