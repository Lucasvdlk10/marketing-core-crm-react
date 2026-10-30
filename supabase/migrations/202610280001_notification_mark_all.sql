begin;
create or replace function public.core_mark_all_notifications_read(p_workspace uuid)
returns integer
language plpgsql
security invoker
set search_path = public
as $function$
declare
  affected integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.core_notifications
     set read_at = coalesce(read_at, now())
   where workspace_id = p_workspace
     and user_id = auth.uid()
     and read_at is null;

  get diagnostics affected = row_count;
  return affected;
end
$function$;
revoke all on function public.core_mark_all_notifications_read(uuid) from public, anon;
grant execute on function public.core_mark_all_notifications_read(uuid) to authenticated;
commit;
