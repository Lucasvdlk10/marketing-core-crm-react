# CRM Marketing Core — Auditoria Atual

- **Data da auditoria:** 29/10/2026 — atualizada após correção da importação de leads
- **Projeto auditado:** `Versão React para testes/marketing-core-crm-react`
- **Branch:** `main`
- **HEAD funcional local:** aguardando commit/push desta frente de dashboard
- **Último commit funcional publicado:** `f7ec71bd14d927f0e8f40149320551a792514165`
- **Meta:** 100% das funções críticas verificadas por testes automatizados, typecheck, build e auditoria de dependências.

## Veredito executivo

**Estado: AMARELO — dashboard personalizável, filtros, drawer, equipes, metas e inteligência foram implementados e validados localmente; migration aplicada no staging; falta commit/push e verificação do deploy público. Automação por lista, funções personalizadas, importação, paginação e histórico permanecem validados.**

### Atualização — importação de leads

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
