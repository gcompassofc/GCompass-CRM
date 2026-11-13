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

import { mesclarCampos } from "./campos";
import { carregarConfig } from "./config";
import { camposDoCorretorDasRespostas, diagnosticoDasRespostas, lerRespostas, soOQueFalta } from "./formulario";
import { avisarLeadCriado } from "@/lib/opa/eventos-lead";
import { marcarConversou } from "@/lib/opa/conversa-iniciada";
import { phoneLookupVariants } from "@/lib/channels/phone-variants";

/** Padrão da janela; a empresa muda em Configurações (config.volta_dias). */
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
  /** Ids da Meta (utm_campaign, utm_term, utm_content do painel). */
  campanhaId?: string | null;
  conjuntoId?: string | null;
  anuncioId?: string | null;
  utmSource?: string | null;
  utmMedium?: string | null;
  /** Respostas do formulário pelo valor da opção (lib/opa/formulario.ts). */
  respostas?: Record<string, unknown> | null;
  /** Lead que nasceu de conversa no WhatsApp do corretor (anúncio de clique para WhatsApp, etiqueta). */
  via?: "whatsapp";
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

/** Id da Meta é só número; nome de campanha do site ("bio-perfil") é texto. */
const ehId = (v: string | null | undefined): boolean => Boolean(v && /^\d{6,}$/.test(v.trim()));

/**
 * O que vai em custom_fields.origem: nomes para o corretor ler e ids para o
 * painel e o dashboard cruzarem (#516, item 6). Sem nome, a UTM de texto do site
 * vale como nome; id numérico nunca aparece como nome.
 */
export function montarOrigem(e: Entrada): Record<string, unknown> {
  const nome = (n: string | null | undefined, utm: string | null | undefined) => n?.trim() || (utm && !ehId(utm) ? utm.trim() : null);
  const origem: Record<string, unknown> = {
    canal: e.origem,
    campanha: nome(e.campanha, e.campanhaId),
    conjunto: nome(e.conjunto, e.conjuntoId),
    anuncio: nome(e.anuncio, e.anuncioId),
  };
  if (ehId(e.campanhaId)) origem.campanha_id = e.campanhaId!.trim();
  if (ehId(e.conjuntoId)) origem.conjunto_id = e.conjuntoId!.trim();
  if (ehId(e.anuncioId)) origem.anuncio_id = e.anuncioId!.trim();
  if (e.utmSource) origem.fonte = e.utmSource;
  if (e.utmMedium) origem.meio = e.utmMedium;
  if (e.via) origem.via = e.via;
  return origem;
}

/** Respostas legíveis + diagnóstico pré-preenchido, para gravar no lead. */
function camposDoFormulario(e: Entrada) {
  const respostas = lerRespostas(e.respostas);
  return {
    respostas,
    diagnostico: diagnosticoDasRespostas(respostas),
    corretor: camposDoCorretorDasRespostas(e.respostas),
  };
}

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
  const origem = montarOrigem(e);
  const form = camposDoFormulario(e);

  const { data: imovel } = e.imovelCodigo
    ? await admin
        .from("imoveis")
        .select("codigo, preco_venda_cents, off_market")
        .eq("organization_id", orgId)
        .eq("codigo", e.imovelCodigo)
        .maybeSingle()
    : { data: null };
  const im = imovel as { codigo: string; preco_venda_cents: number | null; off_market: boolean } | null;

  // Contato: telefone é a chave que junta tudo, com e sem o nono dígito (13/11/2026,
  // caso da Wandalcy: o formulário veio com o 9 e o WhatsApp dela é sem). O mais
  // antigo ganha, e um segundo achado não pode virar erro (e contato novo).
  const formas = phoneLookupVariants(telefone);
  const { data: contatoExistente } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", orgId)
    .in("phone_number", formas.length ? formas : [telefone])
    .is("is_merged_into", null)
    .order("created_at", { ascending: true })
    .limit(1)
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
      // Só as chaves que mudam: o que o corretor gravou no meio (E1) não se perde.
      // As respostas do formulário novo entram; o diagnóstico só preenche o que está vazio.
      await mesclarCampos(
        admin,
        aberto.id,
        {
          imoveis_interesse: [...interesse],
          voltou: { em, vez, origem, imovel_codigo: im?.codigo ?? null },
          ...(form.respostas.length ? { formulario: { em, respostas: form.respostas } } : {}),
          opa: soOQueFalta(cf.opa as Record<string, unknown> | undefined, form.diagnostico),
          campos_corretor: soOQueFalta(cf.campos_corretor as Record<string, unknown> | undefined, form.corretor),
        },
        { atividade: em, orgId, mesclar: ["opa", "campos_corretor"] },
      );
      if (im?.off_market) {
        // Acrescenta no banco, sem ler e regravar a lista (C8): etiqueta gravada no meio não se perde.
        const { error: erroTags } = await admin.rpc("fn_opa_anexar_etiquetas", { p_lead: aberto.id, p_tags: ["off-market-comprador"], p_org: orgId });
        if (erroTags) throw new Error(`etiquetas do lead: ${erroTags.message}`);
      }
      await admin.from("crm_lead_activities").insert({
        organization_id: orgId,
        lead_id: aberto.id,
        contact_id: contactId,
        source_module: "opa",
        type: "lead_voltou",
        payload: { vez, origem, imovel_codigo: im?.codigo ?? null, roleta: false, respostas: form.respostas.length },
        performed_at: em,
        actor_kind: "system",
        reason: "Lead que já tem dono volta ao corretor responsável, sem roleta.",
      });
      return { tipo: "voltou", leadId: aberto.id, donoId: aberto.owner_user_id!, vez };
    }

    const { volta_dias } = await carregarConfig(admin, orgId);
    const limite = Date.now() - volta_dias * 86_400_000;
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

