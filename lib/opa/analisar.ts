import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "ai";

import { resolveLanguageModel } from "@/lib/ai/gateway";
import { logger } from "@/lib/logger";

import { analisarComIA, analisarPorRegras, CAMPOS, type CampoCopiloto, type ContextoLeitura, type Leitura, type MensagemLida } from "./copiloto";
import { ROTULO_ORIGEM } from "./dados";
import { precoCurto } from "./imoveis";

/** Modelo do copiloto: leitura curta e estruturada, então o Haiku dá conta. */
export const MODELO_COPILOTO = "anthropic/claude-haiku-5-5";

/**
 * Lê a conversa do lead e grava o que a IA anotou como sugestão pendente.
 * Na ficha roda com o cliente da sessão (só analisa lead que a pessoa vê);
 * na rotina de fundo, com o cliente admin, sempre filtrado pela org.
 *
 * O que o corretor já confirmou com o mesmo valor não volta como sugestão; o
 * que mudou na conversa volta, para ele decidir se troca.
 */
export async function analisarLead(supabase: SupabaseClient, orgId: string, leadId: string): Promise<Leitura | null> {
  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id, contact_id, value_cents, source, custom_fields, contacts(name), crm_stages(name)")
    .eq("organization_id", orgId)
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return null;
  const l = lead as unknown as {
    id: string;
    contact_id: string;
    value_cents: number | null;
    source: string | null;
    custom_fields: Record<string, unknown> | null;
    contacts: { name: string | null } | null;
    crm_stages: { name: string } | null;
  };
  const cf = l.custom_fields ?? {};
  const confirmados = (cf.opa as Record<string, string>) ?? {};

  const { data: conversa } = await supabase
    .from("conversations")
    .select("id")
    .eq("organization_id", orgId)
    .eq("contact_id", l.contact_id)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let mensagens: MensagemLida[] = [];
  if (conversa) {
    const { data } = await supabase
      .from("messages")
      .select("direction, body, sent_at, type")
      .eq("conversation_id", (conversa as { id: string }).id)
      // As 200 mais RECENTES, em ordem cronológica: em conversa longa a IA lia
      // só o começo e o rascunho respondia a uma mensagem velha.
      .order("sent_at", { ascending: false })
      .limit(200);
    mensagens = ((data ?? []) as MensagemLida[]).reverse();
  }

  let imovelTitulo: string | undefined;
  let imovel: ContextoLeitura["imovel"] = null;
  if (cf.imovel_codigo) {
    const { data: im } = await supabase
      .from("imoveis")
      .select(
        "codigo, titulo, bairro, regiao, preco_venda_cents, dormitorios, suites, vagas, area_m2, area_terreno_m2, caracteristicas, descricao, off_market",
      )
      .eq("organization_id", orgId)
      .eq("codigo", cf.imovel_codigo as string)
      .maybeSingle();
    if (im) {
      const i = im as {
        codigo: string;
        titulo: string;
        bairro: string | null;
        regiao: string | null;
        preco_venda_cents: number | null;
        dormitorios: number | null;
        suites: number | null;
        vagas: number | null;
        area_m2: number | null;
        area_terreno_m2: number | null;
        caracteristicas: string[] | null;
        descricao: string | null;
        off_market: boolean;
      };
      imovelTitulo = i.titulo;
      const { preco_venda_cents: precoCents, caracteristicas, ...resto } = i;
      imovel = { ...resto, preco: precoCents ? precoCurto(precoCents) : null, caracteristicas: caracteristicas ?? [] };
    }
  }

  // Contexto do CRM para a IA (fonte da verdade sobre o imóvel e o que já foi confirmado).
  const origem = (cf.origem as { canal?: string; campanha?: string | null } | undefined) ?? { canal: l.source ?? undefined };
  const confirmadosValidos = Object.fromEntries(
    Object.entries(confirmados).filter(([k, v]) => Object.hasOwn(CAMPOS, k) && typeof v === "string" && v),
  ) as Partial<Record<CampoCopiloto, string>>;
  const contexto: ContextoLeitura = {
    hoje: new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date()),
    etapa: l.crm_stages?.name,
    origem: [ROTULO_ORIGEM[origem.canal ?? ""] ?? origem.canal, origem.campanha].filter(Boolean).join(", campanha ") || undefined,
    confirmados: confirmadosValidos,
    imovel,
  };

  let leitura: Leitura | null = null;
  const modelo = resolveLanguageModel(MODELO_COPILOTO);
  if (modelo) {
    try {
      leitura = await analisarComIA(
        mensagens,
        modelo,
        (args) => generateText({ model: args.model as never, system: args.system, prompt: args.prompt }),
        contexto,
      );
    } catch (e) {
      logger.warn("copiloto: IA falhou, seguindo pelas regras", { leadId, erro: String(e) });
    }
  }
  leitura ??= analisarPorRegras(mensagens, {
    nomeLead: l.contacts?.name ?? undefined,
    imovelTitulo,
    imovelValor: l.value_cents ? l.value_cents / 100 : null,
  });

  const novas = leitura.sugestoes.filter((s) => confirmados[s.campo] !== s.valor);

  await supabase
    .from("copiloto_sugestoes")
    .delete()
    .eq("organization_id", orgId)
    .eq("lead_id", leadId)
    .eq("status", "pendente");
  if (novas.length > 0) {
    const { error } = await supabase.from("copiloto_sugestoes").insert(
      novas.map((s) => ({
        organization_id: orgId,
        lead_id: leadId,
        campo: s.campo,
        valor: s.valor,
        evidencia: s.evidencia,
        confianca: s.confianca,
        origem: leitura!.motor,
      })),
    );
    if (error) logger.warn("copiloto: falha ao gravar sugestões", { leadId, erro: error.message });
  }

  await supabase
    .from("crm_leads")
    .update({
      custom_fields: {
        ...cf,
        copiloto: {
          resumo: leitura.resumo,
          proximoPasso: leitura.proximoPasso,
          temperatura: leitura.temperatura,
          motor: leitura.motor,
          analisado_em: new Date().toISOString(),
          // Rascunho vale só para a última mensagem do lead que ele respondeu.
          mensagem: leitura.mensagem || undefined,
          respondendo_a: [...mensagens].reverse().find((m) => m.direction === "inbound")?.sent_at,
          objecoes: leitura.objecoes?.length ? leitura.objecoes : undefined,
        },
      },
    })
    .eq("organization_id", orgId)
    .eq("id", leadId);

  return leitura;
}
