/**
 * Porta de entrada de lead da OPA (site, formulário do Meta, link da bio).
 *
 * Regra do protótipo (decisão 9, pedido do Kallyl em 29/10/2026): lead que já
 * tem dono nunca passa pela roleta de novo. Mesmo telefone (ou e-mail) entrando
 * por outro formulário, outro anúncio ou o site vai direto ao corretor dele: o
 * imóvel novo entra na lista de interesse, o lead ganha o selo "Voltou" e sobe
 * na fila. Ganho ou perdido há menos de JANELA_VOLTA_DIAS volta ao mesmo
 * corretor com negócio novo. Só lead sem dono passa pela roleta.
 *
 * Recebe o cliente admin: quem chama (webhook com token da org, ou o seed)
 * já resolveu a organização por fonte confiável.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const JANELA_VOLTA_DIAS = 90;

export interface Entrada {
  nome: string;
  telefone: string;
  email?: string | null;
  imovelCodigo?: string | null;
  origem: "meta" | "site" | "whatsapp" | "linkbio" | "indicacao";
  campanha?: string | null;
  conjunto?: string | null;
  anuncio?: string | null;
  /** Quando aconteceu (padrão: agora). O seed usa para montar o histórico. */
  em?: string;
  /** Dono escolhido na mão ("Novo lead" na tela): pula a roleta. */
  dono?: string;
  /** Lead próprio do corretor (link, WhatsApp ou cadastro dele): fica com ele no fim do prazo. */
  proprio?: boolean;
}

export type ResultadoEntrada =
  | { tipo: "novo"; leadId: string; donoId: string }
  | { tipo: "voltou"; leadId: string; donoId: string; vez: number }
  | { tipo: "voltou-negocio-novo"; leadId: string; donoId: string };

/** +55 com DDD, só dígitos. "(11) 99841-4410" vira "+5511998414410". */
export function normalizarTelefone(bruto: string): string {
  let d = bruto.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (!d.startsWith("55") || d.length <= 11) d = `55${d}`;
  return `+${d}`;
}

/**
 * Próximo corretor da roleta, na ordem gravada em organizations.settings.opa.roleta,
 * pulando quem está pausado. A função trava a linha da org: duas entradas ao
 * mesmo tempo não caem no mesmo corretor nem apagam a pausa de alguém (0115).
 */
async function proximoDaRoleta(admin: SupabaseClient, orgId: string): Promise<string> {
  const { data, error } = await admin.rpc("fn_opa_proximo_da_roleta", { p_org: orgId });
  if (error || !data) throw new Error(error?.message ?? "Roleta da OPA sem corretor disponível.");
  return data as string;
}

async function funilCompradores(admin: SupabaseClient, orgId: string) {
  const { data: funil } = await admin
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", orgId)
    .eq("slug", "compradores")
    .single();
  const pid = (funil as { id: string }).id;
  const { data: etapa } = await admin
    .from("crm_stages")
    .select("id")
    .eq("pipeline_id", pid)
    .eq("slug", "lead-recebido")
    .single();
  return { pipelineId: pid, etapaId: (etapa as { id: string }).id };
}

