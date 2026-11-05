"use server";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sinal de que os leads de quem está vendo mudaram: quantos abertos e o mais novo.
 * Só um texto, sem dado de lead. Gestor olha a organização; o resto, os próprios.
 */
export async function sinalDeLeads(): Promise<string> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return "";
  const gestor = org.role === "manager" || org.role === "admin";
  const admin = createAdminClient();
  let abertos = admin.from("crm_leads").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId).eq("status", "open");
  let maisNovo = admin.from("crm_leads").select("created_at").eq("organization_id", org.orgId);
  if (!gestor) {
    abertos = abertos.eq("owner_user_id", user.id);
    maisNovo = maisNovo.eq("owner_user_id", user.id);
  }
  const [{ count }, { data }] = await Promise.all([abertos, maisNovo.order("created_at", { ascending: false }).limit(1).maybeSingle()]);
  return `${count ?? 0}:${(data as { created_at: string } | null)?.created_at ?? ""}`;
}
