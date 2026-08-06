# Plano — Webchat: canal de chat no site conectado ao CRM

> Status: proposto, não implementado. Escrito em 2026-08-06.
> Plano irmão: [`importacao-exportacao-contatos.md`](importacao-exportacao-contatos.md) — independente deste.
> **Recomendação: rodar `superpowers:brainstorming` antes de codar.** As decisões
> de identidade do visitante e de domínio autorizado moldam o schema e são caras
> de mudar depois.

## Objetivo

Um widget embutível no site da empresa cujas conversas caem na mesma Central de
atendimento do WhatsApp — mesma fila, mesmo atendente, mesmos agentes de IA.

## O que existe hoje

**Dois canais**, declarados em `lib/channels/types.ts:11`:
`type ChannelProvider = "waha" | "meta_cloud"`. Não há webchat.

A boa notícia: a arquitetura foi feita para um terceiro. `ChannelAdapter`
(`lib/channels/types.ts:65`) é uma interface pequena — `resolveRecipient`,
`isConfigured`, `send`, `codes`, mais dois opcionais — e a doutrina de restrição de
canal (`docs/doctrine/restricao-de-canal.md`) é cobrada por lint
(`scripts/lint-channels.ts`): **nenhum arquivo fora de `lib/channels/` pode nomear
um provider**. Isso significa que o webchat entra pelo seam, sem espalhar `if` pelo
código — desde que o plano respeite a fronteira.

O webchat é o canal *mais fácil* dos três em capacidades: sem banimento, sem janela
de 24h, sem template aprovado, sem custo por mensagem.

## A restrição estrutural que domina este plano

`channel_sessions` **não é uma tabela com uma flag — é uma tagged union com CHECK**
(baseline.sql:8414-8423):

```sql
alter table public.channel_sessions add constraint channel_sessions_provider_check
  check (provider = any (array['waha'::text, 'meta_cloud'::text]));

alter table public.channel_sessions add constraint channel_sessions_provider_ref_check check (
  (provider = 'waha'       and waha_session_name    is not null) or
  (provider = 'meta_cloud' and meta_phone_number_id is not null)
);
```

E `conversations.channel_session_id` é **`NOT NULL`** (baseline.sql:1388) — toda
conversa exige uma sessão. Logo: **sem uma linha de `channel_sessions` para o
webchat, não existe conversa de webchat.** Adicionar o canal é obrigatoriamente
uma mudança de schema nos dois CHECKs, não só código.

Além disso, `webhook_secret_encrypted` é `NOT NULL` na tabela — o plano precisa
decidir o que o webchat grava aí (é um segredo de entrada legítimo: a chave que
autentica o widget).

Há ainda um invariante que **reprova em CI** se o vocabulário divergir:
`tests/invariants/vocabulario-banco-x-typescript.test.ts` compara o CHECK do banco
com o union type do TypeScript. Os dois mudam juntos ou o CI barra — que é
exatamente o comportamento desejado.

## Fase 1 — O canal no modelo (sem UI, sem widget)

**Migration (0110 ou seguinte; último aplicado é 0109).** Tripla obrigatória:
arquivo em `supabase/migrations/` + apêndice idempotente no `baseline.sql` + linha
no `MANIFEST.md`.

- Recriar `channel_sessions_provider_check` incluindo `'webchat'`.
- Estender `channel_sessions_provider_ref_check` com o ramo webchat e sua coluna
  identificadora (ex.: `webchat_site_key`), `add column if not exists`.
- Decidir `webhook_secret_encrypted` para o ramo webchat.
- Idempotente e auto-curativa: o `update.sh` do clone re-aplica o baseline **sem**
  `ON_ERROR_STOP`. Drop-and-recreate de CHECK precisa tolerar re-execução.

**Código:**
- `ChannelProvider` ganha `"webchat"` (`lib/channels/types.ts`).
- `CHANNEL_CAPABILITIES.webchat` (`lib/channels/capabilities.ts`):
  `freeformOutsideWindow: true`, `requiresTemplates: false`, `banRisk: false`,
  `minIntervalMs: null`, `groups: "none"`, `costPerMessage: false`.
  `voiceNote` — decidir; provavelmente `"opus-only"` ou não suportar áudio na v1.
