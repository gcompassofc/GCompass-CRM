/**
 * /app/leads/<id>/conversa: abre a conversa do lead no Multi-atendimento.
 *
 * Todo botão "Abrir conversa" (ficha, Início, Fila da equipe) passa por aqui, para
 * a decisão ficar num lugar só (lib/opa/conversa-do-lead.ts). O lead é lido com a
 * sessão de quem clicou (RLS): quem não vê o lead não chega à conversa.
 *
 * Os links para cá usam prefetch={false}: abrir a conversa pode criá-la e
 * atribuí-la, e isso só acontece no clique.
 *
 * Com `?json=1` (janela de conversa do Funil, 09/11/2026) a mesma decisão volta em
 * JSON ({ ok, conversaId } ou { ok: false, motivo }), sem sair da tela.
 */
import { NextResponse } from "next/server";

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { conversaDoLead } from "@/lib/opa/conversa-do-lead";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const json = new URL(request.url).searchParams.get("json") === "1";
  const responder = (r: { ok: true; conversaId: string } | { ok: false; motivo: string }) => NextResponse.json(r, { status: r.ok ? 200 : 409 });
  // Location relativo: atrás do Caddy, `request.url` é o endereço interno do
  // contêiner (http://0.0.0.0:3000) e um redirect absoluto levava o navegador
  // para lá (ERR_ADDRESS_INVALID, 03/11/2026).
  const para = (caminho: string) => new NextResponse(null, { status: 303, headers: { Location: caminho } });

  const user = await loadAuthUser();
  if (!user) return json ? NextResponse.json({ ok: false, motivo: "sem_sessao" }, { status: 401 }) : para(`/login?next=${encodeURIComponent(`/app/leads/${id}/conversa`)}`);
  const org = await resolveActiveOrg(user);
  if (!org) return json ? responder({ ok: false, motivo: "sem_org" }) : para("/app");

  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id, contact_id, owner_user_id")
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!lead) return json ? responder({ ok: false, motivo: "sem_lead" }) : para("/app/leads");

  try {
    const r = await conversaDoLead(createAdminClient(), org.orgId, lead as { contact_id: string; owner_user_id: string | null }, {
      // Leitor só abre o que já existe: não cria conversa nem muda dono.
      podeCriar: org.role !== "viewer",
    });
    if (json) return responder(r.ok ? { ok: true, conversaId: r.conversaId } : { ok: false, motivo: r.motivo });
    if (r.ok) return para(`/app/inbox?id=${r.conversaId}`);
    return para(`/app/leads/${id}?conversa=${r.motivo}`);
  } catch (err) {
    console.error("[app/leads/conversa] falhou", err instanceof Error ? err.message : String(err));
    return json ? responder({ ok: false, motivo: "erro" }) : para(`/app/leads/${id}?conversa=erro`);
  }
}
