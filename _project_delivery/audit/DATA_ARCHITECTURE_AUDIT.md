# Auditoria focada em dados, isolamento e desempenho — CRM Marketing Core

- **Coleta:** 31/10/2026, 20:31–20:52 BRT.
- **Escopo:** repositório React de staging e Supabase de staging atualmente vinculado. O identificador do projeto foi omitido desta cópia compartilhável.
- **Base do repositório:** `main`, HEAD `680a86e11aead6d02cc3952109dd6a5b9b7fd526`.
- **Limite de escopo:** produção não foi consultada nem alterada. As consultas ao Supabase foram `SELECT`/metadados; nenhum registro de cliente foi exportado, criado ou alterado.
- **Estado local:** há mudanças não commitadas de interface para o atalho “Criar nova negociação” em `LeadProfileDrawer`, `ContactsPage`, `PipelinePage`, `styles.css`, testes e o novo `DealCreateDialog`. Elas não estão publicadas e foram preservadas; não fazem parte do histórico remoto do preview.

## Parecer executivo

**A fundação multi-tenant está no caminho certo; a estratégia atual de carregamento e a rastreabilidade do schema ainda não sustentam uma afirmação de prontidão para volume comercial.** O maior sinal de lentidão não é a organização das pastas: é o próprio fluxo de dados do front-end. A aplicação carrega um snapshot amplo, e várias RPCs — inclusive o heartbeat de presença a cada 60 segundos — provocam uma nova carga completa. No Supabase de staging, o `core_dashboard_summary` aparece com 9.743 execuções, média de 320,24 ms e máximo de 1.369,23 ms no intervalo estatístico observado.

Há bons controles: as 48 tabelas `public.core_*` observadas têm RLS habilitado; o schema contém políticas por capacidade, chaves/índices de escopo e FKs compostas que ajudam a impedir vínculos entre workspaces. Porém, o repositório não contém uma cadeia de migrations capaz de reconstruir o schema atual desde um banco vazio: 18 das 64 migrations versionadas contêm somente `;`, e não foi encontrado DDL de criação para tabelas-base como `core_contacts`/`core_workspaces` nem a definição local da RPC de dashboard que está sendo executada em produção de staging.

**Conclusão prática:** não recomendo reescrever nem fragmentar o banco agora. Recomendo, antes de ampliar clientes pagantes: (1) parar a reidratação completa em chamadas de presença/RPCs; (2) carregar listas com paginação e filtros no servidor; (3) recuperar/testar a reconstrução integral do schema; (4) criar testes negativos de RLS entre workspaces; e (5) reduzir a exposição de CPF/CNPJ no snapshot e no cache do navegador.

## Método e limites

1. Releitura dos documentos locais de auditoria/continuidade e inspeção do estado do Git.
2. Revisão das 64 migrations locais, dos 3 testes SQL de banco e dos módulos React de API, snapshot, contatos, pipeline, dashboard, importação e criação de negociação.
3. Leitura somente de metadados do Supabase de staging: catálogo PostgreSQL, RLS/policies, índices, constraints, ACLs do schema privado e estatísticas agregadas. A consulta não selecionou linhas de contatos, leads, empresas ou usuários.
4. Leitura agregada de `pg_stat_statements`, com valores literais removidos do texto normalizado. Os resultados abaixo registram apenas nomes de relações/RPCs e métricas.
5. `npm run build` foi executado no worktree atual. Não foi feito teste de carga, captura de tempos no navegador autenticado, nem `EXPLAIN (ANALYZE, BUFFERS)` com volume sintético. O login autenticado não foi usado.

**Limite importante:** os dados de staging são pequenos e não representam capacidade de produção: estimativas atuais indicam cerca de 222 contatos e 31 negociações. As estatísticas de banco acumulam aproximadamente 12 dias e 4 horas desde o reset; são contagens e médias acumuladas, não percentis de experiência do usuário. A configuração específica do limite máximo de linhas do PostgREST não foi confirmada; uma consulta ao GUC do banco retornou `NULL`, o que não revela a configuração do serviço HTTP.

