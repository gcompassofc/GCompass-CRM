/**
 * Contatos do WhatsApp do corretor: o que é pessoal, o que é lead (pedido do
 * Allyson, 01/11/2026).
 *
 * O corretor liga o próprio número. Tudo o que já estava no aparelho é pessoal: o
 * CRM não guarda a conversa e a IA não lê. Vira lead, e só então é guardado e
 * lido, o contato que:
 *   - já é lead no CRM (porta de entrada, cadastro do corretor);
 *   - chega por anúncio de clique para o WhatsApp ou pelo botão do site;
 *   - o corretor marca como lead (etiqueta "Lead OPA" do WhatsApp Business ou o
 *     botão "É lead" no CRM).
 * O resto que chega depois de ligar o número fica "a classificar": desde
 * 02/11/2026 (decisão do Allyson) guarda nome, número e as últimas mensagens,
 * cifrados e só para o dono do número, até ele decidir. "Pessoal" apaga tudo; sem
 * decisão, as mensagens somem sozinhas em 7 dias.
 *
 * Este arquivo é só regra, sem banco: quem grava é lib/waha/contatos-pessoais.ts.
 */

export type Situacao = "pessoal" | "lead" | "a_classificar";
export type OrigemContato = "importacao" | "etiqueta" | "corretor" | "campanha" | "site" | "lead_do_crm" | "novo";

/** Nomes das etiquetas criadas no WhatsApp Business do corretor. */
export const ETIQUETAS = { lead: "Lead OPA", pessoal: "Pessoal" } as const;

/** Até quanto da conversa antiga entra quando o contato vira lead (contexto para a IA). */
export const HISTORICO_AO_VIRAR_LEAD = 40;

/** Depois de ligar o número, a janela em que tudo o que chega ainda é tratado como do aparelho. */
export const JANELA_IMPORTACAO_MS = 15 * 60_000;

/** Quantos "a classificar" a tela mostra de uma vez (o resto entra conforme decide). */
export const LIMITE_A_CLASSIFICAR = 20;

/** Sem decisão do corretor, a conversa guardada de um contato a classificar some depois disto. */
export const ESPERA_DIAS = 7;
export const ESPERA_MS = ESPERA_DIAS * 24 * 60 * 60_000;

/** Quantas mensagens ficam guardadas por contato a classificar (as mais recentes; o banco corta o resto). */
export const ESPERA_MAX_POR_CONTATO = 20;

/** Quantas mensagens o "Ver conversa" mostra. */
export const CONVERSA_NA_TELA = 5;

/**
 * Tipos de mensagem guardados enquanto o corretor decide (o vocabulário de
 * `messages.type`). Reação e o que não for conteúdo não entram.
 */
export const TIPOS_EM_ESPERA = ["text", "audio", "image", "video", "document", "sticker", "location", "contact"] as const;
export type TipoEmEspera = (typeof TIPOS_EM_ESPERA)[number];

export function tipoEmEspera(tipo: string): tipo is TipoEmEspera {
  return (TIPOS_EM_ESPERA as readonly string[]).includes(tipo);
}

/** Mídia não é baixada enquanto espera: vira um marcador, como na leitura da IA. */
const MARCADOR_DE_MIDIA: Record<Exclude<TipoEmEspera, "text">, string> = {
  audio: "[áudio]",
  image: "[foto]",
  video: "[vídeo]",
  document: "[documento]",
  sticker: "[figurinha]",
  location: "[localização]",
  contact: "[contato]",
};

/** O texto de uma mensagem em espera para a tela: mídia vira marcador, com a legenda se houver. */
export function textoDaEspera(tipo: string, corpo: string | null): string {
  const marca = tipo !== "text" && tipoEmEspera(tipo) ? MARCADOR_DE_MIDIA[tipo as Exclude<TipoEmEspera, "text">] : null;
  const texto = corpo?.trim() ? corpo.trim() : null;
  if (marca) return texto ? `${marca} ${texto}` : marca;
  return texto ?? "";
}

