/**
 * Aviso da equipe pelo número OPA Lembretes (sessão WAHA `opa-lembretes`).
 *
 * O aviso vai do número da OPA para o WhatsApp do corretor ou do gerente, nunca
 * para o cliente. O número de cada pessoa é o da sessão de WhatsApp que ela
 * conectou (`channel_sessions.owner_user_id`, migration 0120). Sessão antiga,
 * sem dono gravado, ainda é achada pelo nome de exibição, mas só para quem não
 * tem sessão própria e só quando o nome é único: o nome da pessoa é editável por
 * ela, e casar por nome deixava um corretor receber os avisos de um gestor (A6).
 *
 * Avisos da gestão e da administração podem ir para números fixos, escolhidos em
 * Configurações (10/11/2026): ver `Destino` mais abaixo.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { phoneLookupVariants } from "@/lib/channels/phone-variants";
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

// ---------------------------------------------------------------- destinos fixos

/**
 * Quem recebe um aviso. Pessoa da equipe sem número fixo recebe no WhatsApp que ela
 * conectou no CRM. Número fixo (Configurações > Horário > Quem recebe os avisos)
 * recebe direto nele; se for o número de alguém da equipe, leva o nome da pessoa.
 */
export interface Destino {
  userId: string | null;
  nome: string | null;
  /** Número fixo, só dígitos. null = o número que a pessoa conectou. */
  telefone: string | null;
}

export const destinoDaPessoa = (p: { id: string; nome: string }): Destino => ({ userId: p.id, nome: p.nome, telefone: null });

/** DDD + 8 últimos dígitos: o mesmo número com ou sem 55 e com ou sem o nono dígito. */
export function chaveDoTelefone(telefone: string | null | undefined): string | null {
  let d = (telefone ?? "").replace(/\D/g, "");
  if (d.length >= 12 && d.startsWith("55")) d = d.slice(2);
  return d.length >= 10 ? d.slice(0, 2) + d.slice(-8) : null;
}

export function mesmoTelefone(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = chaveDoTelefone(a);
  return x !== null && x === chaveDoTelefone(b);
}

/** Os números fixos como destinos; número de alguém da equipe ganha o nome e o id da pessoa. */
export function destinosFixos(
  numeros: string[],
  canal: Pick<CanalDeAvisos, "telefonePorPessoa">,
  equipe: { get(id: string): { id: string; nome: string } | undefined },
): Destino[] {
  return numeros.map((telefone) => {
    const dono = [...canal.telefonePorPessoa].find(([, fone]) => mesmoTelefone(fone, telefone))?.[0];
    const pessoa = dono ? equipe.get(dono) : undefined;
    return { userId: pessoa?.id ?? null, nome: pessoa?.nome ?? null, telefone };
  });
}

/**
 * Como o aviso fica gravado em opa_avisos: a pessoa, quando há; sem pessoa, o
 * número entra na marca (a chave única é lead, tipo, marca e pessoa).
 */
export function chaveDoDestino(d: Destino, marca: string): { userId: string | null; marca: string } {
  return d.userId ? { userId: d.userId, marca } : { userId: null, marca: `${marca} tel:${d.telefone ?? ""}` };
}

/** Endereço que o WhatsApp reconhece para um número digitado (resolve o nono dígito). Vale enquanto o processo vive. */
const enderecos = new Map<string, string>();

async function enderecoDoNumero(sessao: string, telefone: string): Promise<string | null> {
  const guardado = enderecos.get(telefone);
  if (guardado) return guardado;
  const waha = getWahaClient();
  const formas = phoneLookupVariants(telefone).map((v) => v.replace(/\D/g, ""));
  if (!waha || !formas.length) return null;
  for (const forma of formas) {
    try {
      const r = await waha.checkExists(sessao, forma);
      if (!r.numberExists) continue;
      const digitos = [r.pn, r.chatId]
        .map((id) => (id ? /^(\d+)@(?:c\.us|s\.whatsapp\.net)$/.exec(id)?.[1] : undefined))
        .find((d): d is string => !!d && formas.includes(d));
      const endereco = `${digitos ?? forma}@c.us`;
      enderecos.set(telefone, endereco);
      return endereco;
    } catch {
      // Não deu para consultar: manda para o número como foi digitado (sem guardar).
      return `${formas[0]}@c.us`;
    }
  }
  return null;
}

