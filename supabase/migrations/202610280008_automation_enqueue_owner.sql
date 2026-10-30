-- Ensure source-table triggers enqueue through the database owner while the
-- automation outbox remains inaccessible to browser/authenticated clients.
begin;
alter function public.core_enqueue_automation_event() owner to postgres;
alter function public.core_enqueue_automation_event() security definer;
alter function public.core_enqueue_automation_event() set search_path='';
revoke all on public.core_automation_events from public,anon,authenticated;
grant select on public.core_automation_events to authenticated;
revoke all on function public.core_enqueue_automation_event() from public,anon,authenticated;
commit;
