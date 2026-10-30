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

Correção global mobile local: commit funcional `7421a2ff7cc4a47ec4136233e8b35742eb65db95`. Adiciona toggle + drawer acessível (backdrop, X, fechar ao navegar/Escape, foco contido/restaurado e scroll lock), expansão de busca no mobile, cabeçalho sticky e safe areas; mantém sidebar desktop e permissões existentes. Validação local: 16/16 testes AppShell, suíte 43 arquivos/192 testes, typecheck/build/audit aprovados; viewport 320/390/576/700 sem overflow; navegação/search exercitadas no browser. Aguardando push, CI/deploy e verificação pública do bundle; só então considerar resolvido.

Preservar o desktop: as regras novas se limitam a media queries móveis. No preview sem preferências de workspace, 1262 px selecionou o breakpoint `md` vazio da grade e empilhou cartões estreitos; em 1920 px o grid voltou ao modo desktop. Este preview não substitui a validação do layout salvo real, que permanece pendente após deploy.


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
