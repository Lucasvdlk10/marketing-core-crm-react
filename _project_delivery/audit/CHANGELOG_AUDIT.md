## 30/10/2026 — Recepção de payload completo e multipartido do Leads Hub (deploy Supabase concluído; publicação UI pendente)

- **Causa:** o RPC `core_ingest_lead` persistia hash e resumo genérico, não o JSON; faltava `submission_id`; payloads parciais eram rejeitados e chaves idempotentes reutilizadas entre partes conflituavam.
- **Mudanças:** normalizador preserva campos originais e aceita parte sem identidade quando vinculável; idempotência compõe header e corpo; migration `20261031012321_lead_ingestion_activity_payload.sql` cria vínculo por envio, associa eventos às atividades e evita reexecutar automações para partes; perfil busca e mostra cada payload; inclui campanha/consentimento/atribuição no mapeamento remoto.
- **Testes:** `leadPayload.test.ts`, `LeadIngestionActivity.test.tsx`, `leadRecordsRemote.test.ts` — 11/11 aprovados; suíte completa serial: 45/45 arquivos, 199/199 testes; typecheck e build aprovados (avisos de `config.js` sem `type=module` e chunk grande); audit 0 vulnerabilidades.
- **Projeto alvo:** ref da configuração React `nsrwjtgzluadienwtnxt`; sem PII, contagem antes da mudança: 9 eventos no workspace Marketing Core, 6 `chat-captacao`, último em 30/10/2026 21:13 BRT. Projeto distinto `L.E.I.A CRM` não foi alterado.
- **Supabase:** migration aplicada; `supabase migration list` confirma histórico local/remoto alinhado. Teste SQL sintético em subtransação: 3 envios (parcial, completo, parcial), 3 atividades completas, mapeamento/merge, retry duplicado e 1 automação; subtransação revertida e zero resíduos. `core-webhook-v2` deployed, versão 5, `verify_jwt=false`.
- **Entrega:** migration `20261031012321` e `core-webhook-v2` versão 5 aplicadas ao projeto Supabase da configuração React; histórico de migrations local/remoto alinhado. Teste sintético dentro de subtransação (3 partes, retry, merge, automação) passou e foi revertido sem resíduos. Commit `6b7a8b6bbf27ddec0fa32fa39c2536f926d5bb20` em `origin/main`; workflow GitHub Pages `41158295537` sucesso. Página e favicon/JS/CSS HTTP 200, hashes dos ativos iguais a `dist/`; JS contém `Recebimento de lead`, CSS contém `lead-ingestion-fields`.
- **Limite/ação:** não foi enviado lead real para evitar criar registro persistente. Payload da amostra antiga não está persistido (só hash); reenvie pelo Leads Hub para gerar o evento histórico com o novo formato.

## 30/10/2026 — Detalhamento interativo do funil do Dashboard

- **Solicitação:** permitir clicar em Abertas e Ganhas no card Funil do período e identificar as negociações/leads correspondentes.
- **Implementação:** ambas as linhas são controles de botão acessíveis; abrem o drawer existente. Abertas apresenta `openDeals`, Ganhas apresenta `wonDeals`; filtros de período/equipe do Dashboard são preservados.
- **Arquivos:** `src/pages/DashboardPage.tsx`, `src/styles.css`, `src/test/DashboardMobileLayout.test.tsx`.
- **Evidências:** teste focal 3/3; typecheck e build passaram; audit reportou 0 vulnerabilidades. Suíte completa repetida serialmente: 43/43 arquivos e 193/193 testes aprovados; a execução paralela anterior teve 9 timeouts de concorrência em testes de outras páginas.
- **Entrega:** commit funcional `410edcb10ccd32c6d4e05866addfbec1ee040e1f` em `origin/main`; workflow `41149784034` concluiu com sucesso no mesmo SHA. Página GitHub Pages e JS/CSS responderam HTTP 200; hashes remotos coincidem com `dist/` (`index-BIvZC6hq.js`: `1347bdbabc0161ad0303ab79a1ed2fc883717ba7400a9014ce6fc925a90b5cfe`; `index-C9h4_b7w.css`: `55886b160db13f9457bd393afc9582c5b09600ef47c31a3cddc6be9b8c7aaf91`). Bundle contém marcador `dashboard-funnel-row`.

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
- Validações focadas: **21/21**; typecheck/build aprovados; `npm audit` 0 vulnerabilidades; DB lint exit 0 com avisos preexistentes. Workflow `41108027237`, no SHA `b33bfe848bf743f3cac8927e66cc61b8d871cb3c`: **42 arquivos/183 testes**, build e deploy aprovados. Asset público verificado: `index-CBeWXIWg.js`, HTTP 200, SHA-256 `a093adb7c7f695a8ef841e717a50704484ba082ca22b85c0f61022d34f30db0c`; contém os marcadores da correção.
- Um disparo local com workers paralelos teve 174/183 testes devido a timeouts fora da área alterada; a execução serial usada no CI passou integralmente. Working tree source foi commitada e enviada; o usuário pode validar no próximo acesso após atualizar/recarregar o CRM.

