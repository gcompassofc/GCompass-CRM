"use server";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { tokenDeEntrada } from "@/lib/opa/segredos";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Token da porta de entrada de leads. Sai do servidor só no clique de copiar,
 * só para gestor ou administrador; a página mostra apenas o final.
 */
export async function pegarTokenEntrada(): Promise<string | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org || (org.role !== "manager" && org.role !== "admin")) return null;
  return tokenDeEntrada(createAdminClient(), org.orgId);
}
