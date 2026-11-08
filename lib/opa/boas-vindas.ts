/**
 * Boas-vindas ao lead de formulário, pelo WhatsApp do corretor da vez (#498).
 * Especificação: opa/Tracking/37-boas-vindas-pelo-numero-do-corretor.md.
 *
 * Regra em uma frase: o lead cai, a roleta escolhe, e o número DESSE corretor
 * manda a mensagem assinada com o nome dele. Nunca por outro número: sem a
 * conexão do dono, não manda e grava o motivo no histórico do lead.
 *
 * A mensagem sai marcada (`metadata.boas_vindas`) e o lead guarda a hora em
 * `custom_fields.boas_vindas`: ela não conta como primeira resposta e não para
 * o prazo de 1 h (lib/opa/atendimento.ts, migration 0130).
 *
 * Melhor esforço: roda depois de a porta responder ao painel e nunca lança.
 */
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { ensureConversation } from "@/lib/automation/start-conversation";
import { NUMERO_SEM_WHATSAPP } from "@/lib/messaging/sem-whatsapp";
import type { createAdminClient } from "@/lib/supabase/admin";

import { montarBoasVindas } from "./boas-vindas-texto";
import { mesclarCampos } from "./campos";
import { carregarConfig } from "./config";
import { entregarConversaAoDono } from "./conversa-do-lead";

type Admin = ReturnType<typeof createAdminClient>;

export type ResultadoBoasVindas =
  | { enviada: true; corretor: string }
  | { enviada: false; motivo: string; registrar: boolean };

async function nomeDaPessoa(admin: Admin, userId: string): Promise<string> {
  const { data } = await admin.auth.admin.getUserById(userId);
  const u = data?.user;
  return ((u?.user_metadata?.full_name as string | undefined) ?? u?.email?.split("@")[0] ?? "").trim();
}

async function registrar(admin: Admin, orgId: string, leadId: string, contactId: string | null, tipo: string, reason: string, payload: Record<string, unknown>) {
  const { error } = await admin.from("crm_lead_activities").insert({
    organization_id: orgId,
    lead_id: leadId,
    contact_id: contactId,
    source_module: "opa",
    type: tipo,
    payload,
    actor_kind: "system",
    reason,
  });
  if (error) console.error("[opa.boas-vindas] atividade", error.message);
}

