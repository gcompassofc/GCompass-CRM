/**
 * Relatório mensal da OPA: SÓ A ESTRUTURA, desligado (decisão do Allyson,
 * 01/11/2026). A rota app/api/v1/cron/opa-relatorio-mensal só manda com
 * OPA_RELATORIO_MENSAL=on, e não está no agendador do docker-compose.
 *
 * O que entra, sempre do mês anterior no horário de São Paulo, funil de
 * compradores:
 *  - leads novos por origem (pago conta como anúncio, como na Fila);
 *  - primeira resposta no prazo, geral e por corretor (mesma regra do Início:
 *    `resumirPrazo`, com o fim do mês como "agora");
 *  - funil por etapa: foto do fim do mês dos leads criados no mês (sem histórico
 *    de etapas ainda, item D2 da revisão de 31/10);
 *  - visitas (feitas, agendadas, canceladas), propostas, vendas e valor (valor só
 *    quando o gestor vê receita), perdidos e motivos.
 *
 * Dado pessoal: o e-mail leva só o primeiro nome do corretor. Nada de nome nem
 * telefone de lead.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConfigOpa } from "./config";
import { carregarConfig } from "./config";
import { ROTULO_ORIGEM, primeiroNome } from "./dados";
import { ETAPAS_FINAIS, FUNIS } from "./estrutura";
import { resumirPrazo, type LeadParaPrazo, type RespostaDoLead } from "./inicio";
import { todasAsPaginas } from "./lotes";
import { diaSP, inicioDoDia } from "./periodo";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export interface MesDoRelatorio {
  /** Primeiro instante do mês (ms). */
  de: number;
  /** Primeiro instante do mês seguinte (ms). */
  ate: number;
  /** "outubro de 2026". */
  rotulo: string;
}

/** O mês anterior ao instante `agora`, no fuso de São Paulo. */
export function mesAnterior(agora: number): MesDoRelatorio {
  const [a, m] = diaSP(agora).split("-").map(Number) as [number, number];
  const ano = m === 1 ? a - 1 : a;
  const mes = m === 1 ? 12 : m - 1;
  const doisDigitos = (n: number) => String(n).padStart(2, "0");
  return {
    de: inicioDoDia(`${ano}-${doisDigitos(mes)}-01`),
    ate: inicioDoDia(`${a}-${doisDigitos(m)}-01`),
    rotulo: `${MESES[mes - 1]} de ${ano}`,
  };
}

export interface LeadDoMes {
  id: string;
  criadoEm: number;
  origem: string | null;
  tags: string[];
  donoId: string | null;
  etapa: string | null;
  status: "open" | "won" | "lost";
}

export interface DadosDoMes {
  mes: MesDoRelatorio;
  leads: LeadDoMes[];
  respostas: Map<string, RespostaDoLead>;
  /** Motivo de cada lead perdido no mês (fechado no mês, criado quando for). */
  perdidos: Array<string | null>;
  /** Valor de cada venda fechada no mês, em centavos. */
  vendas: number[];
  visitas: Array<"agendada" | "feita" | "cancelada">;
  /** id -> nome da pessoa da equipe. */
  equipe: Map<string, string>;
  config: Pick<ConfigOpa, "prazos" | "horario">;
  /** Gestor vê receita? (settings.opa.gerente_ve_receita) */
  mostrarValor: boolean;
}

export interface LinhaContagem {
  rotulo: string;
  total: number;
}

export interface LinhaCorretor {
  nome: string;
  leads: number;
  avaliados: number;
  noPrazo: number;
  /** % no prazo, ou null quando ainda não há lead avaliado. */
  pct: number | null;
}

export interface RelatorioMensal {
  mes: string;
  leadsNovos: number;
  porOrigem: LinhaContagem[];
  prazo: { avaliados: number; noPrazo: number; pct: number | null };
  porCorretor: LinhaCorretor[];
  funil: LinhaContagem[];
  visitas: { feitas: number; agendadas: number; canceladas: number };
  propostas: number;
  vendas: { total: number; valorCents: number | null };
  perdidos: { total: number; motivos: LinhaContagem[] };
}

const ETAPAS_DE_PROPOSTA = new Set(["proposta", "negociacao", "fechamento"]);

export function rotuloDaOrigem(l: Pick<LeadDoMes, "origem" | "tags">): string {
  if (l.origem === "meta" || l.tags.includes("pago")) return "Anúncio";
  if (!l.origem) return "Outros";
  return ROTULO_ORIGEM[l.origem] ?? "Outros";
}

function pct(noPrazo: number, avaliados: number): number | null {
  return avaliados > 0 ? Math.round((noPrazo / avaliados) * 100) : null;
}

