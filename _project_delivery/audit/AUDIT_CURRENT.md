# CURRENT WEBHOOK RELEASE STATUS — 31/10/2026

- Staging validated: migration `20261031033521` and live contracts passed for React CRM ref `nsrwjtgzluadienwtnxt`.
- Edge v7 active (`verify_jwt=false`); complete diff independently approved in re-review #9 after the earlier legacy-matcher concern was confirmed false positive.
- Git publication, Pages, and browser submission pending.
> Historical ingestion v5 published earlier; that status is distinct from the current webhook automation release.

# Historical ingestion — Leads Hub → CRM: eventos multipartidos — 30/10/2026 (v5 publicado; smoke test real pendente)

**Causa confirmada no projeto Supabase atualmente configurado pela versão React (workspace Marketing Core):** o webhook normaliza apenas campos mapeados; `core_ingest_lead` gravava somente o hash em `core_ingestion_events` e uma frase genérica em `core_activities.body`. Reenvios com chave igual e payload diferente davam conflito; payload sem nome/e-mail/telefone era rejeitado; atualizações existentes não preenchiam empresa/campanha/URL de origem. Na atividade não havia payload recuperável. Contagem consultada sem dados pessoais: 9 eventos no workspace, 6 com origem `chat-captacao`, último recebido em 30/10/2026 21:13 BRT. Não copiar conteúdo de lead para auditoria.

**Implementação:** normalizador preserva JSON recebido em `raw_fields`; aceita envios parciais somente com `submission_id`; chave de evento versionada por combinação da chave externa + corpo (retry idêntico deduplicado; partes diferentes viram eventos). Migration `20261031012321_lead_ingestion_activity_payload.sql` adiciona vínculos/eventos e atualiza o RPC para mesclar campos conhecidos sem apagar dados anteriores, registrar JSON completo em atividades e limitar automação ao primeiro evento completo por envio. React busca atividades por workspace/contato e mostra todos os campos; campanha, consentimento e atribuição são mapeados para o perfil.

**Validação/entrega:** testes focados 11/11; suíte completa serial 45/45 arquivos e 199/199 testes; typecheck aprovado; audit 0 vulnerabilidades; build de produção aprovado (avisos conhecidos: `config.js` sem `type=module` e chunk grande). Migration aplicada no ref `nsrwjtgzluadienwtnxt`; `supabase migration list` local/remoto alinhado em `20261031012321`. Função `core-webhook-v2` versão 5, `verify_jwt=false`. SQL sintético transacional validou parcial→completo→parcial, merge de empresa/UTM/consentimento, 3 atividades com payload completo, retry deduplicado e 1 automação; rollback confirmado e zero resíduo. Commit `6b7a8b6bbf27ddec0fa32fa39c2536f926d5bb20` está em `origin/main`; workflow Pages `41158295537` concluiu com sucesso nesse SHA. Página pública HTTP 200; JS/CSS/favicon HTTP 200 e hashes idênticos a `dist/` (`index-D-T26AD5.js` SHA-256 `7719cc95662cbfe45b5da4828be99f7a8ba7b2244f9a7b41056a1ab3370a20d4`; `index-BwMBGLeZ.css` SHA-256 `cc5255cf98cd74829962e01080dc3fd3508201341000f05374289c8bfe42d18a`); bundle contém a atividade e estilos novos. Nenhum envio real foi disparado durante a validação. Projeto `L.E.I.A CRM` separado não foi alterado. Envio histórico não é recuperável do CRM antigo (guardava hash apenas); para vê-lo na nova timeline, reenvie pelo Leads Hub.

# CRM Marketing Core — Auditoria Atual

- **Data da auditoria:** 31/10/2026
- **Projeto auditado:** `Versão React para testes/marketing-core-crm-react`
- **Branch/entrega funcional:** `main`; commit `6b7a8b6bbf27ddec0fa32fa39c2536f926d5bb20` confirmado em `origin/main`, workflow GitHub Pages `41158295537` concluído com sucesso. A funcionalidade interativa do funil permanece publicada desde os commits anteriores; esta auditoria registra também a ingestão multipartida.
- **Meta:** 100% das funções críticas verificadas por testes automatizados, typecheck, build e auditoria de dependências.

