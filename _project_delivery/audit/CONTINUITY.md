# Continuidade e Handoff

## Ordem obrigatória de leitura

1. `audit/AUDIT_CURRENT.md`
2. `audit/TECHNICAL_RULES.md`
3. `git status --short --branch`
4. `git log -10 --oneline --decorate`
5. Diff dos arquivos que serão alterados
6. Handoff em `_project_delivery/handoff/`

## Vínculo com Git

A continuidade atual parte do commit funcional `394a3e4d8dbddc11d57b67c337b31fb07bf92545`, branch `main`, publicado com sucesso no GitHub Pages. O workspace principal do staging possui 212 contatos; a importação `teste1.csv` foi registrada como 200/200 concluída. A paginação autenticada e o histórico de importações são o novo ponto de partida.

## Atualização contínua

Após qualquer alteração relevante:

- executar os comandos de verificação disponíveis;
- atualizar `AUDIT_CURRENT.md` com data, HEAD, resultados e pendências;
- conferir `git diff --stat` e `git status`;
- após push, confirmar o hash remoto antes de declarar entrega.
