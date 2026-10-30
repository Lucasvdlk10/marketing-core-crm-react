begin;

create table if not exists public.core_lead_import_history (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.core_workspaces(id) on delete cascade,
  requested_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  source_type text not null check (source_type in ('CSV','TSV','TXT','XLS','XLSX','ARQUIVO')),
  total_rows integer not null check (total_rows >= 0),
  imported_rows integer not null check (imported_rows >= 0 and imported_rows <= total_rows),
  failed_rows integer not null check (failed_rows >= 0 and failed_rows <= total_rows),
  status text not null check (status in ('COMPLETED','PARTIAL','FAILED')),
  created_at timestamptz not null default now(),
  check (imported_rows + failed_rows = total_rows)
);

create index if not exists core_lead_import_history_workspace_created
  on public.core_lead_import_history(workspace_id, created_at desc, id desc);

alter table public.core_lead_import_history enable row level security;

revoke all on public.core_lead_import_history from public, anon;
grant select, insert on public.core_lead_import_history to authenticated;
grant all on public.core_lead_import_history to service_role;

drop policy if exists core_lead_import_history_read on public.core_lead_import_history;
create policy core_lead_import_history_read
  on public.core_lead_import_history
  for select
  to authenticated
  using (public.core_has_permission(workspace_id, 'contacts.read'));

drop policy if exists core_lead_import_history_insert on public.core_lead_import_history;
create policy core_lead_import_history_insert
  on public.core_lead_import_history
  for insert
  to authenticated
  with check (
    requested_by = auth.uid()
    and public.core_has_permission(workspace_id, 'contacts.write')
  );

commit;
