# Segurança, limites e classificação de validação

## Verificações locais

- Capabilities `manage_options`, nonce em todas as alterações administrativas e `permission_callback` explícito em REST.
- Token só em `wp_options` não autoload ou constante PHP; nunca é emitido em HTML, JS ou resposta REST.
- URL em allowlist obrigatória; somente HTTPS com caminho exato do webhook e ID hexadecimal 32; sem IP, localhost, `userinfo`, query, porta diferente de 443 ou redirecionamento. `wp_safe_remote_post` aplica as verificações próprias WordPress e TLS.
- Não usa API read-only da IA, chave service-role, banco do CRM, migrations ou rede remota de produção.
- Bloqueio de campos de alto risco pelo ID e destino; mapeamento explícito para `raw_fields`.
- Outbox de curta duração (até 14 dias quando cron executa), payload apagado após entrega, sem PII em logs/estado. Metadata de entrega não contém conteúdo de formulários.
- Erro 409 não cria novo `submission_id`; timeout conserva bytes JSON/header.

## Riscos conhecidos e trabalho futuro

1. WordPress/Elementor Pro/MySQL não estavam disponíveis no ambiente de construção. Falta teste real de instalação, runtime, banco e compatibilidade com versões.
2. Proteção de spam é básica (nonce de convidado, honeypot, rate limit por IP com hash). Não substitui captcha adaptativo, WAF ou controle de abuso global.
3. Hospedagens podem configurar HTTP/DNS indevidamente; validar SSRF e DNS rebinding com infraestrutura real antes do uso.
4. `wp_options` não criptografa token por padrão. Prefira `wp-config.php` com variáveis protegidas para produção.
5. Payload temporariamente armazenado na outbox contém PII mínima em claro no banco. Proteger backups/acesso ao banco. WP-Cron parado impede limpeza automática.
6. Se a conexão for desativada antes da entrega, itens pendentes podem terminar em falha permanente; revisar pendências antes de trocar credenciais.
7. Não há reconciliação ou leitura do CRM: 201/200 são aceites HTTP, não read-back de persistência na camada final.
8. No painel administrativo, os dados de origem não são exibidos. A privacidade por e-mail vale apenas para payload pendente indexado pelo hash local; contato só por telefone precisa revisão operacional.
9. Sem teste de performance, acessibilidade com leitor de tela, multisite e WordPress em produção. Limites de 200 itens e 5 tentativas são operacionais, não garantias sob concorrência extrema.
10. O mapeamento de consentimento não gera revogação; a atualização de consentimento remoto está fora do escopo.

## Camadas de comprovação

- **Feito:** PHP syntax lint, testes unitários de contrato/HTTP com mocks, inspeção estática dos arquivos distribuídos e ZIP.
- **Não feito:** WordPress/Elementor reais, suíte E2E, banco MySQL, teste anti-SSRF na rede, tráfego de staging ou produção, implantação, integração CRM com read-back.
