alter table public.core_deals add column if not exists loss_reason text;

comment on column public.core_deals.loss_reason is 'Motivo estruturado da perda, usado nos relatórios comerciais.';
