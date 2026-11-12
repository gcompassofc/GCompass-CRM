import { cache } from "react";

import type { PedidoRadarSalvo } from "@/lib/opa/pedido-radar";
import type { RadarDoCard } from "@/lib/opa/radar-captacoes";
import { cifraConfigurada, decifrar } from "@/lib/crypto/dados-pessoais";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { boasVindasEnviadaEm, boasVindasFoiEntregue, esperaDesde, esperaEmMinutos } from "./atendimento";
import { carregarConfig } from "./config";
import { fotoDaEquipe } from "./fotos-equipe";
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

/** Prazo de primeira resposta padrão, em minutos (regra da OPA: pago 1 h, orgânico 3 h). A empresa muda em Configurações > Prazos. */
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
  /** Ids da Meta, quando o lead veio do formulário pelo painel (#516, item 6). */
  campanha_id?: string | null;
  conjunto_id?: string | null;
  anuncio_id?: string | null;
  /** "whatsapp": nasceu de conversa no WhatsApp do corretor (anúncio de clique, etiqueta). */
  via?: string | null;
}

export interface RespostaSalva {
  chave: string;
  pergunta: string;
  resposta: string;
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
  /** O contato tem foto do WhatsApp guardada (a mesma das Conversas, servida por /api/v1/contacts/{id}/avatar). */
  temFoto: boolean;
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
  /** Prazo de primeira resposta deste lead, em minutos (Configurações > Prazos, pago ou orgânico). */
  prazoMin: number;
  conversa: {
    id: string;
    ultimaEm: string | null;
    previa: string | null;
    /** Minutos de atendimento (só o horário de atendimento conta) desde a mensagem do lead sem resposta; null = não está esperando. */
    esperandoMin: number | null;
  } | null;
  pendentes: number;
  /** Resposta do "Lead ou pessoal?" (custom_fields.classificado); null = ninguém respondeu. */
  classificado: "lead" | null;
  /** Último pedido ao OPA Radar feito pela ficha (lib/opa/pedido-radar.ts). */
  pedidoRadar: PedidoRadarSalvo | null;
  /** Respostas do último formulário (pergunta por extenso), lib/opa/formulario.ts. */
  respostasFormulario: RespostaSalva[];
  respostasEm: string | null;
  /** Boas-vindas automática: quando saiu, ou por que não saiu. */
  boasVindas: { em: string; status: string; erro?: string | null } | null;
  /** Card do funil de captação que veio das Captações do Radar (custom_fields.radar); null nos outros. */
  radar: RadarDoCard | null;
}

export const ROTULO_ORIGEM: Record<string, string> = {
  meta: "Formulário Meta",
  anuncio_whatsapp: "Anúncio de WhatsApp",
  site: "Site",
  whatsapp: "WhatsApp",
  linkbio: "Link da bio",
  indicacao: "Indicação",
  radar: "OPA Radar",
};

/**
 * Chave da origem para rótulo e filtro. Lead pago que nasceu de conversa no
 * WhatsApp do corretor é "Anúncio de WhatsApp": só o formulário passa pelo painel
 * e traz campanha, imóvel e respostas (#516, item 7).
 */
export function chaveOrigem(origem: OrigemLead | null | undefined): string {
  if (!origem) return "";
  if (origem.canal === "meta" && origem.via === "whatsapp") return "anuncio_whatsapp";
  return origem.canal ?? "";
}

export function rotuloOrigem(origem: OrigemLead | null | undefined, padrao = "Não informado"): string {
  const k = chaveOrigem(origem);
  return ROTULO_ORIGEM[k] ?? (k || padrao);
}

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
  /** null no card do Radar, que nasce sem contato até o corretor achar o dono. */
  contact_id: string | null;
  created_at: string;
  assigned_at: string | null;
  contacts: {
    name: string | null;
    phone_number: string | null;
    telefone_cifrado?: string | null;
    avatar_storage_path?: string | null;
    is_anonymized?: boolean | null;
  } | null;
  crm_stages: { name: string; slug: string; color: string | null; position: number } | null;
};

