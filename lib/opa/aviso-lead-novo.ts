/**
 * Aviso "lead novo para você" (pedido do Allyson, 10/11/2026).
 *
 * O formulário chegou, a roleta escolheu o corretor, e o OPA Lembretes avisa esse
 * corretor na hora, a qualquer hora do dia. Antes, o primeiro sinal era o lembrete de
 * 20 minutos sem resposta.
 *
 * Só lead que preencheu formulário (site ou anúncio). Quem volta por outro formulário e
 * já está com o corretor recebe a versão "preencheu de novo". Lead que nasceu no
 * WhatsApp do próprio corretor não gera aviso: a conversa já está na mão dele.
 *
 * Uma vez por entrada (`opa_avisos`, tipo `lead_novo`): o n8n e a Meta reenviam o mesmo
 * formulário em erro. Desliga em Configurações (avisos.desligados). Nunca lança.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import { avisarPessoa, carregarCanalDeAvisos, textoLeadNovo, type ResultadoAviso } from "./aviso-whatsapp";
import { avisoAtivo, carregarConfig } from "./config";
import { carregarEquipe } from "./dados";
import { dadosDaEntrada, preencheuFormulario } from "./veio-de-formulario";

export const TIPO_LEAD_NOVO = "lead_novo";

interface LeadLido {
  id: string;
  title: string;
  status: string;
  owner_user_id: string | null;
  source: string | null;
  custom_fields: Record<string, unknown> | null;
  contacts: { name: string | null; phone_number: string | null } | null;
}

export async function avisarLeadNovo(
  admin: SupabaseClient,
  orgId: string,
  leadId: string,
  p: { voltou?: boolean; vez?: number } = {},
): Promise<ResultadoAviso | "nada"> {
  try {
    const config = await carregarConfig(admin, orgId);
    if (!avisoAtivo(config, "lead_novo")) return "nada";

    const { data, error } = await admin
      .from("crm_leads")
      .select("id, title, status, owner_user_id, source, custom_fields, contacts(name, phone_number)")
      .eq("organization_id", orgId)
      .eq("id", leadId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const lead = data as unknown as LeadLido | null;
    if (!lead?.owner_user_id || lead.status !== "open") return "nada";
    if (!preencheuFormulario(lead.custom_fields, lead.source)) return "nada";

    const dono = (await carregarEquipe(orgId)).get(lead.owner_user_id);
    // Dono que saiu da equipe: a rotina de minuto em minuto leva o lead para a gestão.
    if (!dono) return "nada";

    const voltou = Boolean(p.voltou);
    const { data: reserva, error: erroReserva } = await admin
      .from("opa_avisos")
      .insert({
        organization_id: orgId,
        lead_id: lead.id,
        user_id: dono.id,
        tipo: TIPO_LEAD_NOVO,
        marca: voltou ? `voltou:${p.vez ?? 2}` : "novo",
        dados: {},
      })
      .select("id")
      .single();
    if (erroReserva) {
      // 23505 = esta entrada já foi avisada (formulário reenviado).
      if (erroReserva.code === "23505") return "nada";
      throw new Error(erroReserva.message);
    }

    const entrada = dadosDaEntrada(lead.custom_fields, voltou);
    const canal = await carregarCanalDeAvisos(admin, orgId);
    const resultado = await avisarPessoa(
      canal,
      dono,
      textoLeadNovo({
        corretor: dono.nome,
        lead: lead.contacts?.name?.trim() || lead.title.split(" · ")[0] || "Lead",
        imovel: entrada.imovel,
        canal: entrada.canal,
        voltou,
        link: `${env.NEXT_PUBLIC_APP_URL}/app/leads/${lead.id}`,
        whatsapp: (lead.contacts?.phone_number ?? "").replace(/\D/g, "") || null,
      }),
    );
    await admin
      .from("opa_avisos")
      .update({ status: resultado === "enviado" ? "enviado" : resultado === "sem_numero" ? "sem_numero" : "falhou" })
      .eq("id", (reserva as { id: string }).id);
    return resultado;
  } catch (e) {
    logger.warn("[opa.aviso-lead-novo] falhou", { orgId, leadId, error: e instanceof Error ? e.message : String(e) });
    return "nada";
  }
}
