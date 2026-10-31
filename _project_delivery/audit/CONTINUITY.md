# Continuidade e Handoff

## Ordem obrigatória de leitura

1. `audit/AUDIT_CURRENT.md`
2. `audit/TECHNICAL_RULES.md`
3. `git status --short --branch`
4. `git log -10 --oneline --decorate`
5. Diff dos arquivos que serão alterados
6. Handoff em `_project_delivery/handoff/`

## Vínculo com Git

Melhoria do Dashboard mobile: commit `10efa8170e24f78ebffd6448040e76b4f6fb5038`, publicado no workflow `41120798607`; cards em coluna fluida até 700 px e preferências desktop protegidas. A primeira correção não incluiu navegação. Após o usuário reportar sidebar inacessível, foi confirmado que o CSS a ocultava sem um botão/estado de abertura; também faltava uma forma de abrir a busca global no celular.

Correção global mobile: commit funcional `7421a2ff7cc4a47ec4136233e8b35742eb65db95`, incluído no release `aa3d579bfbc7c357d3219bf922e3cc35031ae547`, enviado para `origin/main`. Workflow GitHub Pages `41132042334` concluiu com sucesso no SHA do release; assets públicos CSS/JS HTTP 200 e hashes coincidentes com `dist/`. Drawer acessível (backdrop, X, fecha ao navegar/Escape, foco contido/restaurado e scroll lock), busca global expansível, cabeçalho sticky e safe areas; preserva rotas/permissões e estilo desktop. AppShell 16/16, suíte 43/43 arquivos/192 testes, typecheck/build/audit aprovados. Validado em 320/390/576/700 sem overflow e interação real do drawer/search no browser.

Preservar o desktop: regras novas limitadas aos breakpoints móveis; controles móveis ocultos em 1262/1920 e classe mobile não se aplica em 1920. Preview local sem preferências persistidas mostrou breakpoint `md` vazio/coluna estreita em 1262; isso não foi alterado, pois o usuário pediu conservar o PC. Se o usuário reportar essa largura, verificar com a preferência real do workspace e separar a correção.

Próximo: pedir ao usuário que recarregue o CRM mobile; se ainda não aparecer, coletar URL/viewport/cache da sessão e comparar com o asset publicado. Não declarar falha resolvida para telas internas além do shell/dashboard sem validação visual delas.


A entrega anterior do relatório de motivos foi corrigida no commit `b33bfe848bf743f3cac8927e66cc61b8d871cb3c`, enviada para `origin/main` e publicada no workflow `41108027237`. Causa: bootstrap `core_deals` omitia `loss_reason` e o relatório filtrava `created_at`. Migration `202610300008_loss_timestamp.sql` aplicada/confirmada no `L.E.I.A CRM Staging`; consulta agregada confirmou a perda real de R$ 2.000 em 30/10/2026. CI: 42 arquivos/183 testes, build e deploy aprovados. Bundle público verificado com SHA-256 `a093adb7c7f695a8ef841e717a50704484ba082ca22b85c0f61022d34f30db0c`.

A continuidade anterior registrava a Visão geral expandida para dashboard personalizável, filtro global de datas, escopo por equipe, drawer de indicadores, velocidade do pipeline, metas e inteligência de vendas. A migration `202610300005_personalized_sales_dashboard.sql` está aplicada no staging. Automações por lista, funções personalizadas, importação, paginação e histórico permanecem validados. Última suíte: 178/178; DB lint limpo.

Relatórios de motivos de perda receberam gráfico de barras ordenado, filtro de períodos (incluindo personalizado), detalhamento por clique e impacto financeiro baseado em `core_deals.loss_reason`. A migration `202610300006_loss_reason_reporting.sql` foi aplicada no staging.

O Relatório de Presença passou a registrar login, logout, heartbeat e trocas de status em `core_presence_events`, com métricas por status, horas de uso versus período esperado, filtro de equipes e detalhe diário por colaborador. A migration `202610300007_presence_usage_history.sql` foi aplicada no staging.

O filtro de equipe agora é aplicado no cliente usando os grupos reais retornados pelo snapshot do workspace; o front-end permanece React 18.3.1. A publicação do commit `b410909` depende de nova tentativa do GitHub Pages após erro 500 do provedor.

## Atualização contínua

Após qualquer alteração relevante:

- executar os comandos de verificação disponíveis;
- atualizar `AUDIT_CURRENT.md` com data, HEAD, resultados e pendências;
- conferir `git diff --stat` e `git status`;
- após push, confirmar o hash remoto antes de declarar entrega.

## Retomada atual — funil interativo

Implementação local em progresso: no card “Funil do período”, Abertas e Ganhas abrem o drawer com listas separadas de negociações e respeitam filtros atuais. Alterados `src/pages/DashboardPage.tsx`, `src/styles.css` e teste `src/test/DashboardMobileLayout.test.tsx`. Teste focal 3/3, typecheck, build e audit (0 vulnerabilidades) aprovados; suíte serial concluída com 43/43 arquivos e 193/193 testes aprovados. Commit funcional `410edcb10ccd32c6d4e05866addfbec1ee040e1f`; workflow `41149784034` concluído com sucesso no SHA exato. Assets CSS/JS públicos HTTP 200 com SHA-256 idênticos aos builds locais e marcador do drawer presente. A funcionalidade está publicada; próximo passo seguro: verificar feedback visual/funcional do usuário em Abertas e Ganhas, sem reabrir mudanças não solicitadas.

## Retomada atual — payloads multipartidos do Leads Hub (30/10/2026)

Causa rastreada no banco alvo `nsrwjtgzluadienwtnxt` (Supabase da configuração React, com os eventos recentes de `chat-captacao`; projeto `L.E.I.A CRM` separado não alterado): o RPC original gravava hash + atividade genérica, rejeitava envios sem identidade e não mesclava empresa/campanha/URL nas atualizações. Migration `supabase/migrations/20261031012321_lead_ingestion_activity_payload.sql` aplicada; histórico local/remoto alinhado. Teste SQL sintético transacional passou (3 envios, 3 atividades, merge, retry deduplicado, uma automação) e deixou zero resíduos. `core-webhook-v2` versão 5 deployed com `verify_jwt=false`. Testes focados 11/11; suíte serial 45/45 arquivos e 199/199 testes; typecheck/build aprovados; audit 0 vulnerabilidades. Commit `6b7a8b6bbf27ddec0fa32fa39c2536f926d5bb20` em `origin/main`; workflow Pages `41158295537` sucesso; página pública e assets HTTP 200 com hashes iguais a `dist/`. Para smoke test real, pedir ao usuário reenvio pelo Leads Hub; a amostra antiga não pode ser reconstruída porque o CRM guardou só hash. Nenhum lead real foi enviado durante validação.
