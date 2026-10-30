begin;
create or replace function public.core_segment_list_create_with_members(
  p_workspace uuid,
  p_name text,
  p_description text,
  p_category text,
  p_contact_ids uuid[],
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  new_list public.core_segment_lists%rowtype;
  requested_count integer := coalesce(cardinality(p_contact_ids), 0);
  visible_count integer;
begin
  if auth.uid() is null then
    raise exception 'Login required' using errcode = '28000';
  end if;
  if not public.core_has_permission(p_workspace, 'contacts.write') then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  if pg_catalog.length(pg_catalog.btrim(p_name)) not between 1 and 200 then
    raise exception 'Invalid segment list name' using errcode = '22023';
  end if;
  if p_category not in ('RECOVERY', 'MARKETING', 'CUSTOM') then
    raise exception 'Invalid segment list category' using errcode = '22023';
  end if;
  if requested_count <> coalesce((select count(distinct id) from pg_catalog.unnest(p_contact_ids) id), 0) then
    raise exception 'Duplicate contact ids' using errcode = '22023';
  end if;

  select count(*) into visible_count
  from public.core_contacts c
  where c.workspace_id = p_workspace and c.id = any(coalesce(p_contact_ids, '{}'::uuid[]));
  if visible_count <> requested_count then
    raise exception 'One or more contacts are not available in this workspace' using errcode = '42501';
  end if;

  insert into public.core_segment_lists(workspace_id, name, category, description, created_by)
  values (p_workspace, pg_catalog.btrim(p_name), p_category, nullif(pg_catalog.btrim(p_description), ''), auth.uid())
  returning * into new_list;

  insert into public.core_segment_list_members(workspace_id, list_id, contact_id, reason)
  select p_workspace, new_list.id, contact_id, p_reason
  from pg_catalog.unnest(coalesce(p_contact_ids, '{}'::uuid[])) contact_id;

  return pg_catalog.jsonb_build_object('id', new_list.id, 'member_count', requested_count);
end
$function$;
revoke all on function public.core_segment_list_create_with_members(uuid,text,text,text,uuid[],text) from public, anon;
grant execute on function public.core_segment_list_create_with_members(uuid,text,text,text,uuid[],text) to authenticated;
commit;