## 30/10/2026 — Dashboard mobile sem corte

- Problema da captura: cards de indicadores com altura insuficiente no celular, valores e legendas cortados; layout móvel reaproveitava grid desktop.
- Alterado `src/pages/DashboardPage.tsx`: classe mobile e persistência de layout desabilitada sob 700 px; drag/resize preservados e salvamento mantido acima do breakpoint.
- Alterado `src/styles.css`: seletores scoping pela classe mobile no container medido convertem o grid em coluna fluida, liberam altura automática, quebram valores grandes e ajustam gráficos; sem classe mobile, os estilos desktop não são aplicados.
- Novo `src/test/DashboardMobileLayout.test.tsx`: confirma todos os blocos e não salvar layout mobile, e que desktop permanece arrastável e persistido.
- Validação: RED reproduzido antes da implementação; teste focado **7/7**, suíte serial **43/43 arquivos, 185/185 testes**, typecheck/build aprovados. Preview visual em 320, 390 e 576 px: sem overflow horizontal e cards sem corte; stress test com valor `R$ 151.563.514,00`. Em 1262 px, o preview isolado (sem `AppShell`) mostrou 4 colunas; depois o teste com shell revelou que isso não representa a largura útil real do dashboard nesse viewport (ver nota atual).
- Arquivos temporários de preview removidos e Vite parado. Código commitado em `10efa8170e24f78ebffd6448040e76b4f6fb5038`, workflow `41120798607` concluído com sucesso e publicação verificada no bundle público (hashes listados na auditoria atual).

## 30/10/2026 — Navegação e experiência mobile global

- Causa confirmada após feedback: em até 870 px o CSS ocultava `.sidebar`, mas `Header` não renderizava `.sidebar-toggle` nem havia estado para abrir o drawer; a busca global também não tinha ação para revelar seu campo em telas estreitas.
- `AppShell`, `Header` e `Sidebar` passaram a controlar drawer mobile com backdrop, botão X, rotas preservando os filtros de permissão, fechamento por navegação/Escape/backdrop, bloqueio de scroll, foco inicial/retorno e ciclo de Tab.
- Busca global recebeu controle mobile expansível com foco imediato e Escape; cabeçalho sticky, safe areas e espaçamento compacto limitados aos breakpoints móveis. Nenhuma regra desktop existente foi alterada.
- `src/test/AppShell.test.tsx` cobre botão, abertura, fechar por rota/X/backdrop/Escape, foco, scroll lock e busca; testes RED reproduziram a ausência de toggle, do close interno e do foco contido antes das implementações.
- Navegador local: 320/390/576/700 px sem overflow; 390 px drawer aberto, navegação para `/reports`, restauração de foco/scroll e busca aberta/focada/fechada por Escape. 1262/1920 px controles móveis ocultos; a grade em 1262 no preview sem preferências reais mostrou o breakpoint `md` vazio preexistente, a confirmar com a preferência salva do workspace; 1920 px usou modo desktop.
- Validação: AppShell **16/16**; suíte serial **43 arquivos/192 testes**; typecheck/build e `git diff --check` aprovados; npm audit: **0 vulnerabilidades**. Avisos de build `config.js` e chunk >500 kB continuam existentes.
- Release `aa3d579bfbc7c357d3219bf922e3cc35031ae547` (contendo o commit funcional `7421a2ff7cc4a47ec4136233e8b35742eb65db95`) enviado para `origin/main`. GitHub Pages workflow `41132042334` concluiu com sucesso no SHA do release.
- Verificação pública: index da aplicação aponta para CSS `assets/index-CMeS1aXy.css` e JS `assets/index-mQVsila3.js`; ambos HTTP 200, marcadores de menu/busca presentes e SHA-256 coincidente com `dist/`: CSS `6408ddd8bcf1383431fabd54d92449d65ce3e5645632a96b9f1e7b7ac4e9b44b`, JS `cd7975ac52bc4408d8239bceb28638aced01244b751bd485f22c5bac82a1562c`.
- Próximo: usuário recarregar a aplicação no mobile; se persistir a queixa, validar a sessão/viewport real e priorizar tela específica sem tocar no desktop.