### Interatividade do funil da Visão geral — 30/10/2026

Os totais de “Abertas” e “Ganhas” no card Funil do período agora são botões acessíveis e abrem o drawer lateral existente com as negociações correspondentes, respeitando período e equipe já aplicados pelo dashboard. A lista de abertas deriva de `openDeals`; a de ganhas deriva de `wonDeals`. Implementação local em `src/pages/DashboardPage.tsx` e estilo em `src/styles.css`; regressão com leads sintéticos em `src/test/DashboardMobileLayout.test.tsx`. Teste focal: 3/3 aprovado. Typecheck aprovado; build de produção aprovado (com avisos preexistentes de chunk grande e `config.js`). `npm audit --audit-level=moderate`: 0 vulnerabilidades. Suíte completa serial: 43/43 arquivos e 193/193 testes aprovados. Commit funcional `410edcb10ccd32c6d4e05866addfbec1ee040e1f` em `origin/main`; workflow GitHub Pages `41149784034` concluiu com sucesso nesse SHA. Página pública e bundles JS/CSS HTTP 200; hashes dos dois assets coincidem exatamente com `dist/`, e ambos contêm o marcador do novo drill-down. Nenhuma migration/Supabase foi necessária.

## Veredito executivo

**Estado: VERDE para a correção global mobile. O commit funcional `7421a2ff7cc4a47ec4136233e8b35742eb65db95` está no release `aa3d579bfbc7c357d3219bf922e3cc35031ae547`; CI e deploy GitHub Pages concluíram no workflow `41132042334`. CSS/JS públicos respondem HTTP 200 e seus hashes coincidem com `dist/`.**

### Mobile do Dashboard — 30/10/2026

A captura do usuário mostrava cartões de indicadores com altura insuficiente, cortando valores e texto; o grid responsivo também herdava a posição/altura editável do desktop. Em viewport de até 700 px, o dashboard agora troca o grid absoluto do React Grid Layout por uma coluna fluida com cartões de altura automática, quebra segura de valores e gráficos com espaço; controles de arrastar/redimensionar ficam ocultos e as alterações mobile não sobrescrevem a preferência de layout desktop.

Evidência visual local do dashboard: viewport **320, 390 e 576 px**, 8 cartões em coluna e `scrollWidth === clientWidth` (sem rolagem horizontal); valores longos aparecem sem corte. No preview com o shell completo em **1920 px**, a classe mobile não se aplica e os controles móveis ficam ocultos. Observação: o teste isolado anterior de **1262 px** não incluía o `AppShell`; no shell completo sem preferências persistidas, o RGL usa o breakpoint `md` vazio e empilha cartões estreitos. Nenhuma regra nova altera o desktop; a disposição com as preferências reais do workspace precisa ser confirmada no CRM publicado antes de reafirmar o resultado específico de 4 colunas.

Regressão focada: **7/7 testes**; suíte completa **185/185** (43 arquivos, execução serial); TypeScript e build aprovados. Build preserva avisos preexistentes de `config.js` e chunk acima de 500 kB. Workflow `41120798607` concluiu CI e deploy para o mesmo SHA `10efa8170e24f78ebffd6448040e76b4f6fb5038`. O CSS público `assets/index-bv0W2g4u.css` (SHA-256 `c998cdb505abb7bde7e32bfa3a5eefd03aa5b451fd9379b99e859fa7ba741cca`) e JS `assets/index-CrwP6ViJ.js` (SHA-256 `258229697496ae3e643714ee88ab6fc801cc8efdcba852b071efe542033c5b57`) respondem HTTP 200 e correspondem exatamente aos artefatos locais.

### Navegação e shell mobile — 30/10/2026

