---
tags: [cliente/opa, tipo/revisao]
atualizado: 2026-10-31
status: vigente
---

# CRM OPA: revisão completa (31/10/2026)

Seis frentes: funcionalidades, segurança, velocidade, uso, estrutura e inteligência artificial,
mais dados comerciais. Cada ponto traz prioridade (**Alta**, **Média**, **Baixa**), o que fazer e,
quando houver, a referência atual que embasa.

Como foi feito: build de produção e medição com carga de 1.500 leads e 30 mil mensagens,
revisão de código (26 achados), revisão do fluxo da IA e pesquisa de referências de 2025 e 2026.

## Medições (modo de produção, máquina local, carga de 1.500 leads)

| Tela | Gerente | Corretora |
|---|---|---|
| Início | 0,67 s | 0,17 s |
| Fila | 0,54 s | 0,22 s |
| Leads | 0,61 s | 0,38 s |
| Funil | 0,64 s | 0,48 s |
| Imóveis | 0,76 s | 0,57 s |

- Build de produção: passou, 3 min 30 s, 43 páginas.
- Dependências: 0 críticas; 2 altas só no build (biblioteca do Sentry), 20 moderadas.

## Corrigido nesta revisão

1. Erro de hidratação (React 418) na tela de Leads do gerente: a foto vazia era um `<div>` dentro de `<p>`.
2. A IA e a ficha liam as mensagens mais antigas da conversa (200 e 80 primeiras); agora as mais recentes.
3. "Agendar mensagem" da ficha gravava a hora sem fuso (3 h deslocada com o servidor em UTC) e aceitava horário passado.
4. Áudio, foto e documento sumiam da leitura da IA; agora entram como "[áudio]", "[foto]".
5. O copiloto relia a conversa a cada mensagem; agora espera 2 minutos sem mensagem nova (menos custo).

## 1. Funcionalidades

| # | Prioridade | Ponto | O que fazer |
|---|---|---|---|
| F1 | Alta | Lembretes, avisos de prazo e repasse da roleta aparecem nas telas, mas nenhuma rotina os executa (`lembretes_agendados`, regras de `config.lembretes`, aviso aos 20 min, repasse no prazo) | Criar a rotina de lembretes e repasse; até lá, a tela diz "em breve" |
| F2 | Alta | Configurações salvas e ignoradas: horário de atendimento (o relógio conta minutos corridos), `volta_dias` (fixo em 90), pesos do cruzamento, obrigatórios da ficha de visita, prazos do Início e de Lembretes | Ler `ConfigOpa` em cada ponto |
| F3 | Alta | Números do Início distorcidos: leads novos só contam os abertos; "respondidos no prazo" ignora lead sem conversa (infla o percentual); ligação não conta como resposta | Contar por `created_at` em todos os status, lead sem conversa conta como não respondido, incluir ligação |
| F4 | Média | "Combina" muda de tela para tela (Carteira usa 60 fixo; ficha e Funil usam a configuração) | Usar `config.cruzamento.minimo` em todas |
| F5 | Média | Ficha rápida de visita pode criar o lead e falhar na visita | Validar tudo antes de criar o lead |
| F6 | Média | Exportar baixa só leads abertos, com data em UTC | Consulta própria com status e data de São Paulo |
| F7 | Média | Funil não atualiza o total depois de arrastar; "Mais N nesta etapa" abre a lista sem filtro | Sincronizar estado e filtrar por etapa |
| F8 | Média | Entrada de lead: lead aberto sem dono gera um segundo lead; erros ignorados no caminho "voltou" | Tratar sem dono e checar erros |
| F9 | Média | Lead perdido não mostra motivo nem permite reabrir | Mostrar motivo e data; "Reabrir" para gestor |
| F10 | Média | Avisos das atas ainda não implementados: negócio parado (7 dias em proposta, 14 em negociação, 30 em fechamento) e retorno não feito transferido no 3º dia | Rotina diária com alerta (modelo "rotting" do Pipedrive) |
| F11 | Baixa | "Abrir no kit" não seleciona lead de outro funil | Carregar o lead pelo id |

