---
tags: [cliente/opa, tipo/auditoria, tema/seguranca]
atualizado: 2026-10-30
status: vigente
---

# Auditoria de segurança e de uso do CRM OPA (30/10/2026)

Ambiente auditado: GCompass-CRM, ramo `opa/crm-local`, Supabase e WAHA locais no Docker.
Método: ataque real contra o sistema rodando (PostgREST com a sessão de uma corretora, sem sessão,
força bruta no login, replay de server action, webhook, mídia forjada), leitura linha a linha da
camada OPA e da base, `pnpm audit` e pesquisa de CVEs e boas práticas da stack.

Contas usadas nos ataques: Luana (corretora), Marco (gerente), anônimo com a anon key pública.

## Resumo

| | Antes | Depois |
|---|---|---|
| Críticas | 4 (mídia forjada vaza a chave da WAHA, carteira apagada pela corretora, RCE no React/Next, proxy-addr) | 0 |
| Altas abertas | 14 | 6 (dependem de produção ou de decisão, lista abaixo) |
| Dependências (`pnpm audit --prod`) | 7 críticas, 25 altas | 0 críticas, 2 altas (só build) |
| Dado pessoal em texto puro no banco | tudo | colunas cifradas prontas e preenchidas (fase 1 de 3) |

## 1. Ataques feitos e resultado

| # | Ataque | Antes | Depois |
|---|---|---|---|
| 1 | Corretora altera preço e apaga os 71 imóveis pelo PostgREST | **passou** | bloqueado |
| 2 | Corretora lê nome e telefone de todos os contatos | **passou (23 de 23)** | vê só os 7 dela |
| 3 | Corretora lê o token do webhook de entrada | **passou** | token fora do alcance |
| 4 | Corretora grava `media_url` forjada e abre a mídia | **passou: chave da WAHA chegou ao atacante e o HTML rodou na origem do CRM** | bloqueado no banco e no código |
| 5 | Venda forjada (`custom_fields.venda` com comissão inventada, que iria ao Meta) | **passou** | bloqueado |
| 6 | Dois cliques simultâneos em Ganhar | duas vendas possíveis | uma venda, a outra recebe "já foi encerrado" |
| 7 | Ganhar lead de outro corretor, imóvel já vendido, venda retroativa a 2020 | sem trava de data | bloqueados |
| 8 | Corretora apaga o próprio lead | **passou** | só gestor apaga |
| 9 | Replay de server action com id de lead de outro corretor | bloqueado | bloqueado |
| 10 | Abrir a ficha de lead de outro corretor | 404 | 404 |
| 11 | Nome de lead com `<script>` e `onerror` nas telas do gerente | não executou | não executou |
| 12 | Webhook: sem token, token errado, org inexistente | 403 | 403 |
| 13 | Webhook: corpo de 20 MB | lido inteiro (DoS de memória) | 413 sem ler |
| 14 | Webhook: 10 entradas iguais ao mesmo tempo | 1 lead, mas 9 respostas 500 (n8n e Meta reenviam) | 1 lead, 10 respostas 200 |
| 15 | Cron sem segredo ou com segredo errado | 403 | 403 |
| 16 | Força bruta direto no GoTrue (`/auth/v1/token`) | **200 senhas em 0,2 s, sem bloqueio** | **pendente (P1)** |
| 17 | Errar 5 vezes a senha de um corretor de propósito | **o corretor fica sem entrar por minutos** | **pendente (P3)** |
| 18 | Enumeração de usuário pelo login e pela recuperação de senha | mesma resposta para quem existe e quem não existe | ok |
| 19 | Cadastro aberto pela anon key | aberto (com confirmação de e-mail) | **pendente (P2)** |
| 20 | Portas do Docker na rede | Redis sem senha, Studio do Supabase sem login, Postgres com senha padrão, todos em `0.0.0.0` | **pendente (P6)** |

## 2. Corrigido nesta rodada

Migrations: `0112_cifra_dados_pessoais`, `0113_opa_endurecimento`, `0114_base_endurecimento`.

