-- 0120: (1) lead, contato e conversa só se apagam pelo administrador e (2) cada
-- número de WhatsApp tem dono (decisão do Allyson, 01/11/2026).
--
-- Parte 1, exclusão.
--
-- Antes: gerente apagava lead e contato; qualquer corretor apagava conversa (e
-- as mensagens vão junto, por cascata). Agora o corretor e o gerente não apagam
-- nada pelo PostgREST: o lead se perde com motivo e fica o histórico.
--
-- O que o corretor faz no celular dele (apagar a conversa no WhatsApp) não chega
-- aqui: o CRM não escuta evento de conversa apagada, então o lead, o número e as
-- informações continuam. Esta regra fecha a outra porta, a do banco.
--
-- Service role e rotinas do servidor (LGPD, limpeza) não passam pela RLS e seguem
-- iguais. O administrador continua apagando pela tela.

drop policy if exists crm_leads_delete on public.crm_leads;
create policy crm_leads_delete on public.crm_leads for delete to authenticated
  using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'admin'))
  );

drop policy if exists contacts_delete on public.contacts;
create policy contacts_delete on public.contacts for delete to authenticated
  using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'admin'))
  );

drop policy if exists conversations_agent_delete on public.conversations;
drop policy if exists conversations_admin_delete on public.conversations;
create policy conversations_admin_delete on public.conversations for delete to authenticated
  using (
    public.fn_is_platform_admin()
    or (organization_id in (select public.fn_user_org_ids()) and public.fn_role_at_least(organization_id, 'admin'))
  );

-- ---------------------------------------------------------------------------
-- Parte 2: o corretor liga o próprio WhatsApp
-- ---------------------------------------------------------------------------
-- Até aqui o número do corretor era achado pelo nome de exibição (frágil). Agora a
-- sessão guarda de quem é. O QR e a reconexão só abrem para o dono (ou o
-- administrador), e o índice garante um número ativo por pessoa: dois cliques ou
-- duas abas não criam duas sessões.
alter table public.channel_sessions
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists channel_sessions_um_ativo_por_dono
  on public.channel_sessions (organization_id, owner_user_id)
  where owner_user_id is not null and archived_at is null;

notify pgrst, 'reload schema';