/**
 * Contato que o WhatsApp mandou com número oculto (`@lid`) não tem
 * `phone_number`; quando o telefone apareceu no payload, ele fica só cifrado
 * (lib/waha/contatos-pessoais.ts). Aberto aqui, a ficha ganha o botão do WhatsApp.
 */
function telefoneSoCifrado(orgId: string, valor: string | null): string | null {
  if (!valor || !cifraConfigurada()) return null;
  try {
    return decifrar(valor, { org: orgId, campo: "telefone" });
  } catch {
    return null;
  }
}

export function prazoDoLead(l: Pick<LeadOpa, "prazoMin">): number {
  return l.prazoMin;
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
  /** status "todos" traz também ganhos e perdidos (exportação, F6); o padrão são só os abertos. */
  opts: { leadId?: string; funil?: string; status?: "abertos" | "todos" } = {},
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
        "id, title, status, stage_id, pipeline_id, owner_user_id, value_cents, source, tags, custom_fields, contact_id, created_at, assigned_at, contacts(name, phone_number, telefone_cifrado, avatar_storage_path, is_anonymized), crm_stages(name, slug, color, position)",
      )
      .eq("organization_id", orgId);
    // A ficha abre também negócio ganho ou perdido; as listas só mostram os abertos.
    if (opts.leadId) return c.eq("id", opts.leadId);
    if (opts.status !== "todos") c = c.eq("status", "open");
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

  const contatos = [...new Set(leads.map((l) => l.contact_id).filter((c): c is string => Boolean(c)))];
  const [config, conversas, pend] = await Promise.all([
    carregarConfig(supabase, orgId),
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

  type ConversaBruta = {
    id: string;
    last_message_at: string | null;
    last_message_preview: string | null;
    last_inbound_at: string | null;
    last_outbound_at: string | null;
  };
  const convPorContato = new Map<string, ConversaBruta>();
  const agora = Date.now();
  for (const c of (conversas ?? []) as Array<ConversaBruta & { contact_id: string }>) convPorContato.set(c.contact_id, c);

  return leads.map((l) => {
    const cf = (l.custom_fields ?? {}) as Record<string, unknown>;
    // Card do Radar sem dono achado: o título inteiro ("Casa · Praia Grande") é o nome.
    const nome = l.contacts?.name ?? ((cf.radar as { dist?: string } | undefined)?.dist ? l.title : l.title.split(" · ")[0]) ?? "Lead";
    const tags = l.tags ?? [];
    const voltou = (cf.voltou as VoltouInfo | undefined) ?? null;
    const interesse = new Set<string>((cf.imoveis_interesse as string[] | undefined) ?? []);
    if (cf.imovel_codigo) interesse.add(cf.imovel_codigo as string);
    const pago = l.source === "meta" || tags.includes("pago");
    const bruta = l.contact_id ? (convPorContato.get(l.contact_id) ?? null) : null;
    // Desde quando espera resposta: mensagem do lead sem resposta, volta por
    // formulário, "Respondi" ou ligação (tiram da fila), lead novo sem conversa
    // e relógio novo quando o lead muda de corretor. Os minutos contam só o
    // horário de atendimento (lib/opa/atendimento.ts).
    const desde = esperaDesde({
      status: l.status,
      criadoEm: l.created_at,
      atribuidoEm: l.assigned_at,
      voltouEm: voltou?.em,
      respondidoEm: cf.respondido_em as string | undefined,
      temConversa: bruta !== null,
      ultimaMensagemEm: bruta?.last_message_at,
      ultimaEntradaEm: bruta?.last_inbound_at,
      ultimaSaidaEm: bruta?.last_outbound_at,
      boasVindasEm: boasVindasEnviadaEm(cf),
      boasVindasEntregue: boasVindasFoiEntregue(cf),
    });
    const esperandoMin = desde !== null ? esperaEmMinutos(desde, agora, config.horario) : null;
    let conversa: LeadOpa["conversa"] = bruta
      ? { id: bruta.id, ultimaEm: bruta.last_message_at, previa: bruta.last_message_preview, esperandoMin }
      : null;
    if (!conversa && desde !== null) {
      // Lead que entrou pelo site ou formulário e ainda não tem conversa.
      conversa = {
        id: "",
        ultimaEm: voltou?.em ?? l.created_at,
        previa: voltou ? "Voltou por outro formulário" : "Lead novo, ainda sem conversa",
        esperandoMin,
      };
    }
    return {
      id: l.id,
      status: l.status,
      venda: (cf.venda as VendaDoLead | undefined) ?? null,
      nome,
      telefone: l.contacts?.phone_number ?? telefoneSoCifrado(orgId, l.contacts?.telefone_cifrado ?? null),
      contatoId: l.contact_id ?? "",
      // Contato anonimizado nunca mostra rosto (a rota da foto também barra).
      temFoto: Boolean(l.contact_id && l.contacts?.avatar_storage_path && !l.contacts?.is_anonymized),
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
      pago,
      prazoMin: pago ? config.prazos.pago_min : config.prazos.organico_min,
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
      classificado: (cf.classificado as { como?: string } | undefined)?.como === "lead" ? "lead" : null,
      pedidoRadar: (cf.pedido_radar as PedidoRadarSalvo | undefined)?.pedido ? (cf.pedido_radar as PedidoRadarSalvo) : null,
      respostasFormulario: ((cf.formulario as { respostas?: RespostaSalva[] } | undefined)?.respostas ?? []).filter((r) => r && r.pergunta && r.resposta),
      respostasEm: (cf.formulario as { em?: string } | undefined)?.em ?? null,
      boasVindas: (cf.boas_vindas as LeadOpa["boasVindas"] | undefined) ?? null,
      radar: (cf.radar as RadarDoCard | undefined)?.dist ? (cf.radar as RadarDoCard) : null,
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
  const [{ data, error }, { data: lista, error: erroUsuarios }] = await Promise.all([
    admin.from("user_organizations").select("user_id, role").eq("organization_id", orgId).is("revoked_at", null),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  // E4: equipe vazia por erro sumia com a roleta e os donos dos leads sem aviso.
  if (error) throw new Error(`carregarEquipe: ${error.message}`);
  if (erroUsuarios) throw new Error(`carregarEquipe (usuários): ${erroUsuarios.message}`);
  const porId = new Map((lista?.users ?? []).map((u) => [u.id, u]));
  const mapa = new Map<string, Pessoa>();
  for (const m of (data ?? []) as Array<{ user_id: string; role: string }>) {
    const u = porId.get(m.user_id);
    const nome = (u?.user_metadata?.full_name as string | undefined) ?? u?.email?.split("@")[0] ?? "Pessoa";
    const partes = nome.split(" ").filter(Boolean);
    const iniciais = ((partes[0]?.[0] ?? "") + (partes.length > 1 ? partes.at(-1)![0] : "")).toUpperCase();
    // Sem foto no perfil, a guardada no CRM (fotos-equipe.ts, 12/11/2026).
    const foto = fotoDaEquipe({ avatarUrl: u?.user_metadata?.avatar_url as string | undefined, email: u?.email, nome });
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
  const { data, error } = await supabase
    .from("crm_leads")
    .select("id, owner_user_id, closed_at, value_cents, custom_fields, contacts(name)")
    .eq("organization_id", orgId)
    .eq("status", "won")
    .gte("closed_at", desde)
    .lt("closed_at", ate ?? "9999-12-31");
  // E4: sem isto, uma falha virava "nenhuma venda" na tela Início.
  if (error) throw new Error(`carregarVendas: ${error.message}`);
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
