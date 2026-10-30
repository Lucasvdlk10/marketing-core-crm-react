-- Align campaign RLS with the configurable role-permission system used by
-- the React CRM. The legacy policy rejects modern roles.
begin;
alter table public.core_campaigns enable row level security;
drop policy if exists core_campaigns_read on public.core_campaigns;
drop policy if exists core_campaigns_insert on public.core_campaigns;
drop policy if exists core_campaigns_update on public.core_campaigns;
drop policy if exists core_campaigns_delete on public.core_campaigns;
create policy core_campaigns_read
on public.core_campaigns for select to authenticated
using(public.core_has_permission(workspace_id,'campaigns.read'));
create policy core_campaigns_insert
on public.core_campaigns for insert to authenticated
with check(public.core_has_permission(workspace_id,'campaigns.write'));
create policy core_campaigns_update
on public.core_campaigns for update to authenticated
using(public.core_has_permission(workspace_id,'campaigns.write'))
with check(public.core_has_permission(workspace_id,'campaigns.write'));
create policy core_campaigns_delete
on public.core_campaigns for delete to authenticated
using(public.core_has_permission(workspace_id,'campaigns.delete'));
grant select,insert,update,delete on public.core_campaigns to authenticated;
commit;