## Achados prioritários

### D-01 — Recarregamento amplo e repetido do snapshot — **alto; causa provável de lentidão**

**Evidência no código**

- `src/lib/remoteCrm.ts:259–335`: `bootstrapRemoteCrm` resolve 17 recursos em `Promise.all`. Entre eles estão contatos, negociações, tarefas, tags, vínculos, notificações, campanhas, listas/participantes, permissões, histórico e `core_dashboard_summary`. Vários selects são limitados apenas por `workspace_id`, sem paginação/`Range` nem limite explícito.
- `src/lib/remoteCrm.ts:359–368, 471–477`: `remoteRpc` serializa a chamada na fila global e sempre chama `refreshRemoteCrm()` depois dela; esse refresh executa novamente o bootstrap inteiro.
- `src/App.tsx:137–145`: `core_presence_heartbeat` é chamado por `remoteRpc` a cada 60 segundos. O registro online/offline também usa esse caminho.
- `src/pages/DashboardPage.tsx:14,17`: ao abrir o dashboard, três RPCs passam por `remoteRpc`; preferências e lista de metas são leituras, mas cada chamada também dispara um bootstrap completo. Como as operações entram na fila global, elas não são uma única leitura paralela simples.

**Evidência no banco** — estatísticas agregadas de staging desde o último reset (~12d4h):

- `core_dashboard_summary`: **9.743 chamadas**, média **320,24 ms**, máximo **1.369,23 ms**.
- select de `core_contacts`: **7.446 chamadas**, média **139,78 ms**, máximo **286,63 ms**.
- select de `core_deals`: **8.449 chamadas**, média **44,70 ms**, máximo **120,88 ms**.
- select de `core_contact_tags`: **9.733 chamadas**, média **36,52 ms**, máximo **116,05 ms**.

Os tempos são do PostgreSQL, não incluem rede, React ou desenho da tela. A repetição de `core_dashboard_summary` combina com o caminho do heartbeat → `remoteRpc` → bootstrap; é uma explicação plausível e bem apoiada para carga desnecessária, mas não prova que seja a única causa da lentidão percebida.

**Recomendação:** separar RPCs de leitura, mutações e presença; o heartbeat deve atualizar presença sem recarregar o CRM. Carregar preferências/metas apenas no dashboard. Após uma escrita, invalidar/atualizar só os recursos afetados, em vez de baixar novamente todas as tabelas. Instrumentar duração, bytes e número de requests por tela antes/depois.

### D-02 — Schema atual não é reconstruível a partir das migrations versionadas — **crítico para recuperação e novos ambientes**

- A CLI confirmou **64 versões locais e 64 remotas alinhadas**. Isso confirma o ledger, não que as migrations contenham todo o DDL que criou o banco.
- **18/64** arquivos de migration são literalmente um ponto e vírgula. Entre eles está o arquivo denominado `baseline`; os outros incluem versões de segurança, perfis, segmentos e jobs.
- Em todo o SQL versionado não foi encontrado `CREATE TABLE` para `public.core_contacts` ou `public.core_workspaces`; também não foi encontrada a criação de `core_import_jobs`. A RPC viva `public.core_dashboard_summary(uuid)` é chamada pelo React e executa em staging, mas sua definição não aparece nas migrations locais.
- O catálogo ao vivo tem **48 tabelas `public.core_*` e 8 tabelas em `core_private`**. Portanto, o banco funciona hoje, mas a fonte no Git não explica integralmente sua criação.

**Impacto:** um novo ambiente, restauração ou recuperação regional pode não reconstruir a mesma estrutura apenas repetindo as migrations versionadas. Não altere migrations já aplicadas. Recuperar o DDL histórico, ou produzir um bootstrap revisado e versionado para ambiente vazio, e provar a reconstrução em um projeto descartável antes de vender o produto.

### D-03 — Leitura total no servidor + filtro/paginação no navegador — **alto em volume; risco de truncamento**

