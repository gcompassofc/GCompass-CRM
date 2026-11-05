"use server";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarImoveis, carregarLeads } from "@/lib/opa/dados";

export interface AchadoPaleta {
  tipo: "lead" | "imovel";
  id: string;
  titulo: string;
  detalhe: string;
}

function sem(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Busca universal (Ctrl K): leads e imóveis. Lê com a sessão de quem pediu: o
 * corretor só acha os leads dele, pela mesma RLS das telas.
 */
export async function buscarNaPaleta(consulta: string): Promise<AchadoPaleta[]> {
  const q = sem(consulta.trim());
  if (q.length < 2) return [];
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return [];
  const digitos = q.replace(/\D/g, "");
  const [leads, imoveis] = await Promise.all([carregarLeads(org.orgId, { funil: "todos" }), carregarImoveis(org.orgId)]);

  const achadosLeads = leads
    .filter(
      (l) =>
        sem(l.nome).includes(q) ||
        (digitos.length >= 4 && (l.telefone ?? "").replace(/\D/g, "").includes(digitos)) ||
        l.imoveisInteresse.some((c) => sem(c).includes(q)),
    )
    .slice(0, 6)
    .map((l): AchadoPaleta => ({ tipo: "lead", id: l.id, titulo: l.nome, detalhe: l.etapa.nome }));

  const achadosImoveis = imoveis
    .filter((i) => [i.codigo, i.titulo, i.bairro ?? ""].some((t) => sem(t).includes(q)))
    .slice(0, 5)
    .map((i): AchadoPaleta => ({ tipo: "imovel", id: i.codigo, titulo: `${i.codigo} · ${i.titulo}`, detalhe: i.bairro ?? "" }));

  return [...achadosLeads, ...achadosImoveis];
}
