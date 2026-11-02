begin;

create or replace function public.core_deal_create_with_contact(
  p_workspace uuid,
  p_contact_name text,
  p_phone text,
  p_email text,
  p_company text,
  p_source text,
  p_pipeline uuid,
  p_stage uuid,
  p_deal_name text,
  p_value numeric,
  p_expected_close date,
  p_notes text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_contact_id uuid;
  v_deal_id uuid;
  v_status text;
begin
  if auth.uid() is null then
    raise exception 'Login required' using errcode = '28000';
  end if;
  if not public.core_has_permission(p_workspace, 'contacts.write')
     or not public.core_has_permission(p_workspace, 'deals.write') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if p_workspace is null
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_contact_name, ''))) not between 1 and 200
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_phone, ''))) not between 1 and 64
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_source, ''))) not between 1 and 160
     or pg_catalog.length(pg_catalog.btrim(coalesce(p_deal_name, ''))) not between 1 and 200
     or p_pipeline is null or p_stage is null
     or p_value is null or p_value < 0 then
    raise exception 'Invalid contact or deal input' using errcode = '22023';
  end if;

  select s.outcome into v_status
  from public.core_pipelines p
  join public.core_stages s
    on s.pipeline_id = p.id
   and s.workspace_id = p.workspace_id
  where p.id = p_pipeline
    and p.workspace_id = p_workspace
    and s.id = p_stage;
  if not found then
    raise exception 'Pipeline stage is not available in this workspace' using errcode = '42501';
  end if;

  insert into public.core_contacts(
    workspace_id, name, phone, email, company, source, status
  ) values (
    p_workspace,
    pg_catalog.btrim(p_contact_name),
    pg_catalog.btrim(p_phone),
    nullif(pg_catalog.btrim(coalesce(p_email, '')), ''),
    nullif(pg_catalog.btrim(coalesce(p_company, '')), ''),
    pg_catalog.btrim(p_source),
    'qualified'
  ) returning id into v_contact_id;

  insert into public.core_deals(
    workspace_id, contact_id, pipeline_id, stage_id, name, value,
    status, expected_close, notes
  ) values (
    p_workspace, v_contact_id, p_pipeline, p_stage,
    pg_catalog.btrim(p_deal_name), p_value, v_status,
    p_expected_close, nullif(pg_catalog.btrim(coalesce(p_notes, '')), '')
  ) returning id into v_deal_id;

  return pg_catalog.jsonb_build_object(
    'contact_id', v_contact_id,
    'deal_id', v_deal_id
  );
end
$function$;

revoke all on function public.core_deal_create_with_contact(uuid,text,text,text,text,text,uuid,uuid,text,numeric,date,text) from public, anon;
grant execute on function public.core_deal_create_with_contact(uuid,text,text,text,text,text,uuid,uuid,text,numeric,date,text) to authenticated;

commit;
