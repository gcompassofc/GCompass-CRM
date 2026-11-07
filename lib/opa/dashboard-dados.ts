/**
 * Leitura do dashboard da operação (#564). Lê pela sessão (o RLS decide o que a
 * pessoa vê); só os repasses, que o app não lê, vêm pelo cliente admin, e por
 * isso a página só chama isto depois de conferir que é gestor ou administrador.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import { carregarConfig } from "./config";
import { carregarImoveis, chaveOrigem, type OrigemLead } from "./dados";
import { montarDashboard, type Dashboard, type EtapaDash, type LeadDash } from "./dashboard";
import { carregarRespostasDosLeads } from "./inicio";
import { emLotes, todasAsPaginas } from "./lotes";

export interface FunilDash {
  id: string;
  slug: string;
  nome: string;
}

type Linha = {
  id: string;
  title: string;
  status: "open" | "won" | "lost";
  stage_id: string;
  owner_user_id: string | null;
  value_cents: number | null;
  source: string | null;
  tags: string[] | null;
  custom_fields: Record<string, unknown> | null;
  created_at: string;
  closed_at: string | null;
  stage_changed_at: string | null;
  lost_reason: string | null;
  contacts: { name: string | null } | null;
};

const COLUNAS =
  "id, title, status, stage_id, owner_user_id, value_cents, source, tags, custom_fields, created_at, closed_at, stage_changed_at, lost_reason, contacts(name)";

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);

function paraLeadDash(l: Linha): LeadDash {
  const cf = l.custom_fields ?? {};
  const origem = (cf.origem as OrigemLead | undefined) ?? { canal: l.source ?? undefined };
  const venda = cf.venda as { vgv_cents?: number; comissao_cents?: number } | undefined;
  const voltou = cf.voltou as { em?: string } | undefined;
  return {
    id: l.id,
    nome: l.contacts?.name ?? l.title.split(" · ")[0] ?? "Lead",
    donoId: l.owner_user_id,
    etapaId: l.stage_id,
    status: l.status,
    pago: l.source === "meta" || (l.tags ?? []).includes("pago"),
    origem: chaveOrigem(origem),
    anuncio: origem.anuncio ?? null,
    imovel: (cf.imovel_codigo as string | null) ?? null,
    interesse: (cf.imoveis_interesse as string[] | undefined) ?? [],
    criadoEm: Date.parse(l.created_at),
    fechadoEm: ms(l.closed_at),
    etapaDesde: ms(l.stage_changed_at),
    valorCents: l.value_cents,
    vgvCents: venda?.vgv_cents ?? null,
    comissaoOpaCents: venda?.comissao_cents ?? null,
    motivoPerda: l.lost_reason,
    perdidoNaEtapa: (cf.perdido_na_etapa as string | undefined) ?? null,
    voltouEm: ms(voltou?.em),
  };
}

export async function carregarFunis(orgId: string): Promise<FunilDash[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("crm_pipelines").select("id, slug, name").eq("organization_id", orgId).order("created_at");
  if (error) throw new Error(`carregarFunis: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; slug: string; name: string }>).map((f) => ({ id: f.id, slug: f.slug, nome: f.name }));
}

export async function carregarDashboard(
  orgId: string,
  funil: FunilDash,
  periodo: { de: number; ate: number; anterior: { de: number; ate: number } },
  agora = Date.now(),
): Promise<{ dash: Dashboard; leads: Map<string, LeadDash>; etapas: EtapaDash[] }> {
  const supabase = await createClient();
  const desde = new Date(Math.min(periodo.anterior.de, agora - 30 * 86_400_000)).toISOString();
  const ate = new Date(periodo.ate).toISOString();

  const base = () => supabase.from("crm_leads").select(COLUNAS).eq("organization_id", orgId).eq("pipeline_id", funil.id);
  const [criados, abertos, fechados, { data: etapasRaw, error: erroEtapas }, config, imoveis] = await Promise.all([
    todasAsPaginas((de, a) => base().gte("created_at", desde).lt("created_at", ate).order("created_at").order("id").range(de, a)),
    todasAsPaginas((de, a) => base().eq("status", "open").order("created_at").order("id").range(de, a)),
    todasAsPaginas((de, a) => base().gte("closed_at", desde).lt("closed_at", ate).order("closed_at").order("id").range(de, a)),
    supabase.from("crm_stages").select("id, name, slug, position, is_won, is_lost").eq("pipeline_id", funil.id).order("position"),
    carregarConfig(supabase, orgId),
    carregarImoveis(orgId),
  ]);
  if (erroEtapas) throw new Error(`carregarDashboard: ${erroEtapas.message}`);

  const porId = new Map<string, LeadDash>();
  for (const l of [...criados, ...abertos, ...fechados] as unknown as Linha[]) porId.set(l.id, paraLeadDash(l));
  const leads = [...porId.values()];

  const doPeriodo = leads.filter((l) => l.criadoEm >= periodo.anterior.de && l.criadoEm < periodo.ate).map((l) => l.id);
  const respostas = await carregarRespostasDosLeads(orgId, doPeriodo);

  const ids = leads.map((l) => l.id);
  const visitas = await emLotes(ids, (lote) =>
    supabase
      .from("visitas")
      .select("lead_id, status, quando")
      .eq("organization_id", orgId)
      .gte("quando", new Date(periodo.anterior.de).toISOString())
      .lt("quando", ate)
      .in("lead_id", lote),
  );

  // Repasses: a rotina grava em opa_avisos, que o app não lê pela sessão (0119).
  const { data: avisos, error: erroAvisos } = await createAdminClient()
    .from("opa_avisos")
    .select("lead_id, dados, created_at")
    .eq("organization_id", orgId)
    .eq("tipo", "repasse")
    .gte("created_at", new Date(periodo.anterior.de).toISOString())
    .lt("created_at", ate);
  if (erroAvisos) throw new Error(`carregarDashboard (repasses): ${erroAvisos.message}`);

  const etapas: EtapaDash[] = ((etapasRaw ?? []) as Array<{ id: string; name: string; slug: string; position: number; is_won: boolean; is_lost: boolean }>).map((s) => ({
    id: s.id,
    nome: s.name,
    slug: s.slug,
    posicao: Number(s.position),
    ganho: s.is_won,
    perdido: s.is_lost,
  }));

  const dash = montarDashboard({
    periodo,
    agora,
    leads,
    etapas,
    respostas,
    prazos: config.prazos,
    horario: config.horario,
    visitas: (visitas as Array<{ lead_id: string; status: string; quando: string }>).map((v) => ({ leadId: v.lead_id, status: v.status, quando: Date.parse(v.quando) })),
    repasses: ((avisos ?? []) as Array<{ lead_id: string; dados: { de?: string; para?: string } | null; created_at: string }>)
      .filter((a) => porId.has(a.lead_id))
      .map((a) => ({ leadId: a.lead_id, de: a.dados?.de ?? null, para: a.dados?.para ?? null, em: Date.parse(a.created_at) })),
    imoveisAtivos: funil.slug === "compradores" ? imoveis.filter((i) => i.status === "ativo").map((i) => ({ codigo: i.codigo, titulo: i.titulo })) : [],
  });
  return { dash, leads: porId, etapas };
}
