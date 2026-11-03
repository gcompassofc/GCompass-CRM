"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { avisarMudancaDeEtapa } from "@/lib/opa/eventos-lead";
import { normalizarWhatsapp } from "@/lib/auth/segundo-fator";
import { aplicarDecisao, chatDoContato, numeroDoCorretor, sessaoPorId } from "@/lib/waha/contatos-pessoais";
import { MOTIVO_PESSOAL } from "@/lib/opa/contatos-whatsapp";

/**
 * Lead que era contato pessoal, e o caminho de volta (pedido do Allyson, 03/11/2026).
 *
 * "Contato pessoal" aplica a mesma decisão do botão "Pessoal" dos contatos novos
 * (aplicarDecisao): a conversa guardada sai do CRM, a IA para de ler e a conversa
 * ganha a etiqueta "Pessoal" no WhatsApp Business. O lead não se apaga (exclusão é
 * só do administrador): é encerrado como perdido com o motivo "Contato pessoal",
 * e sai da Fila, do Início e dos funis abertos.
 *
 * "Voltar a ser lead" desfaz: reabre na primeira etapa, marca o contato como lead
 * e põe a etiqueta "Lead OPA". O que foi apagado da conversa não volta.
 */
type Resultado = { ok: true } | { ok: false; erro: string };

async function contexto(leadId: string) {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { erro: "Sem empresa ativa." } as const;
  const admin = createAdminClient();
  const { data } = await admin
    .from("crm_leads")
    .select("id, owner_user_id, contact_id, pipeline_id, stage_id, status, lost_reason")
    .eq("organization_id", org.orgId)
    .eq("id", leadId)
    .maybeSingle();
  const lead = data as {
    id: string;
    owner_user_id: string | null;
    contact_id: string | null;
    pipeline_id: string;
    stage_id: string;
    status: string;
    lost_reason: string | null;
  } | null;
  if (!lead) return { erro: "Lead não encontrado." } as const;
  const gestor = user.is_platform_admin || org.role === "manager" || org.role === "admin";
  if (!gestor && lead.owner_user_id !== user.id) return { erro: "Só o corretor do lead ou o gestor pode fazer isso." } as const;
  if (org.role === "viewer") return { erro: "Seu acesso é só de leitura." } as const;
  return { user, org, admin, lead } as const;
}

/** A conversa de WhatsApp do lead: o número do dono do lead primeiro. */
async function conversaDoLead(
  admin: ReturnType<typeof createAdminClient>,
  orgId: string,
  lead: { contact_id: string | null; owner_user_id: string | null },
) {
  if (!lead.contact_id) return null;
  const { data: contato } = await admin
    .from("contacts")
    .select("wa_identity")
    .eq("organization_id", orgId)
    .eq("id", lead.contact_id)
    .maybeSingle();
  const chatId = chatDoContato((contato as { wa_identity: string | null } | null)?.wa_identity);
  if (!chatId) return null;
  const { data: conversas } = await admin
    .from("conversations")
    .select("channel_session_id")
    .eq("organization_id", orgId)
    .eq("contact_id", lead.contact_id);
  const ids = [...new Set(((conversas ?? []) as Array<{ channel_session_id: string | null }>).map((c) => c.channel_session_id).filter(Boolean))] as string[];
  const sessoes = (await Promise.all(ids.map((id) => sessaoPorId(admin, orgId, id)))).filter((s) => s !== null);
  const sessao = sessoes.find((s) => s.owner_user_id === lead.owner_user_id) ?? sessoes[0] ?? null;
  return sessao ? { sessao, chatId } : null;
}