- O snapshot baixa todos os contatos e negociações do workspace (e outros recursos), com ordenação, mas sem cursor ou `Range` explícito. `ContactsPage.tsx:97–156` filtra o array inteiro em memória e só depois faz `slice` para a página visual. O tamanho de página 10 não reduz os dados buscados do banco.
- `PipelinePage.tsx` também monta as negociações a partir do snapshot completo. O dashboard calcula datas, equipes, metas e métricas sobre os arrays carregados no cliente.
- O bootstrap de contatos inclui `notes` e `custom_fields` para todos os contatos; isso amplia tanto payload quanto cache.
- Como a configuração específica de `max_rows` não foi verificada, não afirmo que já exista truncamento. Mas a combinação “leitura sem paginação + limite configurável da API + filtro local” pode deixar a UI lenta e/ou incompleta quando o tenant crescer.

**Índices observados:** `core_contacts_listing(workspace_id, created_at DESC)` combina com a ordenação da lista de contatos. Em contraste, `core_deals_board(workspace_id, stage_id, created_at DESC)` não corresponde à leitura geral atual de deals (workspace + created_at, sem filtro por stage); `core_tasks_due(workspace_id, status, due_at)` não tem `status` como filtro da leitura atual de tarefas; e o índice parcial de notificações unread não cobre necessariamente a leitura de todas as notificações. Isso é oportunidade de análise, não justificativa para criar índices às cegas: confirmar planos com dados sintéticos representativos primeiro.

**Recomendação:** paginação por cursor estável (`created_at`, `id`), filtros no PostgREST/RPC, seleção mínima de colunas e contagens/indicadores no servidor. Carregar os dados da tela conforme a rota, não um snapshot universal. A paginação HTTP e o limite de linhas do PostgREST estão descritos nas referências [S4–S5].

### D-04 — RPC de dashboard cara e chamada fora do dashboard — **alto**

A função viva `core_dashboard_summary` executa várias agregações independentes (contatos totais/30 dias, funil, série diária, deals abertos/ganhos e tarefas a vencer). Ela é chamada pelo bootstrap mesmo quando a pessoa está em Contatos, Pipeline ou outra tela. As estatísticas mostram média de 320 ms e máximo de 1,37 s por execução. O filtro de deals por `status` não tem um índice composto específico visível entre os índices atuais; o índice de board inclui `stage_id` antes de `created_at`.

**Recomendação:** primeiro remover chamadas redundantes; depois medir `EXPLAIN (ANALYZE, BUFFERS)` em staging com dados sintéticos, combinar contagens/somas compatíveis e só então decidir por índices ou agregação/cache. `EXPLAIN ANALYZE` executa a consulta; não rode benchmarks pesados em produção. A função também precisa entrar na fonte versionada do schema.

### D-05 — Importação e exportação ainda passam pelo navegador — **médio/alto para bases grandes**

- `src/lib/leadRecords.ts:24` percorre cada lead sequencialmente (`for ... await createLeadRecord`). Na rota remota, cada linha vira uma escrita REST individual; o progresso e o histórico de parcial/falha são registrados, mas a operação não é um batch transacional único.
- Há uma arquitetura SQL de jobs duráveis (`core_import_enqueue`, claim/lease e processamento em lotes até 500), com idempotência. Não encontrei chamadas dela no `src` nem nas Edge Functions versionadas. Portanto, não trate esse pipeline como ativo na importação atual sem verificar um worker externo; a tela usa o caminho sequencial acima.
- Exportações de contatos/relatórios montam `rows` em memória e geram CSV/PDF/XLSX no navegador. Os jobs de relatório versionados não aparecem conectados ao fluxo React pesquisado.

**Recomendação:** decidir qual caminho de importação será oficial, ligar UI a um worker funcional e observável, preservar idempotência e políticas ATOMIC/PARTIAL, e limitar tamanho/concorrência. Para exportações grandes, usar job assíncrono com download autorizado e expiração.

### D-06 — CPF/CNPJ e campos livres circulam no snapshot e no cache do browser — **médio/alto, privacidade**

