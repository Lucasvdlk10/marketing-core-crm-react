# Marketing Core CRM — React Preview

Migração isolada em React + TypeScript + Vite para testes. O CRM canônico permanece fora desta pasta e não é alterado.

## Segurança e ambiente

- Usa apenas `public/config.js`, com URL e chave pública/anon do staging.
- Não contém credenciais administrativas, credenciais de produção nem alterações no Supabase.
- Sem sessão autenticada, exibe a tela real de login; não injeta dados empresariais fictícios.
- O build estático é gerado em `dist/` com caminhos relativos, adequado ao LEIA Local Preview Hub.

## Comandos verificados

```bash
npm install
npm test
npm run typecheck
npm run build
npm audit --audit-level=moderate
```

Para desenvolvimento local:

```bash
npm run dev -- --host 127.0.0.1
```

## Estrutura

- `src/components/layout`: sidebar, header e shell.
- `src/components/common`: métricas, tabelas, modal, formulários e cabeçalhos.
- `src/components/auth`: autenticação.
- `src/pages`: componentes independentes para todas as 12 páginas.
- `src/lib/api.ts`: adaptação dos contratos REST/Auth/RPC do frontend TypeScript de referência.
- `reference-current`: fonte visual e funcional preservada somente como referência.