/** Manda o aviso ao destino. Nunca lança; "erro" = o WhatsApp não confirmou (não reenviar sozinho). */
export async function avisarDestino(canal: CanalDeAvisos, d: Destino, texto: string): Promise<ResultadoAviso> {
  if (!d.telefone) return d.userId ? avisarPessoa(canal, { id: d.userId, nome: d.nome ?? "" }, texto) : "sem_numero";
  if (!canal.sessaoLembretes) return "sem_sessao";
  const waha = getWahaClient();
  if (!waha) return "sem_sessao";
  const endereco = await enderecoDoNumero(canal.sessaoLembretes, d.telefone);
  if (!endereco) return "sem_numero";
  try {
    await waha.sendMessage(canal.sessaoLembretes, endereco, texto);
    return "enviado";
  } catch {
    return "erro";
  }
}

// ---------------------------------------------------------------- textos

export const primeiroNomeDe = (nome: string | null | undefined): string => (nome ?? "").trim().split(/\s+/)[0] || "Oi";

/** "Marco, " quando se sabe de quem é o número; número fixo sem pessoa não leva nome. */
const chamar = (nome: string | null | undefined): string => ((nome ?? "").trim() ? `${primeiroNomeDe(nome)}, ` : "");

/** Um parágrafo por linha, com uma linha em branco entre eles (pedido do Allyson, 10/11/2026). */
export const emParagrafos = (linhas: Array<string | null | false | undefined>): string => linhas.filter(Boolean).join("\n\n");

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
  return emParagrafos([
    `${primeiroNomeDe(p.corretor)}, ${p.lead} espera sua resposta há ${duracao(p.esperaMin)}.`,
    fim,
    p.whatsapp ? `Responder: https://wa.me/${p.whatsapp}` : null,
    `Ficha: ${p.link}`,
  ]);
}

/**
 * Fora do horário de atendimento (10/11/2026): só um lembrete de que o lead chegou e
 * está sem resposta. Não fala de prazo nem de fila, porque fora do horário o relógio
 * do repasse está parado.
 */
export function textoForaDoHorario(p: { corretor: string; lead: string; esperaMin: number; link: string; whatsapp: string | null }): string {
  return emParagrafos([
    `${primeiroNomeDe(p.corretor)}, o lead ${p.lead} chegou e está sem resposta há ${duracao(p.esperaMin)}.`,
    p.whatsapp ? `Responder: https://wa.me/${p.whatsapp}` : null,
    `Ficha: ${p.link}`,
  ]);
}

export function textoRepasseParaNovoDono(p: { corretor: string; lead: string; de: string; link: string; whatsapp: string | null }): string {
  return emParagrafos([
    `${primeiroNomeDe(p.corretor)}, lead novo para você: ${p.lead}.`,
    `Ele estava com ${primeiroNomeDe(p.de)} e passou para a sua vez por falta de resposta no prazo. Responda o quanto antes.`,
    p.whatsapp ? `Responder: https://wa.me/${p.whatsapp}` : null,
    `Ficha: ${p.link}`,
  ]);
}

export function textoRepasseParaQuemPerdeu(p: { corretor: string; lead: string; para: string }): string {
  return `🔴 ${primeiroNomeDe(p.corretor)}, ${p.lead} passou para ${primeiroNomeDe(p.para)}: ficou sem resposta além do prazo.`;
}