- `LeadImportPage.tsx` aceita CPF/CNPJ; `src/lib/leadRecords.ts:16–17` lê esses valores de `custom_fields` e os grava de volta em JSONB.
- `remoteCrm.ts:278–281` seleciona `custom_fields`, `notes` e outros campos sensíveis para todos os contatos do workspace; o snapshot completo é serializado em `sessionStorage` por até 12 horas (`remoteCrm.ts:173–207`). O cache é limpo no logout, mas continua sendo uma cópia local acessível ao JavaScript da mesma origem durante a sessão.
- As políticas observadas são por linha/capacidade. Não foi encontrada uma permissão de campo separada para CPF/CNPJ; `contacts.read` pode trazer a linha inteira se a política permitir.

**Recomendação:** confirmar se CPF/CNPJ são realmente necessários; evitar carregá-los na lista geral, buscar detalhes sob demanda e criar controle específico de acesso/mascaramento para PII. Definir retenção, exportação e anonimização. Esta auditoria não avaliou criptografia gerenciada pelo provedor; afirma apenas que não há criptografia de campo visível no caminho React revisado.

### D-07 — Isolamento por workspace é uma boa base; falta teste explícito de RLS entre tenants — **positivo com lacuna de validação**

- Nas **48 tabelas `public.core_*`** consultadas, RLS estava habilitado em **48/48**, com 86 políticas. Existem FKs e constraints compostas com `workspace_id` (por exemplo, deal → contact/pipeline/stage), e índices únicos de telefone/e-mail por workspace.
- `core_private` tinha 8 tabelas: 6 com RLS e 2 sem RLS (`workspace_webhooks`, `workspace_webhook_rate`). Para ambas, o schema `core_private` não tem `USAGE` para `anon`, `authenticated` ou `authenticator`; as tabelas não concedem SELECT/INSERT/UPDATE/DELETE a `anon`, `authenticated` ou `service_role`. As funções privilegiadas são o caminho de acesso. Isso parece intencional e não indicou exposição direta; preserve esses grants como invariantes testadas.
- No total das 56 relações inspecionadas foram contados 86 policies, 130 índices e 334 constraints. Nenhuma dessas contagens inclui linhas de clientes.
- Os 3 testes SQL versionados cobrem contrato de permissões, webhook/rate-limit/matching e ingestão/atividade. Não encontrei um teste que, sob `SET LOCAL ROLE authenticated`, tente ler e gravar contatos/deals de outro workspace e prove a negação. Os dois fixtures de webhook/ingestão exercitam principalmente funções privilegiadas; o contrato de capacidades valida helpers, não a matriz completa de RLS de cada tabela.

**Recomendação:** adicionar testes rollback-only com usuários e dois workspaces sintéticos para SELECT/INSERT/UPDATE/DELETE em contacts, deals, tasks e tabelas associativas; testar também `core_private` e os grants descritos. O guia de Supabase recomenda indexar/medir as colunas de políticas e validar explicitamente os comportamentos de RLS [S1–S3].

### D-08 — Bundle inicial acima do limite recomendado pelo build — **médio, secundário**

`npm run build` passou (Vite 6.4.5; 2.167 módulos), mas gerou um chunk principal de **1.271,80 kB** (**369,82 kB gzip**) e CSS de **136,12 kB** (**26,19 kB gzip**). O build alertou que há chunks acima de 500 kB. `App.tsx` importa estaticamente várias páginas. Isso pode prejudicar o primeiro carregamento, especialmente em redes móveis; não explica, por si só, os tempos de banco do `core_dashboard_summary`.

**Recomendação:** code-splitting por rota e lazy-load de PDF/planilhas/relatórios; medir LCP e tempo de hidratação antes/depois. O build também avisou que `config.js` é carregado como script não-module; revisar separadamente, sem alterar a configuração pública nesta auditoria.

## O que está bem encaminhado