## 31/10/2026 — Origem de webhook selecionável nas automações

- Causa: o construtor de automação apresentava um identificador fixo em vez de consultar os webhooks existentes. O caminho de ingestão autorizava o endpoint mas não preservava seu ID para o matcher das automações.
- `AutomationsPage` agora consulta a lista de webhooks no workspace ao abrir a origem Webhook; permite selecionar pelo nome, mantém inativos identificados e grava `source_id`/`source_label`. Regressão antes da implementação falhou por ausência de “Testando”; após a implementação passou.
- Migration `20261031023137_automation_webhook_entry_source.sql` aplicada no Supabase `nsrwjtgzluadienwtnxt`. A função de ingestão agora associa cada evento ao webhook autenticado e o matcher respeita a origem exata; opções wildcard e legado mantidas.
- `core-webhook-v2` v6, `verify_jwt=false`, verificada no projeto correto. Fixture SQL sintética transitória confirmou source ID exato, não correspondência de outro webhook, opção todos e compatibilidade legada; rollback e read-back sem resíduos.
- Testes: AutomationsPage autenticada 27/27; suíte serial 45/45 arquivos e 200/200 testes; typecheck, build, npm audit (0 vulnerabilidades), esbuild do Edge e scan de whitespace nas linhas adicionadas aprovados. Avisos conhecidos de `config.js` e chunk >500 kB permanecem. LEIA Packager Pro: `blocked`, score 63, `safe_to_deliver=false`, 0 bloqueios e 45 findings de baseline (heurísticas em bundles, sinks existentes e fixtures); não declarar o pacote completo pronto. Pages ainda aguarda commit/push e validação do workflow.
- Smoke test real no Leads Hub não executado para evitar criar lead/negociação persistentes sem autorização; não houve envio real.

## 31/10/2026 — Correções pós-revisão de origem de webhook

- Revisão pré-commit inicial não aprovada: contador de rate limit era revertido pela exceção; fonte legado podia casar evento sem identidade de webhook; handler não bloqueava salvamento via chamada direta durante erro/loading. Implementadas correções locais: migration forward-only `20261031033521_webhook_rate_limit_and_match_guard.sql` retorna JSON `rate_limited` e exige `source_webhook_id` em exacto/wildcard/legado; Edge retorna 429; handler agora valida loading/erro e teste fail-safe foi adicionado.
- Validação do validador: comparação normalizada `202610290006` vs `20261031023137` iguala byte a byte/hash `c7235678…303c3c5` após retirar apenas `source_label` permitido e sua regra string 1–80. Comparação do matcher base com `20261031033521`, após retirar só o novo predicate guard, também iguala byte a byte/hash `746d75f7…342b1939`.
- Evidências locais: teste focal 2/2, typecheck, bundle Edge esbuild e dry-run Supabase aprovados; suíte 45/45 arquivos e 201/201 testes. Dry-run lista somente migration `33521`; ela e a Edge v7 ainda não foram aplicadas. Fixture SQL transacional de rate limit e correspondência adicionada, não executada no banco.
- Packager Pro permanece `blocked` (score 63, `safe_to_deliver=false`, 0 bloqueios e 45 findings de baseline); não apresentar pacote completo como pronto. Sem commit/push/publicação e sem lead real.

## 31/10/2026 — Re-review final e preservação do wildcard