export async function marcarLeadComoPessoal(leadId: string): Promise<Resultado> {
  const c = await contexto(leadId);
  if ("erro" in c) return { ok: false, erro: c.erro! };
  const { admin, org, user, lead } = c;
  if (lead.status !== "open") return { ok: false, erro: "Este lead já está encerrado." };

  const conversa = await conversaDoLead(admin, org.orgId, lead);
  if (conversa) {
    await aplicarDecisao(admin, conversa.sessao, conversa.chatId, "pessoal", {
      origem: "corretor",
      porUserId: user.id,
      requestId: randomUUID(),
    });
  }

  // Encerra como perdido, com o motivo cadastrado no funil (a base só aceita motivo da lista).
  await admin.rpc("fn_opa_garantir_motivos", { p_pipeline: lead.pipeline_id, p_motivos: [MOTIVO_PESSOAL] });
  const { data: etapa } = await admin
    .from("crm_stages")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("pipeline_id", lead.pipeline_id)
    .eq("is_lost", true)
    .limit(1)
    .maybeSingle();
  const agora = new Date().toISOString();
  const { error } = await admin
    .from("crm_leads")
    .update({
      status: "lost",
      lost_reason: MOTIVO_PESSOAL,
      closed_at: agora,
      last_activity_at: agora,
      ...(etapa ? { stage_id: (etapa as { id: string }).id, stage_changed_at: agora } : {}),
    })
    .eq("organization_id", org.orgId)
    .eq("id", leadId)
    .eq("status", "open");
  if (error) return { ok: false, erro: "Não consegui encerrar o lead. Tente de novo." };

  if (!conversa) {
    // Sem conversa de WhatsApp no CRM, o registro da decisão fica só aqui.
    await admin.from("crm_lead_activities").insert({
      organization_id: org.orgId,
      lead_id: leadId,
      contact_id: lead.contact_id,
      source_module: "opa",
      type: "contato_pessoal",
      payload: {},
      performed_at: agora,
      performed_by_user_id: user.id,
      reason: "Marcado como contato pessoal: o lead foi encerrado.",
    });
  }
  await avisarMudancaDeEtapa(admin, org.orgId, leadId, lead.stage_id, "opa.pessoal");
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath("/app/hoje");
  revalidatePath("/app/fila");
  revalidatePath("/app/pipeline");
  return { ok: true };
}

export async function voltarParaLead(leadId: string): Promise<Resultado> {
  const c = await contexto(leadId);
  if ("erro" in c) return { ok: false, erro: c.erro! };
  const { admin, org, user, lead } = c;
  if (lead.status !== "lost" || lead.lost_reason !== MOTIVO_PESSOAL) {
    return { ok: false, erro: "Só volta a ser lead quem foi marcado como contato pessoal." };
  }
  const { data: etapa } = await admin
    .from("crm_stages")
    .select("id")
    .eq("organization_id", org.orgId)
    .eq("pipeline_id", lead.pipeline_id)
    .eq("is_won", false)
    .eq("is_lost", false)
    .order("position", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!etapa) return { ok: false, erro: "O funil deste lead não tem etapa aberta." };
  const agora = new Date().toISOString();
  const { error } = await admin
    .from("crm_leads")
    .update({
      status: "open",
      lost_reason: null,
      closed_at: null,
      last_activity_at: agora,
      stage_id: (etapa as { id: string }).id,
      stage_changed_at: agora,
    })
    .eq("organization_id", org.orgId)
    .eq("id", leadId);
  if (error) return { ok: false, erro: "Não consegui reabrir o lead. Tente de novo." };
  await admin.from("crm_lead_activities").insert({
    organization_id: org.orgId,
    lead_id: leadId,
    contact_id: lead.contact_id,
    source_module: "opa",
    type: "reaberto",
    payload: { motivo_da_perda: MOTIVO_PESSOAL },
    performed_at: agora,
    performed_by_user_id: user.id,
  });

  // Lead aberto antes da decisão: o registrarLeadDoContato acha este e não cria outro.
  const conversa = await conversaDoLead(admin, org.orgId, lead);
  if (conversa) {
    await aplicarDecisao(admin, conversa.sessao, conversa.chatId, "lead", {
      origem: "corretor",
      porUserId: user.id,
      requestId: randomUUID(),
    });
  }
  await avisarMudancaDeEtapa(admin, org.orgId, leadId, lead.stage_id, "opa.voltou_a_lead");
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath("/app/hoje");
  revalidatePath("/app/fila");
  revalidatePath("/app/pipeline");
  return { ok: true };
}

/**
 * Contato pessoal que não está no CRM (o CRM não guarda nada dele): o corretor
 * digita o número e ele vira lead no próprio número, como a etiqueta "Lead OPA".
 */
export async function numeroViraLead(numero: string): Promise<Resultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sem empresa ativa." };
  if (org.role === "viewer") return { ok: false, erro: "Seu acesso é só de leitura." };
  const digitos = normalizarWhatsapp(numero);
  if (!digitos) return { ok: false, erro: "Número inválido. Use DDD + número." };
  const admin = createAdminClient();
  const sessao = await numeroDoCorretor(admin, org.orgId, user.id);
  if (!sessao) return { ok: false, erro: "Seu WhatsApp não está conectado no CRM." };
  await aplicarDecisao(admin, sessao, `${digitos}@c.us`, "lead", {
    origem: "corretor",
    porUserId: user.id,
    requestId: randomUUID(),
  });
  revalidatePath("/app/hoje");
  revalidatePath("/app/leads");
  revalidatePath("/app/meu-whatsapp");
  return { ok: true };
}