/**
 * Onde o payload do NOWEB pode trazer o telefone de um contato `@lid`, sem o
 * store ligado. NÃO CONFERIDO COM PAYLOAD REAL (02/11/2026): são os nomes que o
 * Baileys usa (`key.remoteJidAlt` nas versões novas, `key.senderPn` nas antigas,
 * `participantPn`). Na saída só vale o do chat: `senderPn` seria o do corretor.
 */
const CAMPOS_TELEFONE_ENTRADA: ReadonlyArray<readonly string[]> = [
  ["key", "remoteJidAlt"],
  ["key", "senderPn"],
  ["senderPn"],
  ["key", "participantPn"],
  ["participantPn"],
  ["remoteJidAlt"],
];
const CAMPOS_TELEFONE_SAIDA: ReadonlyArray<readonly string[]> = [["key", "remoteJidAlt"], ["remoteJidAlt"]];

const JID_DE_TELEFONE = /^\+?(\d{8,15})(?::\d+)?@(?:s\.whatsapp\.net|c\.us)$/;

function campo(obj: unknown, caminho: readonly string[]): unknown {
  let atual: unknown = obj;
  for (const k of caminho) {
    if (!atual || typeof atual !== "object") return undefined;
    atual = (atual as Record<string, unknown>)[k];
  }
  return atual;
}

/**
 * Telefone (E.164, "+55...") de um contato que o WhatsApp mandou com número
 * oculto (`@lid`), lido dos campos alternativos do payload. Só aceita valor que
 * termine em `@s.whatsapp.net` ou `@c.us`; sem nenhum, devolve null.
 */
export function telefoneAlternativo(p: { _data?: unknown }, direcao: "entrada" | "saida"): string | null {
  const campos = direcao === "entrada" ? CAMPOS_TELEFONE_ENTRADA : CAMPOS_TELEFONE_SAIDA;
  for (const c of campos) {
    const v = campo(p._data, c);
    if (typeof v !== "string") continue;
    const m = v.trim().match(JID_DE_TELEFONE);
    if (m?.[1]) return `+${m[1]}`;
  }
  return null;
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/**
 * Chat que nunca é contato de cliente: grupo, transmissão, status e canal. Esses
 * não passam nem pela classificação.
 */
export function chatIgnorado(chatId: string): boolean {
  return (
    chatId === "" ||
    chatId.endsWith("@g.us") ||
    chatId.endsWith("@broadcast") ||
    chatId.endsWith("@newsletter") ||
    chatId.startsWith("status@")
  );
}

/** "Lead OPA", "lead", "LEAD" contam como lead; "Pessoal" como pessoal. */
export function etiquetaDe(nome: string | null | undefined): "lead" | "pessoal" | null {
  if (!nome) return null;
  const n = semAcento(nome);
  if (n === semAcento(ETIQUETAS.lead) || n === "lead") return "lead";
  if (n === semAcento(ETIQUETAS.pessoal)) return "pessoal";
  return null;
}

export interface Sinal {
  origem: "campanha" | "site";
  imovelCodigo: string | null;
}

const CODIGO_IMOVEL = /\b([A-Z]{2}\d{6})\b/;
const TEXTO_DO_SITE = /(opailhabela\.com\.br|tenho interesse no im[oó]vel|quero saber mais sobre o im[oó]vel)/i;
const CHAVES_DE_ANUNCIO = ["externalAdReply", "ctwaClid", "ctwa_clid", "conversionSource", "referral", "entryPointConversionSource"];

function temChave(obj: unknown, chaves: string[], profundidade = 0): boolean {
  if (!obj || typeof obj !== "object" || profundidade > 6) return false;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (chaves.includes(k) && v != null && v !== "") return true;
    if (typeof v === "object" && temChave(v, chaves, profundidade + 1)) return true;
  }
  return false;
}

/**
 * Sinal de que o contato veio de anúncio ou do site. O anúncio de clique para o
 * WhatsApp chega com `externalAdReply`/`ctwaClid` no `_data`; o botão do site chega
 * com o texto pronto ("Tenho interesse no imóvel CA006634 ...").
 */
