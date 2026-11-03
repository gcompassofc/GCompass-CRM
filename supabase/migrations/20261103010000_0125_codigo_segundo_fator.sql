-- 0125 · Segundo fator por código no e-mail ou no WhatsApp (pedido do Allyson, 03/11/2026).
--
-- O Supabase só tem o aplicativo autenticador como segundo fator. Para o código
-- por e-mail ou WhatsApp, o servidor gera 6 números, guarda aqui só o HMAC, manda
-- pelo canal escolhido e confere na tela /login/codigo. O método de cada pessoa
-- fica no app_metadata do usuário (só o service role escreve), e o proxy exige o
-- código quando ele é "email" ou "whatsapp" (lib/auth/segundo-fator.ts).
--
-- Tabela por usuário, não por empresa: é parte do login, como auth.mfa_factors.
-- Acesso: RLS ligada e NENHUMA policy. Só o service role, pelo servidor.

create table if not exists public.codigos_segundo_fator (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- "entrar": código do login. "ativar": código que prova o canal antes de ligá-lo.
  finalidade text not null,
  canal text not null,
  -- Para onde foi: o e-mail ou só os dígitos do WhatsApp. Na ativação é o canal
  -- que está sendo provado; ao confirmar, é este destino que passa a valer.
  destino text not null,
  codigo_hash text not null,
  tentativas integer not null default 0,
  expira_em timestamptz not null,
  usado_em timestamptz,
  created_at timestamptz not null default now(),
  constraint codigos_segundo_fator_finalidade_check check (finalidade in ('entrar', 'ativar')),
  constraint codigos_segundo_fator_canal_check check (canal in ('email', 'whatsapp'))
);

create index if not exists idx_codigos_segundo_fator_usuario
  on public.codigos_segundo_fator (user_id, finalidade, created_at desc);

alter table public.codigos_segundo_fator enable row level security;
revoke all on public.codigos_segundo_fator from anon, authenticated;
