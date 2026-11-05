# SDD do plugin — versão implementada

## Componentes

```text
WordPress init -> MCWP_Plugin
  Admin (nonce, manage_options) -> opções mcwp_connection / mcwp_profiles
  Elementor action ('elementor_pro/forms/actions/register') ─┐
  Native shortcode + Gutenberg block + REST request ─────────┤
     -> MCWP_Core::map/validate -> MCWP_Queue::enqueue
            -> MCWP_Queue::process -> MCWP_Core::deliver -> core-webhook-v2
            -> retry cron (5min+single events) -> purge 14d
  WP Privacy export/erase -> hash de e-mail na outbox
```

## Dados persistidos

- `wp_options`: `mcwp_connection` (site-local, `autoload=false`, token opcional), `mcwp_profiles` (mapeamentos sem submissões), `mcwp_site_uuid`, `mcwp_last_delivery`/`mcwp_last_error` (somente códigos/timestamp), `mcwp_schema`.
- `${prefix}mcwp_outbox`: ID, connection_id, submission_id, idem_key, email_hash, JSON bruto do **payload minimizado** enquanto pendente, status, tentativas, próxima tentativa, código curto, timestamps/expiração.
- `payload_json = NULL` e `email_hash = ''` após 200/201; nenhuma tabela externa do CRM é modificada por este plugin.

## Contrato de rede

- Endpoint configurado exclusivamente pelo administrador/constantes e domínio em `MARKETING_CORE_ALLOWED_HOSTS`; caminho de webhook específico e ID de 32 hex.
- `wp_safe_remote_post`, `sslverify=true`, `redirection=0`, `reject_unsafe_urls=true`, timeout 8s, limite response 2KB.
- `Content-Type`, `Authorization: Bearer`, `Idempotency-Key`. Payload JSON <=12000 bytes (validado antes de persistir e enviar).
- 200/201 apaga payload; 429 e 408/5xx fazem retry limitado; demais respostas exigem intervenção.
- Fingerprints com HMAC de configuração impedem enviar payload antigo via credencial nova em alteração fora do painel.

## Segurança e privacidade

- Administrador apenas; capacidade verificada antes de nonce, sanitização e saída escapada.
- Formulário público exige nonce de visitante, rate limit efêmero por hash de IP e honeypot. O nonce público não autentica um usuário anônimo.
- Campos nativos e Elementor são reduzidos à allowlist do perfil. Elementor descarta tipos upload, file, password, hidden, HTML, recaptcha etc.
- Consentimento não é presumido; source_url é reduzido a URL do mesmo host sem query/fragment; token não é interpolado em HTML nem JS.
- Registros temporários minimizados de submissões precisam de proteção de banco/backups. Não existe criptografia automática no WP options.

## Itens não validados e próximos passos

O código foi testado com mocks em PHP, mas WordPress/MySQL/Elementor reais e staging não foram executados. Necessários testes manuais E2E, verificação de conflitos, cron, privacidade e segurança antes de produção. Não há endpoint read-only para ping.
