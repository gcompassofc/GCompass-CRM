/**
 * Agenda do corretor (01/11/2026, pedido do Allyson: "bem fácil"): os retornos
 * marcados em três grupos (hoje, próximos, já saíram) e os prazos das regras
 * em linguagem de gente ("Dia 1, às 9h" no lugar de "D1, 9h").
 *
 * Funções puras: a tela lê do banco e só chama estas para arrumar.
 */
import { diaSP, somarDias } from "./periodo";

export interface ItemAgenda {
  id: string;
  quando: string;
  status: string;
}

export interface AgendaAgrupada<T extends ItemAgenda> {
  /** Esperando, com hora de hoje ou que já passou (sai no próximo minuto). */
  hoje: T[];
  /** Esperando, de amanhã em diante. */
  proximos: T[];
  /** Enviados ou que não saíram, da última semana: os mais novos primeiro. */
  saiu: T[];
}

const ESPERANDO = new Set(["pendente", "enviando"]);

export function agruparAgenda<T extends ItemAgenda>(itens: T[], agora: number): AgendaAgrupada<T> {
  const hojeSP = diaSP(agora);
  const porHora = (a: T, b: T) => a.quando.localeCompare(b.quando);
  const esperando = itens.filter((i) => ESPERANDO.has(i.status)).sort(porHora);
  return {
    hoje: esperando.filter((i) => diaSP(Date.parse(i.quando)) <= hojeSP),
    proximos: esperando.filter((i) => diaSP(Date.parse(i.quando)) > hojeSP),
    saiu: itens.filter((i) => !ESPERANDO.has(i.status) && i.status !== "cancelado").sort((a, b) => porHora(b, a)),
  };
}

const DIA_SEMANA = new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" });
const DIA_MES = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
const HORA = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

/** "Hoje", "Amanhã", "Ontem" ou "qua, 05/11", no horário de São Paulo. */
export function diaFalado(iso: string, agora: number): string {
  const ms = Date.parse(iso);
  const dia = diaSP(ms);
  const hoje = diaSP(agora);
  if (dia === hoje) return "Hoje";
  if (dia === somarDias(hoje, 1)) return "Amanhã";
  if (dia === somarDias(hoje, -1)) return "Ontem";
  return `${DIA_SEMANA.format(ms).replace(".", "")}, ${DIA_MES.format(ms)}`;
}

/** "09:00", no horário de São Paulo. */
export function horaSP(iso: string): string {
  return HORA.format(Date.parse(iso));
}

/**
 * Prazo de uma regra sem código: "D1, 9h" vira "Dia 1, às 9h" e
 * "D7, D14, D21, D28" vira "Dias 7, 14, 21 e 28". O resto fica como está.
 */
export function quandoSimples(q: string): string {
  const dias = [...q.matchAll(/\bD\+?(\d+)\b/g)].map((m) => m[1]!);
  if (dias.length === 0) return q;
  const resto = q
    .replace(/\bD\+?\d+\b/g, "")
    .replace(/^[\s,]+|[\s,]+$/g, "")
    .replace(/\s*,\s*,+/g, ",")
    .trim();
  const lista = dias.length === 1 ? `Dia ${dias[0]}` : `Dias ${dias.slice(0, -1).join(", ")} e ${dias[dias.length - 1]}`;
  if (!resto) return lista;
  return `${lista}, ${/^\d/.test(resto) ? `às ${resto}` : resto}`;
}

/** Texto de regra sem código de dia: "(modelo D1 do kit)" vira "(modelo do dia 1 do kit)". */
export function textoSimples(t: string): string {
  return t.replace(/\bmodelo D\+?(\d+)\b/g, "modelo do dia $1").replace(/\bD\+?(\d+)\b/g, "dia $1");
}