- `CHANNEL_PROVIDER_WEBCHAT` exportado, para ninguém escrever a string fora do módulo.
- `lib/channels/adapters/webchat.ts` implementando `ChannelAdapter`. `send` aqui
  **não faz HTTP para fora** — grava a mensagem e deixa o Realtime entregar ao
  browser do visitante. É a diferença estrutural em relação aos outros dois
  adapters, e merece comentário no código.

**Prova:** `pnpm test:db` verde, incluindo o invariante de vocabulário e a matriz
de capacidades.

## Fase 2 — Identidade do visitante

**A decisão mais cara do plano.** WhatsApp entrega telefone; o site entrega um
anônimo.

- ID de visitante em cookie/localStorage, escopo do domínio do cliente.
- Quando ele vira `contacts`? Recomendo: **na primeira mensagem**, com
  `source = 'webchat'` e `source_metadata` guardando página de origem e referrer.
- **Fusão:** quando o visitante informa telefone/e-mail e já existe contato,
  `contacts.is_merged_into` (que já existe) é o mecanismo. Definir se a fusão é
  automática ou sugerida ao atendente — automática com e-mail digitado errado
  funde dois clientes distintos.
- `phone_number` fica nulo por um tempo: **conferir se algum caminho do CRM assume
  telefone presente** (`resolveRecipient` de outros canais, follow-up, campanha).
  Este é o risco de regressão mais provável de toda a feature.

## Fase 3 — Transporte

WAHA e Meta **empurram** por webhook; o widget precisa do inverso.

- `POST /api/v1/webchat/[siteKey]/messages` — **público**, autenticado por site key
  do path (nunca do body: doutrina de tenancy manda resolver `organization_id` de
  fonte confiável — aqui é o path token, como já faz
  `app/api/v1/webhooks/waha/[token]/route.ts`).
- Rate limit **agressivo** por IP e por site key (Upstash). Endpoint público que
  cria contato é vetor de spam direto na base.
- CORS restrito aos domínios autorizados da org — guardar a allowlist junto da
  sessão de canal.
- Entrega ao visitante por Supabase Realtime, com filtro que **não vaze outras
  conversas** — o visitante não é usuário autenticado, então a RLS normal não o
  protege. Provavelmente exige canal de broadcast por conversa com token próprio.
- Zod em todo input; `X-Request-Id` na resposta.

**Este é o ponto de maior risco de segurança da feature.** Vale passar por
`docs/threat-model.md` antes de escrever o handler.

## Fase 4 — O widget

Script embutível (`<script src=".../widget.js">`) — artefato distribuível, fora do
app Next.js normal: build próprio, sem React do app, pequeno, sem vazar CSS para o
site hospedeiro (Shadow DOM).

Tela de configuração no CRM: gerar site key, listar domínios autorizados,
customizar cor/saudação. **Porta obrigatória** em `lib/navigation/registry.ts`
(`tests/unit/navegacao-completude.test.ts` reprova tela alcançável só por URL).

## Fase 5 — Integração com o resto do CRM

Verificar que o webchat herda, sem código novo: roteamento/atribuição, agentes de
IA e RAG, follow-up, automações, Central de atendimento. **Onde não herdar, é
porque alguém assumiu WhatsApp** — e o conserto certo é remover a suposição, não
adicionar um `if` de provider (o lint reprova, e com razão).

## Verificação

- `pnpm typecheck`, `pnpm lint` (inclui `lint-channels`), `pnpm test:unit`
- `pnpm test:db` — obrigatório: schema, RLS, vocabulário
- QA visual **P0** (doutrina — primeira impressão): num banco fresco do
  `baseline.sql`, subir uma página HTML de teste com o widget, mandar mensagem como
  visitante anônimo e provar que ela aparece na Central e que a resposta do
  atendente chega de volta. Evidência em `.superpowers/evidence/`.
- Atualizar `docs/testing/user-journey-map.md` e o mapa em `docs/architecture/`
  (Living System Checklist: peça nova com ≥2 arestas).

## Riscos

- **`conversations.channel_session_id NOT NULL` + tagged union**: a Fase 1 é
  pré-requisito duro. Não dá para prototipar o widget antes.
- **Contato sem telefone** quebra suposições espalhadas. Mapear antes.
- **Endpoint público que cria contato** é a maior superfície de ataque nova do
  self-host desde o webhook do WAHA.
- **Realtime para não-autenticado**: se mal isolado, vaza conversa de outro
  visitante — ou de outro tenant.