function contar(itens: string[]): LinhaContagem[] {
  const mapa = new Map<string, number>();
  for (const i of itens) mapa.set(i, (mapa.get(i) ?? 0) + 1);
  return [...mapa.entries()].map(([rotulo, total]) => ({ rotulo, total })).sort((a, b) => b.total - a.total || a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/** Monta o relatório a partir do que já foi lido. Função pura: é o que os testes exercitam. */
export function montarRelatorio(d: DadosDoMes): RelatorioMensal {
  const paraPrazo = (ls: LeadDoMes[]): LeadParaPrazo[] =>
    ls.map((l) => ({ id: l.id, pago: l.origem === "meta" || l.tags.includes("pago"), criadoEm: l.criadoEm }));

  const geral = resumirPrazo(paraPrazo(d.leads), d.respostas, d.config, d.mes.ate);

  const porDono = new Map<string, LeadDoMes[]>();
  for (const l of d.leads) {
    if (!l.donoId) continue;
    porDono.set(l.donoId, [...(porDono.get(l.donoId) ?? []), l]);
  }
  const porCorretor: LinhaCorretor[] = [...porDono.entries()]
    .map(([id, ls]) => {
      const r = resumirPrazo(paraPrazo(ls), d.respostas, d.config, d.mes.ate);
      return { nome: primeiroNome(d.equipe.get(id)) || "Sem nome", leads: ls.length, avaliados: r.avaliados, noPrazo: r.noPrazo, pct: pct(r.noPrazo, r.avaliados) };
    })
    .sort((a, b) => b.leads - a.leads || a.nome.localeCompare(b.nome, "pt-BR"));

  // Funil na ordem das etapas, só as que têm lead.
  const compradores = FUNIS.find((f) => f.slug === "compradores");
  const ordem = [...(compradores?.etapas ?? []), ...ETAPAS_FINAIS].map(([slug, nome]) => ({ slug, nome }));
  const funil = ordem
    .map(({ slug, nome }) => ({ rotulo: nome, total: d.leads.filter((l) => l.etapa === slug).length }))
    .filter((e) => e.total > 0);

  return {
    mes: d.mes.rotulo,
    leadsNovos: d.leads.length,
    porOrigem: contar(d.leads.map(rotuloDaOrigem)),
    prazo: { avaliados: geral.avaliados, noPrazo: geral.noPrazo, pct: pct(geral.noPrazo, geral.avaliados) },
    porCorretor,
    funil,
    visitas: {
      feitas: d.visitas.filter((v) => v === "feita").length,
      agendadas: d.visitas.filter((v) => v === "agendada").length,
      canceladas: d.visitas.filter((v) => v === "cancelada").length,
    },
    propostas: d.leads.filter((l) => l.status === "open" && l.etapa && ETAPAS_DE_PROPOSTA.has(l.etapa)).length,
    vendas: { total: d.vendas.length, valorCents: d.mostrarValor ? d.vendas.reduce((s, v) => s + v, 0) : null },
    perdidos: { total: d.perdidos.length, motivos: contar(d.perdidos.map((m) => m?.trim() || "Sem motivo")) },
  };
}

/** A pessoa saiu do relatório? (user_metadata.emails_opa.relatorio_mensal === false) */
export function querRelatorio(metadata: unknown): boolean {
  const emails = (metadata as { emails_opa?: { relatorio_mensal?: unknown } } | null)?.emails_opa;
  return emails?.relatorio_mensal !== false;
}

/**
 * Lê o mês com o cliente admin. Todo filtro leva a organização: o service role
 * passa por cima do RLS.
 */
export async function carregarDadosDoMes(admin: SupabaseClient, orgId: string, mes: MesDoRelatorio): Promise<DadosDoMes> {
  const de = new Date(mes.de).toISOString();
  const ate = new Date(mes.ate).toISOString();

  const { data: funil, error: erroFunil } = await admin.from("crm_pipelines").select("id").eq("organization_id", orgId).eq("slug", "compradores").maybeSingle();
  if (erroFunil) throw new Error(`relatorio: funil: ${erroFunil.message}`);
  const funilId = (funil as { id: string } | null)?.id;
  const config = await carregarConfig(admin, orgId);
  const { data: org } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const mostrarValor = Boolean((org as { settings: { opa?: { gerente_ve_receita?: boolean } } | null } | null)?.settings?.opa?.gerente_ve_receita);
  const vazio: DadosDoMes = { mes, leads: [], respostas: new Map(), perdidos: [], vendas: [], visitas: [], equipe: new Map(), config, mostrarValor };
  if (!funilId) return vazio;

  const { data: etapas, error: erroEtapas } = await admin.from("crm_stages").select("id, slug").eq("organization_id", orgId).eq("pipeline_id", funilId);
  if (erroEtapas) throw new Error(`relatorio: etapas: ${erroEtapas.message}`);
  const slugDaEtapa = new Map((etapas ?? []).map((e) => [(e as { id: string }).id, (e as { slug: string }).slug]));

  const linhas = (await todasAsPaginas((i, f) =>
    admin
      .from("crm_leads")
      .select("id, source, tags, created_at, owner_user_id, stage_id, status")
      .eq("organization_id", orgId)
      .eq("pipeline_id", funilId)
      .gte("created_at", de)
      .lt("created_at", ate)
      .order("created_at")
      .order("id")
      .range(i, f),
  )) as unknown as Array<{ id: string; source: string | null; tags: string[] | null; created_at: string; owner_user_id: string | null; stage_id: string; status: string }>;

  const leads: LeadDoMes[] = linhas.map((l) => ({
    id: l.id,
    criadoEm: Date.parse(l.created_at),
    origem: l.source,
    tags: l.tags ?? [],
    donoId: l.owner_user_id,
    etapa: slugDaEtapa.get(l.stage_id) ?? null,
    status: l.status === "won" || l.status === "lost" ? l.status : "open",
  }));

  const respostas = new Map<string, RespostaDoLead>();
  for (let i = 0; i < leads.length; i += 500) {
    const lote = leads.slice(i, i + 500).map((l) => l.id);
    const { data, error } = await admin.rpc("fn_opa_resposta_do_lead", { p_org: orgId, p_leads: lote });
    if (error) throw new Error(`relatorio: respostas: ${error.message}`);
    for (const [id, v] of Object.entries((data ?? {}) as Record<string, { inicio: string; resposta: string | null }>)) {
      respostas.set(id, { inicio: Date.parse(v.inicio), resposta: v.resposta ? Date.parse(v.resposta) : null });
    }
  }

  const [fechados, visitas, membros] = await Promise.all([
    admin
      .from("crm_leads")
      .select("status, lost_reason, value_cents, custom_fields")
      .eq("organization_id", orgId)
      .eq("pipeline_id", funilId)
      .in("status", ["won", "lost"])
      .gte("closed_at", de)
      .lt("closed_at", ate),
    admin.from("visitas").select("status").eq("organization_id", orgId).gte("quando", de).lt("quando", ate),
    admin.from("user_organizations").select("user_id").eq("organization_id", orgId).is("revoked_at", null),
  ]);
  if (fechados.error) throw new Error(`relatorio: fechados: ${fechados.error.message}`);
  if (visitas.error) throw new Error(`relatorio: visitas: ${visitas.error.message}`);
  if (membros.error) throw new Error(`relatorio: equipe: ${membros.error.message}`);

  type Fechado = { status: string; lost_reason: string | null; value_cents: number | null; custom_fields: { venda?: { vgv_cents?: number } } | null };
  const linhasFechadas = (fechados.data ?? []) as Fechado[];

  const equipe = new Map<string, string>();
  for (const m of (membros.data ?? []) as Array<{ user_id: string }>) {
    const { data } = await admin.auth.admin.getUserById(m.user_id);
    const nome = (data?.user?.user_metadata as { full_name?: string } | undefined)?.full_name;
    if (nome) equipe.set(m.user_id, nome);
  }

  return {
    mes,
    leads,
    respostas,
    perdidos: linhasFechadas.filter((l) => l.status === "lost").map((l) => l.lost_reason),
    vendas: linhasFechadas.filter((l) => l.status === "won").map((l) => l.custom_fields?.venda?.vgv_cents ?? l.value_cents ?? 0),
    visitas: ((visitas.data ?? []) as Array<{ status: "agendada" | "feita" | "cancelada" }>).map((v) => v.status),
    equipe,
    config,
    mostrarValor,
  };
}

/** Gestores e administradores ativos que não saíram do relatório. */
export async function destinatariosDoRelatorio(admin: SupabaseClient, orgId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("user_organizations")
    .select("user_id, role")
    .eq("organization_id", orgId)
    .is("revoked_at", null)
    .in("role", ["manager", "admin"]);
  if (error) throw new Error(`relatorio: destinatarios: ${error.message}`);
  const emails: string[] = [];
  for (const m of (data ?? []) as Array<{ user_id: string }>) {
    const { data: u } = await admin.auth.admin.getUserById(m.user_id);
    if (u?.user?.email && querRelatorio(u.user.user_metadata)) emails.push(u.user.email);
  }
  return emails;
}