- Re-review independente #2 reprovou: ao abrir um gatilho salvo com `source_id='webhook-all'`, o reload async de webhooks não reconhecia o ID sintético e substituía a escolha pelo primeiro ID real; também exigiu rollout ordenado por causa do rate-limit legado da migration já aplicada.
- TDD: teste `preserves and saves the all-active-webhooks source when reopening a trigger` falhou inicialmente de forma esperada (`webhook-1` no lugar de `webhook-all`); `AutomationsPage` agora preserva o wildcard na conclusão do fetch; o mesmo teste passou (1/1). O teste cobre salvar/republicar o source ID após reabrir o modal.
- A migration aplicada `20261031023137` permanece imutável. `20261031033521` documenta rollout seguro: aplicar migration enquanto Edge v6 permanece (v6 rejeita objeto rate_limited sem workspace_id e não ingere); então deploy Edge v7 para HTTP 429. Fresh installs aplicam migrations antes da Edge. Ainda nenhum deploy desta correção.
- Suite final após o ajuste: 45/45 arquivos e 202/202 testes; typecheck/build/esbuild passaram, com avisos de build conhecidos; `npm audit` 0 vulnerabilidades; dry-run mostra apenas migration `33521`; comparação normalizada do validador e matcher mantém os hashes do baseline. Novo teste wildcard RED→GREEN. A Edge v7 e migration 33521 ainda não foram aplicadas; sem lead real.

## 31/10/2026 — Terceira revisão independente (bloqueio)

- Re-review #3 retornou `passed:false`, sem preocupações de segurança e com três erros de lógica/validação: migration 23137 isolada ainda perde o incremento do limite; fixture SQL não atravessa 60 sucessos e 61ª negação e altera contexto diretamente, sem caminho API-key; teste fail-safe React muda `button.disabled=false` antes do clique e não prova a interação normal.
- O limite de dois ciclos de correção/re-review definido pelo procedimento foi atingido. Parar alterações funcionais e não aplicar migration, implantar Edge, commit/push ou publicar até Lucas decidir se autoriza ciclo adicional. Os artefatos permanecem staged/local; sem envio real de lead.

## 31/10/2026 — Ciclo adicional autorizado (re-review #4 pendente)

- Lucas autorizou um ciclo adicional após o re-review #3. Nenhum migration, Edge, commit, push ou Pages foi alterado nesta rodada.
- Implementados localmente: gate de deploy sequenciado (`scripts/deploy-core-webhook-v2.mjs`), testes mockados do gate, contrato SQL rollback-only para 60/61, autenticação→ingestão de dois webhooks e caminho API-key sem `source_webhook_id`, e teste React sem mutar `disabled`.
- Evidência final local: gate mockado 7/7; teste React focado 1/1; suíte Vitest 45/45 arquivos e 202/202 testes; `npm run typecheck` e `npm run build` passaram; bundle Edge passou no esbuild; `npm audit --audit-level=moderate` encontrou 0 vulnerabilidades; dry-run Supabase listou apenas 33521 pendente; verificação de whitespace/sintaxe passou.
- O contrato SQL ainda não foi executado: `supabase status` informou que Docker/Podman não está instalado. A migration `20261031033521` continua pendente no remoto `nsrwjtgzluadienwtnxt`; Edge v6 segue ACTIVE com `verify_jwt=false`. Gate executável inclui a fixture após migration/listagem alinhada e antes de Edge v7; ele não foi executado.
- Próximo passo seguro: concluir a suíte, solicitar revisão independente #4 do diff combinado e, se aprovada, executar o gate de release; depois commit/push e verificar Pages. Não enviar lead real sem autorização específica por criar dado persistente.

## 31/10/2026 — Re-review #4 reprovada; pausa para decisão

- Revisão independente do diff completo retornou `passed=false`, `security_concerns=[]` e dois `logic_errors`: (1) o gate aceita migrations antigas que já estão alinhadas local/remoto; (2) o fixture lê o denial e `hits=61` dentro da subtransação, mas depois a encerra com rollback sentinela.
- A leitura do requisito original é que migrations históricas alinhadas são permitidas; o gate exige 23137 aplicada, 33521 local e bloqueia qualquer outro pending/divergente. O rollback final é intencional para não persistir fixtures; o denial estruturado e o contador 61 são verificados antes desse rollback. Ainda assim, a revisão falhou e não pode ser ignorada sem adjudicação explícita.
- A única rodada extra autorizada terminou sem mudanças após o review. Mantidos os arquivos staged; nenhum commit, push, migration, deploy, Pages ou envio real foi feito. Packager Pro permanece `blocked`, score 62, `safe_to_deliver=false`, 0 findings bloqueantes e 46 findings baseline.
- Aguardar decisão de Lucas antes de iniciar outra correção/re-review ou publicação. A fixture SQL continua sem execução local por ausência de Docker/Podman; o gate de release não foi executado.

