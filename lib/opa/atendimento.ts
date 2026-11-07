/**
 * Relógio de atendimento da OPA: quanto tempo um lead espera resposta contando
 * só o horário de atendimento (Configurações > Horário), no fuso de São Paulo.
 *
 * Antes, o relógio contava minutos corridos: lead que entrava às 22h amanhecia
 * com 10 h de espera e "passou do prazo" antes de o corretor abrir o dia. Agora
 * fora do horário a fila e os lembretes esperam a abertura.
 *
 * Feriado não é reconhecido (não há calendário na configuração): num feriado o
 * relógio segue o horário do dia da semana. Sem nenhum dia aberto na
 * configuração, volta a contar minutos corridos para a fila não congelar.
 */
import type { DiaAtendimento } from "./config";
import { diaSP, inicioDoDia, somarDias } from "./periodo";

const MIN_MS = 60_000;

const DIAS_DA_SEMANA = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"] as const;
const NOMES = DIAS_DA_SEMANA.join("|");

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/-feira/g, "");
}

/** Dias da semana (0 = domingo) de um rótulo como "Segunda a sexta", "Sábado" ou "Domingo e feriado". */
export function diasDaSemana(rotulo: string): Set<number> {
  let texto = semAcento(rotulo);
  const dias = new Set<number>();
  const faixa = new RegExp(`(${NOMES})\\s+a\\s+(${NOMES})`, "g");
  for (const m of texto.matchAll(faixa)) {
    let i = DIAS_DA_SEMANA.indexOf(m[1] as (typeof DIAS_DA_SEMANA)[number]);
    const fim = DIAS_DA_SEMANA.indexOf(m[2] as (typeof DIAS_DA_SEMANA)[number]);
    for (let n = 0; n < 7; n++) {
      dias.add(i);
      if (i === fim) break;
      i = (i + 1) % 7;
    }
  }
  texto = texto.replace(faixa, " ");
  for (const m of texto.matchAll(new RegExp(NOMES, "g"))) {
    dias.add(DIAS_DA_SEMANA.indexOf(m[0] as (typeof DIAS_DA_SEMANA)[number]));
  }
  return dias;
}

/** "08:30" em minutos desde a meia-noite; null se não for uma hora. */
function horaEmMin(h: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(h.trim());
  if (!m) return null;
  const min = Number(m[1]) * 60 + Number(m[2]);
  return min >= 0 && min <= 24 * 60 ? min : null;
}

export interface JanelaDoDia {
  abre: number;
  fecha: number;
}

/** Janela de atendimento de cada dia da semana (0 = domingo); ausente = fechado. */
export function janelasDaSemana(horario: DiaAtendimento[]): Map<number, JanelaDoDia> {
  const mapa = new Map<number, JanelaDoDia>();
  for (const d of horario) {
    if (!d.aberto) continue;
    const abre = horaEmMin(d.abre);
    const fecha = horaEmMin(d.fecha);
    if (abre == null || fecha == null || fecha <= abre) continue;
    for (const dia of diasDaSemana(d.dias)) mapa.set(dia, { abre, fecha });
  }
  return mapa;
}

/** Dia da semana (0 = domingo) de um aaaa-mm-dd. */
function diaDaSemana(dia: string): number {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d!)).getUTCDay();
}

/** Minutos do intervalo [de, ate] que caem dentro do horário de atendimento. */
export function minutosUteis(deMs: number, ateMs: number, horario: DiaAtendimento[]): number {
  if (!(ateMs > deMs)) return 0;
  const janelas = janelasDaSemana(horario);
  if (janelas.size === 0) return (ateMs - deMs) / MIN_MS;

  let total = 0;
  let dia = diaSP(deMs);
  const ultimo = diaSP(ateMs);
  // Teto de segurança: um lead parado há mais de dois anos não trava a tela.
  for (let n = 0; n < 800; n++) {
    const j = janelas.get(diaDaSemana(dia));
    if (j) {
      const zero = inicioDoDia(dia);
      const ini = Math.max(deMs, zero + j.abre * MIN_MS);
      const fim = Math.min(ateMs, zero + j.fecha * MIN_MS);
      if (fim > ini) total += (fim - ini) / MIN_MS;
    }
    if (dia >= ultimo) break;
    dia = somarDias(dia, 1);
  }
  return total;
}

/**
 * Agora está dentro do horário de atendimento? Fora dele, quando o relógio volta a
 * contar (início da próxima janela). Sem nenhum dia aberto, o relógio conta sempre.
 */
export function situacaoDoRelogio(
  agoraMs: number,
  horario: DiaAtendimento[],
): { aberto: true } | { aberto: false; voltaMs: number } {
  const janelas = janelasDaSemana(horario);
  if (janelas.size === 0) return { aberto: true };
  let dia = diaSP(agoraMs);
  for (let n = 0; n < 8; n++) {
    const j = janelas.get(diaDaSemana(dia));
    if (j) {
      const zero = inicioDoDia(dia);
      const abre = zero + j.abre * MIN_MS;
      if (agoraMs >= abre && agoraMs < zero + j.fecha * MIN_MS) return { aberto: true };
      if (agoraMs < abre) return { aberto: false, voltaMs: abre };
    }
    dia = somarDias(dia, 1);
  }
  return { aberto: true };
}

