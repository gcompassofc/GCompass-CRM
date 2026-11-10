-- 0132 · Assistente da equipe no número OPA Lembretes (10/11/2026)
--
-- Registro de cada mensagem que a equipe manda ao assistente e do que ele fez com ela.
-- Serve para três coisas:
--   1. não responder duas vezes a mesma mensagem (o WhatsApp entrega em dobro);
--   2. as travas de ritmo e de recusas seguidas (lib/opa/assistente/regras.ts);
--   3. a lista aberta quando ele pergunta "qual destes leads?" e a pessoa responde com o número.
--
-- Guarda a pergunta (até 300 caracteres) de gente da equipe, nunca de cliente. Some em
-- 30 dias (rotina de minuto em minuto). Só o servidor lê e escreve.
--
-- Pode rodar de novo sem estragar.

create table if not exists public.opa_assistente_mensagens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  -- Número de quem escreveu, só dígitos (pessoa da equipe).
  numero text not null,
  user_id uuid references auth.users(id) on delete set null,
  -- Id da mensagem no WhatsApp, sem o chat: é o que impede a resposta em dobro.
  mensagem_wa_id text not null,
  texto text,
  funcao text,
  -- recebida | atendida | recusada | so_texto | ritmo | silencio | erro
  resultado text not null default 'recebida',
  dados jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint opa_assistente_texto_curto check (texto is null or char_length(texto) <= 300)
);

create unique index if not exists opa_assistente_uma_vez_uq on public.opa_assistente_mensagens (organization_id, mensagem_wa_id);
create index if not exists opa_assistente_numero_idx on public.opa_assistente_mensagens (organization_id, numero, created_at desc);

alter table public.opa_assistente_mensagens enable row level security;
revoke all on public.opa_assistente_mensagens from anon, authenticated;
