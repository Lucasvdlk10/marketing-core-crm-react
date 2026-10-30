# Histórico de alterações auditadas

## 29/10/2026 — Compatibilidade da importação com a planilha modelo

- **Problema reproduzido:** a planilha XLSX baixada pelo próprio CRM contém uma linha de título e uma linha vazia antes do cabeçalho. O importador assumia que a primeira linha era sempre o cabeçalho e, por isso, rejeitava o modelo oficial com a mensagem de que faltavam cabeçalho e dados.
- **Correção:** o importador agora remove linhas vazias iniciais, localiza automaticamente a linha real de cabeçalho pelos campos reconhecidos e mantém fallback para planilhas com cabeçalhos personalizados.
- **Arquivo funcional alterado:** `src/components/contacts/LeadImportPage.tsx`.
- **Regressão adicionada:** `src/test/LeadImportPage.test.tsx` cobre exatamente o formato gerado pelo botão `Baixar planilha de exemplo (.XLSX)`.
- **Arquivo real verificado:** `C:\Users\Lucas\Downloads\Outros\teste de importaçao\marketing_core_200_leads_ficticios_teste.xlsx`, contendo título, linha vazia, cabeçalho e 200 linhas de dados.
- **Validações:** teste focado 3/3; ContactsPage 8/8; suíte completa serial 167/167; TypeScript aprovado; build de produção aprovado; `npm audit --audit-level=moderate` com 0 vulnerabilidades.
- **Estado de entrega:** alteração validada localmente no working tree. HEAD permanece `56d3141278c8d4dd1dec7eb4a08a5d81e6845bd4`; commit/push/deploy ainda não foram declarados, pois o repositório já contém alterações locais de outras frentes que exigem preservação.

## 30/10/2026 — Planilha modelo sem linhas introdutórias

- Removidas da geração do modelo a linha `Modelo de importação de leads` e a linha vazia subsequente.
- O cabeçalho `Nome, Telefone, E-mail, Empresa, Origem, CPF, CNPJ, Status` agora começa obrigatoriamente na primeira linha da planilha.
- A opção foi aplicada somente ao modelo de importação; exportações comuns de relatórios continuam preservando título e espaçamento.
- O arquivo já baixado em `C:\Users\Lucas\Downloads\Outros\teste de importaçao\modelo-importacao-leads-marketing-core.xlsx` também foi substituído e relido: cabeçalho na primeira linha e duas linhas de exemplo.
- Regressão RED→GREEN adicionada em `src/test/ExportReport.test.ts`.
- Validações: testes focados 4/4; TypeScript e build aprovados. Suíte completa: 167/168 no disparo por timeout conhecido do `CalendarPage`; reexecução isolada do Calendar: 7/7.

## 30/10/2026 — Importação confirmada, paginação autenticada e histórico persistente

- O arquivo `C:\Users\Lucas\Downloads\Outros\teste de importaçao\teste1.csv` contém 202 linhas após o cabeçalho, sendo 200 registros válidos e duas linhas finais vazias.
- O Supabase staging foi consultado diretamente: o workspace principal possui exatamente **212 contatos**; 200 foram criados no mesmo minuto da importação, confirmando o sucesso integral.
- Causa da listagem incompleta: `ContactsPage` paginava sempre em blocos de 10, mas escondia o rodapé quando `preview=false`. O rodapé agora aparece também no CRM autenticado.
- Paginação entregue com opções de 10, 20, 30 ou 50 leads por página, total, intervalo visível e navegação até a página final.
- Criada a tabela tenant-scoped `core_lead_import_history` com RLS para `contacts.read`/`contacts.write`; migration `202610300001_lead_import_history.sql` aplicada no staging.
- O histórico aparece abaixo da planilha modelo e registra arquivo, data, formato, quantidade importada e status. O registro de `teste1.csv` foi retroativamente incluído como 200/200 concluído.
- Importações futuras registram automaticamente resultado concluído, parcial ou falho.
- Validações: testes focados 40/40; suíte completa 170/170; typecheck e build aprovados; npm audit com 0 vulnerabilidades. O lint remoto apontou apenas um erro preexistente e não relacionado em `core_automation_choose_deal_assignee`.

## 30/10/2026 — Proprietário pode criar funções personalizadas

- Causa: a tela desabilitava `Nova função` para qualquer sessão autenticada, inclusive quando a associação real era `owner`.
- O bloqueio genérico por `authenticated` foi substituído pela capacidade efetiva `roles.manage`; o proprietário recebe acesso total e pode adicionar, renomear, configurar permissões, excluir e salvar funções.
- Criada a persistência tenant-scoped `core_workspace_roles` e a RPC `core_workspace_roles_replace`, protegida por validação de proprietário, RLS e auditoria.
- A função Proprietário continua protegida e com acesso total.
- Migration `202610300002_custom_workspace_roles.sql` aplicada no staging.
- Validações: regressão RED→GREEN; testes de Configurações 6/6; suíte completa 170/170; typecheck, build e auditoria de dependências aprovados.
