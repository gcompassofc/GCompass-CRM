/**
 * Banco das Captações do Radar: importar o registro do Radar e ler os cards.
 * Regras e textos em ./radar-captacoes.ts. Quem chama decide o cliente: a
 * importação usa o administrador (o gestor importa para a equipe toda); a leitura
 * da tela usa o cliente da sessão, para o RLS mostrar ao corretor só os dele.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { acharCorretor, type DistribuicaoRadar, type RadarDoCard } from "./radar-captacoes";

export const FONTE_RADAR = "radar";

export interface ResultadoImportacao {
  novos: number;
  atualizados: number;
  /** Distribuições cujo corretor não foi achado na equipe do CRM (nome do Radar). */
  semCorretor: string[];
}

async function funilDeCaptacao(db: SupabaseClient, orgId: string): Promise<{ pipelineId: string; etapaId: string }> {
  const { data: funil, error } = await db.from("crm_pipelines").select("id").eq("organization_id", orgId).eq("slug", "captacao").maybeSingle();
  if (error || !funil) throw new Error("O funil Captação de imóvel não existe nesta conta.");
  const pipelineId = (funil as { id: string }).id;
  const { data: etapa } = await db.from("crm_stages").select("id").eq("organization_id", orgId).eq("pipeline_id", pipelineId).eq("slug", "radar").maybeSingle();
  if (!etapa) throw new Error("A etapa Oportunidade do Radar não existe no funil de captação.");
  return { pipelineId, etapaId: (etapa as { id: string }).id };
}

/**
 * Cria um card por distribuição enviada; a que já existe só tem os dados do
 * anúncio atualizados (etapa, dono, anotações e status ficam como estão).
 * Dono = corretor do Radar achado pelo nome na equipe.
 */
export async function importarDistribuicoes(
  admin: SupabaseClient,
  orgId: string,
  distribuicoes: DistribuicaoRadar[],
  equipe: Array<{ id: string; nome: string }>,
  autorId: string | null,
): Promise<ResultadoImportacao> {
  const r: ResultadoImportacao = { novos: 0, atualizados: 0, semCorretor: [] };
  if (distribuicoes.length === 0) return r;
  const { pipelineId, etapaId } = await funilDeCaptacao(admin, orgId);

  const { data: existentes, error } = await admin
    .from("crm_leads")
    .select("id, external_id, custom_fields")
    .eq("organization_id", orgId)
    .eq("source", FONTE_RADAR)
    .in("external_id", distribuicoes.map((d) => d.radar.dist));
  if (error) throw new Error(`Radar: ${error.message}`);
  const porDist = new Map(((existentes ?? []) as Array<{ id: string; external_id: string; custom_fields: Record<string, unknown> | null }>).map((x) => [x.external_id, x]));

  for (const d of distribuicoes) {
    const ja = porDist.get(d.radar.dist);
    if (ja) {
      const antes = (ja.custom_fields?.radar ?? {}) as Partial<RadarDoCard>;
      // O aviso de chegada não volta a valer numa reimportação.
      const radar = { ...d.radar, avisar_chegada: antes.avisar_chegada ?? false };
      const { error: e } = await admin
        .from("crm_leads")
        .update({ title: d.titulo, custom_fields: { ...(ja.custom_fields ?? {}), radar } })
        .eq("organization_id", orgId)
        .eq("id", ja.id);
      if (e) throw new Error(`Radar ${d.radar.dist}: ${e.message}`);
      r.atualizados++;
      continue;
    }
    const dono = acharCorretor(d.corretor, equipe);
    if (!dono) {
      r.semCorretor.push(`${d.radar.dist} (${d.corretor})`);
      continue;
    }
    const em = d.radar.enviado_em;
    const { error: e } = await admin.from("crm_leads").insert({
      organization_id: orgId,
      pipeline_id: pipelineId,
      stage_id: etapaId,
      contact_id: null,
      title: d.titulo,
      status: "open",
      value_cents: d.radar.preco_anunciado ? Math.round(d.radar.preco_anunciado * 100) : null,
      currency: "BRL",
      owner_user_id: dono,
      owner_kind: "user",
      assigned_at: em,
      created_at: em,
      stage_changed_at: em,
      last_activity_at: em,
      source: FONTE_RADAR,
      external_id: d.radar.dist,
      created_by_user_id: autorId,
      tags: ["radar"],
      custom_fields: {
        radar: d.radar,
        origem: { canal: "radar" },
        // Card do Radar não é cliente esperando resposta: fica fora da fila de atendimento.
        respondido_em: em,
        campos_corretor: { tipo: d.radar.tipo ?? "", bairro: d.radar.bairro ?? "" },
        imoveis_interesse: [],
      },
    });
    if (e) {
      // Outra importação ao mesmo tempo já criou: conta como atualizado.
      if (e.code === "23505") {
        r.atualizados++;
        continue;
      }
      throw new Error(`Radar ${d.radar.dist}: ${e.message}`);
    }
    r.novos++;
  }
  return r;
}

/** Card do Radar como a tela e a rotina usam. */
export interface CardRadar {
  id: string;
  titulo: string;
  status: "open" | "won" | "lost";
  donoId: string | null;
  etapa: { id: string; nome: string; slug: string };
  lostReason: string | null;
  ultimoMovimento: string;
  radar: RadarDoCard;
}

type LinhaCard = {
  id: string;
  title: string;
  status: "open" | "won" | "lost";
  owner_user_id: string | null;
  lost_reason: string | null;
  last_activity_at: string | null;
  created_at: string;
  custom_fields: Record<string, unknown> | null;
  crm_stages: { id: string; name: string; slug: string } | null;
};

export function paraCard(l: LinhaCard): CardRadar | null {
  const radar = l.custom_fields?.radar as RadarDoCard | undefined;
  if (!radar?.dist) return null;
  const ultimo = [radar.enviado_em, l.last_activity_at].filter(Boolean).sort().at(-1) ?? l.created_at;
  return {
    id: l.id,
    titulo: l.title,
    status: l.status,
    donoId: l.owner_user_id,
    etapa: { id: l.crm_stages?.id ?? "", nome: l.crm_stages?.name ?? "", slug: l.crm_stages?.slug ?? "" },
    lostReason: l.lost_reason,
    ultimoMovimento: ultimo,
    radar,
  };
}

/** Todos os cards do Radar visíveis para quem consulta (abertos e encerrados). */
export async function carregarCardsRadar(db: SupabaseClient, orgId: string, opts: { donoId?: string | null; soAbertos?: boolean } = {}): Promise<CardRadar[]> {
  let q = db
    .from("crm_leads")
    .select("id, title, status, owner_user_id, lost_reason, last_activity_at, created_at, custom_fields, crm_stages(id, name, slug)")
    .eq("organization_id", orgId)
    .eq("source", FONTE_RADAR)
    .not("external_id", "is", null);
  if (opts.donoId) q = q.eq("owner_user_id", opts.donoId);
  if (opts.soAbertos) q = q.eq("status", "open");
  const { data, error } = await q.order("created_at", { ascending: false }).limit(1000);
  if (error) throw new Error(`Radar: ${error.message}`);
  return ((data ?? []) as unknown as LinhaCard[]).map(paraCard).filter((c): c is CardRadar => c !== null);
}