export async function registrarEntrada(admin: SupabaseClient, orgId: string, e: Entrada): Promise<ResultadoEntrada> {
  const em = e.em ?? new Date().toISOString();
  const telefone = normalizarTelefone(e.telefone);
  const origem = { canal: e.origem, campanha: e.campanha ?? null, conjunto: e.conjunto ?? null, anuncio: e.anuncio ?? null };

  const { data: imovel } = e.imovelCodigo
    ? await admin
        .from("imoveis")
        .select("codigo, preco_venda_cents, off_market")
        .eq("organization_id", orgId)
        .eq("codigo", e.imovelCodigo)
        .maybeSingle()
    : { data: null };
  const im = imovel as { codigo: string; preco_venda_cents: number | null; off_market: boolean } | null;

  // Contato: telefone é a chave que junta tudo.
  const { data: contatoExistente } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", orgId)
    .eq("phone_number", telefone)
    .is("is_merged_into", null)
    .maybeSingle();

  if (contatoExistente) {
    const contactId = (contatoExistente as { id: string }).id;
    const { data: leads } = await admin
      .from("crm_leads")
      .select("id, status, owner_user_id, closed_at, custom_fields, tags")
      .eq("organization_id", orgId)
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false });
    const lista = (leads ?? []) as Array<{
      id: string;
      status: string;
      owner_user_id: string | null;
      closed_at: string | null;
      custom_fields: Record<string, unknown> | null;
      tags: string[] | null;
    }>;

    const aberto = lista.find((l) => l.status === "open" && l.owner_user_id);
    if (aberto) {
      const cf = aberto.custom_fields ?? {};
      const interesse = new Set<string>((cf.imoveis_interesse as string[]) ?? []);
      if (cf.imovel_codigo) interesse.add(cf.imovel_codigo as string);
      if (im) interesse.add(im.codigo);
      const vez = (((cf.voltou as { vez?: number }) ?? {}).vez ?? 1) + 1;
      const tags = new Set(aberto.tags ?? []);
      if (im?.off_market) tags.add("off-market-comprador");
      await admin
        .from("crm_leads")
        .update({
          custom_fields: {
            ...cf,
            imoveis_interesse: [...interesse],
            voltou: { em, vez, origem, imovel_codigo: im?.codigo ?? null },
          },
          tags: [...tags],
          last_activity_at: em,
        })
        .eq("id", aberto.id);
      await admin.from("crm_lead_activities").insert({
        organization_id: orgId,
        lead_id: aberto.id,
        contact_id: contactId,
        source_module: "opa",
        type: "lead_voltou",
        payload: { vez, origem, imovel_codigo: im?.codigo ?? null, roleta: false },
        performed_at: em,
        actor_kind: "system",
        reason: "Lead que já tem dono volta ao corretor responsável, sem roleta.",
      });
      return { tipo: "voltou", leadId: aberto.id, donoId: aberto.owner_user_id!, vez };
    }

    const limite = Date.now() - JANELA_VOLTA_DIAS * 86_400_000;
    const recente = lista.find(
      (l) => l.status !== "open" && l.owner_user_id && l.closed_at && Date.parse(l.closed_at) >= limite,
    );
    if (recente) {
      const leadId = await criarLead(admin, orgId, contactId, recente.owner_user_id!, e, origem, im, em, {
        voltou: { em, vez: 2, origem, imovel_codigo: im?.codigo ?? null, negocio_anterior: recente.id },
      });
      return { tipo: "voltou-negocio-novo", leadId, donoId: recente.owner_user_id! };
    }

    const dono = e.dono ?? (await proximoDaRoleta(admin, orgId));
    const leadId = await criarLead(admin, orgId, contactId, dono, e, origem, im, em, {});
    return { tipo: "novo", leadId, donoId: dono };
  }

  const { data: contato, error } = await admin
    .from("contacts")
    .insert({
      organization_id: orgId,
      name: e.nome,
      display_name: e.nome,
      phone_number: telefone,
      email: e.email ?? null,
      source: e.origem,
      consent: { marketing: true, origem: e.origem },
      created_at: em,
      last_activity_at: em,
    })
    .select("id")
    .single();
  if (error) throw new Error(`entrada: contato: ${error.message}`);
  const dono = e.dono ?? (await proximoDaRoleta(admin, orgId));
  const leadId = await criarLead(admin, orgId, (contato as { id: string }).id, dono, e, origem, im, em, {});
  return { tipo: "novo", leadId, donoId: dono };
}

async function criarLead(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
  dono: string,
  e: Entrada,
  origem: Record<string, unknown>,
  im: { codigo: string; preco_venda_cents: number | null; off_market: boolean } | null,
  em: string,
  extra: Record<string, unknown>,
): Promise<string> {
  const { pipelineId, etapaId } = await funilCompradores(admin, orgId);
  const tags = [
    e.origem === "meta" ? "pago" : "organico",
    ...(im?.off_market ? ["off-market-comprador"] : []),
    ...(e.proprio ? ["proprio"] : []),
  ];
  const { data, error } = await admin
    .from("crm_leads")
    .insert({
      organization_id: orgId,
      pipeline_id: pipelineId,
      stage_id: etapaId,
      contact_id: contactId,
      title: `${e.nome}${im ? ` · ${im.codigo}` : ""}`,
      status: "open",
      value_cents: im?.preco_venda_cents ?? null,
      currency: "BRL",
      owner_user_id: dono,
      owner_kind: "user",
      assigned_at: em,
      last_activity_at: em,
      stage_changed_at: em,
      source: e.origem,
      tags,
      custom_fields: { opa: {}, imovel_codigo: im?.codigo ?? null, imoveis_interesse: im ? [im.codigo] : [], origem, ...extra },
      created_at: em,
    })
    .select("id")
    .single();
  if (error) throw new Error(`entrada: lead: ${error.message}`);
  return (data as { id: string }).id;
}
