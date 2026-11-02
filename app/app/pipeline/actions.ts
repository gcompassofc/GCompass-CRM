"use server";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { escopoDoFunil, montarListaDoEnvio, TETO_ENVIO, type ItemEnvio, type LinhaEnvio } from "@/lib/opa/envio-etapa";
import { createClient } from "@/lib/supabase/server";

/**
 * Leads de uma etapa para o "Mandar para todos" (lib/opa/envio-etapa.ts).
 *
 * Lê com o client do usuário: a regra do banco (RLS) decide o que ele enxerga,
 * e por cima o corretor fica só com os leads dele (escopoDoFunil). Busca a
 * etapa inteira, não só os 25 do quadro, até o teto. Não envia nada: devolve a
 * lista para o corretor abrir um por um no WhatsApp dele.
 */

export type ResultadoEnvio =
  | { ok: true; itens: ItemEnvio[]; total: number; teto: number }
  | { ok: false; erro: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function leadsDaEtapaParaEnvio(etapaId: string, corretor?: string | null): Promise<ResultadoEnvio> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sem organização ativa." };
  if (org.role === "viewer") return { ok: false, erro: "Seu acesso é só de leitura." };
  if (!UUID.test(etapaId)) return { ok: false, erro: "Etapa não encontrada." };
  const filtro = corretor && UUID.test(corretor) ? corretor : null;
  const dono = escopoDoFunil({ role: org.role, plataforma: user.is_platform_admin, userId: user.id, corretor: filtro });

  const supabase = await createClient();
  let consulta = supabase
    .from("crm_leads")
    .select("id, title, owner_user_id, tags, contacts(name, phone_number)", { count: "exact" })
    .eq("organization_id", org.orgId)
    .eq("stage_id", etapaId)
    .eq("status", "open");
  if (dono) consulta = consulta.eq("owner_user_id", dono);
  const { data, count, error } = await consulta
    .order("created_at", { ascending: false })
    .order("id")
    .range(0, TETO_ENVIO - 1);
  if (error) return { ok: false, erro: "Não consegui buscar os leads da etapa. Tente de novo." };

  const itens = montarListaDoEnvio((data ?? []) as unknown as LinhaEnvio[], dono);
  return { ok: true, itens, total: Math.max(count ?? 0, itens.length), teto: TETO_ENVIO };
}
