/**
 * GET /app/leads/exportar · CSV da base de leads. Só o administrador exporta
 * (decisão 6 do protótipo: exportar só o administrador).
 */
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarEquipe, carregarLeads, ROTULO_ORIGEM } from "@/lib/opa/dados";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Célula de CSV. Texto que começa com = + - @ (ou tab/CR) é fórmula no Excel:
 * um lead chamado =HYPERLINK(...) vazaria dados ao abrir. Ganha um ' na frente.
 * Telefone (+55...) é a exceção conhecida.
 */
const cel = (v: unknown) => {
  let t = String(v ?? "");
  if (/^[=+\-@\t\r]/.test(t) && !/^\+\d{8,15}$/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};

export async function GET(): Promise<Response> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org || org.role !== "admin") return new Response("Só o administrador exporta a base.", { status: 403 });
  // Rota não passa pelo layout (onde fica a porta do MFA): sem isto, quem tem só
  // a senha de um admin com verificação em duas etapas baixaria a base inteira.
  const { data: nivel } = await (await createClient()).auth.mfa.getAuthenticatorAssuranceLevel();
  if (nivel?.nextLevel === "aal2" && nivel.currentLevel !== "aal2") {
    return new Response("Confirme a verificação em duas etapas antes de exportar.", { status: 403 });
  }

  const [leads, equipe] = await Promise.all([carregarLeads(org.orgId, { funil: "todos" }), carregarEquipe(org.orgId)]);
  const linhas = [
    ["nome", "telefone", "origem", "pago", "imovel", "etapa", "corretor", "finalidade", "regiao", "momento", "inegociavel", "entrou_em"],
    ...leads.map((l) => [
      l.nome,
      l.telefone,
      ROTULO_ORIGEM[l.origem.canal ?? ""] ?? l.origem.canal,
      l.pago ? "sim" : "não",
      l.imovelCodigo,
      l.etapa.nome,
      equipe.get(l.donoId ?? "")?.nome,
      l.campos.finalidade,
      l.campos.regiao,
      l.campos.momento,
      l.campos.inegociavel,
      l.criadoEm,
    ]),
  ];
  const csv = "﻿" + linhas.map((r) => r.map(cel).join(";")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
