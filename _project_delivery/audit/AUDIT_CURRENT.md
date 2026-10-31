# CRM Marketing Core — Auditoria Atual

- **Data da auditoria:** 30/10/2026
- **Projeto auditado:** `Versão React para testes/marketing-core-crm-react`
- **Branch:** `main` limpa em `origin/main` no release commit `aa3d579bfbc7c357d3219bf922e3cc35031ae547`; inclui o commit funcional `7421a2ff7cc4a47ec4136233e8b35742eb65db95`. GitHub Pages workflow `41132042334` concluiu com sucesso nesse SHA.
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
