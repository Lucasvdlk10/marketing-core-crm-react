# Histórico de alterações auditadas

## 29/10/2026 — Compatibilidade da importação com a planilha modelo

- **Problema reproduzido:** a planilha XLSX baixada pelo próprio CRM contém uma linha de título e uma linha vazia antes do cabeçalho. O importador assumia que a primeira linha era sempre o cabeçalho e, por isso, rejeitava o modelo oficial com a mensagem de que faltavam cabeçalho e dados.
- **Correção:** o importador agora remove linhas vazias iniciais, localiza automaticamente a linha real de cabeçalho pelos campos reconhecidos e mantém fallback para planilhas com cabeçalhos personalizados.
- **Arquivo funcional alterado:** `src/components/contacts/LeadImportPage.tsx`.
- **Regressão adicionada:** `src/test/LeadImportPage.test.tsx` cobre exatamente o formato gerado pelo botão `Baixar planilha de exemplo (.XLSX)`.
- **Arquivo real verificado:** `C:\Users\Lucas\Downloads\Outros\teste de importaçao\marketing_core_200_leads_ficticios_teste.xlsx`, contendo título, linha vazia, cabeçalho e 200 linhas de dados.
- **Validações:** teste focado 3/3; ContactsPage 8/8; suíte completa serial 167/167; TypeScript aprovado; build de produção aprovado; `npm audit --audit-level=moderate` com 0 vulnerabilidades.
- **Estado de entrega:** alteração validada localmente no working tree. HEAD permanece `56d3141278c8d4dd1dec7eb4a08a5d81e6845bd4`; commit/push/deploy ainda não foram declarados, pois o repositório já contém alterações locais de outras frentes que exigem preservação.

## 30/10/2026 — Planilha modelo sem linhas introdutórias

- Removidas da geração do modelo a linha `Modelo de importação de leads` e a linha vazia subsequente.
- O cabeçalho `Nome, Telefone, E-mail, Empresa, Origem, CPF, CNPJ, Status` agora começa obrigatoriamente na primeira linha da planilha.
- A opção foi aplicada somente ao modelo de importação; exportações comuns de relatórios continuam preservando título e espaçamento.
- O arquivo já baixado em `C:\Users\Lucas\Downloads\Outros\teste de importaçao\modelo-importacao-leads-marketing-core.xlsx` também foi substituído e relido: cabeçalho na primeira linha e duas linhas de exemplo.
- Regressão RED→GREEN adicionada em `src/test/ExportReport.test.ts`.
- Validações: testes focados 4/4; TypeScript e build aprovados. Suíte completa: 167/168 no disparo por timeout conhecido do `CalendarPage`; reexecução isolada do Calendar: 7/7.

## 30/10/2026 — Importação confirmada, paginação autenticada e histórico persistente

- O arquivo `C:\Users\Lucas\Downloads\Outros\teste de importaçao\teste1.csv` contém 202 linhas após o cabeçalho, sendo 200 registros válidos e duas linhas finais vazias.
- O Supabase staging foi consultado diretamente: o workspace principal possui exatamente **212 contatos**; 200 foram criados no mesmo minuto da importação, confirmando o sucesso integral.
- Causa da listagem incompleta: `ContactsPage` paginava sempre em blocos de 10, mas escondia o rodapé quando `preview=false`. O rodapé agora aparece também no CRM autenticado.
- Paginação entregue com opções de 10, 20, 30 ou 50 leads por página, total, intervalo visível e navegação até a página final.
- Criada a tabela tenant-scoped `core_lead_import_history` com RLS para `contacts.read`/`contacts.write`; migration `202610300001_lead_import_history.sql` aplicada no staging.
- O histórico aparece abaixo da planilha modelo e registra arquivo, data, formato, quantidade importada e status. O registro de `teste1.csv` foi retroativamente incluído como 200/200 concluído.
- Importações futuras registram automaticamente resultado concluído, parcial ou falho.
- Validações: testes focados 40/40; suíte completa 170/170; typecheck e build aprovados; npm audit com 0 vulnerabilidades. O lint remoto apontou apenas um erro preexistente e não relacionado em `core_automation_choose_deal_assignee`.

