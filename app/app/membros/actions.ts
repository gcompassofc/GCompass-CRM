"use server";

/**
 * Remover alguém da equipe (pedido do Allyson, 07/11/2026). Mesma regra da rota
 * da base (POST /api/v1/team/[user_id]/revoke): só o administrador remove,
 * ninguém remove a si mesmo e o último administrador fica. O que acontece com
 * leads, roleta e WhatsApp está em lib/opa/remover-membro.ts.
 */
import { revalidatePath } from "next/cache";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { executarRemocao, type ResultadoRemocao } from "@/lib/opa/remover-membro";
import { createAdminClient } from "@/lib/supabase/admin";

export async function removerMembro(formData: FormData): Promise<ResultadoRemocao> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org || org.role !== "admin") return { ok: false, erro: "Só o administrador remove alguém da equipe." };
  const r = await executarRemocao(createAdminClient(), {
    orgId: org.orgId,
    atorId: user.id,
    alvo: String(formData.get("userId") ?? ""),
    destino: String(formData.get("destino") ?? ""),
    desconectar: formData.get("desconectar") === "on",
  });
  if (r.ok) {
    revalidatePath("/app/membros");
    revalidatePath("/app/configuracoes");
    revalidatePath("/app/pipeline");
  }
  return r;
}
