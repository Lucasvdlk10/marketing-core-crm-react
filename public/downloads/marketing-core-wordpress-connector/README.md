# Marketing Core CRM — WordPress Connector

**Versão:** 1.0.0 (MVP local para homologação)  
**Status:** ZIP instalável construído; o webhook real do CRM não foi contatado. Testes de PHP/contrato com mocks **não** são um teste de aceitação em WordPress/Elementor reais.

## O que faz

- Formulários nativos via bloco **Marketing Core — formulário** ou shortcode `[marketing_core_form id="contato_site"]`.
- Ação oficial **Marketing Core CRM** para Elementor **Pro Forms**, selecionável em *Actions After Submit*; não há hook global concorrente nem envio duplicado por duas rotas.
- Perfis por formulário com mapeamento por **ID**, opt-in explícito, `source: WordPress`, `form_id`, `submission_id`, URL sem query/fragmento e UTMs permitidas.
- POST HTTPS com Bearer só no servidor, 12.000 bytes máximo, `Idempotency-Key` e outbox persistida antes do primeiro envio; 200/201 aceitos; 429/5xx/timeouts com retentativas limitadas.
- Painel **Marketing Core** em WordPress › Administração, sem exibir token após salvar.

## Requisitos e compatibilidade

- Requisitos declarados de instalação: WordPress **6.5+**, PHP **8.0+**, HTTPS e banco suportado pelo WordPress.
- Para integração Elementor, **Elementor Pro com módulo Forms** e sua dependência Elementor ativa. Sem Elementor Pro, o plugin continua oferecendo formulário nativo.
- Traduções: domínio gettext carregado; a interface desta versão é predominantemente em português, com suporte internacional ainda parcial.
- **Compatibilidade efetivamente verificada aqui:** PHP 8.4.24 por lint e testes unitários com funções WordPress mockadas. Ainda **não** houve instalação/ativação em WordPress descartável, teste de navegador, teste com Elementor Pro ou banco MySQL, e não se anuncia matriz WP/Elementor testada.
- A convenção da ação oficial `elementor_pro/forms/actions/register` e `Action_Base` foi conferida na documentação do Elementor: https://developers.elementor.com/docs/form-actions/add-new-action e https://developers.elementor.com/docs/form-actions/action-run.
- Métodos oficiais WordPress: https://developer.wordpress.org/reference/functions/register_rest_route/ e https://developer.wordpress.org/reference/functions/register_block_type/.

## Instalar

1. WordPress › Plugins › Adicionar plugin › Enviar plugin › selecione **marketing-core-wordpress-connector.zip**, instale e ative. O ZIP tem uma única pasta raiz.
2. No CRM, crie **uma integração Webhook separada para este site**, copie a URL individual terminada em `/functions/v1/core-webhook-v2/<public_id>` e o **Bearer token de ingestão**. Não use credencial de IA ou `service_role`.
3. Copie somente o *hostname exato* da URL fornecida pelo CRM e defina em `wp-config.php`, **antes de ativar a conexão**:

   ```php
   define('MARKETING_CORE_ALLOWED_HOSTS', 'HOST_EXATO_DO_CRM');
   ```

   Sem essa allowlist configurada, qualquer tentativa de envio será bloqueada. Não use `localhost`, IP, esquema HTTP, domínio-curinga ou qualquer host genérico.
4. WordPress › **Marketing Core**: informe a URL completa e token, marque **Ativar entrega** e salve. O plugin verifica **somente o formato local**; não há ping read-only publicado. A conexão permanece “configurada/não verificada” até uma entrega real de formulário autorizada.
5. Crie um perfil com nome, provedor, **chave estável** (`contato_site`), e mapeie ID de origem de cada campo para nome e ao menos e-mail ou telefone. A ação do Elementor depende da chave do perfil, não do label do formulário.
6. Para **nativo**: insira o bloco “Marketing Core — formulário” e informe `contato_site` nas configurações laterais, ou use `[marketing_core_form id="contato_site"]`. No mapeamento padrão, os IDs são `name`, `email`, `phone`, `company`, `campaign`, `consent`. Para usar a caixa “Mensagem”, permita `message:message` como campo adicional no perfil.
7. Para **Elementor Pro**: adicione a ação **Marketing Core CRM** em **Actions After Submit**, informe `contato_site` em **Chave do perfil** e use os IDs efetivos de cada campo no mapeamento; o provedor do perfil precisa ser **Elementor Pro**.
8. Configure um cron confiável no servidor para acionar `wp-cron.php` periodicamente. O plugin agenda verificações a cada cinco minutos e eventos de retry, mas o WP-Cron pode atrasar em sites com pouco tráfego.

### Configuração opcional sem token no banco

É possível passar a URL e o token por constantes de ambiente em `wp-config.php` (exemplo ilustrativo, sem credenciais reais):

```php
define('MARKETING_CORE_WEBHOOK_URL', getenv('MCWP_WEBHOOK_URL') ?: '');
define('MARKETING_CORE_WEBHOOK_TOKEN', getenv('MCWP_WEBHOOK_TOKEN') ?: '');
```