## 31/10/2026 — Novo ciclo #5 autorizado após re-review #4

- Lucas autorizou uma correção/re-review adicional direcionada. Achados a resolver: gate deve rejeitar migrations não pertencentes ao baseline exato mesmo quando alinhadas local/remoto; limite 60/61 deve ser verificado após commit, não apenas antes do rollback.
- Autorização específica concedida para teste sintético em transações separadas: gravar temporariamente apenas workspace/webhook de teste (sem lead/contato), comprovar `hits=61` em leitura após commit, limpar e verificar zero resíduos. Não autoriza migration/deploy/commit/push nesta fase.
- Estado inicial remoto read-only: migrations históricas alinhadas; `20261031033521` local pendente; `core-webhook-v2` v6 ACTIVE/`verify_jwt=false`. Difusão do ciclo #4 permanece staged; auditoria atualizada em working tree.
- Próximo passo: implementação TDD, validação local, gate de re-review independente #5. Não aplicar migration nem executar teste remoto até o review passar; não enviar lead real.

## 31/10/2026 — Ciclo #5 implementado localmente; revisão #5 pendente

- O gate agora pinna o conjunto de 62 migrations já alinhadas no ledger vinculado e permite somente o alvo `20261031033521`; rejeita migration extra mesmo alinhada e verifica conjunto exato pré/pós-push.
- Adicionado probe de rate limit multi-transação: user/workspace/webhook sintéticos, sem membership/lead/contato; 60 authorizations válidas, 61ª negação estruturada, readback separado `hits=61`, cleanup por IDs/markers exatos e verificação de zero resíduo. Token é passado por stdin e não vai a argv/log. Cleanup falho, readback falho ou resíduo bloqueia deploy.
- A fixture SQL rollback-only continua cobrindo identidade webhook→ingestão→outbox, dois webhooks, match exato/diferente/wildcard/legado e API-key sem identidade; removido o teste 60/61 de dentro da subtransação.
- TDD RED→GREEN documentado nos testes: falhas iniciais para migration alinhada não permitida e fases do probe ausentes; resultado final do gate mockado 11/11.
- Validação: Vitest 45/45 arquivos, 202/202 testes; typecheck; build (avisos `config.js` sem `type=module` e chunk principal >500 kB); `npm audit` 0 vulnerabilidades; dry-run Supabase somente migration 33521; `git diff --check HEAD` e `node --check` passaram.
- Não executados: probe SQL ao vivo, fixture SQL, release gate, migration push, Edge deploy, commit/push/Pages ou lead. Docker/Podman local ausente e 33521 segue pendente; Edge v6 ACTIVE/`verify_jwt=false`. Aguardar revisão independente #5; Packager segue `blocked`/`safe_to_deliver=false`.

## 31/10/2026 — Re-review #5 reprovada; ciclo pausado

- A revisão independente `deleg_d0c5f25e` retornou `passed=false`, com 1 security concern e 1 logic uncertainty.
- Security concern: rate cleanup deleta linhas por `webhook_id` e segredos por nome depois do check de workspace, sem vincular cada delete ao registro de webhook/secret exatamente criado pelo probe. Correção potencial: deletar rate via join ao webhook sintético completo e remover somente `vault_secret_id` lido desse registro; se faltar, falhar em zero-residue e bloquear deploy.
- Logic uncertainty: a verificação de `supabase db query` por stdin confirmou só transporte, não a semântica de commit/readback entre invocações. O probe e fixture não foram executados ao vivo; migration 33521 segue pendente, e não se aplicou migration nem deploy.
- O ciclo #5 autorizado terminou reprovado; após mensagem de autorização ampla de Lucas, iniciado ciclo #6. Não se altera migration aplicada 23137. Nenhuma migration/deploy remota ocorreu ainda; migration 33521 segue pendente e Edge v6 ativa.

## 31/10/2026 — Ciclo #6 local, correção de ownership no cleanup

