# Continuidade e Handoff

## Ordem obrigatória de leitura

1. `audit/AUDIT_CURRENT.md`
2. `audit/TECHNICAL_RULES.md`
3. `git status --short --branch`
4. `git log -10 --oneline --decorate`
5. Diff dos arquivos que serão alterados
6. Handoff em `_project_delivery/handoff/`

## Vínculo com Git

A continuidade atual parte do commit funcional `88ae95fdacda547ed5f3310db387a89d6c7eec1a`, branch `main`, publicado com sucesso no GitHub Pages. O proprietário pode criar, editar, excluir e salvar funções personalizadas; as definições são persistidas em `core_workspace_roles`. O workspace principal permanece com 212 contatos e a importação `teste1.csv` registrada como 200/200 concluída.

## Atualização contínua

Após qualquer alteração relevante:

- executar os comandos de verificação disponíveis;
- atualizar `AUDIT_CURRENT.md` com data, HEAD, resultados e pendências;
- conferir `git diff --stat` e `git status`;
- após push, confirmar o hash remoto antes de declarar entrega.
