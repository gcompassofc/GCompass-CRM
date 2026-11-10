/**
 * Contatos do WhatsApp do corretor (regra vigente desde 05/11/2026, decisão do Allyson).
 *
 * Toda conversa do número é pessoal e não aparece no CRM. Só entra:
 *   - quem o corretor marca (etiqueta "Lead OPA" no WhatsApp Business);
 *   - quem é cadastrado no CRM;
 *   - quem chega por ação da OPA: anúncio de clique para o WhatsApp ou botão do site.
 *
 * Lead que veio por ação da OPA é da OPA: o corretor não o marca como pessoal, não o
 * torna próprio e não para o prazo. Só o gestor faz, com registro (ehLeadDaOpa).
 *
 * Mensagem de quem não é lead fica cifrada por até 7 dias, sem tela nenhuma, para o
 * histórico recente entrar quando o contato virar lead. "Pessoal" apaga na hora.
 *
 * Este arquivo é só regra, sem banco: quem grava é lib/waha/contatos-pessoais.ts.
 */

export type Situacao = "pessoal" | "lead" | "a_classificar";
export type OrigemContato = "importacao" | "etiqueta" | "corretor" | "campanha" | "site" | "lead_do_crm" | "novo";

/** Motivo de perda de quem era contato pessoal e entrou como lead (03/11/2026). */
export const MOTIVO_PESSOAL = "Contato pessoal";

/**
 * Lead da OPA: tudo o que o corretor não trouxe. Lead próprio é o único com a etiqueta
 * `proprio`, que só o servidor e o gerente gravam (0121).
 */
export function ehLeadDaOpa(tags: readonly string[] | null | undefined): boolean {
  return !(tags ?? []).includes("proprio");
}

/** Nomes das etiquetas criadas no WhatsApp Business do corretor. */
export const ETIQUETAS = { lead: "Lead OPA", pessoal: "Pessoal" } as const;

/** Até quanto da conversa antiga entra quando o contato vira lead (contexto para a IA). */
export const HISTORICO_AO_VIRAR_LEAD = 40;

/** Depois de ligar o número, a janela em que tudo o que chega ainda é tratado como do aparelho. */
export const JANELA_IMPORTACAO_MS = 15 * 60_000;

/** Sem decisão do corretor, a conversa guardada de um contato a classificar some depois disto. */
export const ESPERA_DIAS = 7;
export const ESPERA_MS = ESPERA_DIAS * 24 * 60 * 60_000;

/** Quantas mensagens ficam guardadas por contato a classificar (as mais recentes; o banco corta o resto). */
export const ESPERA_MAX_POR_CONTATO = 20;

/**
 * Tipos de mensagem guardados enquanto o corretor decide (o vocabulário de
 * `messages.type`). Reação e o que não for conteúdo não entram.
 */
export const TIPOS_EM_ESPERA = ["text", "audio", "image", "video", "document", "sticker", "location", "contact"] as const;
export type TipoEmEspera = (typeof TIPOS_EM_ESPERA)[number];

export function tipoEmEspera(tipo: string): tipo is TipoEmEspera {
  return (TIPOS_EM_ESPERA as readonly string[]).includes(tipo);
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
  ["Info", "SenderAlt"], // GOWS
];
const CAMPOS_TELEFONE_SAIDA: ReadonlyArray<readonly string[]> = [
  ["key", "remoteJidAlt"],
  ["remoteJidAlt"],
  ["Info", "RecipientAlt"], // GOWS
];

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
// O endereço do CRM (crm.opailhabela.com.br) não é o site: ele vem nos avisos do OPA
// Lembretes ("Ficha: https://crm..."), e sem esta exceção o aviso virava lead (10/11/2026).
const TEXTO_DO_SITE = /((?<!crm\.)opailhabela\.com\.br|tenho interesse no im[oó]vel|quero saber mais sobre o im[oó]vel)/i;
// Em minúsculas: a grafia muda de um motor do WAHA para o outro.

/** "FB_Ads", "ctwa_ad", "ig_ads": o valor diz que veio de anúncio. "contact_card" ou "global_search" não. */
const VALOR_DE_ANUNCIO = /(^|[_-])(ads?|ctwa)($|[_-])/i;

/**
 * Marca de anúncio, em qualquer profundidade e nas grafias dos dois motores do WAHA.
 * Só a presença da chave não basta: em 02 e 03/11/2026 conversas pessoais entraram
 * como anúncio porque o WhatsApp preenche `conversionSource` e `entryPointConversionSource`
 * em conversas comuns, e `externalAdReply` também aparece em prévia de link.
 */
function temMarcaDeAnuncio(obj: unknown, profundidade = 0): boolean {
  if (!obj || typeof obj !== "object" || profundidade > 8) return false;
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const chave = k.toLowerCase();
    if ((chave === "ctwaclid" || chave === "ctwa_clid") && typeof v === "string" && v !== "") return true;
    if ((chave === "conversionsource" || chave === "entrypointconversionsource" || chave === "sourcetype") && typeof v === "string" && VALOR_DE_ANUNCIO.test(v)) return true;
    if (typeof v === "object" && temMarcaDeAnuncio(v, profundidade + 1)) return true;
  }
  return false;
}

/**
 * Sinal de que o contato veio de anúncio ou do site. O anúncio de clique para o
 * WhatsApp traz `ctwaClid` e a origem marcada como anúncio; o botão do site chega
 * com o texto pronto ("Tenho interesse no imóvel CA006634 ...").
 */
export function sinalDeEntrada(p: { body?: string | null; _data?: unknown }): Sinal | null {
  const body = p.body ?? "";
  const codigo = body.match(CODIGO_IMOVEL)?.[1] ?? null;
  if (temMarcaDeAnuncio(p._data)) return { origem: "campanha", imovelCodigo: codigo };
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
 * A regra inteira em uma função. Lead do CRM ganha de tudo. O sinal do site também
 * ganha de "pessoal": se não fosse assim, bastaria marcar o número como pessoal antes
 * para o lead da OPA nunca entrar (05/11/2026).
 *
 * Anúncio de WhatsApp NÃO vira lead sozinho (09/11/2026, pedido do Allyson): o
 * corretor pode ter campanha própria apontando para o próprio número (caso do
 * Rodrigo), e o CRM não sabe qual anúncio é da OPA. Fica como qualquer conversa que
 * começou fora: a classificar (ou pessoal), e entra quando o corretor marca OPA.
 */
export function decidir(e: EntradaDecisao): Decisao {
  if (e.atual === "lead") return { situacao: "lead", origem: null, gravar: true, virouLead: false };
  if (e.temLeadNoCrm) return { situacao: "lead", origem: "lead_do_crm", gravar: true, virouLead: true };

  const sinalDoCliente = e.direcao === "entrada" && e.sinal?.origem === "site" ? e.sinal : null;
  if (sinalDoCliente) return { situacao: "lead", origem: sinalDoCliente.origem, gravar: true, virouLead: true };

  if (e.atual === "pessoal") return { situacao: "pessoal", origem: null, gravar: false, virouLead: false };

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