Após o usuário informar que não conseguia abrir o menu e que a experiência geral continuava ruim, a causa foi confirmada: em larguras até 870 px o CSS ocultava a sidebar, mas o componente `Header` não renderizava o botão `.sidebar-toggle` nem existia estado para abrir o drawer. A busca global também ficava sem campo visível/acessível em telas estreitas.

Implementado localmente no commit `7421a2ff7cc4a47ec4136233e8b35742eb65db95`: botão de menu com estado ARIA; drawer com todas as rotas já filtradas pelas permissões, backdrop e botão de fechar; fecha ao navegar, tocar fora, pressionar Escape; trava/restaura scroll e mantém foco por teclado dentro do drawer, retornando-o ao toggle ao fechar. A busca global ganhou botão mobile, expansão/foco do campo e fechamento com Escape. Cabeçalho sticky, safe areas e espaçamentos compactos aplicam-se somente no mobile; os seletores desktop não foram alterados.

Evidência de navegador local: **320, 390, 576 e 700 px** sem overflow horizontal. Em 390 px o drawer foi aberto, mostrou as rotas, fechou ao navegar para `/reports`, liberou o scroll e devolveu foco ao botão; a busca abriu com o input focado, permaneceu dentro da largura e fechou com Escape. No desktop (1262/1920 px) o toggle móvel fica oculto; em 1920 px a classe de layout mobile não se aplica. Nenhum acesso ao banco ou mutação de dados foi feito.

Regressões TDD: testes novos reproduziram a ausência do botão, da ação de fechar e do foco antes das respectivas correções. AppShell **16/16**, suíte serial **43 arquivos / 192 testes**, typecheck, build e `git diff --check` passaram; `npm audit --audit-level=moderate`: **0 vulnerabilidades**. Build mantém os avisos preexistentes de `config.js` e chunk >500 kB. O commit funcional `7421a2ff7cc4a47ec4136233e8b35742eb65db95` foi enviado dentro do release `aa3d579bfbc7c357d3219bf922e3cc35031ae547`; workflow `41132042334` concluiu com sucesso no SHA do release. Assets públicos `assets/index-CMeS1aXy.css` e `assets/index-mQVsila3.js` responderam HTTP 200; hashes SHA-256 `6408ddd8bcf1383431fabd54d92449d65ce3e5645632a96b9f1e7b7ac4e9b44b` e `cd7975ac52bc4408d8239bceb28638aced01244b751bd485f22c5bac82a1562c`, idênticos aos arquivos em `dist/`. Marcadores do menu e busca foram encontrados nos assets publicados.

### Relatório de motivos de perda — 30/10/2026

A causa foi confirmada no caminho de leitura: o bootstrap remoto de `core_deals` não selecionava `loss_reason`; além disso, o filtro do relatório usava `created_at`, excluindo negociações antigas perdidas no período recente. Foi adicionada persistência estruturada de `lost_at`, leitura de `loss_reason`/`lost_at`, agrupamento por lead e motivo cadastrado, período de perda, detalhamento e impacto sobre negociações reais. A tela de perdas não usa os dados mock locais.

A migration `202610300008_loss_timestamp.sql` foi aplicada ao projeto remoto cujo nome e ref foram conferidos como `L.E.I.A CRM Staging` / `nsrwjtgzluadienwtnxt`. Leitura posterior confirmou a coluna `lost_at`, **4/4** negociações perdidas com timestamp e nenhum registro perdido sem data. Consulta agregada encontrou uma perda de **R$ 2.000,00** em 30/10/2026 com motivo `Sem prioridade no momento`, compatível com o registro informado pelo usuário; nenhum nome/PII foi copiado para esta auditoria.