Referência: o lead parado por etapa segue o recurso "rotting" do Pipedrive (support.pipedrive.com/en/article/the-rotting-feature);
a tela "Hoje" por filtros vivos segue as Smart Lists do Follow Up Boss (pages.followupboss.com/smartinsidesales).

## 2. Segurança

Já feito: auditoria de 30/10 (P1 a P13), cifra fase 2, papéis, CSP, assinatura do WhatsApp. Pendente:

| # | Prioridade | Ponto | O que fazer | Referência |
|---|---|---|---|---|
| S1 | Alta | Segundo fator obrigatório também no banco | Policy RESTRICTIVE exigindo `aal2` para gestor e admin, além do proxy | supabase.com/docs/guides/auth/auth-mfa |
| S2 | Alta | CAPTCHA no login | Turnstile no formulário mandando `captchaToken`; só então ligar no Supabase | supabase.com/docs/guides/auth/auth-captcha |
| S3 | Alta | LGPD: conversas vão para a Anthropic (EUA) | Cláusulas-padrão da ANPD (Res. 19/2024) no contrato e na política de privacidade da OPA; avaliar transcrição de áudio local | lefosse.com (prazo de 23/08/2025) |
| S4 | Média | Rodar o Security Advisor (lints 0003, 0006, 0011, 0013, 0024, 0028) no banco de produção | `supabase db advisors` antes de abrir para a equipe | supabase.com/docs/guides/database/database-advisors |
| S5 | Média | Server Actions são endpoints públicos | `serverActions.allowedOrigins` com o domínio e `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` fixa | nextjs.org/docs/app/guides/data-security |
| S6 | Média | Testes de RLS no CI | pgTAP com casos negativos (corretor A não lê lead de B) | supabase.com/docs/guides/local-development/testing/overview |
| S7 | Baixa | 2 vulnerabilidades altas no build (`brace-expansion` via Sentry) | override `brace-expansion@^5.0.11` | pnpm audit |
| S8 | Baixa | CSP sem nonce (script inline liberado) | Nonce conflita com cache de componentes; decidir um caminho | nextjs.org/docs/app/guides/content-security-policy |

Prazo de incidente: registro guardado por 5 anos (página da ANPD). O prazo de 3 dias úteis vem de escritórios de advocacia,
não da página oficial: confirmar com o jurídico.

## 3. Velocidade

| # | Prioridade | Ponto | O que fazer | Referência |
|---|---|---|---|---|
| V1 | Alta | A ficha do lead chama a IA durante a abertura: com chave de IA, a tela trava alguns segundos | Mostrar a ficha na hora e ler em segundo plano (`after()` ou rotina), com selo "lendo" | nextjs.org/blog/next-16 |
| V2 | Média | Nenhuma rota da OPA tem `loading.tsx` | Esqueleto por rota: a tela responde ao toque na hora | nextjs.org (streaming) |
| V3 | Média | Configuração e imóveis buscados de novo em toda tela, inclusive no cabeçalho (`select("*")`) | Cache por org com `updateTag` ao salvar; listar colunas | nextjs.org/blog/next-16 (Cache Components) |
| V4 | Média | Afinidade lead x imóvel recalculada a cada requisição (Carteira e Funil) | Guardar por versão do acervo | |
| V5 | Média | Listas que ainda param em 1.000 linhas: Conexões, vendas, lembretes desligados, `listUsers(perPage 1000)` | `count` com `head: true`, páginas, usuários por id | supabase.com/docs/reference/javascript/range |
| V6 | Baixa | Paginação por OFFSET (`range`) fica lenta em páginas altas | Keyset quando passar de alguns milhares | supabase.com/docs/guides/graphql/api |
| V7 | Baixa | Medir no celular de verdade | `useReportWebVitals`, meta de INP até 200 ms | web.dev/optimize-inp |

