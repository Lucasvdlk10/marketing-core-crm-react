begin;

alter table public.core_ingestion_events
  add column if not exists submission_id text,
  add column if not exists automation_enabled boolean not null default true;

alter table public.core_activities
  add column if not exists submission_id text,
  add column if not exists ingestion_event_id uuid references public.core_ingestion_events(id) on delete cascade;

create index if not exists core_ingestion_submission_lookup
  on public.core_ingestion_events(workspace_id, submission_id, received_at desc)
  where submission_id is not null;

create unique index if not exists core_activities_ingestion_event_uq
  on public.core_activities(ingestion_event_id)
  where ingestion_event_id is not null;

drop trigger if exists core_webhook_automation_outbox on public.core_ingestion_events;
create trigger core_webhook_automation_outbox
  after insert on public.core_ingestion_events
  for each row when (new.automation_enabled is true)
  execute function public.core_enqueue_automation_event();

create table if not exists public.core_lead_submission_links (
  workspace_id uuid not null references public.core_workspaces(id) on delete cascade,
  submission_id text not null check (length(btrim(submission_id)) between 1 and 180),
  contact_id uuid not null references public.core_contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (workspace_id, submission_id)
);

alter table public.core_lead_submission_links enable row level security;
revoke all on public.core_lead_submission_links from public, anon, authenticated;
grant all on public.core_lead_submission_links to service_role;

