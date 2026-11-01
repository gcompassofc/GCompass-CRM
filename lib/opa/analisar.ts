import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { generateText, Output } from "ai";

import { resolveLanguageModel } from "@/lib/ai/gateway";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { mesclarCampos } from "./campos";
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
        async (args) => {
          // I1: saída estruturada, o provedor devolve o formato do esquema.
          // I2: as instruções (as mesmas em toda leitura, cerca de 2 mil tokens
          // com os 52 bairros) levam ponto de cache; o que muda a cada lead
          // (contexto e conversa) vem depois dele e não entra no cache.
          const r = await generateText({
            model: args.model as never,
            output: Output.object({ schema: args.esquema }),
            messages: [
              { role: "system", content: args.instrucoes, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } },
              { role: "user", content: args.entrada },
            ],
          });
          logger.info("copiloto: leitura da IA", {
            leadId,
            entrada: r.usage?.inputTokens,
            cacheLido: r.usage?.inputTokenDetails?.cacheReadTokens,
            cacheGravado: r.usage?.inputTokenDetails?.cacheWriteTokens,
          });
          return { output: r.output };
        },
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

  // E1: grava só a chave `copiloto` (o objeto inteiro, no lugar do anterior);
  // um "Respondi" ou uma ligação feitos enquanto a IA lia ficam como estão.
  await mesclarCampos(
    supabase,
    leadId,
    {
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
    { orgId },
  );

  return leitura;
}

// ---------------------------------------------------------------- leitura em segundo plano (V1)

/** Espera mínima entre duas tentativas no mesmo lead, na mesma instância do app. */
const ESPERA_ENTRE_LEITURAS_MS = 120_000;
const ultimaTentativa = new Map<string, number>();

/**
 * A ficha abre na hora e a IA lê depois que a resposta saiu (`after()` do
 * Next). `token` é o da sessão de quem abriu a ficha: a leitura segue as mesmas
 * regras de RLS dessa pessoa, sem cliente admin. A trava em memória impede que
 * várias aberturas seguidas da mesma ficha (ou uma leitura que falha) paguem a
 * IA de novo dentro de 2 minutos.
 */
export function precisaLerAgora(leadId: string): boolean {
  const antes = ultimaTentativa.get(leadId) ?? 0;
  return Date.now() - antes > ESPERA_ENTRE_LEITURAS_MS;
}

export async function lerEmSegundoPlano(token: string | undefined, orgId: string, leadId: string): Promise<void> {
  if (!token || !precisaLerAgora(leadId)) return;
  ultimaTentativa.set(leadId, Date.now());
  // A conta é um mapa na memória: tira as entradas velhas para não crescer.
  if (ultimaTentativa.size > 500) {
    for (const [k, t] of ultimaTentativa) if (Date.now() - t > ESPERA_ENTRE_LEITURAS_MS) ultimaTentativa.delete(k);
  }
  try {
    const cliente = createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    await analisarLead(cliente, orgId, leadId);
  } catch (e) {
    logger.warn("copiloto: leitura em segundo plano falhou", { leadId, erro: String(e) });
  }
}
