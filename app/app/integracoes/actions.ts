"use server";

import { revalidatePath } from "next/cache";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarConfig, salvarConfig } from "@/lib/opa/config";
import { createAdminClient } from "@/lib/supabase/admin";

export type ResultadoCruzamento = { ok: true } | { ok: false; erro: string };

/** Pesos da afinidade e o mínimo para aparecer. Só gestor ou administrador. */
export async function salvarCruzamento(formData: FormData): Promise<ResultadoCruzamento> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org || (org.role !== "manager" && org.role !== "admin")) {
    return { ok: false, erro: "Só gerente ou administrador muda o cruzamento." };
  }
  const n = (k: string) => Math.round(Number(formData.get(k) ?? 0));
  const pesos = { bairro: n("bairro"), preco: n("preco"), suites: n("suites"), atributos: n("atributos"), demanda: n("demanda") };
  const minimo = n("minimo");
  if (Object.values(pesos).some((p) => !Number.isFinite(p) || p < 0 || p > 100)) {
    return { ok: false, erro: "Cada peso vai de 0 a 100." };
  }
  const soma = Object.values(pesos).reduce((s, p) => s + p, 0);
  if (soma !== 100) return { ok: false, erro: `Os pesos somam ${soma}. Precisam somar 100.` };
  if (!Number.isFinite(minimo) || minimo < 0 || minimo > 100) return { ok: false, erro: "O mínimo vai de 0 a 100." };

  const admin = createAdminClient();
  const atual = await carregarConfig(admin, org.orgId);
  await salvarConfig(admin, org.orgId, { cruzamento: { ...atual.cruzamento, pesos, minimo } });
  revalidatePath("/app/integracoes");
  return { ok: true };
}