export async function enviarBoasVindas(admin: Admin, orgId: string, leadId: string): Promise<ResultadoBoasVindas> {
  const config = await carregarConfig(admin, orgId);
  if (!config.boas_vindas.ligada) return { enviada: false, motivo: "desligada em Configurações", registrar: false };

  const { data } = await admin
    .from("crm_leads")
    .select("id, status, owner_user_id, contact_id, tags, custom_fields, contacts(name, phone_number)")
    .eq("organization_id", orgId)
    .eq("id", leadId)
    .maybeSingle();
  const lead = data as unknown as {
    status: string;
    owner_user_id: string | null;
    contact_id: string;
    tags: string[] | null;
    custom_fields: Record<string, unknown> | null;
    contacts: { name: string | null; phone_number: string | null } | null;
  } | null;
  if (!lead || lead.status !== "open" || !lead.owner_user_id) return { enviada: false, motivo: "lead sem dono", registrar: false };
  const cf = lead.custom_fields ?? {};
  if (cf.boas_vindas) return { enviada: false, motivo: "já enviada", registrar: false };
  if ((lead.tags ?? []).includes("particular")) return { enviada: false, motivo: "contato particular", registrar: false };

  const dono = lead.owner_user_id;
  // Assinatura escolhida em Configurações (Paulo Martin assina "Martin"); sem ela, o primeiro nome do perfil.
  const corretor = config.boas_vindas.assinaturas[dono]?.trim() || (await nomeDaPessoa(admin, dono)) || "corretor";
  const primeiro = corretor.split(/\s+/)[0]!;
  const falhou = async (motivo: string, registrarNoLead = true): Promise<ResultadoBoasVindas> => {
    if (registrarNoLead) {
      await registrar(admin, orgId, leadId, lead.contact_id, "boas_vindas_nao_enviada", `Boas-vindas não enviada: ${motivo}.`, { motivo, corretor: primeiro });
    }
    return { enviada: false, motivo, registrar: registrarNoLead };
  };

  // O número do dono, e só ele. O OPA Lembretes nunca fala com cliente.
  const { data: sessoes } = await admin
    .from("channel_sessions")
    .select("id, status, waha_session_name")
    .eq("organization_id", orgId)
    .eq("owner_user_id", dono)
    .is("archived_at", null);
  const lista = ((sessoes ?? []) as Array<{ id: string; status: string | null; waha_session_name: string | null }>).filter(
    (s) => s.waha_session_name !== "opa-lembretes",
  );
  if (!lista.length) return falhou(`${primeiro} não tem WhatsApp conectado no CRM`);
  const sessao = lista.find((s) => String(s.status ?? "").toUpperCase() === "WORKING");
  if (!sessao) return falhou(`WhatsApp de ${primeiro} desconectado`);
  if (!lead.contacts?.phone_number) return falhou("contato sem telefone");

  // Já conversa com esse corretor (chamou direto no WhatsApp): não repete.
  const { data: jaTem } = await admin
    .from("conversations")
    .select("id, last_message_at")
    .eq("organization_id", orgId)
    .eq("contact_id", lead.contact_id)
    .eq("channel_session_id", sessao.id)
    .not("last_message_at", "is", null)
    .limit(1)
    .maybeSingle();
  if (jaTem) return falhou(`o contato já conversa com ${primeiro}`, false);

  const codigo = (cf.imovel_codigo as string | null) ?? null;
  let publicado = true;
  if (codigo) {
    const { data: im } = await admin.from("imoveis").select("status").eq("organization_id", orgId).eq("codigo", codigo).maybeSingle();
    publicado = !im || (im as { status: string | null }).status === "ativo";
  }
  const canal = (cf.origem as { canal?: string } | undefined)?.canal === "site" ? "site" : "meta";
  const texto = montarBoasVindas({
    modelo: config.boas_vindas.modelo,
    nomeLead: lead.contacts?.name,
    corretor,
    imovelCodigo: codigo,
    canal,
    publicado,
  });

  const conversaId = await ensureConversation(admin as never, orgId, lead.contact_id, sessao.id);
  await entregarConversaAoDono(admin, orgId, conversaId, dono);

  // Reserva antes de mandar: se a porta receber o mesmo lead de novo no meio, não sai em dobro.
  const em = new Date().toISOString();
  await mesclarCampos(admin, leadId, { boas_vindas: { em, por: dono, status: "enviando" } }, { orgId });

  let status = "failed";
  let erro: string | null = null;
  let codigoErro: string | null = null;
  try {
    const msg = await sendMessageHandler(
      admin as never,
      { organization_id: orgId, requestId: `boas-vindas:${leadId}`, actor: { type: "user", id: dono } },
      { conversation_id: conversaId, type: "text", body: texto, metadata: { boas_vindas: true, lead_id: leadId } },
    );
    status = msg.status;
    erro = msg.error_message ?? null;
    codigoErro = msg.error_code ?? null;
  } catch (e) {
    erro = e instanceof Error ? e.message : String(e);
  }

  if (status !== "sent") {
    if (codigoErro === NUMERO_SEM_WHATSAPP) {
      await mesclarCampos(admin, leadId, { boas_vindas: { em, por: dono, status: "sem_whatsapp", erro: NUMERO_SEM_WHATSAPP } }, { orgId });
      return falhou(`o número do lead não tem WhatsApp. Ligue ou mande e-mail`);
    }
    await mesclarCampos(admin, leadId, { boas_vindas: { em, por: dono, status: "falhou", erro } }, { orgId });
    return falhou(`o WhatsApp de ${primeiro} não confirmou o envio${erro ? ` (${erro.slice(0, 120)})` : ""}`);
  }
  const enviadaEm = new Date().toISOString();
  await mesclarCampos(admin, leadId, { boas_vindas: { em: enviadaEm, por: dono, status: "enviada" } }, { orgId });
  await registrar(admin, orgId, leadId, lead.contact_id, "boas_vindas_enviada", `Boas-vindas enviada pelo WhatsApp de ${primeiro}.`, {
    corretor: primeiro,
    texto,
  });
  return { enviada: true, corretor: primeiro };
}