export function textoRepasseParaGestor(p: { gestor: string | null; lead: string; de: string; para: string; link: string }): string {
  return emParagrafos([
    `${chamar(p.gestor)}${p.lead} saiu de ${primeiroNomeDe(p.de)} e foi para ${primeiroNomeDe(p.para)} por falta de resposta no prazo.`,
    `Ficha: ${p.link}`,
  ]);
}

export function textoEscala(p: {
  gestor: string | null;
  lead: string;
  dono: string | null;
  link: string;
  /** Por que a gestão decide: ninguém mais da roleta, o dono não foi avisado, ou o dono saiu da equipe. */
  motivo?: "roleta" | "sem_aviso" | "dono_saiu";
}): string {
  const motivo = p.motivo ?? "roleta";
  const abertura =
    motivo === "dono_saiu"
      ? `${chamar(p.gestor)}${p.lead} está com alguém que saiu da equipe.`
      : motivo === "sem_aviso"
        ? `${chamar(p.gestor)}${p.lead} passou do prazo sem resposta e o aviso não chegou ao corretor, então ele não foi passado adiante.`
        : `${chamar(p.gestor)}${p.lead} passou do prazo e ninguém mais da roleta pôde pegar.`;
  return emParagrafos([
    abertura,
    motivo === "dono_saiu" ? null : p.dono ? `Está com ${primeiroNomeDe(p.dono)}.` : "Está sem dono.",
    `Decida quem atende: ${p.link}`,
  ]);
}

/** "+55 12 99139-2393" a partir de qualquer grafia; número fora do padrão sai só com o "+". */
export function telefoneLegivel(telefone: string | null | undefined): string | null {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (!d) return null;
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(d);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${d}`;
}

/**
 * Lead que preencheu formulário, está com outro corretor e escreveu no WhatsApp de
 * quem recebe este aviso (pedido do Allyson, 10/11/2026). Curto de propósito. O lead
 * é dito pelo número, que é o que a pessoa vê na conversa; sem número, pelo nome.
 */
export function textoLeadDeOutroCorretor(p: { quemRecebeu: string; telefone: string | null; lead: string | null; responsavel: string }): string {
  const quem = telefoneLegivel(p.telefone) ?? p.lead?.trim() ?? "que te escreveu agora";
  return emParagrafos([
    `${primeiroNomeDe(p.quemRecebeu)}, esse lead (${quem}) está com o corretor responsável ${primeiroNomeDe(p.responsavel)}.`,
    "Obs.: avise esse lead para continuar a conversa com o número do corretor.",
  ]);
}

/** Negócio parado. `corretor` é quem recebe: o dono do lead ou alguém da gestão (número fixo sem pessoa vem sem nome). */
export function textoParado(p: { corretor: string | null; lead: string; etapa: string; dias: number; link: string }): string {
  return emParagrafos([
    `${chamar(p.corretor)}${p.lead} está parado há ${p.dias} dias em ${p.etapa}. Vale retomar a conversa ou mover o card.`,
    `Ficha: ${p.link}`,
  ]);
}

export function textoLembrete(p: { corretor: string; mensagem: string; lead: string | null; paraLead: boolean; link: string | null; whatsapp: string | null }): string {
  if (p.paraLead && p.lead) {
    const pronta = p.whatsapp ? `https://wa.me/${p.whatsapp}?text=${encodeURIComponent(p.mensagem)}` : null;
    return emParagrafos([
      `${primeiroNomeDe(p.corretor)}, hora de mandar a mensagem que você agendou para ${p.lead}:`,
      `"${p.mensagem}"`,
      pronta ? `Abrir com a mensagem pronta: ${pronta}` : null,
      p.link ? `Ficha: ${p.link}` : null,
    ]);
  }
  return emParagrafos([`${primeiroNomeDe(p.corretor)}, lembrete: ${p.mensagem}`, p.lead ? `Lead: ${p.lead}` : null, p.link ? `Ficha: ${p.link}` : null]);
}
