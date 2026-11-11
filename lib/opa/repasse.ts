/**
 * Regras da rotina de lembretes da OPA, sem acesso a banco: quais avisos valem
 * para um lead, quando o lead passa para o próximo da roleta e quando o negócio
 * conta como parado. O que roda de verdade fica em `rotina-lembretes.ts`; aqui
 * mora só a decisão, para testar com número e não com WhatsApp.
 */
import { avisoAtivo, type ConfigOpa, type RegraLembrete, type Trilha } from "./config";

export type TrilhaDeResposta = Extract<Trilha, "pago" | "organico">;

/** "20 min sem resposta" vira 20; "1 h sem resposta" vira 60; texto sem prazo vira null. */
export function minutosDaRegra(quando: string): number | null {
  const m = /(\d+)\s*(min|h)\b/i.exec(quando);
  if (!m) return null;
  return Number(m[1]) * (m[2]!.toLowerCase() === "h" ? 60 : 1);
}

/**
 * O prazo de primeira resposta e os avisos da trilha, vindos de Configurações. Com o
 * repasse valendo, aviso no fim do prazo ou depois dele não existe (o lead já passou
 * adiante). Com o repasse desligado (10/11/2026), o lead fica com o corretor e todos os
 * lembretes configurados saem, inclusive o de 1 h de um prazo de 1 h.
 */
export function prazosDaTrilha(config: ConfigOpa, trilha: TrilhaDeResposta): { prazoMin: number; avisos: number[] } {
  const prazoMin = trilha === "pago" ? config.prazos.pago_min : config.prazos.organico_min;
  const teto = repasseAtivo(config, trilha) ? prazoMin : Number.POSITIVE_INFINITY;
  const avisos = [...new Set(trilha === "pago" ? config.prazos.avisos_pago : config.prazos.avisos_organico)]
    .filter((a) => a > 0 && a < teto)
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

/** O lead troca de corretor no fim do prazo? Precisa do tipo "repasse" ligado e da regra da trilha. */
export function repasseAtivo(config: ConfigOpa, trilha: TrilhaDeResposta): boolean {
  return avisoAtivo(config, "repasse") && repasseLigado(config, trilha);
}

/**
 * Lembrete de prazo só sai perto da hora dele (10/11/2026). Atrasado além disto (rotina
 * parada, número pausado, tipo de aviso religado depois), fica registrado e não é mandado:
 * lembrete velho só confunde.
 */
export const ATRASO_MAX_DO_AVISO_MIN = 15;

export function avisoNaHora(avisoMin: number, esperaMin: number): boolean {
  return esperaMin >= avisoMin && esperaMin - avisoMin <= ATRASO_MAX_DO_AVISO_MIN;
}

/** Avisos que já deviam ter saído com a espera de `esperaMin` minutos (do menor para o maior). */
export function avisosDevidos(config: ConfigOpa, trilha: TrilhaDeResposta, esperaMin: number): number[] {
  return prazosDaTrilha(config, trilha).avisos.filter((a) => esperaMin >= a && avisoLigado(config, trilha, a));
}

/** Avisos de prazo que a trilha manda de fato (configurados e ligados). */
export function avisosLigados(config: ConfigOpa, trilha: TrilhaDeResposta): number[] {
  return prazosDaTrilha(config, trilha).avisos.filter((a) => avisoLigado(config, trilha, a));
}

// ---------------------------------------------------------------- primeira resposta

export interface DadosDaPrimeiraResposta {
  /** Criação do lead (ISO). */
  criadoEm: string;
  /** custom_fields.respondido_em: "Respondi" ou ligação (nunca é apagado). */
  respondidoEm?: string | null;
  /** Última mensagem do corretor na conversa do contato. */
  ultimaSaidaEm?: string | null;
}

/**
 * O lead ainda espera o PRIMEIRO atendimento? Só ele entra nos avisos de prazo e
 * no repasse da roleta (pendências de 01/11/2026, A2). Lead que já teve resposta
 * (mensagem depois que entrou, ligação ou "Respondi") fica com o corretor mesmo
 * que o cliente escreva de novo e espere: um "ok, obrigado" em negociação não
 * pode tirar o lead de quem atende. Mensagem do corretor de antes de o lead
 * existir (conversa antiga do mesmo contato) não conta.
 */
export function aguardaPrimeiraResposta(d: DadosDaPrimeiraResposta): boolean {
  if (d.respondidoEm) return false;
  const criado = Date.parse(d.criadoEm);
  const saiu = d.ultimaSaidaEm ? Date.parse(d.ultimaSaidaEm) : NaN;
  return !(Number.isFinite(saiu) && Number.isFinite(criado) && saiu > criado);
}

/** A roleta só com quem ainda está na equipe (quem saiu nunca recebe repasse). */
export function roletaDaEquipe(roleta: string[], equipe: { has(id: string): boolean }): string[] {
  return roleta.filter((id) => equipe.has(id));
}

/**
 * Pode passar o lead adiante? Só se o dono foi avisado antes (algum aviso de
 * prazo saiu de fato), ou se a trilha não tem aviso nenhum ligado. Sem aviso
 * entregue (OPA Lembretes desconectado, corretor sem número), o lead vai para a
 * gestão decidir, não para o próximo da fila (C4).
 */
export function repasseLiberado(p: { avisoSaiu: boolean; avisosDaTrilha: number }): boolean {
  return p.avisoSaiu || p.avisosDaTrilha === 0;
}

// ---------------------------------------------------------------- lembrete agendado

/**
 * O que fazer com o lembrete depois da tentativa (C3). Só "enviado" confirma.
 * "erro" é ambíguo (o WhatsApp não confirmou, mas pode ter entregue): não volta
 * para a fila, para não mandar em dobro. Sem número, sem sessão ou falha antes do
 * envio voltam para a fila até o limite de tentativas.
 */
export function destinoDoLembrete(
  resultado: "enviado" | "sem_numero" | "sem_sessao" | "erro",
  tentativas: number,
  temDestinatario: boolean,
  maxTentativas: number,
): "enviado" | "pendente" | "falhou" {
  if (resultado === "enviado") return "enviado";
  if (resultado === "erro") return "falhou";
  return tentativas >= maxTentativas || !temDestinatario ? "falhou" : "pendente";
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