## 30/10/2026 — Proprietário pode criar funções personalizadas

- Causa: a tela desabilitava `Nova função` para qualquer sessão autenticada, inclusive quando a associação real era `owner`.
- O bloqueio genérico por `authenticated` foi substituído pela capacidade efetiva `roles.manage`; o proprietário recebe acesso total e pode adicionar, renomear, configurar permissões, excluir e salvar funções.
- Criada a persistência tenant-scoped `core_workspace_roles` e a RPC `core_workspace_roles_replace`, protegida por validação de proprietário, RLS e auditoria.
- A função Proprietário continua protegida e com acesso total.
- Migration `202610300002_custom_workspace_roles.sql` aplicada no staging.
- Validações: regressão RED→GREEN; testes de Configurações 6/6; suíte completa 170/170; typecheck, build e auditoria de dependências aprovados.

## 30/10/2026 — Negociação de automação por pessoa ou equipe

- Confirmado no editor de automações o seletor agrupado de responsável: pessoa específica ou equipe.
- Ao selecionar uma equipe, a engrenagem abre a configuração de distribuição, permitindo excluir membros e definir percentuais personalizados por usuário.
- A publicação exige pelo menos um membro e soma exata de 100%; o contrato persiste `team_id` e a lista `distribution`.
- O worker usa distribuição ponderada determinística e ignora membros removidos ou inativos.
- Migration `202610290006_automation_deal_team_assignment.sql` confirmada no staging e `core-automation-worker` republicado.
- Adicionada regressão explícita para excluir um membro e atribuir 100% ao membro restante.
- Validações: teste autenticado 24/24; suíte completa 171/171; typecheck, build e npm audit aprovados; 0 vulnerabilidades.

## 30/10/2026 — Backfill e relatório operacional de automações

- Causa raiz confirmada: publicar/ativar uma automação por lista não criava eventos para os membros já existentes; apenas novos eventos `LEAD_CREATED` eram consumidos. O matcher também não validava a associação do contato à lista configurada.
- `core_automation_activate` agora enfileira de forma idempotente os contatos atuais da lista, com evento direcionado à regra/revisão ativa, e retorna `queued_count` para feedback visual.
- `core_automation_match_active` agora respeita regra/revisão direcionada e confirma membership da lista de segmentação, evitando que automações de uma lista consumam leads de outra origem.
- Criadas as RPCs tenant-scoped `core_automation_metrics` e `core_automation_report`, com entrada, andamento, conclusão, falha, etapa atual e desempenho por etapa.
- Tela de Automações recebeu métricas nos cards, botão Relatório e feedback após salvar informando quantos leads existentes entraram no fluxo.
- Migration `202610300003_automation_segment_backfill_reports.sql` aplicada no staging. Reparação idempotente processou a automação `Teste` e seus 23 membros.
- Evidência remota: 23/23 eventos concluídos; 23/23 execuções concluídas em cada uma das três ações; 23/23 leads com tag `Hulk`, negociação criada e etapa final correta.
- Migration `202610300004_fix_assignment_lint.sql` removeu a dependência de tabela temporária do distribuidor ponderado; `supabase db lint --linked --level error` passou sem resultados.
- Validações: testes autenticados 26/26; suíte completa 173/173; typecheck e build aprovados; npm audit com 0 vulnerabilidades.

## 30/10/2026 — Visão geral personalizável, filtros, equipes e metas

