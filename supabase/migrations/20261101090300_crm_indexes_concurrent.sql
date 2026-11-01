-- Executar isoladamente via Supabase CLI atual ou psql (NUNCA dentro de BEGIN/COMMIT).
-- Confirmar equivalencia aos indices existentes via preflight. Se tamanho grande, janela de manutencao.
create index concurrently if not exists core_contacts_workspace_created_id_v2_idx
  on public.core_contacts(workspace_id,created_at desc,id desc);
create index concurrently if not exists core_deals_workspace_created_id_v2_idx
  on public.core_deals(workspace_id,created_at desc,id desc);
-- O indice anterior core_tasks_due(workspace_id,status,due_at) ja existe: nao duplicar.
-- Indexes de status, origem, trigram e notificacoes SOMENTE apos EXPLAIN/uso real.
