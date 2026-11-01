/**
 * Aviso da equipe pelo número OPA Lembretes (sessão WAHA `opa-lembretes`).
 *
 * O aviso vai do número da OPA para o WhatsApp do corretor ou do gerente, nunca
 * para o cliente. O número de cada pessoa é o da sessão de WhatsApp que ela
 * conectou (`channel_sessions.owner_user_id`, migration 0120). Sessão antiga,
 * sem dono gravado, ainda é achada pelo nome de exibição, mas só para quem não
 * tem sessão própria e só quando o nome é único: o nome da pessoa é editável por
 * ela, e casar por nome deixava um corretor receber os avisos de um gestor (A6).
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
  /** Nome sem acento -> dígitos, só de sessões sem dono e com nome único. */
  telefonePorNome: Map<string, string>;
  /** Quem tem sessão própria (com ou sem número): nunca é achado pelo nome. */
  comSessaoPropria: Set<string>;
}

interface SessaoDoCanal {
  waha_session_name: string;
  display_name: string | null;
  phone_number: string | null;
  status: string;
  owner_user_id: string | null;
}

/** Monta o canal a partir das sessões ativas da org (separado para testar sem banco). */
export function montarCanalDeAvisos(sessoes: SessaoDoCanal[]): CanalDeAvisos {
  const lembretes = sessoes.find((s) => s.waha_session_name === "opa-lembretes" && s.status === "WORKING");
  const telefonePorPessoa = new Map<string, string>();
  const comSessaoPropria = new Set<string>();
  const porNome = new Map<string, string | null>();
  for (const s of sessoes) {
    if (s.waha_session_name === "opa-lembretes") continue;
    if (s.owner_user_id) comSessaoPropria.add(s.owner_user_id);
    const digitos = (s.phone_number ?? "").replace(/\D/g, "");
    if (!digitos) continue;
    if (s.owner_user_id) {
      telefonePorPessoa.set(s.owner_user_id, digitos);
    } else if (s.display_name) {
      const nome = semAcento(s.display_name);
      // Dois números sem dono com o mesmo nome: ambíguo, nenhum vale.
      porNome.set(nome, porNome.has(nome) && porNome.get(nome) !== digitos ? null : digitos);
    }
  }
  const telefonePorNome = new Map<string, string>();
  for (const [nome, digitos] of porNome) if (digitos) telefonePorNome.set(nome, digitos);
  return { sessaoLembretes: lembretes?.waha_session_name ?? null, telefonePorPessoa, telefonePorNome, comSessaoPropria };
}

/** O WhatsApp da pessoa: o da sessão dela; pelo nome só se ela não tem sessão própria. */
export function telefoneDaPessoa(canal: CanalDeAvisos, pessoa: { id: string; nome: string }): string | undefined {
  const proprio = canal.telefonePorPessoa.get(pessoa.id);
  if (proprio) return proprio;
  if (canal.comSessaoPropria.has(pessoa.id)) return undefined;
  return canal.telefonePorNome.get(semAcento(pessoa.nome));
}

/** Lê as sessões da org: o OPA Lembretes e o número de cada pessoa. */
export async function carregarCanalDeAvisos(admin: SupabaseClient, orgId: string): Promise<CanalDeAvisos> {
  const { data, error } = await admin
    .from("channel_sessions")
    .select("waha_session_name, display_name, phone_number, status, owner_user_id")
    .eq("organization_id", orgId)
    .is("archived_at", null);
  if (error) throw new Error(`carregarCanalDeAvisos: ${error.message}`);
  return montarCanalDeAvisos((data ?? []) as SessaoDoCanal[]);
}

/**
 * Manda o texto do OPA Lembretes para o WhatsApp da pessoa. Nunca lança: devolve
 * o resultado. "erro" quer dizer que o WhatsApp não confirmou: a mensagem pode ter
 * saído ou não, e quem chama não deve reenviar sozinho.
 */
export async function avisarPessoa(canal: CanalDeAvisos, pessoa: { id: string; nome: string }, texto: string): Promise<ResultadoAviso> {
  if (!canal.sessaoLembretes) return "sem_sessao";
  const telefone = telefoneDaPessoa(canal, pessoa);
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

export function textoEscala(p: {
  gestor: string;
  lead: string;
  dono: string | null;
  link: string;
  /** Por que a gestão decide: ninguém mais da roleta, o dono não foi avisado, ou o dono saiu da equipe. */
  motivo?: "roleta" | "sem_aviso" | "dono_saiu";
}): string {
  const motivo = p.motivo ?? "roleta";
  const abertura =
    motivo === "dono_saiu"
      ? `${primeiroNomeDe(p.gestor)}, ${p.lead} está com alguém que saiu da equipe.`
      : motivo === "sem_aviso"
        ? `${primeiroNomeDe(p.gestor)}, ${p.lead} passou do prazo sem resposta e o aviso não chegou ao corretor, então ele não foi passado adiante.`
        : `${primeiroNomeDe(p.gestor)}, ${p.lead} passou do prazo e ninguém mais da roleta pôde pegar.`;
  return [
    abertura,
    motivo === "dono_saiu" ? null : p.dono ? `Está com ${primeiroNomeDe(p.dono)}.` : "Está sem dono.",
    `Decida quem atende: ${p.link}`,
  ]
    .filter(Boolean)
    .join("\n");
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