Validações: testes focados **21/21**, TypeScript aprovado, build local aprovado (avisos conhecidos de `config.js` e chunk acima de 500 kB), `npm audit` com **0 vulnerabilidades** e DB lint remoto com exit 0 e avisos preexistentes em funções não relacionadas. A execução do workflow para `b33bfe848bf743f3cac8927e66cc61b8d871cb3c` passou **42 arquivos / 183 testes**, build e deploy. O bundle público `assets/index-CBeWXIWg.js` respondeu HTTP 200, SHA-256 `a093adb7c7f695a8ef841e717a50704484ba082ca22b85c0f61022d34f30db0c`, com marcadores `lost_at`, `loss_reason`, `Período personalizado` e `Distribuição dos motivos`. A execução local paralela teve 174/183 por timeouts intermitentes em áreas não relacionadas; a execução serial do CI passou sem falhas.

### Implantação verificada

O commit `b33bfe848bf743f3cac8927e66cc61b8d871cb3c` foi enviado para `main`; o workflow `41108027237` concluiu com sucesso e publicou a aplicação no GitHub Pages. O bundle e os marcadores da funcionalidade foram lidos de volta após o deploy.

### Atualização histórica — importação de leads

A causa da rejeição foi confirmada: o XLSX gerado pelo próprio CRM possui título e linha vazia antes do cabeçalho, enquanto o importador tratava obrigatoriamente a primeira linha como cabeçalho. O parser agora localiza a linha real de cabeçalho, ignora linhas vazias iniciais e aceita o modelo oficial e a planilha de 200 leads fornecida. Regressão automatizada adicionada para esse formato.

Validação executada após a correção do parser: **167/167 testes**, TypeScript aprovado, build de produção aprovado e auditoria de dependências com **0 vulnerabilidades**. Em 30/10/2026, o gerador do modelo também foi corrigido para iniciar diretamente pelo cabeçalho na primeira linha; testes focados 4/4 e build aprovados. A suíte completa desse segundo disparo teve 167/168 por timeout conhecido do CalendarPage, que passou 7/7 isoladamente. As mudanças estão validadas localmente, mas ainda não foram classificadas como publicadas no GitHub/staging.

### Auditoria-base anterior

## Resultados objetivos

| Área | Resultado | Evidência |
|---|---|---|
| TypeScript | PASS | `npm run typecheck` — exit 0 |
| Build de produção | PASS com avisos | `npm run build` — exit 0; chunk principal ~1.16 MB minificado |
| Testes | ATENÇÃO | 38 arquivos passaram; 1 arquivo teve timeout; 165/166 testes passaram no primeiro disparo |
| Reexecução do CalendarPage | PASS | 7/7 testes passaram isoladamente |
| Dependências | PASS | `npm audit --audit-level=moderate`: 0 info/low/moderate/high/critical |
| Git | ATENÇÃO | 23 arquivos rastreados modificados e muitos arquivos novos, principalmente migrations/tests |
| Supabase | NÃO validado contra remoto nesta auditoria | 52 migrations locais e 4 Edge Functions presentes; aplicação remota não foi alterada |

## Funções e superfície mapeada

- **Páginas React:** 14: Dashboard, Contacts, Pipeline, Tasks, Calendar, Campaigns, Segments, Automations, Reports, Notifications, Integrations, Team, Profile e Settings.
- **Testes automatizados:** 39 arquivos de teste; 166 testes contabilizados no disparo completo.
- **Supabase:** 52 migrations locais; 4 Edge Functions.
- **Build:** 2.133 módulos transformados; saída `dist/` gerada.

## Falhas, riscos e pendências

1. **Timeout na suíte completa:** `src/test/CalendarPage.test.tsx`, caso “exige data futura, horário e responsável selecionado ao criar tarefa”, excedeu 5s no disparo completo. Isolado, passou em 3.185ms. Prioridade P1: reduzir flakiness/tempo ou ajustar timeout de forma justificada.
2. **Working tree não está limpa:** há alterações locais não commitadas. Elas não devem ser consideradas “entregues ao GitHub” até commit/push e verificação remota.
3. **Aviso do Vite:** `./config.js` não pode ser empacotado sem `type="module"`; revisar apenas se o carregamento runtime exigir correção.
4. **Chunk grande:** chunk principal ~1.165 MB minificado; considerar code splitting/dynamic import antes de produção.
5. **Validação remota Supabase:** esta auditoria local não confirma migrations aplicadas em staging/produção nem o estado de RLS/Edge Functions remotas.

