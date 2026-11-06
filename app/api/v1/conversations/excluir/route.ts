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
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const schema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "conversations" });
  if (!authz.ok) return authz.response;

  const lido = schema.safeParse(await req.json().catch(() => null));
  if (!lido.success) return fail("validation_failed", "Escolha de 1 a 200 conversas.", 400, { requestId });

  const supabase = await createClient();
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
