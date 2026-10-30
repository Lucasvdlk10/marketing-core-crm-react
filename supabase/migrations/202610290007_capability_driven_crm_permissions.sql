-- Capability-driven CRM authorization. Owner remains the only immutable full-access role.
begin;

create or replace function public.core_supported_permission(p text) returns boolean
language sql immutable set search_path='' as $fn$
 select p=any(array[
  'workspace.manage','team.manage','roles.manage','integration.manage','calendar.manage','audit.read','integration_logs.read',
  'contacts.read','contacts.write','contacts.delete','deals.read','deals.write','deals.delete',
  'tasks.read','tasks.write','tasks.delete','activities.read','activities.write','activities.delete',
  'tags.read','tags.write','tags.delete','pipeline.read','pipeline.write','pipeline.delete',
  'campaigns.read','campaigns.write','campaigns.delete','forms.read','forms.write','forms.delete',
  'automations.read','automations.write','automations.delete','reports.read'
 ]::text[])
$fn$;

-- Retain this public compatibility predicate for older routines, but remove per-role ceilings.
create or replace function public.core_role_ceiling(r text,p text) returns boolean
language sql immutable set search_path='' as $fn$
 select r in ('owner','admin','marketing_manager','sdr','closer','viewer')
    and public.core_supported_permission(p)
$fn$;

alter table public.core_role_permissions drop constraint if exists core_role_permissions_role_check;
alter table public.core_role_permissions add constraint core_role_permissions_role_check
 check(role in ('admin','marketing_manager','sdr','closer','viewer'));

-- Materialize the previous implicit defaults before switching to explicit configured grants.
-- Existing true/false rows win, so current owner customization is preserved.
with supported(permission) as (
 values
 ('workspace.manage'),('team.manage'),('roles.manage'),('integration.manage'),('calendar.manage'),('audit.read'),('integration_logs.read'),
 ('contacts.read'),('contacts.write'),('contacts.delete'),('deals.read'),('deals.write'),('deals.delete'),
 ('tasks.read'),('tasks.write'),('tasks.delete'),('activities.read'),('activities.write'),('activities.delete'),
 ('tags.read'),('tags.write'),('tags.delete'),('pipeline.read'),('pipeline.write'),('pipeline.delete'),
 ('campaigns.read'),('campaigns.write'),('campaigns.delete'),('forms.read'),('forms.write'),('forms.delete'),
 ('automations.read'),('automations.write'),('automations.delete'),('reports.read')
), roles(role) as (values ('admin'),('marketing_manager'),('sdr'),('closer'),('viewer')),
legacy(role,permission) as (
 values
 ('marketing_manager','contacts.read'),('marketing_manager','contacts.write'),('marketing_manager','tasks.read'),
 ('marketing_manager','activities.read'),('marketing_manager','activities.write'),('marketing_manager','tags.read'),('marketing_manager','tags.write'),
 ('marketing_manager','pipeline.read'),('marketing_manager','campaigns.read'),('marketing_manager','campaigns.write'),('marketing_manager','campaigns.delete'),
 ('marketing_manager','forms.read'),('marketing_manager','forms.write'),('marketing_manager','forms.delete'),
 ('marketing_manager','automations.read'),('marketing_manager','automations.write'),('marketing_manager','reports.read'),
 ('sdr','contacts.read'),('sdr','contacts.write'),('sdr','deals.read'),('sdr','tasks.read'),('sdr','tasks.write'),
 ('sdr','activities.read'),('sdr','activities.write'),('sdr','tags.read'),('sdr','pipeline.read'),('sdr','campaigns.read'),
 ('sdr','forms.read'),('sdr','reports.read'),('sdr','calendar.manage'),
 ('closer','contacts.read'),('closer','contacts.write'),('closer','deals.read'),('closer','deals.write'),
 ('closer','tasks.read'),('closer','tasks.write'),('closer','activities.read'),('closer','activities.write'),
 ('closer','tags.read'),('closer','pipeline.read'),('closer','campaigns.read'),('closer','reports.read'),('closer','calendar.manage'),
 ('viewer','contacts.read'),('viewer','deals.read'),('viewer','tasks.read'),('viewer','activities.read'),('viewer','tags.read'),
 ('viewer','pipeline.read'),('viewer','campaigns.read'),('viewer','forms.read'),('viewer','automations.read'),('viewer','reports.read')
)
insert into public.core_role_permissions(workspace_id,role,permission,enabled)
select w.id,r.role,s.permission,
       (r.role='admin' or exists(select 1 from legacy l where l.role=r.role and l.permission=s.permission))