create or replace function public.core_ingest_lead(p_workspace uuid, p_key text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  c uuid;
  e uuid;
  n text;
  em text;
  ph text;
  sub_id text;
  mapped_contact uuid;
  submission_mapped boolean:=false;
  automation_enabled boolean:=false;
  existing_event record;
  source_label text;
  payload_hash text;
  raw_payload jsonb;
  utm_patch jsonb;
  consent_flag boolean;
  event_time timestamptz;
begin
  if p_key is null or length(p_key)>180 or length(p_key)<8 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_payload is null or pg_catalog.jsonb_typeof(p_payload)<>'object' then
    raise exception 'Invalid lead payload';
  end if;
  if not exists(select 1 from public.core_workspaces where id=p_workspace) then
    raise exception 'Unknown workspace';
  end if;

  n=nullif(pg_catalog.btrim(coalesce(p_payload->>'name','')),'');
  em=nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_payload->>'email',''))),'');
  ph=nullif(pg_catalog.regexp_replace(coalesce(p_payload->>'phone',''),'[^0-9]','','g'),'');
  sub_id=nullif(pg_catalog.btrim(coalesce(p_payload->>'submission_id','')),'');
  if sub_id is not null and length(sub_id)>180 then raise exception 'Invalid submission id'; end if;
  if (n is null or (em is null and ph is null)) and sub_id is null then
    raise exception 'Name and email or phone required';
  end if;
  if length(coalesce(n,''))>200 or length(coalesce(em,''))>254 or length(coalesce(ph,''))>25 then
    raise exception 'Invalid field length';
  end if;

  source_label=pg_catalog.left(coalesce(nullif(pg_catalog.btrim(p_payload->>'source'),''),'Leads Hub'),100);
  payload_hash=pg_catalog.encode(extensions.digest(p_payload::text,'sha256'),'hex');
  raw_payload=case
    when pg_catalog.jsonb_typeof(p_payload->'raw_fields')='object' then p_payload->'raw_fields'
    else p_payload
  end;
  consent_flag=coalesce((p_payload->>'consent')::boolean,false);

  select coalesce(pg_catalog.jsonb_object_agg(entry.key,entry.value),'{}'::jsonb)
    into utm_patch
  from pg_catalog.jsonb_each(
    case when pg_catalog.jsonb_typeof(p_payload->'utm')='object' then p_payload->'utm' else '{}'::jsonb end
  ) as entry(key,value)
  where entry.value<>'""'::jsonb and entry.value<>'null'::jsonb;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_workspace::text||p_key));
  select ce.id,ce.contact_id,ce.payload_hash into existing_event
  from public.core_ingestion_events ce
  where ce.workspace_id=p_workspace and ce.idempotency_key=p_key;
  if found then
    if existing_event.payload_hash<>payload_hash then
      raise exception 'Idempotency conflict' using errcode='23505';
    end if;
    c=existing_event.contact_id;
    if sub_id is not null then
      select contact_id into mapped_contact
      from public.core_lead_submission_links
      where workspace_id=p_workspace and submission_id=sub_id;
      if found then
        if c is not null and c<>mapped_contact then
          raise exception 'Submission ID conflict' using errcode='23505';
        end if;
        c=coalesce(c,mapped_contact);
        if c is not null then
          update public.core_ingestion_events set contact_id=c
          where workspace_id=p_workspace and submission_id=sub_id and contact_id is null;
          update public.core_activities set contact_id=c
          where workspace_id=p_workspace and submission_id=sub_id and contact_id is null;
        end if;
      end if;
    end if;
    return pg_catalog.jsonb_build_object('event_id',existing_event.id,'contact_id',c,'duplicate',true);
  end if;

  if em is not null or ph is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_workspace::text||coalesce(em,ph)));
    if em is not null then
      select id into c from public.core_contacts
      where workspace_id=p_workspace and pg_catalog.lower(pg_catalog.btrim(email))=em limit 1;
    end if;
    if c is null and ph is not null then
      select id into c from public.core_contacts
      where workspace_id=p_workspace and pg_catalog.regexp_replace(phone,'[^0-9]','','g')=ph limit 1;
    end if;
  end if;

  if sub_id is not null then
    select contact_id into mapped_contact
    from public.core_lead_submission_links
    where workspace_id=p_workspace and submission_id=sub_id
    for update;
    if found then
      submission_mapped=true;
      if c is not null and c<>mapped_contact then
        raise exception 'Submission ID conflict' using errcode='23505';
      end if;
      c=coalesce(c,mapped_contact);
    end if;
  end if;

  if c is null and n is not null and (em is not null or ph is not null) then
    insert into public.core_contacts(
      workspace_id,name,email,phone,company,source,campaign,source_url,consent,consent_at,utm,notes
    ) values (
      p_workspace,n,em,ph,
      nullif(pg_catalog.btrim(p_payload->>'company'),''),source_label,
      nullif(pg_catalog.btrim(p_payload->>'campaign'),''),
      nullif(pg_catalog.btrim(p_payload->>'source_url'),''),consent_flag,
      case when consent_flag then now() else null end,utm_patch,''
    ) returning id into c;
  elsif c is not null then
    update public.core_contacts set
      name=coalesce(n,name),
      email=coalesce(em,email),
      phone=coalesce(ph,phone),
      company=coalesce(nullif(pg_catalog.btrim(p_payload->>'company'),''),company),
      source=coalesce(nullif(pg_catalog.btrim(p_payload->>'source'),''),source),
      campaign=coalesce(nullif(pg_catalog.btrim(p_payload->>'campaign'),''),campaign),
      source_url=coalesce(nullif(pg_catalog.btrim(p_payload->>'source_url'),''),source_url),
      utm=coalesce(utm,'{}'::jsonb)||utm_patch,
      consent=consent or consent_flag,
      consent_at=case when consent_at is null and consent_flag then now() else consent_at end,
      updated_at=now()
    where id=c and workspace_id=p_workspace;
  end if;

  automation_enabled=(c is not null and n is not null and (em is not null or ph is not null) and not submission_mapped);

  insert into public.core_ingestion_events(
    workspace_id,idempotency_key,contact_id,source,form_id,payload_hash,submission_id,automation_enabled
  ) values (
    p_workspace,p_key,c,source_label,
    nullif(pg_catalog.btrim(p_payload->>'form_id'),''),payload_hash,sub_id,automation_enabled
  ) returning id,received_at into e,event_time;

  if sub_id is not null and c is not null then
    insert into public.core_lead_submission_links as current_link(workspace_id,submission_id,contact_id)
    values(p_workspace,sub_id,c)
    on conflict(workspace_id,submission_id) do update
      set contact_id=excluded.contact_id
      where current_link.contact_id=excluded.contact_id
    returning current_link.contact_id into mapped_contact;
    if not found then raise exception 'Submission ID conflict' using errcode='23505'; end if;

    update public.core_ingestion_events set contact_id=c
    where workspace_id=p_workspace and submission_id=sub_id and contact_id is null;
    update public.core_activities set contact_id=c
    where workspace_id=p_workspace and submission_id=sub_id and contact_id is null;
  end if;

  insert into public.core_activities(
    workspace_id,contact_id,kind,body,ingestion_event_id,submission_id,created_at
  ) values (
    p_workspace,c,'ingest',raw_payload::text,e,sub_id,event_time
  );

  return pg_catalog.jsonb_build_object('event_id',e,'contact_id',c,'duplicate',false);
end
$function$;

revoke all on function public.core_ingest_lead(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.core_ingest_lead(uuid,text,jsonb) to service_role;

commit;
