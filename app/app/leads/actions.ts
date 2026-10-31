"use server";

import { revalidatePath } from "next/cache";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { analisarLead } from "@/lib/opa/analisar";
import { carregarConfig } from "@/lib/opa/config";
import { CAMPOS } from "@/lib/opa/copiloto";
import { CAMPOS_DIAGNOSTICO } from "@/lib/opa/dados";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Ações da ficha do lead. Todas usam o cliente da sessão: o RLS decide se a
 * pessoa pode mexer naquele lead (corretor só nos dele, gestor na equipe).
 */

async function contexto() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) throw new Error("Sem organização ativa.");
  return { user, org, supabase: await createClient() };
}

async function gravarCampo(leadId: string, campo: string, valor: string) {
  const { org, supabase } = await contexto();
  const { data: lead } = await supabase
    .from("crm_leads")
    .select("custom_fields")
    .eq("organization_id", org.orgId)
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) throw new Error("Lead não encontrado.");
  const cf = ((lead as { custom_fields: Record<string, unknown> | null }).custom_fields ?? {}) as Record<string, unknown>;
  const opa = { ...((cf.opa as Record<string, string>) ?? {}), [campo]: valor };
  const { error } = await supabase
    .from("crm_leads")
    .update({ custom_fields: { ...cf, opa }, last_activity_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw new Error(error.message);
}

/** Confirma a anotação da IA, com o valor que ela sugeriu ou com o que o corretor corrigiu. */
/**
 * Mensagem de erro que pode ir para a tela: as regras de negócio do banco
 * (trava de etapa, venda) passam; o resto vira frase fixa e o detalhe técnico
 * (nome de tabela, policy, constraint) fica só no log do servidor.
 */
function erroParaTela(error: { code?: string; message: string }): string {
  if (error.code === "P0001" || error.code === "P0002") {
    return error.message.replace("regiao", "região").replace("inegociavel", "inegociável");
  }
  if (error.code === "42501") return "Você não tem permissão para isso.";
  console.error("[leads/actions]", error.code, error.message);
  return "Não deu para salvar. Tente de novo.";
}

export async function confirmarSugestao(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const corrigido = String(formData.get("valor") ?? "").trim();
  const { user, org, supabase } = await contexto();

  const { data } = await supabase
    .from("copiloto_sugestoes")
    .select("id, lead_id, campo, valor")
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return;
  const s = data as { id: string; lead_id: string; campo: string; valor: string };
  const valor = corrigido || s.valor;

  await gravarCampo(s.lead_id, s.campo, valor);
  await supabase
    .from("copiloto_sugestoes")
    .update({ status: "aceita", valor, decidido_por: user.id, decidido_em: new Date().toISOString() })
    .eq("id", s.id);
  revalidatePath(`/app/leads/${s.lead_id}`);
}

export async function descartarSugestao(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const { user, org, supabase } = await contexto();
  const { data } = await supabase
    .from("copiloto_sugestoes")
    .update({ status: "recusada", decidido_por: user.id, decidido_em: new Date().toISOString() })
    .eq("organization_id", org.orgId)
    .eq("id", id)
    .select("lead_id")
    .maybeSingle();
  if (data) revalidatePath(`/app/leads/${(data as { lead_id: string }).lead_id}`);
}

/** Campo preenchido à mão pelo corretor, sem passar pela IA. */
export async function editarCampo(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const campo = String(formData.get("campo") ?? "");
  const valor = String(formData.get("valor") ?? "").trim();
  if (!leadId || !campo) return;
  await gravarCampo(leadId, campo, valor);
  revalidatePath(`/app/leads/${leadId}`);
}

export async function reanalisar(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const { org, supabase } = await contexto();
  // Cada leitura custa IA: um script chamando em loop não pode virar fatura.
  const { data } = await supabase.from("crm_leads").select("custom_fields").eq("id", leadId).maybeSingle();
  const lidoEm = (data as { custom_fields: { copiloto?: { analisado_em?: string } } | null } | null)?.custom_fields?.copiloto?.analisado_em;
  if (!data || (lidoEm && Date.now() - Date.parse(lidoEm) < 60_000)) return;
  await analisarLead(supabase, org.orgId, leadId);
  revalidatePath(`/app/leads/${leadId}`);
}

export type ResultadoEtapa = { ok: true; aviso?: string } | { ok: false; erro: string };

/**
 * Muda a etapa conferindo as travas da OPA no servidor: "Diagnóstico feito"
 * pede finalidade, região, momento e inegociável confirmados.
 */
export async function moverEtapa(formData: FormData): Promise<ResultadoEtapa> {
  const leadId = String(formData.get("leadId") ?? "");
  const etapaId = String(formData.get("etapaId") ?? "");
  const { org, supabase } = await contexto();

  const [{ data: lead }, { data: etapa }] = await Promise.all([
    supabase.from("crm_leads").select("custom_fields, stage_id").eq("organization_id", org.orgId).eq("id", leadId).maybeSingle(),
    supabase.from("crm_stages").select("slug, position, pipeline_id").eq("organization_id", org.orgId).eq("id", etapaId).maybeSingle(),
  ]);
  if (!lead || !etapa) return { ok: false, erro: "Lead ou etapa não encontrados." };

  const campos = (((lead as { custom_fields: Record<string, unknown> | null }).custom_fields ?? {}).opa ?? {}) as Record<string, string>;
  const destino = etapa as { slug: string; position: number };
  const { data: diag } = await supabase
    .from("crm_stages")
    .select("position")
    .eq("organization_id", org.orgId)
    .eq("pipeline_id", (etapa as { pipeline_id: string }).pipeline_id)
    .eq("slug", "diagnostico")
    .maybeSingle();
  const posDiag = (diag as { position: number } | null)?.position;
  const passaDoDiagnostico = posDiag != null && Number(destino.position) >= Number(posDiag) && destino.slug !== "sem-momento" && destino.slug !== "perdido";
  const faltando = CAMPOS_DIAGNOSTICO.filter((k) => !campos[k]);
  if (passaDoDiagnostico && faltando.length > 0) {
    const nomes = faltando.map((k) => CAMPOS[k].rotulo.toLowerCase());
    return { ok: false, erro: `Para avançar, confirme antes: ${nomes.join(", ")}.` };
  }

  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("crm_leads")
    .update({ stage_id: etapaId, stage_changed_at: agora, last_activity_at: agora })
    .eq("id", leadId);
  // A trava do banco (fn_trava_campos_da_etapa) responde com a mesma frase.
  if (error) return { ok: false, erro: erroParaTela(error) };
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath("/app/hoje");
  return { ok: true };
}

/**
 * Ganhar o negócio (protótipo do Kallyl, 29/10/2026): o VGV vem do imóvel
 * vendido, o corretor só confirma. Valor diferente do pedido só com "fechou por
 * outro valor", e o pedido fica registrado ao lado. Ao confirmar: comissão OPA
 * (3% do VGV, bruta), lead ganho na etapa de venda, imóvel como Vendido no
 * acervo e o evento "Venda realizada" na fila do Meta com o valor da comissão.
 * A trava do banco segue valendo: sem diagnóstico completo não ganha.
 */
export async function ganharNegocio(formData: FormData): Promise<ResultadoEtapa> {
  const leadId = String(formData.get("leadId") ?? "");
  const codigo = String(formData.get("imovelCodigo") ?? "");
  const outroValor = formData.get("outroValor") === "on";
  const valorDigitado = Number(String(formData.get("valor") ?? "").replace(/\./g, "").replace(",", ".").replace(/[^\d.]/g, ""));
  const data = String(formData.get("data") ?? "") || new Date().toISOString().slice(0, 10);
  const { org, supabase } = await contexto();
  if (org.role === "viewer") return { ok: false, erro: "Seu acesso é só de leitura." };
  if (!codigo) return { ok: false, erro: "Escolha o imóvel vendido." };
  if (outroValor && !(valorDigitado > 0)) return { ok: false, erro: "Digite o valor da venda." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { ok: false, erro: "Data inválida." };

  // Tudo numa transação no banco (migration 0113): confere quem pode, trava o
  // lead e o imóvel, calcula VGV e comissão pelo preço do acervo (o navegador
  // não manda comissão), marca o imóvel vendido e registra o evento do Meta.
  // Duas abas clicando juntas: a segunda encontra o negócio já encerrado.
  const { error } = await supabase.rpc("fn_opa_ganhar_negocio", {
    p_lead: leadId,
    p_imovel_codigo: codigo,
    p_valor_cents: outroValor ? Math.round(valorDigitado * 100) : null,
    p_data: data,
  });
  if (error) {
    return { ok: false, erro: erroParaTela(error) };
  }

  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath("/app/hoje");
  revalidatePath("/app/imoveis");
  return { ok: true };
}

// ---------------------------------------------------------------- fila, etiquetas, campos, visitas

/** Lê custom_fields do lead (RLS da sessão) e grava o resultado de `muda`. */
async function mudarCampos(leadId: string, muda: (cf: Record<string, unknown>) => Record<string, unknown>) {
  const { org, supabase } = await contexto();
  const { data } = await supabase
    .from("crm_leads")
    .select("custom_fields")
    .eq("organization_id", org.orgId)
    .eq("id", leadId)
    .maybeSingle();
  if (!data) throw new Error("Lead não encontrado.");
  const cf = ((data as { custom_fields: Record<string, unknown> | null }).custom_fields ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("crm_leads")
    .update({ custom_fields: muda(cf), last_activity_at: new Date().toISOString() })
    .eq("id", leadId);
  if (error) throw new Error(error.message);
}

/** "Respondi" da fila: o lead desce para o fim até escrever de novo. */
export async function marcarRespondido(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  await mudarCampos(leadId, (cf) => ({ ...cf, respondido_em: new Date().toISOString() }));
  revalidatePath("/app/fila");
  revalidatePath("/app/hoje");
  revalidatePath(`/app/leads/${leadId}`);
}

export async function alternarEtiqueta(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const grupo = String(formData.get("grupo") ?? "");
  const valor = String(formData.get("valor") ?? "");
  if (!grupo || !valor) return;
  const { org, supabase } = await contexto();
  await mudarCampos(leadId, (cf) => {
    const etiquetas = { ...((cf.etiquetas as Record<string, string[]>) ?? {}) };
    const lista = new Set(etiquetas[grupo] ?? []);
    if (lista.has(valor)) lista.delete(valor);
    else lista.add(valor);
    etiquetas[grupo] = [...lista];
    return { ...cf, etiquetas };
  });
  // Off market também é etiqueta de regra (tags do lead): selo, fila e kit.
  if (grupo === "offmarket") {
    const tag = valor.startsWith("Proprietário") ? "off-market-proprietario" : "off-market-comprador";
    const { data } = await supabase.from("crm_leads").select("tags").eq("organization_id", org.orgId).eq("id", leadId).maybeSingle();
    const tags = new Set(((data as { tags: string[] | null } | null)?.tags ?? []) as string[]);
    if (tags.has(tag)) tags.delete(tag);
    else tags.add(tag);
    await supabase.from("crm_leads").update({ tags: [...tags] }).eq("id", leadId);
  }
  revalidatePath(`/app/leads/${leadId}`);
}

export async function salvarCamposCorretor(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  const campos: Record<string, string> = {};
  for (const [k, v] of formData.entries()) {
    if (k.startsWith("campo:")) campos[k.slice(6)] = String(v).trim();
  }
  await mudarCampos(leadId, (cf) => ({ ...cf, campos_corretor: { ...((cf.campos_corretor as object) ?? {}), ...campos } }));
  revalidatePath(`/app/leads/${leadId}`);
}

export async function alternarLembretes(formData: FormData) {
  const leadId = String(formData.get("leadId") ?? "");
  await mudarCampos(leadId, (cf) => {
    const desligar = cf.lembretes_desligados !== true;
    return { ...cf, lembretes_desligados: desligar, lembretes_desligados_em: desligar ? new Date().toISOString() : null };
  });
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath("/app/lembretes");
}

/**
 * Ficha de visita. "Feita" exige interesse, o que gostou e o que não gostou, e
 * leva o card para Visita realizada; "agendada" leva para Visita agendada.
 */
export async function registrarVisita(formData: FormData): Promise<ResultadoEtapa> {
  const leadId = String(formData.get("leadId") ?? "");
  const status = formData.get("status") === "agendada" ? "agendada" : "feita";
  const quando = String(formData.get("quando") ?? "");
  const interesse = Number(formData.get("interesse") ?? 0) || null;
  const gostou = String(formData.get("gostou") ?? "").trim();
  const naoGostou = String(formData.get("nao_gostou") ?? "").trim();
  if (!quando) return { ok: false, erro: "Informe a data e a hora." };
  // O campo datetime-local vem sem fuso: é hora de Ilhabela (no servidor em UTC
  // a visita ficaria 3 horas adiantada).
  const quandoIso = /([zZ]|[+-]\d\d:\d\d)$/.test(quando) ? quando : `${quando.length === 16 ? `${quando}:00` : quando}-03:00`;
  const quandoMs = Date.parse(quandoIso);
  if (Number.isNaN(quandoMs)) return { ok: false, erro: "Data inválida." };
  if (status === "feita" && quandoMs > Date.now() + 10 * 60_000) {
    return { ok: false, erro: "Visita feita não fica no futuro. Para depois, use Agendar visita." };
  }
  if (quandoMs < Date.now() - 90 * 86_400_000) return { ok: false, erro: "Visita de mais de 90 dias atrás não entra." };
  // Regra do Painel: telefone não vai no texto da ficha (o contato já está no lead).
  const comTelefone = ["quem", "gostou", "nao_gostou", "objecao", "obs"].some((k) =>
    /(?:\+?\d[\s().-]?){10,}/.test(String(formData.get(k) ?? "")),
  );
  if (comTelefone) return { ok: false, erro: "Tire o telefone do texto: o contato do cliente já fica no lead." };
  if (status === "feita" && (!interesse || !gostou || !naoGostou)) {
    return { ok: false, erro: "Visita feita pede o interesse, o que gostou e o que não gostou." };
  }
  const { user, org, supabase } = await contexto();
  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id, pipeline_id")
    .eq("organization_id", org.orgId)
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, erro: "Lead não encontrado." };

  const { error } = await supabase.from("visitas").insert({
    organization_id: org.orgId,
    lead_id: leadId,
    imovel_codigo: String(formData.get("imovel") ?? "") || null,
    status,
    quando: new Date(quandoMs).toISOString(),
    quem: String(formData.get("quem") ?? "") || null,
    chegada: String(formData.get("chegada") ?? "") || null,
    interesse,
    gostou: gostou || null,
    nao_gostou: naoGostou || null,
    objecao: String(formData.get("objecao") ?? "") || null,
    proximo_passo: String(formData.get("proximo") ?? "") || null,
    observacoes: String(formData.get("obs") ?? "") || null,
    registrada_por: user.id,
  });
  if (error) return { ok: false, erro: erroParaTela(error) };

  const slug = status === "agendada" ? "visita-agendada" : "visita-realizada";
  const { data: etapa } = await supabase
    .from("crm_stages")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("pipeline_id", (lead as { pipeline_id: string }).pipeline_id)
    .eq("slug", slug)
    .maybeSingle();
  let aviso: string | undefined;
  if (etapa) {
    const fd = new FormData();
    fd.set("leadId", leadId);
    fd.set("etapaId", (etapa as { id: string }).id);
    const r = await moverEtapa(fd);
    // A visita fica registrada mesmo se a trava da etapa barrar a mudança.
    if (!r.ok) aviso = r.erro;
  }
  revalidatePath(`/app/leads/${leadId}`);
  return aviso ? { ok: true, aviso: `Visita registrada. A etapa não mudou: ${aviso}` } : { ok: true };
}

/** "Agendar mensagem": fica na fila do OPA Lembretes para o corretor dono do lead. */
export async function agendarMensagem(formData: FormData): Promise<ResultadoEtapa> {
  const leadId = String(formData.get("leadId") ?? "") || null;
  const quando = String(formData.get("quando") ?? "");
  const mensagem = String(formData.get("mensagem") ?? "").trim();
  if (!quando || !mensagem) return { ok: false, erro: "Informe quando e a mensagem." };
  // O campo do navegador vem sem fuso ("2026-10-31T18:00"): é hora de Ilhabela.
  // Sem isto, com o servidor em UTC, a mensagem saía 3 h deslocada.
  const quandoMs = Date.parse(/[zZ]|[+-]\d{2}:?\d{2}$/.test(quando) ? quando : `${quando}-03:00`);
  if (Number.isNaN(quandoMs)) return { ok: false, erro: "Data inválida." };
  if (quandoMs < Date.now() - 60_000) return { ok: false, erro: "Escolha um horário no futuro." };
  const { user, org, supabase } = await contexto();
  let dono: string | null = user.id;
  if (leadId) {
    const { data } = await supabase.from("crm_leads").select("owner_user_id").eq("organization_id", org.orgId).eq("id", leadId).maybeSingle();
    if (!data) return { ok: false, erro: "Lead não encontrado." };
    dono = (data as { owner_user_id: string | null }).owner_user_id ?? user.id;
  }
  const { error } = await supabase.from("lembretes_agendados").insert({
    organization_id: org.orgId,
    lead_id: leadId,
    para_user_id: dono,
    quando: new Date(quandoMs).toISOString(),
    mensagem,
    origem: "manual",
    criado_por: user.id,
  });
  if (error) return { ok: false, erro: erroParaTela(error) };
  if (leadId) revalidatePath(`/app/leads/${leadId}`);
  revalidatePath("/app/lembretes");
  return { ok: true };
}

/** Perder o negócio com o motivo (Configurações > Motivos de perda). O card sai do quadro. */
export async function perderNegocio(formData: FormData): Promise<ResultadoEtapa> {
  const leadId = String(formData.get("leadId") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();
  if (!motivo) return { ok: false, erro: "Escolha o motivo." };
  const { org, supabase } = await contexto();
  const { data: lead } = await supabase
    .from("crm_leads")
    .select("pipeline_id")
    .eq("organization_id", org.orgId)
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, erro: "Lead não encontrado." };
  const pipelineId = (lead as { pipeline_id: string }).pipeline_id;

  // A base só aceita motivo cadastrado no funil (fn_validate_lost_reason_required).
  // Os motivos moram em Configurações > Motivos de perda: sincroniza antes de gravar.
  const admin = createAdminClient();
  const config = await carregarConfig(admin, org.orgId);
  if (!config.motivos_perda.some((m) => m.motivo === motivo)) return { ok: false, erro: "Motivo fora da lista de Configurações." };
  const { data: funil } = await admin.from("crm_pipelines").select("settings").eq("id", pipelineId).eq("organization_id", org.orgId).single();
  const settings = ((funil as { settings: Record<string, unknown> | null }).settings ?? {}) as Record<string, unknown>;
  const atuais = new Set((settings.lost_reasons as string[] | undefined) ?? []);
  if (!atuais.has(motivo)) {
    await admin.rpc("fn_opa_garantir_motivos", { p_pipeline: pipelineId, p_motivos: config.motivos_perda.map((m) => m.motivo) });
  }

  const { data: etapa } = await supabase
    .from("crm_stages")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("pipeline_id", pipelineId)
    .eq("is_lost", true)
    .limit(1)
    .maybeSingle();
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("crm_leads")
    .update({
      status: "lost",
      lost_reason: motivo,
      closed_at: agora,
      last_activity_at: agora,
      ...(etapa ? { stage_id: (etapa as { id: string }).id, stage_changed_at: agora } : {}),
    })
    .eq("id", leadId);
  if (error) return { ok: false, erro: erroParaTela(error) };
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath("/app/pipeline");
  revalidatePath("/app/hoje");
  return { ok: true };
}

// ---------------------------------------------------------------- ligação

export type ResultadoLigacao = "atendeu" | "nao_atendeu" | "retorno";

const ROTULO_LIGACAO: Record<ResultadoLigacao, string> = {
  atendeu: "atendeu",
  nao_atendeu: "não atendeu",
  retorno: "pediu retorno",
};

/**
 * Ligação em um toque. Pela regra de distribuição da OPA, ligação registrada no
 * card conta como contato: para o relógio da primeira resposta, como o
 * "Respondi" da fila. Tentativa sem resposta fica contada no lead.
 */
export async function registrarLigacao(leadId: string, resultado: ResultadoLigacao): Promise<{ ok: boolean; erro?: string }> {
  const { user, org, supabase } = await contexto();
  if (org.role === "viewer") return { ok: false, erro: "Seu acesso é só de leitura." };
  if (!Object.hasOwn(ROTULO_LIGACAO, resultado)) return { ok: false, erro: "Resultado inválido." };
  const { data: lead } = await supabase
    .from("crm_leads")
    .select("id, contact_id")
    .eq("organization_id", org.orgId)
    .eq("id", leadId)
    .maybeSingle();
  if (!lead) return { ok: false, erro: "Lead não encontrado." };

  const agora = new Date().toISOString();
  const { error } = await supabase.from("crm_lead_activities").insert({
    organization_id: org.orgId,
    lead_id: leadId,
    contact_id: (lead as { contact_id: string | null }).contact_id,
    source_module: "opa",
    type: "ligacao",
    payload: { resultado },
    performed_at: agora,
    performed_by_user_id: user.id,
    actor_kind: "user",
  });
  if (error) return { ok: false, erro: erroParaTela(error) };

  await mudarCampos(leadId, (cf) => ({
    ...cf,
    respondido_em: agora,
    ultima_ligacao: { em: agora, resultado },
    tentativas_ligacao: resultado === "nao_atendeu" ? (Number(cf.tentativas_ligacao) || 0) + 1 : 0,
  }));
  revalidatePath("/app/fila");
  revalidatePath("/app/hoje");
  revalidatePath(`/app/leads/${leadId}`);
  return { ok: true };
}
