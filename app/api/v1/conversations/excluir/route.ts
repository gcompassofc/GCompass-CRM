/**
 * POST /api/v1/conversations/excluir — apaga conversas do CRM. Só o administrador.
 *
 * Apaga daqui, não do WhatsApp: o aparelho do corretor não muda. As mensagens e notas
 * vão junto, por cascata; contato e lead ficam. Se a pessoa escrever de novo, nasce uma
 * conversa nova. A RLS da 0120 repete a regra de papel.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

/**
 * Deixa no histórico de cada lead que a conversa dele foi apagada, por quem e com
 * quantas mensagens. Melhor esforço: a exclusão já aconteceu e não volta atrás.
 */
async function registrarNoHistorico(
  orgId: string,
  quem: { id: string; user_metadata?: Record<string, unknown> | null; email?: string | null },
  conversas: Array<{ id: string; contact_id: string | null }>,
  mensagensDe: Map<string, number>,
): Promise<void> {
  try {
    const contatos = [...new Set(conversas.map((c) => c.contact_id).filter((c): c is string => Boolean(c)))];
    if (!contatos.length) return;
    const admin = createAdminClient();
    const { data: leads } = await admin.from("crm_leads").select("id, contact_id").eq("organization_id", orgId).in("contact_id", contatos);
    const por = String(quem.user_metadata?.full_name ?? "").trim().split(/\s+/)[0] || "um administrador";
    const linhas = ((leads ?? []) as Array<{ id: string; contact_id: string }>).map((l) => ({
      organization_id: orgId,
      lead_id: l.id,
      contact_id: l.contact_id,
      source_module: "opa",
      type: "conversa_apagada",
      payload: { por, mensagens: conversas.filter((c) => c.contact_id === l.contact_id).reduce((n, c) => n + (mensagensDe.get(c.id) ?? 0), 0) },
      performed_by_user_id: quem.id,
      actor_kind: "user",
      reason: "Conversa apagada do CRM pelo administrador. No celular do corretor nada muda.",
    }));
    if (linhas.length) await admin.from("crm_lead_activities").insert(linhas);
  } catch (err) {
    console.error("[conversations/excluir] histórico", err instanceof Error ? err.message : String(err));
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;

  const lido = schema.safeParse(await req.json().catch(() => null));
  if (!lido.success) return fail("validation_failed", "Escolha de 1 a 200 conversas.", 400, { requestId });

  const supabase = await createClient();
  // De quem são as conversas e quantas mensagens têm: depois de apagar não dá mais para saber,
  // e a ficha do lead ficava com a conversa vazia sem explicação (caso da Neide, 10/11/2026).
  const { data: antes } = await supabase
    .from("conversations")
    .select("id, contact_id")
    .eq("organization_id", authz.org.orgId)
    .in("id", lido.data.ids);
  const alvo = (antes ?? []) as Array<{ id: string; contact_id: string | null }>;
  const mensagensDe = new Map<string, number>();
  for (const c of alvo) {
    const { count } = await supabase.from("messages").select("id", { count: "exact", head: true }).eq("conversation_id", c.id);
    mensagensDe.set(c.id, count ?? 0);
  }

  const { data, error } = await supabase
    .from("conversations")
    .delete()
    .eq("organization_id", authz.org.orgId)
    .in("id", lido.data.ids)
    .select("id");
  if (error) {
    console.error("[conversations/excluir]", error.code, error.message);
    return fail("internal_error", "Não deu para excluir agora.", 500, { requestId });
  }

  const apagadas = (data ?? []).length;
  await registrarNoHistorico(
    authz.org.orgId,
    authz.user,
    alvo.filter((c) => ((data ?? []) as Array<{ id: string }>).some((d) => d.id === c.id)),
    mensagensDe,
  );
  await audit({
    action: "conversation.deleted",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "conversation",
    resourceId: null,
    requestId,
    metadata: { ids: lido.data.ids, apagadas },
  });
  return ok({ apagadas }, { requestId });
}