- Modelo compartilhado multi-tenant por `workspace_id`, com RLS por capacidade, FKs compostas e unicidade normalizada por workspace: bom ponto de partida para SaaS; não há razão para sharding prematuro.
- O schema `core_private` separa tokens/integrações/segredos de tabelas públicas e seus ACLs atuais restringem acesso direto das roles do cliente.
- Há padrões de idempotência e jobs duráveis no SQL para webhook/importação/relatórios; o desafio principal é conectá-los ao fluxo ativo e manter a origem do schema completa.
- O front-end usa a chave pública/anon + sessão do usuário no wrapper revisado; nenhum service-role key foi incluído no pacote. Isso não substitui uma varredura completa de segredos em todos os arquivos do repositório.

## Plano recomendado, em ordem

1. **Imediato:** heartbeat de presença e RPCs de leitura sem `refreshRemoteCrm`; separar atualização/invalidação por recurso. Carregar `core_dashboard_summary` só na tela do dashboard.
2. **Antes de ampliar a base:** paginação e filtros server-side em contatos, deals, tarefas, notificações, tags/segmentos; payload mínimo sem CPF/CNPJ por padrão.
3. **Antes de onboarding de clientes pagantes:** reconstrução limpa do banco em staging descartável a partir de fonte versionada; documentar DDL completo e manter migrations aplicadas imutáveis.
4. **Segurança:** matriz automatizada de RLS multi-workspace sob `authenticated`; testes de ACL de `core_private`; separar PII e revisar cache/exportações.
5. **Operação:** medir bootstrap da UI (requests, bytes, p50/p95), banco (`pg_stat_statements`, `EXPLAIN ANALYZE` sob dados sintéticos), importação em lotes e concorrência. Staging atual é pequeno e não prova capacidade para muitos clientes online.
6. **Cold start:** dividir bundle por rota e carregar bibliotecas de importação/exportação quando necessárias.

### Critérios de saída sugeridos

- `supabase db reset`/provisionamento em projeto descartável reproduz tabelas, funções, triggers, índices, RLS e grants sem intervenção manual.
- Cada tabela tenant-scoped tem testes de allow/deny para duas organizações e papéis distintos.
- Abrir Contatos não baixa deals/tasks/relatórios desnecessários; heartbeat não dispara bootstrap.
- Lists usam paginação no servidor e apresentam contagem consistente; imports/exportações grandes não fazem N chamadas síncronas no browser.
- Medições em dados sintéticos com volume e concorrência acordados mostram p95 por tela e RPC dentro de metas definidas pelo produto.

## Referências técnicas

- [S1] Supabase — Row Level Security e configuração de políticas: https://supabase.com/docs/guides/database/postgres/row-level-security
- [S2] Supabase — depuração de desempenho do banco e planos de consulta: https://supabase.com/docs/guides/database/debugging-performance
- [S3] Supabase — recomendações de desempenho para RLS: https://supabase.com/docs/guides/database/postgres/row-level-security#rls-performance-recommendations
- [S4] PostgREST — paginação por Range/limit-offset e contagem: https://postgrest.org/en/stable/references/api/pagination_count.html
- [S5] PostgREST — configuração do limite máximo de linhas: https://postgrest.org/en/stable/references/configuration.html
- [S6] PostgreSQL — `EXPLAIN` e `EXPLAIN ANALYZE`: https://www.postgresql.org/docs/current/using-explain.html
- [S7] Supabase — `pg_stat_statements` para métricas agregadas de consultas: https://supabase.com/docs/guides/database/extensions/pg_stat_statements
- [S8] Supabase — migrations e reset de banco local: https://supabase.com/docs/guides/local-development/cli/getting-started

## Evidências entregues no pacote externo

- Catálogo ao vivo de colunas, constraints, índices, políticas, RLS e ACLs (JSON; sem linhas de clientes).
- Definição ao vivo de `core_dashboard_summary` (ausente das migrations locais).
- Estatísticas agregadas de execução/volume, com SQL literal não exportado.
- Cópias compartilháveis e redigidas das auditorias/continuidade existentes.
- Migrations e testes SQL versionados, módulos do front-end que leem/escrevem dados e contexto/prompt para revisão independente.
