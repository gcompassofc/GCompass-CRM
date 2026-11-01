/**
 * Regras da rotina de lembretes da OPA, sem acesso a banco: quais avisos valem
 * para um lead, quando o lead passa para o próximo da roleta e quando o negócio
 * conta como parado. O que roda de verdade fica em `rotina-lembretes.ts`; aqui
 * mora só a decisão, para testar com número e não com WhatsApp.
 */
import type { ConfigOpa, RegraLembrete, Trilha } from "./config";

export type TrilhaDeResposta = Extract<Trilha, "pago" | "organico">;

/** "20 min sem resposta" vira 20; "1 h sem resposta" vira 60; texto sem prazo vira null. */
export function minutosDaRegra(quando: string): number | null {
  const m = /(\d+)\s*(min|h)\b/i.exec(quando);
  if (!m) return null;
  return Number(m[1]) * (m[2]!.toLowerCase() === "h" ? 60 : 1);
}

/** O prazo de primeira resposta e os avisos da trilha, vindos de Configurações. */
export function prazosDaTrilha(config: ConfigOpa, trilha: TrilhaDeResposta): { prazoMin: number; avisos: number[] } {
  const prazoMin = trilha === "pago" ? config.prazos.pago_min : config.prazos.organico_min;
  const avisos = (trilha === "pago" ? config.prazos.avisos_pago : config.prazos.avisos_organico)
    .filter((a) => a > 0 && a < prazoMin)
    .sort((a, b) => a - b);
  return { prazoMin, avisos };
}

const regrasDa = (config: ConfigOpa, trilha: Trilha): RegraLembrete[] => config.lembretes.filter((r) => r.trilha === trilha);

/**
 * Um aviso aos N minutos está ligado se alguma regra da trilha com esse prazo
 * está ativa, ou se nenhuma regra o menciona. Desligar a regra na tela
 * Lembretes desliga o aviso.
 */
export function avisoLigado(config: ConfigOpa, trilha: TrilhaDeResposta, minuto: number): boolean {
  const regras = regrasDa(config, trilha).filter(
    (r) => /sem resposta/i.test(r.quando) && minutosDaRegra(r.quando) === minuto && !/passa para o pr[óo]ximo/i.test(r.oQue),
  );
  return regras.length === 0 || regras.some((r) => r.ativa);
}

/** O repasse da roleta vale a menos que a regra "passa para o próximo" da trilha esteja desligada. */
export function repasseLigado(config: ConfigOpa, trilha: TrilhaDeResposta): boolean {
  const regras = regrasDa(config, trilha).filter((r) => /passa para o pr[óo]ximo/i.test(r.oQue) && /sem resposta/i.test(r.quando));
  return regras.length === 0 || regras.some((r) => r.ativa);
}

/** Avisos que já deviam ter saído com a espera de `esperaMin` minutos (do menor para o maior). */
export function avisosDevidos(config: ConfigOpa, trilha: TrilhaDeResposta, esperaMin: number): number[] {
  return prazosDaTrilha(config, trilha).avisos.filter((a) => esperaMin >= a && avisoLigado(config, trilha, a));
}

// ---------------------------------------------------------------- repasse

export type DecisaoRepasse =
  | { tipo: "nada"; motivo: "proprio" | "desligado" | "no_prazo" }
  | { tipo: "passar"; para: string }
  /** Todos da roleta já tentaram (ou ninguém está disponível): a gestão decide. */
  | { tipo: "escalar" };

export interface EntradaRepasse {
  esperaMin: number;
  prazoMin: number;
  /** Lead que o corretor trouxe (link, WhatsApp ou cadastro dele) fica com ele. */
  proprio: boolean;
  repasseLigado: boolean;
  donoId: string | null;
  roleta: string[];
  pausados: string[];
  /** Quem já segurou este lead neste ciclo (sem contar o dono de agora). */
  jaTentaram: string[];
}

/**
 * Próximo da roleta depois do dono atual, na ordem da configuração, pulando
 * quem está pausado e quem já tentou. Não mexe no ponteiro global da roleta
 * (`roleta_ultimo`): o repasse não tira a vez de quem vem de lead novo.
 */
export function decidirRepasse(e: EntradaRepasse): DecisaoRepasse {
  if (e.esperaMin < e.prazoMin) return { tipo: "nada", motivo: "no_prazo" };
  if (e.proprio) return { tipo: "nada", motivo: "proprio" };
  if (!e.repasseLigado) return { tipo: "nada", motivo: "desligado" };

  const n = e.roleta.length;
  if (n === 0) return { tipo: "escalar" };
  const inicio = e.donoId ? e.roleta.indexOf(e.donoId) : -1;
  const vetados = new Set([...e.pausados, ...e.jaTentaram, ...(e.donoId ? [e.donoId] : [])]);
  for (let passo = 1; passo <= n; passo++) {
    const candidato = e.roleta[(inicio + passo + n) % n]!;
    if (!vetados.has(candidato)) return { tipo: "passar", para: candidato };
  }
  return { tipo: "escalar" };
}

// ---------------------------------------------------------------- negócio parado

export interface LimiteParado {
  etapa: string;
  dias: number;
}

/**
 * Negócio parado por etapa (F10), lido das regras de cadência ativas que dizem
 * "Parado N dias" (padrão: proposta 7, negociação 14, fechamento 30). A etapa da
 * regra vira o slug do funil.
 */
export function limitesDeParado(config: ConfigOpa): LimiteParado[] {
  const slugs: Record<string, string> = { "proposta feita": "proposta", negociacao: "negociacao", fechamento: "fechamento" };
  const limites: LimiteParado[] = [];
  for (const r of regrasDa(config, "cadencia")) {
    if (!r.ativa) continue;
    const dias = /parado\s+(\d+)\s+dias?/i.exec(r.quando);
    const etapa = slugs[r.etapa.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()];
    if (dias && etapa) limites.push({ etapa, dias: Number(dias[1]) });
  }
  return limites;
}
