# PRD de release — Marketing Core WordPress Connector

**2026-11-04, release local 1.0.0**. Escopo MVP implementado a partir do handoff. Não existe API de leitura de IA nem API pública de ingestão `/v1/ingest/leads` publicada neste pacote.

## Problema

Receber contato dos formulários Elementor Pro e de um formulário próprio WordPress no workspace apropriado do Marketing Core CRM, mantendo a autenticação no servidor e evitando perda silenciosa em indisponibilidade transitória.

## Funcionalidade implementada

- Interface administrativa por site: endpoint, credencial, ativação, estado, mapeamento independente por perfil e fila agregada.
- Ação Elementor Pro opt-in e shortcode/bloco Gutenberg com formulário próprio.
- Validação de nome e e-mail ou telefone; campos permitidos por ID; prevenção de upload e dados sensíveis; consentimento explícito.
- `source=WordPress`, `form_id` prefixado, `submission_id` novo por envio, header `Idempotency-Key` estável.
- Retry com outbox persistente, atualização de status sem corpo e limpeza de dados.

## Não objetivos

- Criar negócio/tarefa ou modificar estruturas CRM.
- Consultar CRM ou operar futuras chaves de IA.
- Contact Form 7, WPForms, Gravity Forms e arquivos anexados.
- Ping de conexão por lead falso.
- Hospedar, aplicar migrations, publicar no CRM ou acessar dados reais.

## Aceite restante

- Instalação e ativação/reativação em ambiente WordPress descartável com PHP/banco reais.
- Elementor Pro real e validação da ação + mapeamentos por IDs.
- HTTP mock externo com TLS real e cenários de retry/SSRF.
- Homologação staging só com autorização; produção depende de read-back autorizado.

## Política de perda de dados

- Desativar preserva fila e configurações. Desinstalar apaga todas as filas e segredos locais.
- Outbox limita 200 payloads e expira em 14 dias quando cron ativo; filas acima desse limite são rejeitadas com retorno de indisponibilidade no nativo.
- Formulário Elementor original não é bloqueado por falha remota, por isso é essencial acompanhar a fila no painel.