## Working tree no momento da auditoria

Arquivos rastreados modificados incluem páginas/componentes de Contacts, Tasks, Automations, Pipeline e Settings; adaptadores/permissions; testes; worker e migrations recentes. Também existem arquivos novos em `src/lib/effectivePermissions.ts`, `src/test/effectivePermissions.test.ts`, migrations de 16/10 a 29/10 e `supabase/tests/`.

**Regra:** não apagar, resetar ou commitar essas alterações automaticamente. O próximo agente deve ler o diff antes de qualquer alteração.

## Próximo alvo de 100%

- [ ] Reproduzir a suíte completa pelo menos duas vezes sem timeout.
- [ ] Corrigir ou estabilizar o teste de CalendarPage.
- [ ] Revisar o warning de `config.js` no build.
- [ ] Avaliar code splitting do chunk principal.
- [ ] Validar migrations e Edge Functions no ambiente remoto autorizado.
- [ ] Criar commit explícito vinculando este arquivo de auditoria.
- [ ] Após cada commit/push, atualizar este documento com hash, data e resultado de verificação.

## Webhooks do Leads Hub como origem de automação — 31/10/2026

**Causa confirmada:** o modal de origem em `AutomationsPage.tsx` usava uma opção fixa (`webhook-lead-created`) e não consultava `core_workspace_webhook_list`; por isso o webhook criado como “Testando” não aparecia. Além disso, o Edge Function descartava o ID do webhook na autorização e o evento `WEBHOOK_RECEIVED` não carregava origem específica; o matcher do worker não podia distinguir qual endpoint recebeu o lead.

**Implementação:** o modal agora busca os webhooks do workspace ativo, exibe nomes/estado e salva o ID selecionado; `source_label` conserva o nome para reedição. O Edge `core-webhook-v2` usa `core_workspace_webhook_authorize_v2` e `core_ingest_webhook_lead_v2`; a migration `20261031023137_automation_webhook_entry_source.sql` inclui o ID autenticado no contexto do outbox, valida rótulo no grafo e filtra automações pelo webhook exato. “Todos os webhooks ativos” e o identificador legado continuam suportados.

**Validação Supabase/Edge:** aplicada ao projeto `nsrwjtgzluadienwtnxt`; histórico remoto confirma `20261031023137`. `core-webhook-v2` implantada como versão 6 (`verify_jwt=false`), confirmada em `supabase functions list`. Teste sintético transacional no workspace validou publicação/ativação de grafos com o nome do webhook, disparo somente para o ID escolhido, rejeição do webhook diferente, wildcard e compatibilidade legada; a subtransação foi revertida. Read-back confirmou zero eventos, contatos ou automações sintéticas residuais.

**Validação local após o segundo ajuste:** suíte serial 45/45 arquivos, 202/202 testes; teste `webhook-all` RED→GREEN; typecheck passou; build passou (avisos conhecidos `config.js` sem `type=module` e chunk >500 kB); `npm audit --audit-level=moderate` encontrou 0 vulnerabilidades; bundle Edge via esbuild passou; `supabase db push --linked --dry-run` lista somente `20261031033521_webhook_rate_limit_and_match_guard.sql`, sem aplicar; comparação normalizada do validador e do matcher passou com hashes iguais (`c7235678…303c3c5`, `746d75f7…342b1939`).

