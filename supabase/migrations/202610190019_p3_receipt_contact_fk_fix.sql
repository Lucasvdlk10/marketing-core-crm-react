-- Preserve receipt tenant binding when an imported contact is deleted.
begin;
alter table public.core_import_row_receipts
  drop constraint if exists core_import_row_receipts_workspace_id_contact_id_fkey;
alter table public.core_import_row_receipts
  add constraint core_import_row_receipts_workspace_id_contact_id_fkey
  foreign key (workspace_id, contact_id)
  references public.core_contacts(workspace_id, id)
  on delete set null (contact_id);
commit;