- Achado do review #5 tratado com TDD: teste mockado RED antes da correção, depois GREEN. Cleanup exige workspace sintético exato e webhook com ID/workspace/public_id/name/created_by e token digest; rate rows são deletadas somente via join ao webhook exato; Vault secret é deletado somente pelo `vault_secret_id` ligado ao webhook. Removida exclusão por nome.
- Adicionado `--contracts-only` à release gate para executar db push + probe multi-transação + fixture rollback-only, parando antes de Edge deploy; útil para demonstrar commit/readback ao vivo sem publicar código antes da re-review.
- Validação local final: `npm run test:deploy-gate` 13/13; Vitest 45/45 arquivos, 202/202 testes; `npm run typecheck`, `npm run build`, `npm audit --audit-level=moderate` (0 vulnerabilidades), `node --check` e `git diff --check HEAD` passaram. Build emitiu os avisos existentes de `config.js` sem `type=module` e chunk >500 kB.
- Contrato ao vivo: a primeira execução `--contracts-only` aplicou a migration e executou o rate probe até readback/cleanup, mas a fixture falhou com PostgreSQL `42P01` porque as duas chamadas `core_workspace_webhook_create(...)` referenciavam alias `h` sem declará-lo. Regressão TDD ficou RED, as duas chamadas ganharam `AS h`, e a fixture direta passou com todos os resíduos em zero. A nova execução completa `--contracts-only` terminou exit 0: 60 autorizações aceitas, 61ª denial estruturada, committed_hits=61, cleanup zero-residue, fixture rollback-only passou; Edge deploy explicitamente pulado.
- Readback remoto pós-probe: ledger local/remoto alinhado em 63 versões (62 históricas + `20261031033521`); Edge `core-webhook-v2` permanece ACTIVE v6/`verify_jwt=false`; consulta de resíduo sintético retornou zero workspace/user/webhook/API key/contato. Nenhuma Edge v7, commit/push ou Pages ainda.
- Próximo passo: compilar bundle completo e obter re-review independente #6 com evidência live. Após aprovação, executar gate completo para Edge v7, ler estado de volta, e então commit/push/Pages. Próximas tarefas recuperadas: regressões para campos extras/envios parciais/retries e validar ingestão no Supabase/CRM corretos; preferir synthetic data e não usar lead pessoal.

## 2026-10-31 — Review #6 remediation and live revalidation

- Review #6 failed closed on probe-context cleanup coverage, allowing the already-applied target migration in default precheck, and incomplete rollback-fixture residue checks. Corrected only those reported areas plus their regressions.
- Files changed: `scripts/deploy-core-webhook-v2.mjs`, `scripts/deploy-core-webhook-v2.node.mjs`, `supabase/tests/20261031033521_webhook_rate_limit_match_guard.sql`; audit/continuity files updated for evidence. The applied migration remains untouched.
- TDD: release-gate and context-failure tests were observed RED before fixes; an additional fixture assertion went RED because the former second `DO` block could not access captured local IDs. After consolidation, `npm run test:deploy-gate` passes 15/15. Full Vitest 45/45 files and 202/202 tests, typecheck, build, audit (0 vulnerabilities), both Node syntax checks, and `git diff --check HEAD` pass. Build still emits the existing `config.js` module-type and large-chunk warnings.
- Fixture residue verification now runs after the rollback subtransaction in the same outer PL/pgSQL scope, with direct checks for rate rows by exact webhook/key IDs and Vault secrets by captured secret IDs, plus user/profile/membership, audit, automation/outbox, ingestion/activity/link, contact and deal rows. No broad DELETEs.
- Live revalidation: direct rollback fixture and `npm run deploy:core-webhook-v2 -- --resume-after-contracts --contracts-only` both exit 0 on `nsrwjtgzluadienwtnxt`. The exact 63-version ledger is aligned; rate probe reports 60 accepted + structured denial #61, distinct committed readback `hits=61`, cleanup and zero residue; fixture direct assertions pass. Separate aggregate readback shows zero synthetic workspaces/users/webhooks/API keys/contacts. Edge remains ACTIVE v6 with `verify_jwt=false`; no v7 deploy, commit, push, or Pages publish.
- Existing mixed staged/worktree state and index were preserved. Independent review #7 and release remain pending; no real lead was sent.
- Re-check of next tasks: `test-ingress-history` remains justified because unit-level cases do not prove all RPC conflict/linking/merge/automation behaviors; historical rollback SQL evidence should be re-run or completed with focused assertions. `validate-deploy-ingress` remains justified because prior Pages/staging evidence is historical; after approved release, verify the current Pages SHA/runtime config and one clearly marked synthetic browser submission with exact cleanup/readback, targeting only the React CRM Supabase project.