**Revisões pré-commit #1–#3:** reprovadas; a #3 não reportou achados de segurança, mas registrou risco de rollback na migration `20261031023137`, cobertura insuficiente do limite 60/61 e lacunas nos testes de identidade/API-key e interação React. Lucas autorizou um ciclo adicional. **Ciclo #4 local:** criado gate executável de rollout (`scripts/deploy-core-webhook-v2.mjs`) que bloqueia projetos/ref incorretos, migrations inesperadas/divergentes e deployment antes da aplicação/alinhamento de `20261031033521`; executa a fixture SQL rollback-only antes da Edge e confirma `ACTIVE`/`verify_jwt=false` depois. A fixture SQL rollback-only valida dois webhooks pela cadeia de autorização→ingestão→outbox, API-key sem identidade, matching exato/diferente/wildcard/legado e resíduo zero, sem editar `context` diretamente. O probe multi-transação do gate verifica separadamente 60 autorizações aceitas, a 61ª negação estruturada, leitura pós-commit `hits=61`, cleanup sintético exato e readback de zero resíduos. O teste React usa `userEvent` sem alterar `disabled`. Gate mockado passou 7/7; regressão React focada passou 1/1; suíte completa passou 45/45 arquivos e 202/202 testes; typecheck/build passaram; esbuild da Edge passou; npm audit encontrou 0 vulnerabilidades; dry-run Supabase listou somente migration 33521 pendente; verificação de whitespace/sintaxe passou. A fixture SQL ainda não foi executada: Docker/Podman local não está disponível e a migration 33521 permanece pendente no remoto. Nenhuma alteração de banco/Edge, commit, push, Pages ou envio real foi feito. Migration aplicada `20261031023137` continua imutável.

**LEIA Packager Pro:** `blocked`, score 62, `safe_to_deliver=false`, 0 findings bloqueantes e 46 findings de baseline; não declarar o pacote completo pronto. **Re-review independente #4:** reprovada (`passed=false`, `security_concerns=[]`) com duas ressalvas: o gate permite migrations históricas já alinhadas local/remoto; a fixture SQL verifica hits=61 e negação estruturada dentro da subtransação antes do rollback sentinela. Avaliação ainda não aprovada para release: histórico alinhado é necessário e o gate bloqueia pending/divergente; o rollback final é intencional para zero resíduo, mas esses critérios precisam de decisão explícita. Após o re-review #4, Lucas autorizou novo ciclo direcionado. Escopo: pin exato do conjunto de migrations alinhadas, comprovar hits=61 após commit com webhook/workspace sintéticos temporários, cleanup em transação separada e readback zero; sem leads/contatos. O baseline do ciclo #4 permanece staged; as correções do ciclo #5 e a auditoria estão unstaged. Nenhuma migration/deploy/commit/push remotos. Packager continua `blocked`, `safe_to_deliver=false` (score 62; 0 blockers, 46 findings).

## Ciclo #5 — correções locais e validação (31/10/2026)

