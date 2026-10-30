-- Harden the automation outbox trigger for real authenticated CRM writes.
-- Browser roles retain no direct write access to the protected outbox.
begin;
alter function public.core_enqueue_automation_event() owner to postgres;
alter function public.core_enqueue_automation_event() security definer;
alter function public.core_enqueue_automation_event() set search_path='';
alter function public.core_enqueue_automation_event() set row_security=off;
grant insert on public.core_automation_events to postgres;
grant select on public.core_automation_settings to postgres;
revoke all on public.core_automation_events from public,anon,authenticated;
grant select on public.core_automation_events to authenticated;
revoke all on function public.core_enqueue_automation_event() from public,anon,authenticated;
do $verify$
begin
  if not has_table_privilege('postgres','public.core_automation_events','INSERT') then
    raise exception 'postgres lacks INSERT on core_automation_events';
  end if;
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid=p.pronamespace
    join pg_roles r on r.oid=p.proowner
    where n.nspname='public'
      and p.proname='core_enqueue_automation_event'
      and p.prosecdef
      and r.rolname='postgres'
  ) then
    raise exception 'core_enqueue_automation_event is not SECURITY DEFINER owned by postgres';
  end if;
end
$verify$;
commit;
