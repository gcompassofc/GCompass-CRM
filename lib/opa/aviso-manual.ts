/**
 * Aviso escrito na hora, pelo número OPA Lembretes (pedido do Allyson, 10/11/2026).
 *
 * Gestor ou administrador escreve um texto na tela Agenda > Enviados e escolhe quem da
 * equipe recebe. Sai pelo caminho de envio do CRM (o mesmo das conversas), e não direto
 * no WhatsApp: assim a mensagem fica gravada com QUEM mandou (`sent_by_user_id`) e
 * aparece na lista de enviados com o nome da pessoa.
 *
 * Só fala com a equipe: o destino é sempre o WhatsApp que a pessoa conectou no CRM.
 * Respeita o modo de teste (Configurações, avisos.teste). Nunca lança: devolve o
 * resultado de cada pessoa.
 */
import { sendMessageHandler } from "@/app/api/v1/messages/_handler";
import { ensureConversation } from "@/lib/automation/start-conversation";
import type { createAdminClient } from "@/lib/supabase/admin";
import { parseChatId, upsertContact } from "@/lib/waha/ingest";

import { carregarCanalDeAvisos, chaveDoTelefone, liberadoNoTeste, telefoneDaPessoa } from "./aviso-whatsapp";
import { carregarEquipe } from "./dados";

type Admin = ReturnType<typeof createAdminClient>;

export const TAMANHO_MAX_DO_AVISO = 1000;
export const SESSAO_LEMBRETES = "opa-lembretes";

export type ResultadoManual = "enviado" | "sem_numero" | "retido" | "sem_sessao" | "erro";

export interface EnvioManual {
  userId: string;
  nome: string;
  resultado: ResultadoManual;
  detalhe?: string | null;
}

/** Frase curta de cada resultado, para o aviso na tela. */
export function fraseDoResultado(r: ResultadoManual): string {
  return {
    enviado: "enviado",
    sem_numero: "sem WhatsApp conectado no CRM",
    retido: "o OPA Lembretes está em modo de teste",
    sem_sessao: "o OPA Lembretes está desconectado",
    erro: "o WhatsApp não confirmou o envio",
  }[r];
}

export async function enviarAvisoManual(
  admin: Admin,
  p: { orgId: string; autorId: string; paraIds: string[]; texto: string },
): Promise<EnvioManual[]> {
  const texto = p.texto.trim();
  const ids = [...new Set(p.paraIds)];
  if (!texto || !ids.length) return [];

  const equipe = await carregarEquipe(p.orgId);
  const pessoas = ids.map((id) => equipe.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
  const todos = (resultado: ResultadoManual, detalhe?: string): EnvioManual[] => pessoas.map((x) => ({ userId: x.id, nome: x.nome, resultado, detalhe }));

  try {
    const { data: sessao } = await admin
      .from("channel_sessions")
      .select("id, status")
      .eq("organization_id", p.orgId)
      .eq("waha_session_name", SESSAO_LEMBRETES)
      .is("archived_at", null)
      .maybeSingle();
    const linha = sessao as { id: string; status: string | null } | null;
    if (!linha || String(linha.status ?? "").toUpperCase() !== "WORKING") return todos("sem_sessao");

    const canal = await carregarCanalDeAvisos(admin as never, p.orgId);
    // Conversas que o número já tem: a pessoa que já recebeu aviso segue na mesma conversa
    // (o WhatsApp devolve o número com ou sem o nono dígito, então casa pela chave curta).
    const { data: conversasRaw } = await admin
      .from("conversations")
      .select("id, contact_id, last_message_at, contacts:contact_id(phone_number)")
      .eq("organization_id", p.orgId)
      .eq("channel_session_id", linha.id)
      .eq("is_group", false)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(500);
    const porChave = new Map<string, string>();
    for (const c of (conversasRaw ?? []) as unknown as Array<{ id: string; contacts: { phone_number: string | null } | null }>) {
      const chave = chaveDoTelefone(c.contacts?.phone_number);
      if (chave && !porChave.has(chave)) porChave.set(chave, c.id);
    }

    const saida: EnvioManual[] = [];
    for (const pessoa of pessoas) {
      const base = { userId: pessoa.id, nome: pessoa.nome };
      const telefone = telefoneDaPessoa(canal, pessoa);
      if (!telefone) {
        saida.push({ ...base, resultado: "sem_numero" });
        continue;
      }
      if (!liberadoNoTeste(canal, telefone)) {
        saida.push({ ...base, resultado: "retido" });
        continue;
      }
      try {
        let conversaId = porChave.get(chaveDoTelefone(telefone) ?? "") ?? null;
        if (!conversaId) {
          const chatId = `${telefone}@c.us`;
          const contatoId = await upsertContact(admin, p.orgId, parseChatId(chatId), chatId, pessoa.nome);
          if (!contatoId) throw new Error("não foi possível abrir a conversa com a pessoa");
          conversaId = await ensureConversation(admin as never, p.orgId, contatoId, linha.id);
        }
        const msg = await sendMessageHandler(
          admin as never,
          { organization_id: p.orgId, requestId: `aviso-manual:${p.autorId}:${Date.now()}`, actor: { type: "user", id: p.autorId } },
          { conversation_id: conversaId, type: "text", body: texto, metadata: { aviso_manual: true } },
        );
        saida.push(msg.status === "sent" ? { ...base, resultado: "enviado" } : { ...base, resultado: "erro", detalhe: msg.error_message ?? null });
      } catch (e) {
        saida.push({ ...base, resultado: "erro", detalhe: e instanceof Error ? e.message.slice(0, 160) : null });
      }
    }
    return saida;
  } catch (e) {
    return todos("erro", e instanceof Error ? e.message.slice(0, 160) : undefined);
  }
}