- O gate agora fixa os 62 versions históricos lidos do ledger vinculado, permite somente o forward migration alvo `20261031033521`, rejeita qualquer versão fora da allowlist mesmo quando alinhada e exige conjuntos exatos antes/depois de `db push`. A autorização segue para migration isolada; após o push, local/remoto devem corresponder exatamente ao baseline + alvo.
- O gate executa o probe de rate limit em chamadas SQL separadas: cria apenas user/workspace/webhook sintéticos (sem membership, lead ou contato), faz 60 authorizations válidas e a 61ª denial estruturada, lê `hits=61` em uma transação posterior, limpa por IDs/markers exatos e verifica zero resíduo de workspace, user/profile, membership, webhook/rate, segredo Vault, auditoria, contato, ingestion, atividade, deal e automação. SQL é enviado por stdin; token aleatório não entra em argv nem logs. Qualquer falha de teste/cleanup/readback bloqueia Edge deploy.
- A fixture SQL rollback-only voltou a cobrir somente identidade webhook→ingestão→outbox, dois endpoints, matcher exato/diferente/wildcard/legado e API-key sem identidade; não edita `context` diretamente. Rate 60/61 está no probe multi-transação separado.
- RED→GREEN: teste de migration extra alinhada e fases/cleanup do rate probe falharam antes da correção; gate Node terminou 11/11 após as mudanças.
- Validação local: Vitest 45/45 arquivos, 202/202 testes; typecheck passou; build passou (avisos: `config.js` sem `type=module` e chunk principal >500 kB); `npm audit --audit-level=moderate` encontrou 0 vulnerabilidades; dry-run remoto listou somente `20261031033521`; `git diff --check HEAD` e `node --check` passaram.
- Re-review #5 reprovou; Lucas autorizou concluir sem nova confirmação. Correções ciclo #6: cleanup exige workspace e endpoint exatos (ID, workspace_id, public_id, name, created_by e token digest), rate rows via `DELETE ... USING` no webhook exato e Vault secret só pelo `vault_secret_id`; removido delete por nome. O modo `--contracts-only` aplica migration e roda contratos sem Edge deploy.
- Staging `nsrwjtgzluadienwtnxt`: ledger local/remoto alinhado com 63 versões (62 históricas + `20261031033521`), migration aplicada. Contrato ao vivo passou: 60 autorizações aceitas, 61ª negação estruturada, readback pós-commit `hits=61`, cleanup e zero resíduos. Fixture rollback-only também passou; leitura final: zero workspaces, users, webhooks, rate rows, API keys, ingestion events, activities, contacts e automations sintéticos. Edge `core-webhook-v2` continua v6 ACTIVE/`verify_jwt=false`; v7 ainda não implantada.
- A primeira tentativa contracts-only falhou no fixture por alias SQL ausente (`42P01`, `h`); migration já estava aplicada, sem Edge deploy. TDD adicionou regressão, alias `AS h` corrigido nas duas chamadas, fixture direta e gate completo executados com sucesso. Local: `test:deploy-gate` 13/13; Vitest 45/45 arquivos, 202/202 testes; typecheck/build/audit (0 vulnerabilidades)/`node --check`/`git diff --check HEAD` passaram; build mantém avisos existentes de `config.js` e chunk >500 kB.
- Próximo passo: bundle completo e re-review independente #6. Só após aprovação executar release gate completo para Edge v7, ler o estado de volta e então commit/push/Pages. Próximas tarefas preservadas: regressões de payload extra/envios parciais/retries; validar Supabase/CRM de ingestão, atualizar auditoria e publicar após confirmação. Não enviar leads pessoais; preferir fixtures sintéticas.
## Review #6 — local remediation