/**
 * Lead para um contato que já existe no CRM (veio do WhatsApp do corretor e virou
 * lead: etiqueta, botão "É lead", anúncio ou site). O dono é sempre o corretor do
 * número, sem roleta. Se o contato já tem lead aberto, devolve esse.
 */
export async function registrarLeadDoContato(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
  e: Pick<Entrada, "nome" | "origem" | "imovelCodigo" | "dono" | "proprio">,
): Promise<{ leadId: string; novo: boolean }> {
  const { data: aberto } = await admin
    .from("crm_leads")
    .select("id")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();
  if (aberto) return { leadId: (aberto as { id: string }).id, novo: false };
  if (!e.dono) throw new Error("entrada: lead do WhatsApp sem dono");

  const { data: imovel } = e.imovelCodigo
    ? await admin
        .from("imoveis")
        .select("codigo, preco_venda_cents, off_market")
        .eq("organization_id", orgId)
        .eq("codigo", e.imovelCodigo)
        .maybeSingle()
    : { data: null };
  const em = new Date().toISOString();
  // Nasceu de conversa no WhatsApp do corretor: "Anúncio de WhatsApp" quando veio de
  // anúncio, nunca "Formulário Meta" (#516, item 7).
  const entrada: Entrada = { ...e, telefone: "", via: "whatsapp" };
  const origem = montarOrigem(entrada);
  const leadId = await criarLead(
    admin,
    orgId,
    contactId,
    e.dono,
    entrada,
    origem,
    imovel as { codigo: string; preco_venda_cents: number | null; off_market: boolean } | null,
    em,
    {},
  );
  return { leadId, novo: true };
}

/** O contato já teve lead da OPA dentro da janela de volta (config.volta_dias)? */
async function jaFoiDaOpa(admin: SupabaseClient, orgId: string, contactId: string): Promise<boolean> {
  const { volta_dias } = await carregarConfig(admin, orgId);
  const limite = new Date(Date.now() - volta_dias * 86_400_000).toISOString();
  const { data } = await admin
    .from("crm_leads")
    .select("tags, created_at")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .gte("created_at", limite);
  return ((data ?? []) as Array<{ tags: string[] | null }>).some((l) => !(l.tags ?? []).includes("proprio"));
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
  // Quem já chegou por ação da OPA não vira próprio num cadastro novo (05/11/2026):
  // sem isto, bastava encerrar o lead e cadastrar o número de novo para fugir do repasse.
  const proprio = Boolean(e.proprio) && !(await jaFoiDaOpa(admin, orgId, contactId));
  const form = camposDoFormulario(e);
  const tags = [
    e.origem === "meta" ? "pago" : "organico",
    ...(im?.off_market ? ["off-market-comprador"] : []),
    ...(proprio ? ["proprio"] : []),
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
      custom_fields: {
        opa: form.diagnostico,
        ...(Object.keys(form.corretor).length ? { campos_corretor: form.corretor } : {}),
        ...(form.respostas.length ? { formulario: { em, respostas: form.respostas } } : {}),
        imovel_codigo: im?.codigo ?? null,
        imoveis_interesse: im ? [im.codigo] : [],
        origem,
        ...extra,
      },
      created_at: em,
    })
    .select("id")
    .single();
  // A trava da 0129 barrou: a pessoa já tem lead aberto (entrada simultânea ou o mesmo número
  // em outro contato). O lead que entrou não se perde: fica o que já existe.
  if ((error as { hint?: string } | null)?.hint === "lead_duplicado") {
    const { data: existente } = await admin.rpc("fn_lead_aberto_da_pessoa" as never, { p_org: orgId, p_contato: contactId } as never);
    if (existente) {
      console.info("[entrada] lead duplicado evitado", { orgId, contactId });
      return existente as unknown as string;
    }
  }
  if (error) throw new Error(`entrada: lead: ${error.message}`);
  const leadId = (data as { id: string }).id;
  // Automações (webhook e regras) disparam também para lead que entra pela OPA.
  await avisarLeadCriado(admin, orgId, { id: leadId, pipeline_id: pipelineId, stage_id: etapaId, title: `${e.nome}${im ? ` · ${im.codigo}` : ""}` }, `opa.${e.origem}`);
  // A mensagem do cliente pode ter chegado antes do card (formulário abre o
  // WhatsApp na hora): marca "conversou" já aqui, se for o caso (0134).
  await marcarConversou(admin, orgId, contactId, `opa.${e.origem}.entrada`);
  return leadId;
}