As constantes substituem os campos correspondentes no painel. Salve a conexão no painel após alteração da configuração para girar a identidade local. Uma alteração posterior sem salvar é detectada por fingerprint e **bloqueia** o envio. A configuração não criptografa automaticamente os valores armazenados em `wp_options`: quem tem acesso ao banco pode ler credenciais guardadas lá. `autoload=false` minimiza carregamento, **não** significa criptografia.

## Dados, fila, erros e limites

O payload canônico segue o webhook existente `core-webhook-v2`. A fachada `/v1/ingest/leads` e a API de leitura da IA **não estão implementadas** e não são utilizadas aqui. O CRM pode criar/atualizar contato, registrar evento/atividade e acionar automações; o plugin não cria negócio diretamente.

- 200/201 → entregue; apaga JSON da fila. 429 → respeita `Retry-After`/`retry_after_seconds`; 500/502/503/504 e erro de rede → até **5 tentativas** com backoff e jitter. 400/401/405/409/413/422/redirecionamento → falha permanente, sem repetir automaticamente. **401 também desativa a conexão** até revisão do administrador.
- Payload e header são persistidos e **não mudam durante retries**. Envios novos ganham UUID novo. Credenciais rotacionadas geram `connection_id` novo; itens antigos **não** são reencaminhados com nova credencial.
- A fila tem teto operacional de aproximadamente **200 registros com payload** por site, retém falhas no máximo **14 dias** se WP-Cron está executando, e mantém apenas metadados de sucesso até expirar.
- A interface de status mostra apenas contadores, códigos, data de aceite, nunca o corpo ou token. Dados de falhas são retidos temporariamente para reenvio e diagnóstico, e podem ser excluídos no painel. Falhas permanentes podem ser reenviadas manualmente no painel somente com a mesma conexão e o mesmo payload/header original.
- A API REST pública `POST /wp-json/mcwp/v1/submit` exige nonce de formulário de visitante (não autenticação), honeypot, atraso mínimo e limite efêmero por IP com hash. Para sites sob ataque, adote proteção anti-spam/WAF adicional.
- `source_url` é reduzido a esquema+host+caminho do **mesmo site**; query/fragmento são descartados. UTMs capturadas separadamente: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`.
- O plugin não envia `workspace_id`, cookies, IP, User-Agent, arquivos, anexos, senhas, campos de pagamento, documentos pessoais ou campos não permitidos. O `consent=false` significa “não registrado opt-in neste envio”, não revoga consentimento no CRM.

## Privacidade, reversão e desinstalação

- Atualize a política de privacidade do site e a base legal para enviar dados à Marketing Core CRM; informe o período de retenção local e o tratamento remoto pelo CRM.
- Exportador/apagador WordPress de dados pessoais por e-mail cobre a **fila local ainda com payload e e-mail informado**; um registro captado somente com telefone não pode ser localizado por pesquisa de e-mail. Dados já entregues ao CRM exigem atendimento de privacidade **no CRM**, independentemente da exclusão no WordPress.
- **Desativar** apenas pausa a integração/cron e mantém configurações/fila; antes de reativar confira a conexão e as pendências. **Desinstalar** é destrutivo: remove credenciais, perfis e **todos os envios locais pendentes**, inclusive os não entregues. Faça exportação ou resolva pendências antes da remoção.
- Multisite: os dados usam `get_option`/tabela prefixada de **cada site**, nunca uma credencial compartilhada da rede. O desinstalador percorre os sites para limpar os dados. Multisite precisa de homologação antes de uso em rede.

## Homologação segura antes de produção

1. Use WordPress e Elementor Pro descartáveis compatíveis, com banco/HTTPS e plugins reais. Teste ativação, desativação, bloco, shortcode, ação Elementor e painel como admin/não admin.
2. Aponte somente para um **servidor HTTP mock** que imite o webhook, com domínio HTTPS permitido; valide 201/200, 429, 503, timeout, erro permanente, 12 KB, idempotência (mesmo header e mesmos bytes) e sanitização.
3. Faça auditoria independente de SSRF/DNS/rebinding/redirects, CSP, spam, cron, capacidade da fila e privacidade em multisite. `wp_safe_remote_post` e `reject_unsafe_urls` são defesas adicionais, não garantia universal para rede/hospedagem arbitrária.
4. Obtenha autorização para staging e use fixture sintética aprovada, sem usar CRM/produção e sem criar leads fictícios para “testar conexão”. Confirme aceite real com **read-back autorizado** da ingestão no CRM.
5. Só então libere produção e monitore o estado de entrega. O pacote atual **não** declara integração real validada.

## Testes locais

Execute `php tests/test-core.php`, `php tests/test-adapters.php`, `php tests/test-elementor.php` e `find . -name '*.php' -print0 | xargs -0 -n1 php -l` na pasta do plugin. Veja `docs/TESTS.md` para evidência e limites da validação.

## Arquivos de origem e licença

Implementação independente baseada no handoff técnico de 04/11/2026; código-fonte do CRM não é incluído e não foi modificado. Licença GPL-2.0-or-later.