- Review #6 reported three findings. Local fixes: rollback fixture residue verification now checks captured webhook/key/event/automation ownership IDs directly (including rate rows), with no broad DELETE; rate-probe context creation runs inside cleanup-guarded control flow; default release rejects target 33521 already remote-applied, while `--resume-after-contracts` requires exact 63-version alignment, skips push, and reruns both contracts before any optional deploy.
- Evidence: regression tests were observed RED before source changes; focused cases and `npm run test:deploy-gate` pass (15/15). Both Node syntax checks and `git diff --check HEAD` pass. Fixture validated locally only; no remote query, push, Edge deploy, or other external state changes.
- Independent re-review #6 (`deleg_36093fac`) failed closed on three issues: probe-context construction sat outside its guarded path; default release accepted target migration 33521 already applied; fixture residue checks could miss orphan rate rows and omitted synthetic artifact tables.
- Cycle #7 fixes: context-factory failure is tested to cause no rate-probe SQL/setup or Edge deploy; default mode now rejects an already-applied target, while `--resume-after-contracts` accepts only exact local/remote baseline+target alignment, skips `db push`, and reruns both contracts before optional deployment. The rollback fixture captures IDs in its outer PL/pgSQL scope and performs post-rollback direct checks by webhook ID, API-key ID, and captured Vault secret IDs, plus workspace/user/profile/membership, audit, automation event/outbox, rule/revision, ingestion/activity/submission-link, contact and deal tables. No broad deletes.
- TDD/evidence: regression tests were observed RED before fixes; the added fixture-scope assertion also failed RED on the former separate `DO` block and passed after consolidation. `npm run test:deploy-gate` 15/15; full Vitest 45/45 files and 202/202 tests; typecheck/build passed; audit 0 vulnerabilities; both Node syntax checks and `git diff --check HEAD` passed. Build warnings remain: runtime `config.js` without `type=module` and main chunk >500 kB.
- Live contracts-only revalidation on `nsrwjtgzluadienwtnxt` passed via `npm run deploy:core-webhook-v2 -- --resume-after-contracts --contracts-only`: exact 63-version ledger (62 historical + target), 60 valid authorizations plus structured 61st denial, separate committed readback `hits=61`, cleanup/readback zero, and rollback identity fixture passed with direct orphan-safe assertions. Separate readback found zero synthetic workspaces, users, webhooks, API keys and contacts. Edge remains v6 ACTIVE/`verify_jwt=false`; no v7, commit, push, or Pages publication occurred.
- Backlog remains justified: ingestion unit tests cover only parts of multipart behavior; RPC-level conflict/linking/merge/automation evidence must be freshly checked. Current Pages/CRM deployment validation must follow the reviewed release and use only a marked synthetic submission with exact cleanup/readback; no personal lead submissions.
- Independent re-review #7 (`deleg_ba3c2410`) failed on four findings: webhook cleanup lookup must be inside the owned-workspace gate; legacy identity semantics needed an explicit API-key regression and docs; rollback residue needed direct generated IDs for more artifact tables; historical `published` wording needed a prominent current webhook status.
- Cycle #8 fixes: exact webhook secret lookup now runs only when the probe workspace+actor/name/slug ownership check passes, and its predicate remains exact for webhook ID/workspace/public ID/name/creator/token digest; rate rows remain deleted only through that webhook and Vault only by its captured secret ID. Final legacy contract is explicit: `webhook-lead-created` remains valid for identified authenticated webhook events; identity-free API-key events match no webhook source. Applied migrations 23137 and 33521 remain untouched. The rollback fixture explicitly tests API-key-vs-legacy/wildcard and checks captured IDs for ingestion, activities, audits, automation events/deliveries/continuations, contacts/deals, plus exact submission-link composite keys.
- TDD/evidence: new regressions were observed RED (14/18) before implementation; focused gate now 18/18. Full Vitest 45/45 files, 202/202 tests; typecheck/build pass; audit reports 0 vulnerabilities; Node syntax and `git diff --check HEAD` pass. Existing build warnings remain `config.js` without `type=module` and main chunk >500 kB.
- Live validation on `nsrwjtgzluadienwtnxt`: rollback-only fixture passed with direct generated-ID checks and zero aggregate residues. `npm run deploy:core-webhook-v2 -- --resume-after-contracts --contracts-only` exited 0: exact 63-version ledger, 60 accepted plus structured denial #61, separate committed readback `hits=61`, ownership-exact cleanup/readback zero; Edge deploy skipped. No real lead was sent.
- Independent re-review #8 initially returned a single legacy-matcher finding. Re-review #9 (`deleg_3b3b49bb`) approved the complete bundle and confirmed that finding was a false positive: identified events with `source_webhook_id` match `webhook-lead-created`; the identity-free API-key event matches no webhook source. No code or applied migration changed after bundle #8.
- Edge release executed only after that approval with `npm run deploy:core-webhook-v2 -- --resume-after-contracts`; gate exited 0, enforced exact 63-version alignment without `db push`, reran both contracts, verified committed rate `hits=61`, cleanup/residue zero, and invoked `functions deploy core-webhook-v2 --no-verify-jwt`. Independent remote readback: `core-webhook-v2` ACTIVE v7, `verify_jwt=false`; local/remote ledger 63/63 exact. A separate aggregate readback found zero synthetic workspaces, users, webhooks, secrets and contacts.
- Git commit/push, GitHub Pages, and browser submission remain pending; no real lead/contact was sent. Existing mixed staged/unstaged Git state is unchanged.
- Next tasks remain justified: complete focused ingestion RPC regressions for conflict/linking/merge/automation; after UI publication, verify the current Pages SHA/runtime config and a marked synthetic end-to-end submission with exact cleanup/readback, targeting only the React CRM project.
