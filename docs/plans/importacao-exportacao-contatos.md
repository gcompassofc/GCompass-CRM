# Plano — Importação e exportação de contatos em massa

> Status: proposto, não implementado. Escrito em 2026-08-06.
> Plano irmão: [`webchat-canal-site.md`](webchat-canal-site.md) — independente deste.

## Objetivo

Permitir que o operador do CRM (a) baixe sua base de contatos em CSV e (b) suba
uma planilha de contatos, com deduplicação e origem declarada.

## O que existe hoje

`app/api/v1/contacts/` tem cinco rotas — `route.ts` (list/create), `[id]/route.ts`,
`[id]/avatar`, `[id]/timeline`, `[id]/crm-summary`. **Nenhuma de import ou export.**
A listagem já resolve busca, filtro por tag/source e paginação por cursor
(`listContactsHandler` em `app/api/v1/contacts/_handler.ts`), e é a base natural do
export.

Colunas relevantes de `contacts` (baseline.sql:1343):

| Coluna | Nota para este plano |
|---|---|
| `email_normalized` | **GENERATED** `lower(trim(email))` — chave de dedup pronta, não escrever |
| `phone_number` | text livre; normalização é responsabilidade de quem escreve |
| `consent` | `jsonb NOT NULL`, com `marketing`/`transactional`/`profiling` |
| `source`, `source_metadata` | `NOT NULL`, default `'manual'` / `{}` — onde a origem da importação é registrada |
| `tags` | `text[] NOT NULL default '{}'` |
| `cpf_encrypted` (bytea), `cpf_hash` | **nunca sai no export** |
| `is_anonymized`, `is_merged_into` | linhas a excluir do export |

## Decisões a tomar antes de codar

Estas quatro moldam o schema e são caras de mudar depois. Levar ao usuário.

1. **Chave de deduplicação.** Telefone normalizado E.164 é a recomendação (canal
   primário é WhatsApp), com e-mail como chave secundária. Alternativa: só e-mail,
   via `email_normalized` que já existe indexado.
2. **Colisão = update, skip ou erro?** Recomendo *skip com relatório*: importação
   que sobrescreve silenciosamente destrói dado que o atendente editou à mão.
3. **Consentimento.** A tela de importação deve **exigir** que o usuário declare
   origem e base legal, gravadas em `source_metadata`. Importar milhares de
   contatos sem isso é passivo de LGPD.
4. **Teto do síncrono.** Acima de quantas linhas vai para worker? Sugestão: 500.

## Fase 1 — Export (entrega valor sozinho, fazer primeiro)

**Rota:** `GET /api/v1/contacts/export` → `text/csv`.

- Reusar os filtros de `contactListQuerySchema` (search/tag/source) — quem exporta
  quer exportar *o que está vendo*.
- RBAC: `requireRole("agent")` como o POST de contacts. Considerar exigir `manager`
  para export — é exfiltração da base inteira num clique.
- **Excluir** `is_anonymized = true` e `is_merged_into is not null`.
- **Nunca** incluir `cpf_encrypted` / `cpf_hash`. Colunas do CSV: nome, display_name,
  email, telefone, tags, source, created_at, last_activity_at.
- Streaming por página de cursor, não `select *` em memória — base de 50k linhas
  derruba o container.
- **Audit log obrigatório**: export de base é evento sensível. Ação sugerida
  `contacts.exported`, com contagem de linhas no payload.
- Rate limit: baixo (ex. 5/hora/org). É a rota mais atraente para abuso.

**Testes:** unit do serializador CSV (escape de vírgula/aspas/quebra de linha em
nome de contato — quebra real), e um teste provando que contato anonimizado e CPF
não aparecem na saída.

**Sem migration.** Fase 1 não toca schema.

## Fase 2 — Import

**Rotas:**
- `POST /api/v1/contacts/import/preview` — recebe o arquivo, devolve diagnóstico
  (linhas válidas, inválidas, duplicadas na planilha, já existentes na base) **sem
  gravar nada**. Ninguém sobe 3 mil contatos às cegas.
- `POST /api/v1/contacts/import` — executa. Aceita `Idempotency-Key` (doutrina de
  API), obrigatório aqui: duplo clique não pode duplicar a base.

**Fluxo acima do teto:** grava `event_log` (`event_type: 'contacts.import_requested'`,
respeitando o CHECK `^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$`) e um worker consome. O
precedente de worker com progresso e retry é `workers/lgpd-export-worker.ts`
(attempts, cap de 3, não lança para fora do handler).

**Normalização de telefone:** aplicar na entrada, apoiada em
`lib/channels/phone-variants.ts`. Planilha brasileira traz dez formatos e o nono
dígito; sem normalizar, o contato importado nunca casa com a conversa que chega.

**Migration (0110)** — necessária para rastrear lotes:
- Tabela `contact_imports` (id, organization_id, status, contagens, arquivo,
  `created_by_user_id`, timestamps) com `organization_id NOT NULL references
  organizations(id) on delete cascade` e RLS `tenant_isolation_contact_imports_all`
  via `fn_user_org_ids()`.
- Sem isso não há como mostrar "importação de ontem: 1.200 ok, 30 falhas".
- **Tripla obrigatória**: arquivo em `supabase/migrations/` + apêndice idempotente
  no `supabase/baseline.sql` + linha no `MANIFEST.md`. Próximo número é **0110**
  (último aplicado: 0109).

**Audit:** `contacts.imported` com contagens.

## Fase 3 — UI

Tela em `app/app/contacts/` com dois botões. O import precisa de: upload, tela de
preview com o diagnóstico da Fase 2, mapeamento de coluna→campo (planilha real
nunca vem com os cabeçalhos que esperamos), e declaração de origem/consentimento.

**Porta obrigatória:** se virar tela própria, declarar em
`lib/navigation/registry.ts` — o CI reprova tela alcançável só por URL
(`tests/unit/navegacao-completude.test.ts`).

## Verificação

- `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`
- `pnpm test:db` — **obrigatório**, a Fase 2 mexe em schema e RLS
- QA visual (doutrina): provar pela tela, em banco fresco do `baseline.sql`,
  importando uma planilha de verdade com telefone sujo e linha duplicada.
  Evidência em `.superpowers/evidence/`.
- Atualizar `docs/testing/user-journey-map.md`.

## Riscos

- **Export é exfiltração num clique.** RBAC, rate limit e audit não são opcionais.
- **Import sem dedup duplica a base** na segunda tentativa — é o defeito mais
  provável e o mais caro de desfazer.
- **CSV com CPF na planilha de entrada**: decidir se aceita. Se aceitar, tem que
  encriptar (`cpf_encrypted`/`cpf_hash` andam juntos, há CHECK de consistência).
