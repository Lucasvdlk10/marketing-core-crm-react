-- Deterministic staging contract for capability-driven CRM permissions.
-- Run after migrations; all fixtures and permission mutations are rolled back.
begin;

insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
values
 ('00000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-000000000001','authenticated','authenticated','permission-owner@example.invalid','',now(),'{}','{}'),
 ('00000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-000000000002','authenticated','authenticated','permission-sdr@example.invalid','',now(),'{}','{}'),
 ('00000000-0000-0000-0000-000000000000','c0000000-0000-0000-0000-000000000003','authenticated','authenticated','permission-admin@example.invalid','',now(),'{}','{}');

insert into public.core_workspaces(id,name,slug,created_by)
values ('cc000000-0000-0000-0000-000000000001','Permission contract','permission-contract','c0000000-0000-0000-0000-000000000001');
insert into public.core_memberships(workspace_id,user_id,role,active) values
 ('cc000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','owner',true),
 ('cc000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','sdr',true),
 ('cc000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','admin',true);

set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000001',true);
select public.core_team_set_permission('cc000000-0000-0000-0000-000000000001','sdr','deals.write',true);
select public.core_team_set_permission('cc000000-0000-0000-0000-000000000001','sdr','contacts.delete',true);
select public.core_team_set_permission('cc000000-0000-0000-0000-000000000001','sdr','tasks.delete',true);
select public.core_team_set_permission('cc000000-0000-0000-0000-000000000001','sdr','pipeline.write',true);
select public.core_team_set_permission('cc000000-0000-0000-0000-000000000001','sdr','pipeline.delete',true);
select public.core_team_set_permission('cc000000-0000-0000-0000-000000000001','admin','deals.write',false);

do $contract$
begin
 if not exists(select 1 from public.core_role_permissions where workspace_id='cc000000-0000-0000-0000-000000000001' and role='sdr' and permission='deals.write' and enabled) then raise exception 'SDR grant did not persist'; end if;
 if not exists(select 1 from public.core_role_permissions where workspace_id='cc000000-0000-0000-0000-000000000001' and role='admin' and permission='deals.write' and not enabled) then raise exception 'Admin deny did not persist'; end if;
 if not public.core_member_has_permission('cc000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','deals.write') then raise exception 'SDR effective grant missing'; end if;
 if public.core_member_has_permission('cc000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','deals.write') then raise exception 'Admin explicit deny ignored'; end if;
 if not public.core_member_has_permission('cc000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','deals.write') then raise exception 'Owner lost unconditional access'; end if;
 begin
  perform public.core_team_set_permission('cc000000-0000-0000-0000-000000000001','owner','deals.write',false);
  raise exception 'Owner permission was mutable';
 exception when check_violation or invalid_parameter_value or insufficient_privilege then null; end;
 begin
  perform public.core_team_set_permission('cc000000-0000-0000-0000-000000000001','sdr','not.a.capability',true);
  raise exception 'Unknown capability was accepted';
 exception when invalid_parameter_value then null; end;
end $contract$;

select set_config('request.jwt.claim.sub','c0000000-0000-0000-0000-000000000002',true);
do $contract$
begin
 if not public.core_has_permission('cc000000-0000-0000-0000-000000000001','deals.write') then raise exception 'SDR effective read failed'; end if;
 if not public.core_has_permission('cc000000-0000-0000-0000-000000000001','contacts.delete') then raise exception 'contacts.delete grant failed'; end if;
 if not public.core_has_permission('cc000000-0000-0000-0000-000000000001','tasks.delete') then raise exception 'tasks.delete grant failed'; end if;
 if not public.core_has_permission('cc000000-0000-0000-0000-000000000001','pipeline.write') then raise exception 'pipeline.write grant failed'; end if;
 if not public.core_has_permission('cc000000-0000-0000-0000-000000000001','pipeline.delete') then raise exception 'pipeline.delete grant failed'; end if;
end $contract$;

reset role;
rollback;
