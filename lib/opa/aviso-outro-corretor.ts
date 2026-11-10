/**
 * Aviso "esse lead está com outro corretor" (pedido do Allyson, 10/11/2026).
 *
 * O lead preencheu o formulário, a roleta entregou a um corretor, e mesmo assim ele
 * escreveu no WhatsApp de outra pessoa da equipe (quase sempre o do Marco, que é o
 * número conhecido). Para não ficarem dois atendendo o mesmo lead, quem recebeu a
 * mensagem é avisado pelo OPA Lembretes de quem é o responsável.
 *
 * Só avisa. Não troca o dono do lead, não fala com o cliente e não mexe na conversa.
 * Não sai quando o lead é de quem recebeu a mensagem (é a vez dele).
 *
 * Uma vez por lead, responsável e dia (`opa_avisos`, tipo `lead_de_outro_corretor`):
 * o WAHA manda `message` e `message.any` da mesma mensagem, e o lead costuma mandar
 * várias seguidas. Se ele voltar a escrever outro dia, o aviso sai de novo.
 *
 * Chamado pelo webhook do WhatsApp do corretor (lib/waha/contatos-pessoais.ts),
 * depois de a mensagem ser gravada. Nunca lança.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logger } from "@/lib/logger";

import { avisarPessoa, carregarCanalDeAvisos, textoLeadDeOutroCorretor, type ResultadoAviso } from "./aviso-whatsapp";
import { carregarEquipe } from "./dados";
import { diaSP } from "./periodo";
import { leadComOutroCorretor, type LeadAbertoDoContato } from "./veio-de-formulario";

export const TIPO_LEAD_DE_OUTRO_CORRETOR = "lead_de_outro_corretor";

type LeadLido = LeadAbertoDoContato & { contacts: { name: string | null; phone_number: string | null } | null };

export async function avisarLeadDeOutroCorretor(
  admin: SupabaseClient,
  p: {
    orgId: string;
    /** Dono do número que recebeu a mensagem. */
    receptorId: string;
    /** Contatos do CRM de quem escreveu (pela identidade do WhatsApp ou pelo telefone). */
    contatoIds: string[];
    agora?: number;
  },
): Promise<ResultadoAviso | "nada"> {
  try {
    if (!p.contatoIds.length) return "nada";
    const { data, error } = await admin
      .from("crm_leads")
      .select("id, owner_user_id, source, custom_fields, contacts(name, phone_number)")
      .eq("organization_id", p.orgId)
      .in("contact_id", p.contatoIds)
      .eq("status", "open")
      .not("owner_user_id", "is", null);
    if (error) throw new Error(error.message);
    const lead = leadComOutroCorretor((data ?? []) as unknown as LeadLido[], p.receptorId);
    if (!lead?.owner_user_id) return "nada";

    const equipe = await carregarEquipe(p.orgId);
    const receptor = equipe.get(p.receptorId);
    const responsavel = equipe.get(lead.owner_user_id);
    // Responsável que saiu da equipe: a rotina já leva o lead para a gestão decidir.
    if (!receptor || !responsavel) return "nada";

    const marca = `${lead.owner_user_id}:${diaSP(p.agora ?? Date.now())}`;
    const { data: reserva, error: erroReserva } = await admin
      .from("opa_avisos")
      .insert({
        organization_id: p.orgId,
        lead_id: lead.id,
        user_id: p.receptorId,
        tipo: TIPO_LEAD_DE_OUTRO_CORRETOR,
        marca,
        dados: { responsavel: lead.owner_user_id },
      })
      .select("id")
      .single();
    if (erroReserva) {
      // 23505 = já avisado hoje (ou a outra entrega da mesma mensagem chegou antes).
      if (erroReserva.code === "23505") return "nada";
      throw new Error(erroReserva.message);
    }

    const canal = await carregarCanalDeAvisos(admin, p.orgId);
    const resultado = await avisarPessoa(
      canal,
      receptor,
      textoLeadDeOutroCorretor({
        quemRecebeu: receptor.nome,
        telefone: lead.contacts?.phone_number ?? null,
        lead: lead.contacts?.name ?? null,
        responsavel: responsavel.nome,
      }),
    );
    await admin
      .from("opa_avisos")
      .update({ status: resultado === "enviado" ? "enviado" : resultado === "sem_numero" ? "sem_numero" : "falhou" })
      .eq("id", (reserva as { id: string }).id);
    return resultado;
  } catch (e) {
    logger.warn("[opa.aviso-outro-corretor] falhou", { orgId: p.orgId, error: e instanceof Error ? e.message : String(e) });
    return "nada";
  }
}