- **Mídia forjada (crítica).** Mensagem recebida só nasce pelo servidor (trigger), a URL é montada sobre a origem da WAHA e só em `/api/files/`, e a resposta só sai com tipo de imagem, áudio, vídeo ou PDF, com `nosniff` e CSP `sandbox` (`lib/messaging/media/waha-source.ts`, `app/api/v1/messages/[id]/media/route.ts`).
- **Carteira de imóveis.** Escrita só gestor; equipe lê.
- **Ganhar negócio.** Virou uma função transacional no banco (`fn_opa_ganhar_negocio`): confere papel e dono, trava lead e imóvel, calcula VGV e comissão pelo preço do acervo, marca o imóvel vendido e registra o evento do Meta. Trigger impede gravar `venda` pelo PostgREST e impede rotinas de apagar uma venda já registrada.
- **Token do webhook.** Saiu de `organizations.settings` para `opa_segredos` (sem policy, só servidor).
- **Contatos** seguem a visibilidade do lead e da conversa (`fn_can_view_contact`). OPA em `visibility_mode = own`.
- **Leitor (viewer)** não escreve em visitas, sugestões, lembretes, nem pelo "Novo lead". Lembrete pessoal só para quem recebe, quem criou e gestor.
- **Novo lead do corretor** não mexe mais no lead de um colega e não revela o nome do contato alheio; dono escolhido pelo gestor precisa ser da equipe; origem em lista fechada.
- **Webhook de entrada.** Corpo até 32 KB, telefone com 10 a 13 dígitos, idempotente sob concorrência, resposta sem o dono do lead.
- **Cron** compara segredo em tempo constante.
- **Exportar CSV.** Célula que começa com `= + - @` vira texto (injeção de fórmula); exige a verificação em duas etapas quando o admin tem MFA.
- **Copiloto (IA).** Conversa entra delimitada como dado; saída validada (campo só da lista, tamanhos, confiança numérica); resumo e próximo passo sem link, e-mail, PIX ou dado bancário; "Reler" no máximo uma vez por minuto.
- **Erros do banco** não aparecem mais na tela (só regra de negócio); o detalhe fica no log.
- **Base:** `emit_event` só na org de quem chama; `retrieve_top_k_chunks` só da própria org e com k até 50; função nova não nasce executável pela anon key; exportação LGPD só para admin; lead só se apaga por gestor.
- **Seed** recusa rodar fora do Supabase local (ele apaga a org inteira).
- **Dependências.** next 16.4.3, react e react-dom 19.2.9, @sentry/nextjs 10.78, @modelcontextprotocol/sdk 1.32.2, zod 4.6.7 e overrides para sharp, proxy-addr, undici, body-parser, fast-uri, nanoid e source-map-js.

Conferido depois: `tsc` sem erro, eslint sem erro, 12 testes da cifra, as 11 telas abrindo no Next 16.4, fluxos de fila, novo lead, visita, perder e ganhar pelas telas.

## 3. Criptografia de dados pessoais

Objetivo: quem levar um dump do banco não lê nome, telefone, e-mail nem conversa.

- **Como:** AES-256-GCM no servidor Next (`lib/crypto/dados-pessoais.ts`). A chave nunca fica no banco. Cada valor gravado é `pii1.v1.<base64url>`, com IV aleatório (o mesmo nome vira textos diferentes) e preso à org e ao campo (copiar o cifrado de um lead para outro não abre).
- **Busca e duplicado por telefone e e-mail:** índice cego HMAC-SHA256 com chave própria e com a org no meio. Busca exata funciona; o índice não volta para o número.
- **Troca de chave:** a versão vai no próprio valor; `scripts/cifrar-dados-pessoais.ts` regrava o que estiver na chave antiga.
- **Chaves:** `PII_CHAVES`, `PII_CHAVE_ATUAL`, `PII_CHAVE_INDICE` (geradas só para o ambiente local). Em produção ficam no cofre de segredos do provedor, nunca no repositório nem no banco.

| Fase | O que | Estado |
|---|---|---|
| 1 | Colunas cifradas ao lado das de texto (`contacts.nome_cifrado`, `telefone_cifrado`, `email_cifrado`, `telefone_indice`, `email_indice`, `messages.corpo_cifrado`), com check que recusa texto puro | **feito**: 23 contatos e 39 mensagens cifrados e conferidos |
| 2 | O app passa a gravar e ler pelas colunas cifradas (ingestão da WAHA e do Meta, cadastro de contato, webhook de entrada, telas); busca por telefone pelo índice; busca por nome decifrando no servidor a lista que a RLS já liberou | a fazer |
| 3 | Texto puro vira NULL e um trigger recusa gravar texto puro de novo | a fazer, depois da fase 2 |

