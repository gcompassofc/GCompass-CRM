/**
 * Período dos números (Início e telas de gestão): atalhos prontos e intervalo
 * personalizado, sempre no fuso de São Paulo. Fica na URL
 * (`?periodo=7d` ou `?periodo=personalizado&de=2026-10-01&ate=2026-10-15`)
 * para o link compartilhado abrir igual.
 *
 * Cada período traz o anterior do mesmo tamanho, para o "antes" dos cartões.
 */

export type ChavePeriodo = "hoje" | "7d" | "30d" | "mes" | "mes-passado" | "90d" | "ano" | "personalizado";

export interface Periodo {
  chave: ChavePeriodo;
  /** Início, inclusive (ms). */
  de: number;
  /** Fim, exclusivo (ms). */
  ate: number;
  /** Dias de calendário cobertos (para "Leads novos · 12 dias"). */
  dias: number;
  /** Datas aaaa-mm-dd do primeiro e do último dia, para o calendário. */
  deDia: string;
  ateDia: string;
  /** Rótulo do botão: "7 dias", "Este mês", "1 a 15 out". */
  rotulo: string;
  anterior: { de: number; ate: number };
  /** Hoje em São Paulo (o calendário desliga os dias depois dele). */
  hoje: string;
}

export const ATALHOS: Array<{ chave: Exclude<ChavePeriodo, "personalizado">; rotulo: string }> = [
  { chave: "hoje", rotulo: "Hoje" },
  { chave: "7d", rotulo: "7 dias" },
  { chave: "30d", rotulo: "30 dias" },
  { chave: "mes", rotulo: "Este mês" },
  { chave: "mes-passado", rotulo: "Mês passado" },
  { chave: "90d", rotulo: "90 dias" },
  { chave: "ano", rotulo: "Este ano" },
];

const DIA_MS = 86_400_000;
const FUSO = "-03:00";
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/** aaaa-mm-dd de um instante, no fuso de São Paulo. */
export function diaSP(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(ms),
  );
}

/** Meia-noite de São Paulo do dia aaaa-mm-dd, em ms. */
export function inicioDoDia(dia: string): number {
  return Date.parse(`${dia}T00:00:00${FUSO}`);
}

export function somarDias(dia: string, n: number): string {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d! + n)).toISOString().slice(0, 10);
}

function diaValido(d: string | undefined): d is string {
  return Boolean(d && /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(inicioDoDia(d)));
}

/** "1 a 15 out", "28 set a 3 out", "15 out" ou com ano quando muda de ano. */
export function rotuloIntervalo(deDia: string, ateDia: string): string {
  const [a1, m1, d1] = deDia.split("-").map(Number);
  const [a2, m2, d2] = ateDia.split("-").map(Number);
  if (deDia === ateDia) return `${d1} ${MESES[m1! - 1]}`;
  if (a1 !== a2) return `${d1} ${MESES[m1! - 1]} ${a1} a ${d2} ${MESES[m2! - 1]} ${a2}`;
  if (m1 === m2) return `${d1} a ${d2} ${MESES[m2! - 1]}`;
  return `${d1} ${MESES[m1! - 1]} a ${d2} ${MESES[m2! - 1]}`;
}

/**
 * Lê `periodo`, `de` e `ate` da URL. Aceita o formato antigo `periodo=30`.
 * Personalizado inválido (datas trocadas, futuro, mais de 3 anos) cai em 7 dias.
 */
export function resolverPeriodo(
  params: { periodo?: string; de?: string; ate?: string },
  agora = Date.now(),
): Periodo {
  const hoje = diaSP(agora);
  const bruto = params.periodo === "30" ? "30d" : params.periodo === "7" ? "7d" : params.periodo;
  let chave: ChavePeriodo = (["hoje", "7d", "30d", "mes", "mes-passado", "90d", "ano", "personalizado"] as const).includes(
    bruto as ChavePeriodo,
  )
    ? (bruto as ChavePeriodo)
    : "7d";

  let deDia: string;
  let ateDia = hoje;
  switch (chave) {
    case "hoje":
      deDia = hoje;
      break;
    case "30d":
      deDia = somarDias(hoje, -29);
      break;
    case "90d":
      deDia = somarDias(hoje, -89);
      break;
    case "mes":
      deDia = `${hoje.slice(0, 7)}-01`;
      break;
    case "mes-passado": {
      const primeiroDeste = `${hoje.slice(0, 7)}-01`;
      ateDia = somarDias(primeiroDeste, -1);
      deDia = `${ateDia.slice(0, 7)}-01`;
      break;
    }
    case "ano":
      deDia = `${hoje.slice(0, 4)}-01-01`;
      break;
    case "personalizado": {
      const ok =
        diaValido(params.de) &&
        diaValido(params.ate) &&
        params.de <= params.ate &&
        params.ate <= hoje &&
        inicioDoDia(params.ate) - inicioDoDia(params.de) <= 3 * 366 * DIA_MS;
      if (ok) {
        deDia = params.de!;
        ateDia = params.ate!;
      } else {
        chave = "7d";
        deDia = somarDias(hoje, -6);
      }
      break;
    }
    default:
      deDia = somarDias(hoje, -6);
  }

  const de = inicioDoDia(deDia);
  const ate = inicioDoDia(somarDias(ateDia, 1));
  const dias = Math.round((ate - de) / DIA_MS);
  const atalho = ATALHOS.find((a) => a.chave === chave);
  return {
    chave,
    de,
    ate,
    dias,
    deDia,
    ateDia,
    rotulo: atalho ? atalho.rotulo : rotuloIntervalo(deDia, ateDia),
    anterior: { de: de - (ate - de), ate: de },
    hoje,
  };
}

export function noIntervalo(iso: string | null | undefined, intervalo: { de: number; ate: number }): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return t >= intervalo.de && t < intervalo.ate;
}

/** Parâmetros de URL do período, para links que preservam a escolha. */
export function paramsDoPeriodo(p: Pick<Periodo, "chave" | "deDia" | "ateDia">): Record<string, string> {
  if (p.chave === "7d") return {};
  if (p.chave === "personalizado") return { periodo: "personalizado", de: p.deDia, ate: p.ateDia };
  return { periodo: p.chave };
}
