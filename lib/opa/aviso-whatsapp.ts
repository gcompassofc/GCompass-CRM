/**
 * Aviso da equipe pelo número OPA Lembretes (sessão WAHA `opa-lembretes`).
 *
 * O aviso vai do número da OPA para o WhatsApp do corretor ou do gerente, nunca
 * para o cliente. O número de cada pessoa é o da sessão de WhatsApp que ela
 * conectou (`channel_sessions.owner_user_id`, migration 0120). Sessão antiga,
 * sem dono gravado, ainda é achada pelo nome de exibição.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { getWahaClient } from "@/lib/waha/client";

export type ResultadoAviso = "enviado" | "sem_numero" | "sem_sessao" | "erro";

export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

export interface CanalDeAvisos {
  /** Nome da sessão do OPA Lembretes no WAHA, ou null se não está conectada. */
  sessaoLembretes: string | null;
  /** Id da pessoa -> só dígitos do WhatsApp dela. */
  telefonePorPessoa: Map<string, string>;
  /** Nome da pessoa sem acento -> dígitos (sessões sem dono gravado). */
  telefonePorNome: Map<string, string>;
}

/** Lê as sessões da org: o OPA Lembretes e o número de cada pessoa. */
export async function carregarCanalDeAvisos(admin: SupabaseClient, orgId: string): Promise<CanalDeAvisos> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select("waha_session_name, display_name, phone_number, status, owner_user_id")
    .eq("organization_id", orgId)
    .is("archived_at", null);
  if (error) throw new Error(`carregarCanalDeAvisos: ${error.message}`);
  const sessoes = (data ?? []) as Array<{
    waha_session_name: string;
    display_name: string | null;
    phone_number: string | null;
    status: string;
    owner_user_id: string | null;
  }>;
  const lembretes = sessoes.find((s) => s.waha_session_name === "opa-lembretes" && s.status === "WORKING");
  const telefonePorPessoa = new Map<string, string>();
  const telefonePorNome = new Map<string, string>();
  for (const s of sessoes) {
    if (s.waha_session_name === "opa-lembretes" || !s.phone_number) continue;
    const digitos = s.phone_number.replace(/\D/g, "");
    if (!digitos) continue;
    if (s.owner_user_id) telefonePorPessoa.set(s.owner_user_id, digitos);
    if (s.display_name) telefonePorNome.set(semAcento(s.display_name), digitos);
  }
  return { sessaoLembretes: lembretes?.waha_session_name ?? null, telefonePorPessoa, telefonePorNome };
}

/** Manda o texto do OPA Lembretes para o WhatsApp da pessoa. Nunca lança: devolve o resultado. */
export async function avisarPessoa(canal: CanalDeAvisos, pessoa: { id: string; nome: string }, texto: string): Promise<ResultadoAviso> {
  if (!canal.sessaoLembretes) return "sem_sessao";
  const telefone = canal.telefonePorPessoa.get(pessoa.id) ?? canal.telefonePorNome.get(semAcento(pessoa.nome));
  if (!telefone) return "sem_numero";
  const waha = getWahaClient();
  if (!waha) return "sem_sessao";
  try {
    await waha.sendMessage(canal.sessaoLembretes, `${telefone}@c.us`, texto);
    return "enviado";
  } catch {
    return "erro";
  }
}

// ---------------------------------------------------------------- textos

export const primeiroNomeDe = (nome: string | null | undefined): string => (nome ?? "").trim().split(/\s+/)[0] || "Oi";

/** "1 h 5 min", "35 min", "2 dias". */
export function duracao(min: number): string {
  if (min < 60) return `${Math.max(1, Math.round(min))} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h${min % 60 ? ` ${Math.round(min % 60)} min` : ""}`;
  const d = Math.floor(h / 24);
  return `${d} ${d === 1 ? "dia" : "dias"}`;
}

export function textoAvisoDePrazo(p: {
  corretor: string;
  lead: string;
  esperaMin: number;
  faltaMin: number;
  proprio: boolean;
  link: string;
  whatsapp: string | null;
}): string {
  const fim = p.proprio
    ? "Ele é lead seu, então não troca de corretor."
    : p.faltaMin > 0
      ? `Faltam ${duracao(p.faltaMin)} para ele passar para o próximo da fila.`
      : "O prazo acabou.";
  return [
    `${primeiroNomeDe(p.corretor)}, ${p.lead} espera sua resposta há ${duracao(p.esperaMin)}.`,
    fim,
    p.whatsapp ? `Responder: https://wa.me/${p.whatsapp}` : null,
    `Ficha: ${p.link}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function textoRepasseParaNovoDono(p: { corretor: string; lead: string; de: string; link: string; whatsapp: string | null }): string {
  return [
    `${primeiroNomeDe(p.corretor)}, lead novo para você: ${p.lead}.`,
    `Ele estava com ${primeiroNomeDe(p.de)} e passou para a sua vez por falta de resposta no prazo. Responda o quanto antes.`,
    p.whatsapp ? `Responder: https://wa.me/${p.whatsapp}` : null,
    `Ficha: ${p.link}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function textoRepasseParaQuemPerdeu(p: { corretor: string; lead: string; para: string }): string {
  return `${primeiroNomeDe(p.corretor)}, ${p.lead} passou para ${primeiroNomeDe(p.para)}: ficou sem resposta além do prazo.`;
}

export function textoRepasseParaGestor(p: { gestor: string; lead: string; de: string; para: string; link: string }): string {
  return `${primeiroNomeDe(p.gestor)}, ${p.lead} saiu de ${primeiroNomeDe(p.de)} e foi para ${primeiroNomeDe(p.para)} por falta de resposta no prazo.\nFicha: ${p.link}`;
}

export function textoEscala(p: { gestor: string; lead: string; dono: string | null; link: string }): string {
  return [
    `${primeiroNomeDe(p.gestor)}, ${p.lead} passou do prazo e ninguém mais da roleta pôde pegar.`,
    p.dono ? `Está com ${primeiroNomeDe(p.dono)}.` : "Está sem dono.",
    `Decida quem atende: ${p.link}`,
  ].join("\n");
}

export function textoParado(p: { corretor: string; lead: string; etapa: string; dias: number; link: string }): string {
  return `${primeiroNomeDe(p.corretor)}, ${p.lead} está parado há ${p.dias} dias em ${p.etapa}. Vale retomar a conversa ou mover o card.\nFicha: ${p.link}`;
}

export function textoLembrete(p: { corretor: string; mensagem: string; lead: string | null; paraLead: boolean; link: string | null; whatsapp: string | null }): string {
  if (p.paraLead && p.lead) {
    const pronta = p.whatsapp ? `https://wa.me/${p.whatsapp}?text=${encodeURIComponent(p.mensagem)}` : null;
    return [
      `${primeiroNomeDe(p.corretor)}, hora de mandar a mensagem que você agendou para ${p.lead}:`,
      `"${p.mensagem}"`,
      pronta ? `Abrir com a mensagem pronta: ${pronta}` : null,
      p.link ? `Ficha: ${p.link}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [`${primeiroNomeDe(p.corretor)}, lembrete: ${p.mensagem}`, p.lead ? `Lead: ${p.lead}` : null, p.link ? `Ficha: ${p.link}` : null]
    .filter(Boolean)
    .join("\n");
}