from public.core_workspaces w cross join roles r cross join supported s
on conflict(workspace_id,role,permission) do nothing;

create or replace function public.core_member_has_permission(w uuid,p_user uuid,p text) returns boolean
language sql stable security definer set search_path='' as $fn$
 select public.core_supported_permission(p) and exists(
  select 1
  from public.core_memberships m
  join public.core_workspaces x on x.id=m.workspace_id
  where m.workspace_id=w and m.user_id=p_user and m.active and x.state='active'
    and (
      m.role='owner'
      or (m.role in ('admin','marketing_manager','sdr','closer','viewer') and exists(
        select 1 from public.core_role_permissions rp
        where rp.workspace_id=m.workspace_id and rp.role=m.role and rp.permission=p and rp.enabled
      ))
    )
 )
$fn$;

create or replace function public.core_has_permission(w uuid,p text) returns boolean
language sql stable security definer set search_path='' as $fn$
 select auth.uid() is not null and public.core_member_has_permission(w,auth.uid(),p)
$fn$;

create or replace function public.core_team_set_permission(w uuid,p_role text,p_permission text,p_enabled boolean)
returns void language plpgsql security definer set search_path='' as $fn$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='28000'; end if;
 if not (public.core_is_super_admin() or exists(
   select 1 from public.core_memberships m join public.core_workspaces x on x.id=m.workspace_id
   where m.workspace_id=w and m.user_id=auth.uid() and m.active and m.role='owner' and x.state='active'
 )) then raise exception 'Owner permission required' using errcode='42501'; end if;
 if p_role not in ('admin','marketing_manager','sdr','closer','viewer') then
  raise exception 'Only non-owner roles are configurable' using errcode='22023';
 end if;
 if not public.core_supported_permission(p_permission) then
  raise exception 'Unsupported permission' using errcode='22023';
 end if;
 insert into public.core_role_permissions(workspace_id,role,permission,enabled)
 values(w,p_role,p_permission,p_enabled)
 on conflict(workspace_id,role,permission) do update set enabled=excluded.enabled;
 insert into core_private.platform_audit(actor_id,action,workspace_id,metadata)
 values(auth.uid(),'role_permission_changed',w,pg_catalog.jsonb_build_object('role',p_role,'permission',p_permission,'enabled',p_enabled));
end $fn$;

-- Tag assignment/removal is a contact-edit action, not tag-administration.
drop policy if exists core_contact_tags_read on public.core_contact_tags;
drop policy if exists core_contact_tags_insert on public.core_contact_tags;
drop policy if exists core_contact_tags_update on public.core_contact_tags;
drop policy if exists core_contact_tags_delete on public.core_contact_tags;
create policy core_contact_tags_read on public.core_contact_tags for select to authenticated
 using(public.core_has_permission(workspace_id,'contacts.read'));
create policy core_contact_tags_insert on public.core_contact_tags for insert to authenticated
 with check(public.core_has_permission(workspace_id,'contacts.write'));
create policy core_contact_tags_update on public.core_contact_tags for update to authenticated
 using(public.core_has_permission(workspace_id,'contacts.write'))
 with check(public.core_has_permission(workspace_id,'contacts.write'));
create policy core_contact_tags_delete on public.core_contact_tags for delete to authenticated
 using(public.core_has_permission(workspace_id,'contacts.write'));

-- Reassert the CRM action contracts explicitly; deal status/stage updates are deals.write.
do $policies$
declare t text; resource text;
begin
 for t,resource in select * from (values
  ('core_deals','deals'),('core_contacts','contacts'),('core_tasks','tasks'),
  ('core_pipelines','pipeline'),('core_stages','pipeline')
 ) v(t,resource)
 loop
  execute format('drop policy if exists %I on public.%I',t||'_insert',t);
  execute format('drop policy if exists %I on public.%I',t||'_update',t);
  execute format('drop policy if exists %I on public.%I',t||'_delete',t);
  execute format('create policy %I on public.%I for insert to authenticated with check(public.core_has_permission(workspace_id,%L))',t||'_insert',t,resource||'.write');
  execute format('create policy %I on public.%I for update to authenticated using(public.core_has_permission(workspace_id,%L)) with check(public.core_has_permission(workspace_id,%L))',t||'_update',t,resource||'.write',resource||'.write');
  execute format('create policy %I on public.%I for delete to authenticated using(public.core_has_permission(workspace_id,%L))',t||'_delete',t,resource||'.delete');
 end loop;
end $policies$;