Achado junto: o CPF da base **não está cifrado de verdade**. A função `encrypt_cpf` nunca foi criada e o `cpf_hash` é SHA-256 puro, que se reverte testando todos os CPFs. Entra na fase 2 com o índice HMAC.

## 4. Pendente, em ordem de prioridade

### Situação em 30/10/2026, segunda rodada (preparo para produção)

| # | Situação | O que foi feito | Onde |
|---|---|---|---|
| P1 | Parcial | Tetos do GoTrue no `config.toml`. Local não conta (o CLI não liga `GOTRUE_RATE_LIMIT_HEADER`); no Supabase Cloud os limites por IP valem. CAPTCHA espera o app mandar o token | `supabase/config.toml`, `docs/PRODUCAO-OPA.md` §3 e §9 |
| P2 | Fechado | Cadastro fechado no GoTrue e no app (`CADASTRO_ABERTO`); convite cria a conta com senha de 12+ | `app/actions/team/criarContaPeloConvite.ts` |
| P3 | Fechado | Proxy exige aal2 de quem tem fator: tela volta para `/login/mfa`, API responde 401 | `proxy.ts` |
| P4 | Fechado | 0115: escrita de configuração só gerente+, operação corretor+, exclusão gerente+; mensagens idem | migration 0115 |
| P5 | Fechado | Bloqueio por conta + IP (5) e teto geral da conta (30) | `lib/auth/rate-limit.ts` |
| P6 | Fechado no local | Redis com senha; Redis, ponte e WAHA só em 127.0.0.1. Portas do Supabase CLI seguem em 0.0.0.0 (firewall do Windows) | `scripts/servicos-locais-fechados.sh` |
| P7 | Fechado | O WAHA gratuito assina sim: o projeto usava a variável errada (`WHATSAPP_HOOK_HMAC` no lugar de `WHATSAPP_HOOK_HMAC_KEY`). Corrigido nos composes e exigência ligada: aviso sem assinatura ou com assinatura falsa dá 401, aviso real do WAHA entra | `docker-compose*.yml`, `.env.producao.example` |
| P8 | Fechado | CSP (connect-src, img-src, frame-ancestors, base-uri, form-action) e HSTS em tempo de execução | `lib/seguranca/csp.ts` |
| P9 | Fechado | Sentry desligado por padrão; Next 16 parou de imprimir os argumentos das Server Functions (a senha do login ia para o log) | `lib/sentry/dsn.ts`, `next.config.ts` |
| P10 | Decidido | Allyson: o gerente vê integrações, token e comissão (comportamento atual mantido) | `scripts/producao/preparar-opa.ts` |
| P11 | Fechado | Roleta, configuração e motivos de perda por funções atômicas | migration 0115 |
| P12 | Aberto | Baixo risco | |
| P13 | Fechado | Gatilho: URL https dos domínios aceitos; foto como nome do arquivo do site ou URL aceita | migration 0115 |
| Convite | Fechado | `INVITE_TOKEN_SECRET` vazio no `.env` assinava convite com chave vazia (`??` virou `\|\|`) | `lib/auth/invite-token.ts` |
| Cifra | Fase 2 feita | Rotina `/api/v1/cron/cifrar-dados` a cada minuto; gatilhos devolvem para a fila o que mudou (0116) | `lib/crypto/cifrar-pendentes.ts` |

Testes: 22 de 22 conferências no app rodando (`teste-prep-producao.cjs`), 34 testes unitários, e o
banco zerado com `scripts/test-db.sh` (instalação, reaplicação e invariantes).

### Lista original

