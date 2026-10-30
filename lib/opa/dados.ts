import { cache } from "react";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import type { Imovel } from "./imoveis";
import { emLotes, todasAsPaginas } from "./lotes";

/**
 * Leitura das telas da OPA. Lead, conversa e sugestão saem pelo cliente da
 * sessão: o RLS da base (escopo calculado uma vez por consulta, migration 0117)
 * decide o que cada papel vê, então o corretor recebe só os leads dele sem filtro aqui.
 *
 * Base grande: as listas vão em páginas de 1.000 e as buscas por id em lotes
 * (lib/opa/lotes.ts); erro de consulta derruba a tela em vez de virar lista vazia.
 */

/** Prazo de primeira resposta, em minutos (regra da OPA: pago 1 h, orgânico 3 h). */
export const PRAZO_PAGO_MIN = 60;
export const PRAZO_ORGANICO_MIN = 180;

export interface CamposOpa {
  finalidade?: string;
  regiao?: string;
  faixa?: string;
  suites?: string;
  momento?: string;
  inegociavel?: string;
  estilo_vida?: string;
  quem_decide?: string;
}

export interface CopilotoSalvo {
  resumo?: string;
  proximoPasso?: string;
  temperatura?: "quente" | "morno" | "frio";
  motor?: "ia" | "regras";
  analisado_em?: string;
  /** Rascunho da IA para a última mensagem do lead; vale enquanto respondendo_a for a última entrada. */
  mensagem?: string;
  respondendo_a?: string;
  objecoes?: string[];
}

export interface OrigemLead {
  canal?: string;
  campanha?: string | null;
  conjunto?: string | null;
  anuncio?: string | null;
}

export interface VoltouInfo {
  em: string;
  vez: number;
  origem?: OrigemLead;
  imovel_codigo?: string | null;
}

/** Off market vem da etiqueta do lead ou de ele ter entrado por imóvel off market do acervo. */
export type OffMarket = "comprador" | "proprietario" | null;

export interface VendaDoLead {
  imovel_codigo: string;
  vgv_cents: number;
  valor_pedido_cents: number | null;
  outro_valor: boolean;
  comissao_cents: number;
  data: string;
}

export interface LeadOpa {
  id: string;
  status: "open" | "won" | "lost";
  venda: VendaDoLead | null;
  nome: string;
  telefone: string | null;
  contatoId: string;
  etapa: { id: string; nome: string; slug: string; cor: string | null; posicao: number };
  pipelineId: string;
  donoId: string | null;
  valorCents: number | null;
  pago: boolean;
  origem: OrigemLead;
  campos: CamposOpa;
  copiloto: CopilotoSalvo;
  /** Ligações seguidas sem atender (zera quando atende ou pede retorno). */
  tentativasLigacao: number;
  imovelCodigo: string | null;
  imoveisInteresse: string[];
  offMarket: OffMarket;
  voltou: VoltouInfo | null;
  /** Etiquetas marcadas à mão (grupo -> valores). As que vêm do imóvel saem de `etiquetasDoLead`. */
  etiquetas: Record<string, string[]>;
  /** Campos do corretor (Configurações > Campos do lead). */
  camposCorretor: Record<string, string>;
  lembretesDesligados: boolean;
  proprio: boolean;
  criadoEm: string;
  conversa: {
    id: string;
    ultimaEm: string | null;
    previa: string | null;
    /** Minutos desde a mensagem do lead que ainda não teve resposta; null = não está esperando. */
    esperandoMin: number | null;
  } | null;
  pendentes: number;
}

export const ROTULO_ORIGEM: Record<string, string> = {
  meta: "Formulário Meta",
  site: "Site",
  whatsapp: "WhatsApp",
  linkbio: "Link da bio",
  indicacao: "Indicação",
  radar: "OPA Radar",
};

type LinhaLead = {
  id: string;
  title: string;
  status: "open" | "won" | "lost";
  stage_id: string;
  pipeline_id: string;
  owner_user_id: string | null;
  value_cents: number | null;
  source: string | null;
  tags: string[] | null;
  custom_fields: Record<string, unknown> | null;
  contact_id: string;
  created_at: string;
  contacts: { name: string | null; phone_number: string | null } | null;
  crm_stages: { name: string; slug: string; color: string | null; position: number } | null;
};

