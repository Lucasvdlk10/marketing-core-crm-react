# Continuidade e Handoff

## Ordem obrigatória de leitura

1. `audit/AUDIT_CURRENT.md`
2. `audit/TECHNICAL_RULES.md`
3. `git status --short --branch`
4. `git log -10 --oneline --decorate`
5. Diff dos arquivos que serão alterados
6. Handoff em `_project_delivery/handoff/`

## Vínculo com Git

A continuidade atual parte da branch `main`, publicada no GitHub Pages. O proprietário pode criar, editar, excluir e salvar funções personalizadas. A ação Criar negociação das automações aceita pessoa específica ou equipe; para equipes, a engrenagem permite excluir membros e definir distribuição percentual somando 100%. A migration ponderada está no staging e o worker foi republicado. O workspace principal permanece com 212 contatos e a importação `teste1.csv` registrada como 200/200 concluída.

## Atualização contínua

Após qualquer alteração relevante:

- executar os comandos de verificação disponíveis;
- atualizar `AUDIT_CURRENT.md` com data, HEAD, resultados e pendências;
- conferir `git diff --stat` e `git status`;
- após push, confirmar o hash remoto antes de declarar entrega.
