# Continuidade e Handoff

## Ordem obrigatória de leitura

1. `audit/AUDIT_CURRENT.md`
2. `audit/TECHNICAL_RULES.md`
3. `git status --short --branch`
4. `git log -10 --oneline --decorate`
5. Diff dos arquivos que serão alterados
6. Handoff em `_project_delivery/handoff/`

## Vínculo com Git

A auditoria atual foi gerada a partir do HEAD `56d3141278c8d4dd1dec7eb4a08a5d81e6845bd4`, branch `main`, com working tree local não limpa. O próximo commit que alterar o projeto deve incluir a atualização destes arquivos de auditoria e registrar no commit a relação com o estado auditado.

## Atualização contínua

Após qualquer alteração relevante:

- executar os comandos de verificação disponíveis;
- atualizar `AUDIT_CURRENT.md` com data, HEAD, resultados e pendências;
- conferir `git diff --stat` e `git status`;
- após push, confirmar o hash remoto antes de declarar entrega.
