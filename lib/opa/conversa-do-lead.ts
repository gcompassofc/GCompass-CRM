/**
 * "Abrir conversa" de um lead: sempre no Multi-atendimento do CRM, nunca no
 * WhatsApp Web (pedido do Allyson, 03/11/2026).
 *
 * Acha a conversa do contato do lead; se não houver (lead do site ou do
 * formulário), abre uma no número do dono do lead (Meu WhatsApp) ou, sem ele,
 * no número da empresa, para o corretor mandar a primeira mensagem pelo CRM.
 *
 * Conversa sem dono fica com o dono do lead. Sem isto, o corretor (papel agent)
 * via o lead e não via a conversa: a regra de visão das conversas só mostra a
 * ele o que está atribuído a ele, e a conversa que entrou pelo Meu WhatsApp
 * nascia sem dono (caso do teste de 03/11: lead na tela Início, Multi-atendimento
 * vazio e "Abrir conversa" caindo no wa.me).
 *
 * Quem chama já conferiu que o usuário enxerga o lead (leitura com RLS) e passa a
 * org resolvida do servidor; aqui é o cliente admin, e toda consulta filtra a org.
 */
import { ensureConversation } from "@/lib/automation/start-conversation";
import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export interface LeadDaConversa {
  contact_id: string;
  owner_user_id: string | null;
}

export type ResultadoConversa =
  | { ok: true; conversaId: string; criada: boolean }
  | { ok: false; motivo: "sem_numero" | "sem_conversa" };

type ConversaLinha = {
  id: string;
  channel_session_id: string | null;
  assigned_to_user_id: string | null;
  assignee_kind: string | null;
};

/** Número por onde a conversa nova sai: o do dono do lead, senão o da empresa. */
async function numeroParaAbrir(admin: Admin, orgId: string, donoId: string | null): Promise<string | null> {
  if (donoId) {
    const { data } = await admin
      .from("channel_sessions")
      .select("id")
      .eq("organization_id", orgId)
      .eq("owner_user_id", donoId)
      .is("archived_at", null)
      .maybeSingle();
    if (data) return (data as { id: string }).id;
  }
  const { data: daEmpresa } = await admin
    .from("channel_sessions")
    .select("id, status")
    .eq("organization_id", orgId)
    .is("owner_user_id", null)
    .is("archived_at", null);
  const lista = (daEmpresa ?? []) as Array<{ id: string; status: string | null }>;
  const ligada = lista.find((s) => String(s.status ?? "").toUpperCase() === "WORKING");
  return (ligada ?? lista[0])?.id ?? null;
}

/** Passa a conversa sem dono para o dono do lead (só se ninguém pegou antes). */
async function entregarAoDono(admin: Admin, orgId: string, conversa: ConversaLinha, donoId: string | null): Promise<void> {
  if (!donoId || conversa.assigned_to_user_id || conversa.assignee_kind === "ai") return;
  const { error } = await admin.rpc("fn_conversation_assign", {
    p_organization_id: orgId,
    p_conversation_id: conversa.id,
    p_to_user_id: donoId,
    p_reason: "routing",
    p_expected_assignee: null as unknown as string,
    // Trava otimista: se alguém assumiu entre a leitura e aqui, não rouba.
    p_enforce_expected: true,
  });
  if (error) console.error("[opa.conversa-do-lead] atribuir ao dono falhou", error.message);
}

export async function conversaDoLead(
  admin: Admin,
  orgId: string,
  lead: LeadDaConversa,
  opts: { podeCriar: boolean },
): Promise<ResultadoConversa> {
  const { data } = await admin
    .from("conversations")
    .select("id, channel_session_id, assigned_to_user_id, assignee_kind, last_message_at")
    .eq("organization_id", orgId)
    .eq("contact_id", lead.contact_id)
    .eq("is_group", false)
    .order("last_message_at", { ascending: false, nullsFirst: false });
  const conversas = (data ?? []) as ConversaLinha[];

  if (conversas.length) {
    // Mais de uma (o contato falou com dois números): a do número do dono primeiro.
    let escolhida = conversas[0]!;
    if (lead.owner_user_id && conversas.length > 1) {
      const doDono = await numeroParaAbrir(admin, orgId, lead.owner_user_id);
      escolhida = conversas.find((c) => c.channel_session_id === doDono) ?? escolhida;
    }
    if (opts.podeCriar) await entregarAoDono(admin, orgId, escolhida, lead.owner_user_id);
    return { ok: true, conversaId: escolhida.id, criada: false };
  }

  if (!opts.podeCriar) return { ok: false, motivo: "sem_conversa" };
  const sessaoId = await numeroParaAbrir(admin, orgId, lead.owner_user_id);
  if (!sessaoId) return { ok: false, motivo: "sem_numero" };

  const conversaId = await ensureConversation(admin as never, orgId, lead.contact_id, sessaoId);
  await entregarAoDono(
    admin,
    orgId,
    { id: conversaId, channel_session_id: sessaoId, assigned_to_user_id: null, assignee_kind: null },
    lead.owner_user_id,
  );
  return { ok: true, conversaId, criada: true };
}

/**
 * Conversa que entrou pelo Meu WhatsApp do corretor nasce dele. Chamada quando o
 * contato vira lead (lib/waha/contatos-pessoais.ts). Melhor esforço: nunca lança.
 */
export async function entregarConversaAoDono(admin: Admin, orgId: string, conversaId: string, donoId: string | null): Promise<void> {
  if (!donoId) return;
  try {
    const { data } = await admin
      .from("conversations")
      .select("id, channel_session_id, assigned_to_user_id, assignee_kind")
      .eq("organization_id", orgId)
      .eq("id", conversaId)
      .maybeSingle();
    if (data) await entregarAoDono(admin, orgId, data as ConversaLinha, donoId);
  } catch (err) {
    console.error("[opa.conversa-do-lead] entregar ao dono falhou", String(err));
  }
}