export function prazoDoLead(l: Pick<LeadOpa, "pago">): number {
  return l.pago ? PRAZO_PAGO_MIN : PRAZO_ORGANICO_MIN;
}

/**
 * Leitura por requisição: layout, cabeçalho e página pedem os mesmos dados no
 * mesmo render; o `cache` do React faz a ida ao banco uma vez só. Quem acabou de
 * gravar e precisa reler usa `carregarLeadsSemCache`.
 */
const leadsDaRequisicao = cache((orgId: string, leadId: string, funil: string) =>
  carregarLeadsSemCache(orgId, { leadId: leadId || undefined, funil: funil || undefined }),
);

export function carregarLeads(orgId: string, opts: { leadId?: string; funil?: string } = {}): Promise<LeadOpa[]> {
  return leadsDaRequisicao(orgId, opts.leadId ?? "", opts.funil ?? "");
}

export async function carregarLeadsSemCache(
  orgId: string,
  opts: { leadId?: string; funil?: string } = {},
): Promise<LeadOpa[]> {
  const supabase = await createClient();

  const { data: funil } = await supabase
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", orgId)
    .eq("slug", opts.funil ?? "compradores")
    .maybeSingle();

  const consulta = () => {
    let c = supabase
      .from("crm_leads")
      .select(
        "id, title, status, stage_id, pipeline_id, owner_user_id, value_cents, source, tags, custom_fields, contact_id, created_at, contacts(name, phone_number), crm_stages(name, slug, color, position)",
      )
      .eq("organization_id", orgId);
    // A ficha abre também negócio ganho ou perdido; as listas só mostram os abertos.
    if (opts.leadId) return c.eq("id", opts.leadId);
    c = c.eq("status", "open");
    // funil "todos": a base inteira (tela Leads); senão, só o funil pedido.
    if (opts.funil !== "todos" && funil) c = c.eq("pipeline_id", (funil as { id: string }).id);
    return c;
  };

  let leads: LinhaLead[];
  try {
    leads = (await todasAsPaginas((de, ate) => consulta().order("created_at", { ascending: false }).order("id").range(de, ate))) as unknown as LinhaLead[];
  } catch (e) {
    throw new Error(`carregarLeads: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (leads.length === 0) return [];

  const contatos = [...new Set(leads.map((l) => l.contact_id))];
  const [conversas, pend] = await Promise.all([
    emLotes(contatos, (lote) =>
      supabase
        .from("conversations")
        .select("id, contact_id, last_message_at, last_message_preview, last_inbound_at, last_outbound_at")
        .eq("organization_id", orgId)
        .in("contact_id", lote),
    ),
    emLotes(
      leads.map((l) => l.id),
      (lote) =>
        supabase.from("copiloto_sugestoes").select("lead_id").eq("organization_id", orgId).eq("status", "pendente").in("lead_id", lote),
    ),
  ]);

  const pendPorLead = new Map<string, number>();
  for (const p of (pend ?? []) as Array<{ lead_id: string }>) {
    pendPorLead.set(p.lead_id, (pendPorLead.get(p.lead_id) ?? 0) + 1);
  }

  const convPorContato = new Map<string, LeadOpa["conversa"]>();
  const agora = Date.now();
  for (const c of (conversas ?? []) as Array<{
    id: string;
    contact_id: string;
    last_message_at: string | null;
    last_message_preview: string | null;
    last_inbound_at: string | null;
    last_outbound_at: string | null;
  }>) {
    const entrou = c.last_inbound_at ? Date.parse(c.last_inbound_at) : null;
    const saiu = c.last_outbound_at ? Date.parse(c.last_outbound_at) : null;
    const esperando = entrou !== null && (saiu === null || entrou > saiu);
    convPorContato.set(c.contact_id, {
      id: c.id,
      ultimaEm: c.last_message_at,
      previa: c.last_message_preview,
      esperandoMin: esperando ? Math.round((agora - entrou) / 60_000) : null,
    });
  }

  return leads.map((l) => {
    const cf = (l.custom_fields ?? {}) as Record<string, unknown>;
    const nome = l.contacts?.name ?? l.title.split(" · ")[0] ?? "Lead";
    const tags = l.tags ?? [];
    const voltou = (cf.voltou as VoltouInfo | undefined) ?? null;
    const interesse = new Set<string>((cf.imoveis_interesse as string[] | undefined) ?? []);
    if (cf.imovel_codigo) interesse.add(cf.imovel_codigo as string);
    let conversa = convPorContato.get(l.contact_id) ?? null;
    // Lead que voltou por formulário espera resposta desde a volta, mesmo
    // que a última mensagem da conversa tenha sido do corretor.
    if (voltou?.em) {
      const voltouMin = Math.round((agora - Date.parse(voltou.em)) / 60_000);
      const ultimaSaida = conversa?.ultimaEm ? Date.parse(conversa.ultimaEm) : 0;
      if (Date.parse(voltou.em) > ultimaSaida || conversa?.esperandoMin != null) {
        conversa = {
          id: conversa?.id ?? "",
          ultimaEm: conversa?.ultimaEm ?? voltou.em,
          previa: conversa?.previa ?? "Voltou por outro formulário",
          esperandoMin: Math.max(conversa?.esperandoMin ?? 0, voltouMin),
        };
      }
    }
    // "Respondi" na fila: o lead desce para o fim até escrever de novo.
    const respondidoEm = cf.respondido_em ? Date.parse(cf.respondido_em as string) : 0;
    if (conversa?.esperandoMin != null && respondidoEm >= agora - conversa.esperandoMin * 60_000) {
      conversa = { ...conversa, esperandoMin: null };
    }
    // Lead que entrou pelo site ou formulário e ainda não tem conversa espera o
    // primeiro contato desde que entrou.
    if (!conversa && l.status === "open" && !respondidoEm) {
      conversa = {
        id: "",
        ultimaEm: l.created_at,
        previa: "Lead novo, ainda sem conversa",
        esperandoMin: Math.round((agora - Date.parse(l.created_at)) / 60_000),
      };
    }
    return {
      id: l.id,
      status: l.status,
      venda: (cf.venda as VendaDoLead | undefined) ?? null,
      nome,
      telefone: l.contacts?.phone_number ?? null,
      contatoId: l.contact_id,
      etapa: {
        id: l.stage_id,
        nome: l.crm_stages?.name ?? "",
        slug: l.crm_stages?.slug ?? "",
        cor: l.crm_stages?.color ?? null,
        posicao: Number(l.crm_stages?.position ?? 0),
      },
      pipelineId: l.pipeline_id,
      donoId: l.owner_user_id,
      valorCents: l.value_cents,
      pago: l.source === "meta" || (l.tags ?? []).includes("pago"),
      origem: (cf.origem as OrigemLead) ?? { canal: l.source ?? undefined },
      campos: (cf.opa as CamposOpa) ?? {},
      etiquetas: (cf.etiquetas as Record<string, string[]>) ?? {},
      camposCorretor: (cf.campos_corretor as Record<string, string>) ?? {},
      lembretesDesligados: cf.lembretes_desligados === true,
      proprio: tags.includes("proprio"),
      copiloto: (cf.copiloto as CopilotoSalvo) ?? {},
      tentativasLigacao: Number(cf.tentativas_ligacao) || 0,
      imovelCodigo: (cf.imovel_codigo as string) ?? null,
      imoveisInteresse: [...interesse],
      offMarket: tags.includes("off-market-proprietario")
        ? "proprietario"
        : tags.includes("off-market-comprador")
          ? "comprador"
          : null,
      voltou,
      criadoEm: l.created_at,
      conversa,
      pendentes: pendPorLead.get(l.id) ?? 0,
    };
  });
}

export const carregarImoveis = cache(async (orgId: string): Promise<Imovel[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("imoveis")
    .select("*")
    .eq("organization_id", orgId)
    .order("preco_venda_cents", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`carregarImoveis: ${error.message}`);
  return (data ?? []) as Imovel[];
});

export interface Pessoa {
  id: string;
  nome: string;
  papel: string;
  iniciais: string;
  /** Foto do perfil (user_metadata.avatar_url), preenchida a partir do site da OPA. */
  foto: string | null;
}

/** Nomes da equipe. Lê auth.users pelo cliente admin (uma chamada só), filtrado pelos membros da org. */
export const carregarEquipe = cache(async (orgId: string): Promise<Map<string, Pessoa>> => {
  const admin = createAdminClient();
  const [{ data }, { data: lista }] = await Promise.all([
    admin.from("user_organizations").select("user_id, role").eq("organization_id", orgId).is("revoked_at", null),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const porId = new Map((lista?.users ?? []).map((u) => [u.id, u]));
  const mapa = new Map<string, Pessoa>();
  for (const m of (data ?? []) as Array<{ user_id: string; role: string }>) {
    const u = porId.get(m.user_id);
    const nome = (u?.user_metadata?.full_name as string | undefined) ?? u?.email?.split("@")[0] ?? "Pessoa";
    const partes = nome.split(" ").filter(Boolean);
    const iniciais = ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes.at(-1)![0] : "")).toUpperCase();
    const foto = (u?.user_metadata?.avatar_url as string | undefined) || null;
    mapa.set(m.user_id, { id: m.user_id, nome, papel: m.role, iniciais, foto });
  }
  return mapa;
});

export function tempoCurto(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h${min % 60 ? ` ${min % 60} min` : ""}`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
}

export function primeiroNome(nome: string | undefined | null): string {
  return (nome ?? "").split(" ")[0] ?? "";
}

export const CAMPOS_DIAGNOSTICO: Array<keyof CamposOpa> = ["finalidade", "regiao", "momento", "inegociavel"];

export function diagnosticoCompleto(c: CamposOpa): number {
  return CAMPOS_DIAGNOSTICO.filter((k) => Boolean(c[k])).length;
}

// ---------------------------------------------------------------- vendas e prazo

/** Comissão bruta da OPA sobre o VGV (regra do protótipo; alíquota da operação fora da conta). */
export const COMISSAO_OPA = 0.03;

export interface Venda {
  leadId: string;
  nome: string;
  donoId: string | null;
  imovelCodigo: string | null;
  vgvCents: number;
  comissaoCents: number;
  em: string;
}

export async function carregarVendas(orgId: string, desde: string, ate?: string): Promise<Venda[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_leads")
    .select("id, owner_user_id, closed_at, value_cents, custom_fields, contacts(name)")
    .eq("organization_id", orgId)
    .eq("status", "won")
    .gte("closed_at", desde)
    .lt("closed_at", ate ?? "9999-12-31");
  return ((data ?? []) as unknown as Array<{
    id: string;
    owner_user_id: string | null;
    closed_at: string;
    value_cents: number | null;
    custom_fields: { venda?: { imovel_codigo?: string; vgv_cents?: number; comissao_cents?: number } } | null;
    contacts: { name: string | null } | null;
  }>).map((l) => {
    const v = l.custom_fields?.venda ?? {};
    const vgv = v.vgv_cents ?? l.value_cents ?? 0;
    return {
      leadId: l.id,
      nome: l.contacts?.name ?? "Lead",
      donoId: l.owner_user_id,
      imovelCodigo: v.imovel_codigo ?? null,
      vgvCents: vgv,
      comissaoCents: v.comissao_cents ?? Math.round(vgv * COMISSAO_OPA),
      em: l.closed_at,
    };
  });
}

/**
 * Primeira resposta de cada lead: minutos entre a primeira mensagem do lead e a
 * primeira do corretor depois dela. null = ainda sem resposta.
 */
export async function carregarPrimeiraResposta(orgId: string, contatos: string[]): Promise<Map<string, number | null>> {
  const mapa = new Map<string, number | null>();
  if (contatos.length === 0) return mapa;
  const supabase = await createClient();
  // A conta sai pronta do banco (migration 0117): sem lista no endereço e sem
  // trazer todas as mensagens para cá.
  const { data, error } = await supabase.rpc("fn_opa_primeira_resposta", { p_org: orgId, p_contatos: contatos });
  if (error) throw new Error(`carregarPrimeiraResposta: ${error.message}`);
  const minutos = (data ?? {}) as Record<string, number | null>;
  for (const c of contatos) mapa.set(c, minutos[c] ?? null);
  return mapa;
}

/** Quem vê receita (VGV vendido e comissão): admin sempre; gerente só se a org liberar. */
export async function gerenteVeReceita(orgId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const s = (data as { settings: { opa?: { gerente_ve_receita?: boolean } } | null } | null)?.settings;
  return Boolean(s?.opa?.gerente_ve_receita);
}

// ---------------------------------------------------------------- relógio

const DIA_MS = 86_400_000;

/** Início da janela de N dias que termina agora, em ISO. */
export function inicioDoPeriodo(dias: number): string {
  return new Date(Date.now() - dias * DIA_MS).toISOString();
}

/** A data cai na janela de N dias; deslocamento 1 = a janela anterior (para o "Antes"). */
export function noPeriodo(iso: string, dias: number, deslocamento = 0): boolean {
  const t = Date.parse(iso);
  const agora = Date.now();
  return t >= agora - (deslocamento + 1) * dias * DIA_MS && t < agora - deslocamento * dias * DIA_MS;
}

/** Volta recente (até 7 dias): é o que ganha selo e bloco na ficha. */
export function voltaRecente(l: Pick<LeadOpa, "voltou">): VoltouInfo | null {
  return l.voltou && Date.now() - Date.parse(l.voltou.em) < 7 * DIA_MS ? l.voltou : null;
}

// ---------------------------------------------------------------- fila e etiquetas

/** "?corretor=" do cabeçalho: gestor vendo a operação de uma pessoa. */
export function filtrarCorretor<T extends { donoId: string | null }>(leads: T[], corretor?: string | null): T[] {
  return corretor ? leads.filter((l) => l.donoId === corretor) : [...leads];
}

const ORDINAL = ["Primeiro", "Segundo", "Terceiro", "Quarto"];

/**
 * O que vem a seguir no relógio da fila (regra do protótipo): avisos aos 20 e
 * 40 min no pago, aos 20 min, 1 h e 2 h no orgânico; no fim do prazo o lead
 * passa para o próximo da roleta.
 */
export function proximoNaFila(
  l: Pick<LeadOpa, "pago" | "conversa" | "proprio">,
  prazos: { pago_min: number; organico_min: number; avisos_pago: number[]; avisos_organico: number[] } = {
    pago_min: PRAZO_PAGO_MIN,
    organico_min: PRAZO_ORGANICO_MIN,
    avisos_pago: [20, 40],
    avisos_organico: [20, 60, 120],
  },
): { texto: string; pct: number; estourou: boolean } {
  const m = l.conversa?.esperandoMin ?? 0;
  const prazo = l.pago ? prazos.pago_min : prazos.organico_min;
  const avisos = l.pago ? prazos.avisos_pago : prazos.avisos_organico;
  const pct = Math.min(100, Math.round((m / prazo) * 100));
  if (m >= prazo) return { texto: `Passou do prazo há ${tempoCurto(m - prazo)}`, pct: 100, estourou: true };
  const i = avisos.findIndex((a) => a > m);
  if (i >= 0) return { texto: `${ORDINAL[i] ?? `${i + 1}º`} aviso em ${tempoCurto(avisos[i]! - m)}`, pct, estourou: false };
  return {
    texto: l.proprio ? `Prazo em ${tempoCurto(prazo - m)} (lead próprio, não troca)` : `Passa para o próximo da fila em ${tempoCurto(prazo - m)}`,
    pct,
    estourou: false,
  };
}

/** Configuração da conta (lib/opa/config.ts), lida uma vez por requisição. */
export const configDaOrg = cache(async (orgId: string) => {
  const { carregarConfig } = await import("./config");
  return carregarConfig(await createClient(), orgId);
});
