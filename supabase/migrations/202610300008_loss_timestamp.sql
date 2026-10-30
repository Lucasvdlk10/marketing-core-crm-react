alter table public.core_deals
  add column if not exists lost_at timestamptz;

update public.core_deals
set lost_at = updated_at
where status = 'lost'
  and lost_at is null;

comment on column public.core_deals.lost_at is
  'Timestamp da transição da negociação para perdida, usado nos relatórios por período.';
