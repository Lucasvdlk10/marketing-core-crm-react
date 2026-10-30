# Continuidade e Handoff

## Ordem obrigatória de leitura

1. `audit/AUDIT_CURRENT.md`
2. `audit/TECHNICAL_RULES.md`
3. `git status --short --branch`
4. `git log -10 --oneline --decorate`
5. Diff dos arquivos que serão alterados
6. Handoff em `_project_delivery/handoff/`

## Vínculo com Git

A continuidade atual parte da branch `main`. Automações baseadas em listas agora processam também os membros existentes no momento da ativação, de forma idempotente e direcionada à revisão correta. A automação `Teste` processou os 23 membros da lista `teste`: todos receberam a tag `Hulk`, tiveram negociação criada e foram movidos para a etapa configurada. A tela possui métricas por automação e relatório por etapa/lead. Migrations `202610300003` e `202610300004` estão no staging e o DB lint está limpo.

## Atualização contínua

Após qualquer alteração relevante:

- executar os comandos de verificação disponíveis;
- atualizar `AUDIT_CURRENT.md` com data, HEAD, resultados e pendências;
- conferir `git diff --stat` e `git status`;
- após push, confirmar o hash remoto antes de declarar entrega.