## 2026-10-31 — Review #7 remediation and live revalidation

- Review #7 failed closed on cleanup gating, undocumented legacy identity semantics, incomplete direct-ID residue checks, and ambiguous current release status. Fixed only those findings and added regressions.
- Files changed: `scripts/deploy-core-webhook-v2.mjs`, `scripts/deploy-core-webhook-v2.node.mjs`, `supabase/tests/20261031033521_webhook_rate_limit_match_guard.sql`, plus audit/continuity docs. Applied migrations 23137 and 33521 were not edited.
- Final compatibility rule is explicit: legacy source identifier `webhook-lead-created` continues to match identified authenticated webhook events; API-key `WEBHOOK_RECEIVED` events without `source_webhook_id` match neither exact, wildcard, nor legacy webhook sources. This is the forward-migration 33521 contract; migration 23137 remains an immutable historical intermediate.
- Cleanup now queries the exact webhook and secret only after exact synthetic workspace ownership is confirmed; the webhook predicate binds ID/workspace/public_id/name/created_by/token digest. Rate deletion remains joined to that webhook; Vault deletion uses only its captured `vault_secret_id`.
- Rollback fixture captures generated IDs for ingestion, activity, audit/platform audit, automation events/deliveries/continuations, contacts/deals; it verifies these directly after nested rollback and checks submission links by exact workspace+submission ID composite keys. It also checks exact rate and Vault IDs, profile/membership, rules/revisions, and parent IDs.
- TDD: gate regressions were RED at 14/18 before fixes, then GREEN 18/18. Full tests: 45/45 files, 202/202 tests; typecheck/build passed; `npm audit --audit-level=moderate` 0 vulnerabilities; both Node syntax checks and `git diff --check HEAD` passed. Existing build warnings remain (`config.js` module type and >500 kB chunk).
- Live: direct rollback fixture and `npm run deploy:core-webhook-v2 -- --resume-after-contracts --contracts-only` exit 0 on `nsrwjtgzluadienwtnxt`. Exact 63-version ledger; 60 valid authorizations + structured #61 denial, distinct committed `hits=61`, cleanup and zero-residue readback; fixture direct-ID assertions passed. Edge remains ACTIVE v6/`verify_jwt=false`; no v7 deploy, commit, push, Pages, browser submission or real lead.
- Current webhook release status is now prominent at the top of `AUDIT_CURRENT.md`; historical ingestion publication is labeled separately. Independent review #8 was followed by approval from independent review #9. Ingestion regression and current Pages/CRM validation remain justified.

## 2026-10-31 — Independent review #9 and Edge v7 staging release

- Review #8’s only logic concern claimed that identified webhook events could not match the legacy source. The source condition and live rollback fixture showed the claim was false: identified webhook event requires `source_webhook_id` and asserts `v_legacy=1`; API-key event without identity asserts zero exact/wildcard/legacy matches. Independent re-review #9 (`deleg_3b3b49bb`) approved all 13 reviewed paths and confirmed no security or logic findings.
- Pre-deploy project readback: `L.E.I.A CRM Staging`, ref `nsrwjtgzluadienwtnxt`, `ACTIVE_HEALTHY`, `sa-east-1`; migration ledger 63 local / 63 remote, exact equality, target `20261031033521` present.
- After approval, `npm run deploy:core-webhook-v2 -- --resume-after-contracts` exited 0. The script skipped `db push`, reran rate and identity contracts, verified 60 accepted + structured denial #61, separate committed `hits=61`, exact cleanup and zero residue, then deployed with explicit `--no-verify-jwt`.
- Independent post-deploy readback: `core-webhook-v2` ACTIVE v7, `verify_jwt=false`; migration ledger remains 63/63 exact. Aggregate synthetic readback returned zero workspaces, users, webhooks, Vault secrets and contacts. No real lead/contact was sent.
- Git commit/push, Pages workflow, public asset verification and browser submission remain pending; no publication has yet been claimed.
