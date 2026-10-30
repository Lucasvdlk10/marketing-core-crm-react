-- Persist editable segment filters and atomically recalculate list membership.
alter table public.core_segment_lists add column if not exists filters jsonb not null default '{}'::jsonb;
alter table public.core_segment_lists drop constraint if exists core_segment_lists_filters_object;
alter table public.core_segment_lists add constraint core_segment_lists_filters_object check (jsonb_typeof(filters)='object');
create or replace function public.core_segment_list_create_with_filters(p_workspace uuid,p_name text,p_description text,p_category text,p_contact_ids uuid[],p_reason text,p_filters jsonb)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare new_list public.core_segment_lists%rowtype; requested_count integer:=coalesce(cardinality(p_contact_ids),0); visible_count integer;
begin
 if auth.uid() is null then raise exception 'Login required' using errcode='28000'; end if;
 if not public.core_has_permission(p_workspace,'contacts.write') then raise exception 'Forbidden' using errcode='42501'; end if;
 if length(btrim(p_name)) not between 1 and 200 or p_category not in('RECOVERY','MARKETING','CUSTOM') or jsonb_typeof(coalesce(p_filters,'{}'::jsonb))<>'object' then raise exception 'Invalid segment list fields' using errcode='22023'; end if;
 if requested_count<>coalesce((select count(distinct id) from unnest(coalesce(p_contact_ids,'{}'::uuid[])) id),0) then raise exception 'Duplicate contact ids' using errcode='22023'; end if;
 select count(*) into visible_count from public.core_contacts c where c.workspace_id=p_workspace and c.id=any(coalesce(p_contact_ids,'{}'::uuid[]));
 if visible_count<>requested_count then raise exception 'One or more contacts are not available in this workspace' using errcode='42501'; end if;
 insert into public.core_segment_lists(workspace_id,name,category,description,filters,created_by) values(p_workspace,btrim(p_name),p_category,nullif(btrim(p_description),''),coalesce(p_filters,'{}'::jsonb),auth.uid()) returning * into new_list;
 insert into public.core_segment_list_members(workspace_id,list_id,contact_id,reason) select p_workspace,new_list.id,contact_id,p_reason from unnest(coalesce(p_contact_ids,'{}'::uuid[])) contact_id;
 return jsonb_build_object('id',new_list.id,'member_count',requested_count,'filters',new_list.filters);
end $fn$;
create or replace function public.core_segment_list_update_with_members(p_workspace uuid,p_list_id uuid,p_name text,p_description text,p_filters jsonb,p_contact_ids uuid[],p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $fn$
declare requested_count integer:=coalesce(cardinality(p_contact_ids),0); visible_count integer;
begin
 if auth.uid() is null then raise exception 'Login required' using errcode='28000'; end if;
 if not public.core_has_permission(p_workspace,'contacts.write') then raise exception 'Forbidden' using errcode='42501'; end if;
 if length(btrim(p_name)) not between 1 and 200 or length(coalesce(p_description,''))>2000 or jsonb_typeof(coalesce(p_filters,'{}'::jsonb))<>'object' then raise exception 'Invalid segment list fields' using errcode='22023'; end if;
 if requested_count<>coalesce((select count(distinct id) from unnest(coalesce(p_contact_ids,'{}'::uuid[])) id),0) then raise exception 'Duplicate contact ids' using errcode='22023'; end if;
 select count(*) into visible_count from public.core_contacts c where c.workspace_id=p_workspace and c.id=any(coalesce(p_contact_ids,'{}'::uuid[]));
 if visible_count<>requested_count then raise exception 'One or more contacts are not available in this workspace' using errcode='42501'; end if;
 update public.core_segment_lists set name=btrim(p_name),description=nullif(btrim(p_description),''),filters=coalesce(p_filters,'{}'::jsonb),updated_at=now() where workspace_id=p_workspace and id=p_list_id;
 if not found then raise exception 'Segment list not found' using errcode='P0002'; end if;
 delete from public.core_segment_list_members where workspace_id=p_workspace and list_id=p_list_id;
 insert into public.core_segment_list_members(workspace_id,list_id,contact_id,reason) select p_workspace,p_list_id,contact_id,p_reason from unnest(coalesce(p_contact_ids,'{}'::uuid[])) contact_id;
 return jsonb_build_object('id',p_list_id,'member_count',requested_count,'filters',coalesce(p_filters,'{}'::jsonb));
end $fn$;
revoke all on function public.core_segment_list_create_with_filters(uuid,text,text,text,uuid[],text,jsonb),public.core_segment_list_update_with_members(uuid,uuid,text,text,jsonb,uuid[],text) from public,anon;
grant execute on function public.core_segment_list_create_with_filters(uuid,text,text,text,uuid[],text,jsonb),public.core_segment_list_update_with_members(uuid,uuid,text,text,jsonb,uuid[],text) to authenticated;
