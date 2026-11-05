# Evidência de validação local — 04/11/2026

## Ambiente

- PHP CLI instalado: **8.4.24**.
- Não havia WordPress, WP-CLI, MySQL/MariaDB, PHPUnit, Elementor Pro ou site acessível no ambiente de criação.
- **Nenhuma chamada HTTP ao CRM real**. O transporte HTTP é mockado por funções de teste locais.

## TDD (RED/GREEN)

- RED inicial: `php tests/test-core.php`, antes de existir `includes/class-mc-core.php`, terminou com `Failed opening required .../includes/class-mc-core.php` (fatal error de dependência ausente).
- GREEN após implementar o núcleo: `php tests/test-core.php` passou. Foi ampliado com casos adversos de SSRF, limite de bytes, redirect e troca de credenciais e permaneceu verde.

## Comandos executados no pacote final

```sh
php -d display_errors=1 -d error_reporting=-1 tests/test-core.php
php -d display_errors=1 -d error_reporting=-1 tests/test-adapters.php
php -d display_errors=1 -d error_reporting=-1 tests/test-elementor.php
php -d display_errors=1 -d error_reporting=-1 tests/test-queue.php
find . -name '*.php' -print0 | xargs -0 -n1 php -l
```

**Saída resumida observada:** 50 afirmações `PASS` no total, todos os quatro programas encerrados com sucesso; 15 arquivos PHP sem erros de sintaxe. Testes cobrem canonicalização/mapeamento, consentimento, filtragem de dados sensíveis, SSRF e redirect, formato HTTPS, corpo máximo, idempotência, HTTP 201/401/429/503, reenvio com os mesmos bytes, outbox, rotação de credencial, autorização administrativa mockada, rejeição REST e registro da ação Elementor (com classe-base simulada).

## Não executados

- Instalação/ativação/desativação/desinstalação do ZIP em WordPress real, banco MySQL, Gutenberg ou Elementor Pro real.
- Integração staging/produção, read-back de CRM, testes multi-tenant com dados reais, fixtures remotas e deploy.
- Teste de DNS rebinding e regras de firewall de um hosting real, acessibilidade com leitor de tela, navegadores e carga concorrente.

O pacote **é instalável em formato WordPress**, mas sua funcionalidade em ambiente real **requer homologação** antes do uso em produção. Não confundir aprovação dos mocks com validação real da integração.