| # | Grav. | O que | Por quê | Como |
|---|---|---|---|---|
| P1 | Alta | Força bruta direto no GoTrue | 200 tentativas em 0,2 s; o limite do app não vale nesse caminho | Em produção: rate limit do GoTrue (`[auth.rate_limit]` / `GOTRUE_RATE_LIMIT_*`), CAPTCHA Turnstile nativo do GoTrue, senha mínima de 12, regra de WAF no `/auth/v1/token` |
| P2 | Alta | Cadastro aberto | Qualquer pessoa vira usuário e cria org própria, o que abre os outros ataques sem convite | Produção com `GOTRUE_DISABLE_SIGNUP=true`; equipe entra por convite |
| P3 | Alta | MFA não exigido pelo servidor | Com só a senha do admin, a sessão aal1 entra no app e na API; código de recuperação pode ser criado pela própria sessão | Exigir `aal2` no `proxy.ts` e no `requireRole` quando houver fator; recovery code só pelo servidor |
| P4 | Alta | ~50 tabelas da base com escrita sem checar papel | Corretor ou leitor reescreve agente de IA, credenciais de IA, sessões de WhatsApp, apaga mensagens pelo PostgREST | Separar leitura e escrita nas policies `tenant_isolation_*` e exigir gestor/admin na escrita de configuração |
| P5 | Média | Bloqueio por conta derruba o corretor | Errar 5 vezes a senha de alguém de propósito tranca o dono por minutos | Trocar o bloqueio duro por CAPTCHA a partir da 3ª falha |
| P6 | Média (local) | Portas do Docker abertas na rede | Redis sem senha, Studio sem login, Postgres com senha padrão em `0.0.0.0` | Publicar em `127.0.0.1:` e `requirepass` no Redis |
| P7 | Média | Webhook da WAHA aceita evento sem assinatura | Com o token da URL, injeta mensagem falsa | `WHATSAPP_HOOK_HMAC_KEY` e `WAHA_WEBHOOK_REQUIRE_SIGNATURE=true`; dashboard e swagger da WAHA desligados |
| P8 | Média | Sem CSP e sem HSTS | Qualquer XSS futuro vira roubo de sessão | CSP com nonce no `proxy.ts`, HSTS no proxy de produção |
| P9 | Média (LGPD) | Erros vão para o Sentry da comunidade do projeto original | Relatório de erro pode levar dado de lead para terceiro | `SENTRY_DSN=off` ou Sentry próprio |
| P10 | Média | Gerente vê integrações, token e comissão | A matriz de papéis diz "só admin" | **Decisão do Allyson:** gerente mexe ou não em integrações e vê ou não comissão |
| P11 | Média | Roleta e configuração regravam o `settings` inteiro | Pausa de corretor pode se perder se entrar lead no mesmo instante | Atualização atômica por `jsonb_set` numa função |
| P12 | Baixa | Demais da base | cursor sem validação em `.or()`, modo demo por substring, webhook genérico com HMAC pulado em falha, DNS de webhook de automação, `api_audit_log` aberto a insert, canal Realtime público de alertas, ffmpeg sem `protocol_whitelist`, update de conversa sem visibilidade | Um por um, baratos |
| P13 | Baixa | URL do site e fotos do imóvel aceitam qualquer domínio | Com escrita só de gestor, o risco caiu | Lista de domínios (opailhabela.com.br e R2) |

## 5. Antes de ir para produção (checklist)

1. P1, P2, P3 e P6 fechados; P8 e P9 decididos.
2. Chaves `PII_*`, `SUPABASE_SERVICE_ROLE_KEY`, `WAHA_API_KEY` e segredos de cron no cofre do provedor, diferentes das locais.
3. Fase 2 da cifra feita e conferida (`--conferir`).
4. Supabase de produção: Security Advisor sem alerta, backup cifrado e restauração testada, SSL obrigatório, sem porta de banco pública.
5. WAHA só na rede interna, com API key e HMAC.
6. Plano de incidente: comunicar a ANPD em até 3 dias úteis (Resolução CD/ANPD 15/2024).

## 6. Como repetir os ataques

Scripts usados (fora do repositório, na pasta de rascunho da sessão): ataque direto ao banco como corretora
e anônimo, força bruta e DoS de login, webhook/cron/headers/portas, navegador (replay de action, XSS,
trancar conta), mídia forjada, venda forjada e clique duplo. Vale transformar em testes de integração
no padrão do guia `04 - Base de Conhecimento/IA & Ferramentas/seguranca-de-apps-feitos-com-ia.md`.