- Dashboard refeito para o modo autenticado com grade responsiva arrastável e redimensionável usando `react-grid-layout`.
- Adicionado filtro global de data inicial/final e perfil de equipe; os indicadores, funil, atividade, velocidade e progresso das metas usam o mesmo escopo.
- Indicadores agora são acionáveis e abrem drawer lateral com os registros filtrados.
- Adicionados velocidade média do pipeline, progresso por equipe e modal de inteligência de vendas com projeção determinística, risco de gargalo e sucesso imediato.
- Criadas preferências tenant/user-scoped para layout e equipe selecionada em `core_dashboard_preferences`.
- Criadas metas tenant-scoped em `core_sales_goals`, RPCs de leitura/upsert e geração idempotente de notificações de risco/sucesso por equipe e função.
- Migration `202610300005_personalized_sales_dashboard.sql` aplicada no staging.
- O dashboard passou a buscar `owner_id` dos contatos para filtrar por equipe corretamente.
- Validações: Dashboard 5/5; suíte completa 178/178; TypeScript, build, audit de dependências e DB lint aprovados; 0 vulnerabilidades.
- Pendência conhecida: o build mantém o aviso preexistente de `config.js` sem `type="module"` e o chunk inicial aumentou pela biblioteca de grid; não bloqueiam execução.

## 30/10/2026 — Relatório de motivos de perda

- Adicionado `core_deals.loss_reason` com migration `202610300006_loss_reason_reporting.sql`.
- Pipeline remoto agora persiste o motivo estruturado ao marcar uma negociação como perdida.
- Relatórios exibem barras ordenadas por quantidade, percentual, tooltip nativo com motivo/quantidade/percentual e drawer inline com os leads da barra selecionada.
- Impacto financeiro soma os valores reais das negociações perdidas no período.
- Filtro inclui hoje, ontem, 7, 15, 30, 90 dias, mês atual, mês anterior e período personalizado.
- Validações: ReportsPage 5/5, typecheck e build aprovados; migration aplicada no staging.

## 30/10/2026 — Presença e uso do sistema

- Criado histórico estruturado `core_presence_events` e RPC `core_presence_usage_report` para acumular online, reunião e ausente por usuário.
- Login automático registra `online`, heartbeat mantém a sessão ativa e encerramento registra `offline`.
- Relatório exibe horas por status, uso total versus período esperado, ranking implícito por tempo online e filtro por equipes personalizadas.
- Clique no nome consulta e mostra as entradas, saídas e mudanças de status do colaborador no período.
- Validações: ReportsPage 5/5, typecheck e migration `202610300007_presence_usage_history.sql` aplicados no staging.

## 30/10/2026 — Consolidação visual e filtros dos relatórios

- Filtro de equipe do relatório de presença passou a filtrar efetivamente os usuários pelos grupos do workspace.
- Tabela de presença passou a formatar duração em horas/minutos e exportar o recorte selecionado.
- Confirmado front-end React 18.3.1 + TypeScript + Vite + React Router; a sessão de Relatórios é composta por `ReportsPage.tsx` e componentes React.
- O deploy do commit `b410909` foi reexecutado, mas o GitHub Pages respondeu HTTP 500 na criação da implantação; o código permanece no GitHub e aguarda nova publicação.

## 30/10/2026 — Correção do relatório de motivos de perda

- Causa confirmada: o bootstrap de `core_deals` não selecionava `loss_reason`; o relatório filtrava perdas pela `created_at`, não pela data do evento.
- Adicionados `lost_at` e migration `202610300008_loss_timestamp.sql`; a Pipeline grava/limpa a data conforme a transição de status e mantém o timestamp ao editar negociação perdida.
- O relatório lê negociações perdidas reais do snapshot do workspace e motivos cadastrados no CRM; inclui contagem de leads únicos por motivo, barras ordenadas, percentual, detalhe de leads, impacto financeiro e exportação do mesmo recorte. Períodos usam datas de calendário; relatório não apresenta dados mock.
- Migration aplicada no `L.E.I.A CRM Staging` (ref `nsrwjtgzluadienwtnxt`). Read-back: coluna existe, migration consta no histórico, 4 negociações perdidas e 0 sem `lost_at`; consulta agregada confirmou perda de R$ 2.000 em 30/10/2026.
- Validações focadas: **21/21**; typecheck/build aprovados; `npm audit` 0 vulnerabilidades; DB lint exit 0 com avisos preexistentes. Suíte completa paralela: 174/183; execução serial igual à CI ainda em andamento.
- Commit/push/deploy do frontend ainda pendentes; não tratar a página pública como atualizada até validar o SHA implantado e os assets.