-- Service-side automation authorization must obey the same configured permission rows.
create or replace function public.core_automation_authorize_action(p_event_id uuid,p_worker_id uuid,p_revision_id uuid,p_node_id text) returns text
language plpgsql security definer set search_path='' as $fn$
declare e public.core_automation_events%rowtype; r public.core_automation_rules%rowtype; action_permission text; action_execution_key text;
begin
 if auth.role()<>'service_role' then raise exception 'Server only' using errcode='42501'; end if;
 select * into e from public.core_automation_events where id=p_event_id and ((status='processing' and worker_id=p_worker_id and lease_until>now()) or (status='completed' and exists(select 1 from public.core_automation_continuations c where c.event_id=p_event_id and c.status='processing' and c.worker_id=p_worker_id and c.lease_until>now()))) for update;
 if not found then raise exception 'Worker lease lost' using errcode='55000'; end if;
 select rule.* into r from public.core_automation_rule_revisions rev join public.core_automation_rules rule on rule.id=rev.rule_id and rule.workspace_id=rev.workspace_id where rev.id=p_revision_id and rev.workspace_id=e.workspace_id and rule.enabled and rule.active_revision_id=rev.id;
 if not found or not coalesce((select automation_enabled from public.core_automation_settings where workspace_id=e.workspace_id),false) then raise exception 'Automation disabled' using errcode='42501'; end if;
 action_permission=case (select n->>'subtype' from public.core_automation_rule_revisions rev cross join lateral pg_catalog.jsonb_array_elements(rev.graph->'nodes') n where rev.id=p_revision_id and n->>'id'=p_node_id and n->>'type'='action')
  when 'CREATE_TASK' then 'tasks.write' when 'CREATE_FOLLOWUP' then 'tasks.write' when 'COMPLETE_TASKS' then 'tasks.write'
  when 'DISTRIBUTE_LEAD' then 'contacts.write' when 'ADD_TO_SEGMENT_LIST' then 'contacts.write' when 'NOTIFY_USER' then 'automations.write'
  when 'SEND_EMAIL' then 'automations.write' when 'SEND_WHATSAPP' then 'automations.write' when 'WAIT' then 'automations.write'
  when 'MOVE_STAGE' then 'deals.write' when 'CREATE_DEAL' then 'deals.write' when 'ADD_TAG' then 'contacts.write' else null end;
 if action_permission is null or r.creator_id is null or not public.core_member_has_permission(e.workspace_id,r.creator_id,action_permission) then raise exception 'Rule creator lacks current action permission' using errcode='42501'; end if;
 action_execution_key=e.id::text||':'||p_revision_id::text||':'||p_node_id;
 insert into public.core_automation_action_executions(workspace_id,event_id,rule_revision_id,node_id,execution_key,status,attempts) values(e.workspace_id,e.id,p_revision_id,p_node_id,action_execution_key,'started',1)
 on conflict(workspace_id,execution_key) do update set status='started',attempts=public.core_automation_action_executions.attempts+1,error_code=null,finished_at=null where public.core_automation_action_executions.status in('failed','skipped_permission','skipped_disabled');
 return action_execution_key;
end $fn$;

revoke all on function public.core_supported_permission(text),public.core_member_has_permission(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.core_supported_permission(text),public.core_member_has_permission(uuid,uuid,text) to authenticated,service_role;
revoke all on function public.core_team_set_permission(uuid,text,text,boolean) from public,anon;
grant execute on function public.core_team_set_permission(uuid,text,text,boolean) to authenticated;

-- Migration-time contract checks fail the transaction if the capability model regresses.
do $contract$
declare unsupported integer;
begin
 if public.core_role_ceiling('sdr','deals.write') is not true then raise exception 'Non-owner ceiling compatibility failed'; end if;
 if public.core_supported_permission('not.a.capability') then raise exception 'Unknown permission accepted'; end if;
 if exists(select 1 from public.core_role_permissions where role='owner') then raise exception 'Owner permission rows must not exist'; end if;
 select count(*) into unsupported from public.core_role_permissions rp where not public.core_supported_permission(rp.permission);
 if unsupported<>0 then raise exception 'Unsupported persisted permissions: %',unsupported; end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='core_contact_tags' and policyname='core_contact_tags_insert' and with_check like '%contacts.write%') then raise exception 'Contact-tag assignment policy mismatch'; end if;
 if not exists(select 1 from pg_policies where schemaname='public' and tablename='core_contact_tags' and policyname='core_contact_tags_delete' and qual like '%contacts.write%') then raise exception 'Contact-tag removal policy mismatch'; end if;
end $contract$;

commit;