/** "hoje às 08:00", "amanhã às 08:00" ou "segunda às 08:00", no horário de São Paulo. */
export function quandoVolta(voltaMs: number, agoraMs: number): string {
  const hora = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(voltaMs);
  const dia = diaSP(voltaMs);
  if (dia === diaSP(agoraMs)) return `hoje às ${hora}`;
  if (dia === somarDias(diaSP(agoraMs), 1)) return `amanhã às ${hora}`;
  const semana = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" }).format(voltaMs).replace("-feira", "");
  return `${semana} às ${hora}`;
}

/** Minutos de espera, arredondados, no horário de atendimento. */
export function esperaEmMinutos(deMs: number, ateMs: number, horario: DiaAtendimento[]): number {
  return Math.round(minutosUteis(deMs, ateMs, horario));
}

// ---------------------------------------------------------------- desde quando o lead espera

export interface DadosDaEspera {
  status: "open" | "won" | "lost";
  criadoEm: string;
  /** Quando o lead foi entregue ao corretor atual (crm_leads.assigned_at). */
  atribuidoEm?: string | null;
  /** custom_fields.voltou.em: o lead voltou por outro formulário. */
  voltouEm?: string | null;
  /** custom_fields.respondido_em: "Respondi" ou ligação registrada. */
  respondidoEm?: string | null;
  /** Há conversa do contato no WhatsApp? */
  temConversa: boolean;
  ultimaMensagemEm?: string | null;
  ultimaEntradaEm?: string | null;
  ultimaSaidaEm?: string | null;
  /** custom_fields.boas_vindas.em quando a boas-vindas automática saiu (#498). */
  boasVindasEm?: string | null;
}

const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
};

/**
 * A última mensagem enviada na conversa foi só a boas-vindas automática? Vale a
 * folga de 1 minuto: a linha da mensagem nasce um instante antes da hora gravada
 * no lead. Qualquer mensagem do corretor depois disso já é resposta de verdade.
 */
export function saidaFoiSoBoasVindas(ultimaSaidaEm: string | null | undefined, boasVindasEm: string | null | undefined): boolean {
  const saiu = ms(ultimaSaidaEm);
  const bv = ms(boasVindasEm);
  return saiu !== null && bv !== null && saiu <= bv + 60_000;
}

/** A saída que conta como resposta do corretor: a boas-vindas automática não conta. */
export function saidaDoCorretor(ultimaSaidaEm: string | null | undefined, boasVindasEm: string | null | undefined): string | null {
  return saidaFoiSoBoasVindas(ultimaSaidaEm, boasVindasEm) ? null : (ultimaSaidaEm ?? null);
}

/**
 * custom_fields.boas_vindas.em: hora da tentativa da boas-vindas automática.
 * Vale também quando falhou: a linha da mensagem (mesmo com falha) marca a
 * conversa como "última saída", e nem por isso o corretor respondeu.
 */
export function boasVindasEnviadaEm(cf: Record<string, unknown> | null | undefined): string | null {
  const bv = cf?.boas_vindas as { em?: string } | undefined;
  return bv?.em ?? null;
}

/**
 * Desde quando o lead espera uma resposta do corretor (ms), ou null se não
 * espera. Regras da fila:
 *  - mensagem do lead sem resposta depois dela espera desde a mensagem;
 *  - lead que voltou por formulário espera desde a volta, mesmo que a última
 *    mensagem da conversa tenha sido do corretor;
 *  - "Respondi" ou ligação depois do início da espera tira o lead da fila até
 *    ele escrever de novo;
 *  - lead aberto sem conversa e sem "Respondi" espera desde que entrou;
 *  - lead passado a outro corretor (repasse da roleta ou troca do gerente) começa o relógio de novo na atribuição.
 */
export function esperaDesde(d: DadosDaEspera): number | null {
  const entrou = ms(d.ultimaEntradaEm);
  // A boas-vindas automática não é resposta do corretor: não tira da fila nem zera o prazo.
  const soBoasVindas = saidaFoiSoBoasVindas(d.ultimaSaidaEm, d.boasVindasEm);
  const saiu = soBoasVindas ? null : ms(d.ultimaSaidaEm);
  let desde: number | null = entrou !== null && (saiu === null || entrou > saiu) ? entrou : null;
  // Lead respondeu à boas-vindas: o relógio continua o da chegada do lead.
  const criadoEm = ms(d.criadoEm);
  if (soBoasVindas && desde !== null && criadoEm !== null) desde = Math.min(desde, criadoEm);

  const voltou = ms(d.voltouEm);
  if (voltou !== null) {
    const ultimaMensagem = ms(d.ultimaMensagemEm) ?? 0;
    if (voltou > ultimaMensagem || desde !== null) desde = desde === null ? voltou : Math.min(desde, voltou);
  }

  const respondido = ms(d.respondidoEm) ?? 0;
  if (desde !== null && respondido >= desde) desde = null;

  if (desde === null && (!d.temConversa || soBoasVindas) && d.status === "open" && !respondido) desde = ms(d.criadoEm);

  // A entrega inicial (atribuição no instante da criação) não reinicia nada;
  // uma troca de corretor depois dela, sim.
  if (desde !== null) {
    const atribuido = ms(d.atribuidoEm);
    const criado = ms(d.criadoEm);
    if (atribuido !== null && criado !== null && atribuido - criado > 60_000 && atribuido > desde) desde = atribuido;
  }
  return desde;
}
