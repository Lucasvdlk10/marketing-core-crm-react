# Continuidade e Handoff

## Ordem obrigatória de leitura

1. `audit/AUDIT_CURRENT.md`
2. `audit/TECHNICAL_RULES.md`
3. `git status --short --branch`
4. `git log -10 --oneline --decorate`
5. Diff dos arquivos que serão alterados
6. Handoff em `_project_delivery/handoff/`

## Vínculo com Git

A continuidade atual parte da branch `main`, com a Visão geral expandida para dashboard personalizável, filtro global de datas, escopo por equipe, drawer de indicadores, velocidade do pipeline, metas e inteligência de vendas. A migration `202610300005_personalized_sales_dashboard.sql` está aplicada no staging. Automações por lista, funções personalizadas, importação, paginação e histórico permanecem validados. Última suíte: 178/178; DB lint limpo.

Relatórios de motivos de perda receberam gráfico de barras ordenado, filtro de períodos (incluindo personalizado), detalhamento por clique e impacto financeiro baseado em `core_deals.loss_reason`. A migration `202610300006_loss_reason_reporting.sql` foi aplicada no staging.

O Relatório de Presença passou a registrar login, logout, heartbeat e trocas de status em `core_presence_events`, com métricas por status, horas de uso versus período esperado, filtro de equipes e detalhe diário por colaborador. A migration `202610300007_presence_usage_history.sql` foi aplicada no staging.

O filtro de equipe agora é aplicado no cliente usando os grupos reais retornados pelo snapshot do workspace; o front-end permanece React 18.3.1. A publicação do commit `b410909` depende de nova tentativa do GitHub Pages após erro 500 do provedor.

## Atualização contínua

Após qualquer alteração relevante:

- executar os comandos de verificação disponíveis;
- atualizar `AUDIT_CURRENT.md` com data, HEAD, resultados e pendências;
- conferir `git diff --stat` e `git status`;
- após push, confirmar o hash remoto antes de declarar entrega.