## 4. Uso (corretor no dia a dia)

| # | Prioridade | Ponto | O que fazer | Referência |
|---|---|---|---|---|
| U1 | Alta | Sem busca de lead no celular (a busca do topo some abaixo de 1024 px) | Busca na própria tela Leads, em todo tamanho | |
| U2 | Alta | Aviso no celular quando chega lead (speed-to-lead) | PWA instalável com push; no iPhone, push só com o app na tela inicial | nextjs.org/docs/app/guides/progressive-web-apps; HBR 2011 (resposta em até 1 h, ~7x mais conversa qualificada) |
| U3 | Alta | Ações sem retorno: Respondi, confirmar sugestão, salvar campos, etiquetas | Estado de envio e aviso de sucesso ou erro em cada uma | |
| U4 | Média | Listas de escolha com a base inteira (Lembretes, Kit) e o Kit manda nome e telefone de todos ao navegador | Busca com sugestão no servidor | |
| U5 | Média | Alvos de toque de 36 px e cinza `#8aa3b3` com contraste de 2,6:1 | Mínimo 44 px e cinza que passe 4,5:1 | WCAG 2.2 |
| U6 | Média | No celular, o cartão do Funil é alça de arrastar e link ao mesmo tempo; menu lateral maior que a gaveta | Mover etapa por menu no celular; ajustar a gaveta | |
| U7 | Baixa | Sinal fraco em parte da ilha | Modo offline com reenvio (Serwist, `useOffline` experimental) | nextjs.org/docs/app/guides/progressive-web-apps |
| U8 | Baixa | Validar o protótipo das telas por permissão (artifact de 30/10) antes de reformar Início e menus | | |

## 5. Estrutura e operação

| # | Prioridade | Ponto | O que fazer | Referência |
|---|---|---|---|---|
| E1 | Alta | Gravações em `custom_fields` se sobrescrevem: o copiloto grava o objeto inteiro e pode apagar um "Respondi" ou uma ligação feitos no meio | RPC que mescla só a chave alterada (`jsonb_set`) | |
| E2 | Alta | Rotinas por chamada HTTP de minuto em minuto, sem orçamento de tempo (copiloto faz até 20 chamadas de IA em série) | Fila no Postgres (pgmq) + pg_cron; orçamento por rodada e paralelismo limitado | supabase.com/docs/guides/queues |
| E3 | Alta | Backup e restauração testados; arquivos do Storage não entram no backup | PITR (Cloud) ou WAL-G (self-host) e um teste de restauração | supabase.com/docs/guides/platform/backups |
| E4 | Média | Erros engolidos (`const { data }` sem `error`) em vendas, equipe, configuração, sugestões e lembretes | Checar e mostrar mensagem | |
| E5 | Média | Observabilidade | OpenTelemetry (`registerOTel`) e GlitchTip (compatível com o SDK do Sentry, leve para VPS) | nextjs.org/docs/app/guides/open-telemetry |
| E6 | Média | Duplicações: "tirar acento" em 9 arquivos, dois formulários de visita, duas "agendar mensagem", comissão 0,03 fixa | `lib/opa/texto.ts`, um componente e uma ação de visita | |
| E7 | Média | `APP_PROFILE` opcional: esquecido no deploy, abre a interface genérica | Exigir em produção (já está no `.env.producao.example`; somar à conferência) | |
| E8 | Média | Datas no fuso do servidor (início do mês no Funil, data na lista, data padrão do ganho) | Usar `diaSP` e `inicioDoDia` de `periodo.ts` | |
| E9 | Baixa | Arquivos grandes: ficha do lead com 1.178 linhas, `kit.ts` com 1.983 | Partir por aba e por módulo | |
| E10 | Baixa | Webhook de entrada repete 4 vezes qualquer erro e devolve 500 | Repetir só em conflito; 422 para roleta vazia | |

## 6. Inteligência artificial