export function sinalDeEntrada(p: { body?: string | null; _data?: unknown }): Sinal | null {
  const body = p.body ?? "";
  const codigo = body.match(CODIGO_IMOVEL)?.[1] ?? null;
  if (temChave(p._data, CHAVES_DE_ANUNCIO)) return { origem: "campanha", imovelCodigo: codigo };
  if (TEXTO_DO_SITE.test(body)) return { origem: "site", imovelCodigo: codigo };
  return null;
}

export interface EntradaDecisao {
  /** Situação gravada hoje para este contato neste número (null = nunca visto). */
  atual: Situacao | null;
  /** O CRM já tem lead para este contato. */
  temLeadNoCrm: boolean;
  sinal: Sinal | null;
  /** "entrada" = o cliente escreveu; "saida" = o corretor escreveu do celular. */
  direcao: "entrada" | "saida";
  /** Ainda na janela logo depois de ligar o número (o que chega é do aparelho). */
  emImportacao: boolean;
}

export interface Decisao {
  situacao: Situacao;
  /** Origem a gravar quando a situação muda (ou o contato é novo). */
  origem: OrigemContato | null;
  /** A mensagem é guardada no CRM (e a IA pode ler). */
  gravar: boolean;
  /** Acabou de virar lead: criar o lead no CRM e trazer o histórico recente. */
  virouLead: boolean;
}

/**
 * A regra inteira em uma função. Lead do CRM ganha de tudo; pessoal só sai de
 * pessoal por etiqueta, botão do corretor ou lead do CRM (sinal de anúncio vindo de
 * um contato pessoal só o põe para o corretor decidir).
 */
export function decidir(e: EntradaDecisao): Decisao {
  if (e.atual === "lead") return { situacao: "lead", origem: null, gravar: true, virouLead: false };
  if (e.temLeadNoCrm) return { situacao: "lead", origem: "lead_do_crm", gravar: true, virouLead: true };

  const sinalDoCliente = e.direcao === "entrada" ? e.sinal : null;

  if (e.atual === "pessoal") {
    if (sinalDoCliente) return { situacao: "a_classificar", origem: sinalDoCliente.origem, gravar: false, virouLead: false };
    return { situacao: "pessoal", origem: null, gravar: false, virouLead: false };
  }

  if (sinalDoCliente) return { situacao: "lead", origem: sinalDoCliente.origem, gravar: true, virouLead: true };

  if (e.atual === "a_classificar") return { situacao: "a_classificar", origem: null, gravar: false, virouLead: false };

  // Nunca visto: logo depois de ligar o número, é conversa do aparelho.
  if (e.emImportacao) return { situacao: "pessoal", origem: "importacao", gravar: false, virouLead: false };
  return { situacao: "a_classificar", origem: "novo", gravar: false, virouLead: false };
}

/**
 * A janela começa quando o número fica conectado pela primeira vez e dura 15
 * minutos: o que aparece nela é conversa que já estava no aparelho (a lista de
 * conversas não é lida de propósito, ver lib/waha/client.ts). Fora dela, ou sem
 * início marcado, contato nunca visto fica "a classificar".
 */
export function emJanelaDeImportacao(
  s: { pessoais_import_inicio: string | null; pessoais_importados_em: string | null },
  agora = Date.now(),
): boolean {
  if (s.pessoais_importados_em || !s.pessoais_import_inicio) return false;
  return agora - Date.parse(s.pessoais_import_inicio) < JANELA_IMPORTACAO_MS;
}

/** O que muda quando o corretor decide (botão no CRM ou etiqueta no WhatsApp). */
export function decisaoDoCorretor(nova: "lead" | "pessoal"): { situacao: Situacao; apagarConteudo: boolean; criarLead: boolean } {
  return nova === "lead"
    ? { situacao: "lead", apagarConteudo: false, criarLead: true }
    : { situacao: "pessoal", apagarConteudo: true, criarLead: false };
}
