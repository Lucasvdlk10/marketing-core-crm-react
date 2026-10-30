# Regras Técnicas e de Continuidade — CRM Marketing Core

1. O diretório canônico auditado é `Versão React para testes/marketing-core-crm-react`.
2. Antes de qualquer handoff/troca de provedor, ler primeiro `audit/AUDIT_CURRENT.md`, este arquivo e o `git status`.
3. Nunca considerar alteração local entregue sem commit, push e leitura de volta do hash remoto.
4. Preservar React + TypeScript + Vite e os contratos existentes do Supabase; não inventar dados empresariais fictícios.
5. Manter credenciais administrativas e de produção fora do repositório; frontend usa apenas configuração pública/anon autorizada.
6. Toda alteração de função deve incluir ou atualizar teste correspondente quando aplicável.
7. Validar no mínimo: `npm test`, `npm run typecheck`, `npm run build` e `npm audit --audit-level=moderate`.
8. Não resetar, descartar ou sobrescrever alterações de terceiros sem autorização explícita.
9. Migrations devem ser aditivas, reversíveis quando possível e revisadas quanto a tenant isolation, RLS e privilégios.
10. Atualizar `audit/AUDIT_CURRENT.md` após cada alteração relevante, commit ou push, registrando resultado real dos comandos.
11. Avisos de build devem ser registrados como pendências; não declarar 100% enquanto houver falha funcional, timeout não explicado ou validação remota ausente.
12. Separar claramente estado local, staging e produção; nunca inferir que um ambiente remoto foi atualizado a partir de um build local.