Estado: copiloto com contexto da OPA, objeções do kit, rascunho de resposta, 18 testes de leitura. Modelo: Haiku 5.5.

| # | Prioridade | Ponto | O que fazer | Referência |
|---|---|---|---|---|
| I1 | Alta | A resposta da IA é texto que o código tenta ler como JSON; se vier fora do formato, cai nas regras | Saída estruturada garantida (`Output.object` com schema Zod no AI SDK 7, ou `strict` da Anthropic) e validar enums depois | platform.claude.com/docs/en/build-with-claude/structured-outputs |
| I2 | Alta | As instruções (cerca de 2 mil tokens com os 52 bairros) vão inteiras em toda chamada | Cache de prompt: o Haiku 5.5 guarda a partir de 512 tokens e a leitura em cache custa 0,1x | platform.claude.com/docs/en/build-with-claude/prompt-caching |
| I3 | Alta | Sem avaliação com conversas reais | Conjunto de 30 a 50 conversas reais anonimizadas com o valor certo de cada campo; medir acerto por campo; medir quanto o corretor edita o rascunho | platform.claude.com/docs/en/test-and-evaluate/develop-tests |
| I4 | Alta | Áudio não é transcrito (o cliente que manda áudio fica sem leitura) | Transcrever com Whisper local (large-v3-turbo) antes da IA; local evita outra transferência internacional | models.handy.computer/languages/pt |
| I5 | Média | Sem registro de custo e uso da IA | Gravar tokens e custo por leitura (a base já tem `llm_calls`) e um teto mensal | |
| I6 | Média | Conversa longa: a IA lê só as últimas 40 mensagens | Resumo incremental guardado no lead (resumo anterior + mensagens novas) | platform.claude.com/docs/en/build-with-claude/compaction |
| I7 | Média | Mesmo modelo para tudo | Haiku por padrão; Sonnet só quando a confiança vier baixa ou no rascunho de objeção difícil | platform.claude.com/docs/en/about-claude/pricing |
| I8 | Média | Guardrails: a saída é mostrada como texto (correto); manter sem tools que executem ação e rascunho nunca enviado sozinho | Já segue o OWASP LLM01; manter | genai.owasp.org/llmrisk/llm01-prompt-injection |
| I9 | Baixa | Releitura noturna de toda a base para atualizar temperatura | Batch API (50% mais barato) | platform.claude.com/docs/en/build-with-claude/batch-processing |

## 7. Dados e inteligência comercial

| # | Prioridade | Ponto | O que fazer | Referência |
|---|---|---|---|---|
| D1 | Média | Temperatura é uma nota só | Dois eixos: perfil (campos) e engajamento (com decaimento no tempo) | knowledge.hubspot.com/scoring/build-lead-scores |
| D2 | Média | Histórico de etapas | Tabela só de inclusão (lead, etapa, quando, quem): funil, tempo por etapa e eventos do Meta saem dela | |
| D3 | Média | Envio das conversões ao Meta | "Conversion Leads" exige Lead Ads e cerca de 200 leads por mês: provavelmente fora do volume da OPA; começar por Lead e etapas principais | developers.facebook.com/docs/marketing-api/conversions-api/conversion-leads-integration |
| D4 | Baixa | Atribuição de anúncio de WhatsApp (`ctwa_clid`) | O WAHA não é a API oficial: testar com um anúncio real antes de prometer | developers.facebook.com/docs/marketing-api/conversions-api/business-messaging |

## Ordem sugerida

1. **Antes da equipe usar:** F1, F2, F3, E1, U1, U3, V1, I1, I2.
2. **Antes de escalar:** E2, E3, S1, S2, S3, I3, I4, U2.
3. **Depois:** o resto, por prioridade.

Não confirmado na pesquisa: versão final do OWASP Top 10 2025, prazo de 3 dias no texto da ANPD, CAPTCHA e senha vazada no
Supabase self-host, `ctwa_clid` no WAHA.
