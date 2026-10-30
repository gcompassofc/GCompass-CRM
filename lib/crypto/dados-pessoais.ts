/**
 * Cifra de dados pessoais (nome, telefone, e-mail, texto de conversa) em repouso.
 *
 * Objetivo: um dump do banco (backup vazado, réplica, alguém com SQL) não pode
 * entregar a carteira de leads em massa. A chave nunca fica no banco; o servidor
 * Next cifra antes de gravar e decifra depois de ler.
 *
 * Formato gravado (texto, cabe em coluna `text` e passa pelo PostgREST):
 *   pii1.<versão da chave>.<base64url(iv 12 bytes | cifrado | tag 16 bytes)>
 *
 * - AES-256-GCM com IV aleatório: o mesmo nome gravado duas vezes vira dois
 *   textos diferentes, então não dá para agrupar quem é quem olhando o dump.
 * - AAD = organização + campo: o cifrado de um lead não abre se for copiado
 *   para outra org ou outro campo (troca de colunas por quem tem SQL).
 * - Versão da chave no próprio valor: rotação sem parar o sistema (as chaves
 *   antigas continuam abrindo; `precisaRecifrar` aponta o que regravar).
 *
 * Busca e deduplicação: `indiceCego` (HMAC-SHA256 com chave própria, separada da
 * de cifra, e com a org no meio). Igualdade exata de telefone ou e-mail funciona;
 * o índice sozinho não volta para o número, e o de uma org não serve em outra.
 *
 * Chaves (32 bytes em base64; gerar com `openssl rand -base64 32`):
 *   PII_CHAVES        "v1:<base64>,v2:<base64>"   todas as que ainda abrem dado
 *   PII_CHAVE_ATUAL   "v2"                          a que cifra dado novo
 *   PII_CHAVE_INDICE  "<base64>"                    só do índice cego; trocar exige recalcular
 * Em produção as chaves vêm do cofre de segredos do provedor (ou de um KMS que
 * entrega a chave de dados já aberta no boot); nunca do banco.
 *
 * Valor sem o prefixo `pii1.` é tratado como legado em texto puro e devolvido
 * como está: permite migrar coluna por coluna sem janela de manutenção.
 */
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

const PREFIXO = "pii1";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const CHAVE_BYTES = 32;

export type CampoPessoal = "nome" | "telefone" | "email" | "mensagem" | "observacao";

export interface Contexto {
  /** organization_id dono do dado. */
  org: string;
  campo: CampoPessoal;
}

interface Chaveiro {
  atual: string;
  chaves: Map<string, Buffer>;
  indice: Buffer;
}

let chaveiro: Chaveiro | null = null;

function decodificarChave(nome: string, b64: string): Buffer {
  const buf = Buffer.from(b64.trim(), "base64");
  if (buf.length !== CHAVE_BYTES) {
    throw new Error(`${nome} deve ter 32 bytes em base64 (lido: ${buf.length}). Gere com: openssl rand -base64 32`);
  }
  return buf;
}

function carregarChaveiro(): Chaveiro {
  if (chaveiro) return chaveiro;
  const lista = process.env.PII_CHAVES ?? "";
  const atual = (process.env.PII_CHAVE_ATUAL ?? "").trim();
  const indice = process.env.PII_CHAVE_INDICE ?? "";
  if (!lista || !atual || !indice) {
    throw new Error("Cifra de dados pessoais sem chave: defina PII_CHAVES, PII_CHAVE_ATUAL e PII_CHAVE_INDICE.");
  }
  const chaves = new Map<string, Buffer>();
  for (const par of lista.split(",")) {
    const [versao, b64] = par.split(":");
    if (!versao || !b64 || !/^v\d+$/.test(versao.trim())) throw new Error("PII_CHAVES no formato v1:<base64>,v2:<base64>.");
    chaves.set(versao.trim(), decodificarChave(`PII_CHAVES ${versao}`, b64));
  }
  if (!chaves.has(atual)) throw new Error(`PII_CHAVE_ATUAL (${atual}) não está em PII_CHAVES.`);
  const chaveIndice = decodificarChave("PII_CHAVE_INDICE", indice);
  for (const c of chaves.values()) {
    if (c.equals(chaveIndice)) throw new Error("PII_CHAVE_INDICE precisa ser diferente das chaves de cifra.");
  }
  chaveiro = { atual, chaves, indice: chaveIndice };
  return chaveiro;
}

/** Só para testes: esquece as chaves lidas do ambiente. */
export function esquecerChaves(): void {
  chaveiro = null;
}

/** As chaves estão configuradas? Para telas e rotinas decidirem sem lançar. */
export function cifraConfigurada(): boolean {
  try {
    carregarChaveiro();
    return true;
  } catch {
    return false;
  }
}

function aad(ctx: Contexto): Buffer {
  if (!ctx.org) throw new Error("Contexto de cifra sem organização.");
  return Buffer.from(`${PREFIXO}|${ctx.org}|${ctx.campo}`, "utf8");
}

export function estaCifrado(valor: string | null | undefined): boolean {
  return typeof valor === "string" && valor.startsWith(`${PREFIXO}.`);
}

export function cifrar(texto: string, ctx: Contexto): string;
export function cifrar(texto: string | null | undefined, ctx: Contexto): string | null;
export function cifrar(texto: string | null | undefined, ctx: Contexto): string | null {
  if (texto == null) return null;
  if (estaCifrado(texto)) return texto;
  const { atual, chaves } = carregarChaveiro();
  const iv = randomBytes(IV_BYTES);
  const c = createCipheriv("aes-256-gcm", chaves.get(atual)!, iv);
  c.setAAD(aad(ctx));
  const corpo = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return `${PREFIXO}.${atual}.${Buffer.concat([iv, corpo, c.getAuthTag()]).toString("base64url")}`;
}

export function decifrar(valor: string, ctx: Contexto): string;
export function decifrar(valor: string | null | undefined, ctx: Contexto): string | null;
export function decifrar(valor: string | null | undefined, ctx: Contexto): string | null {
  if (valor == null) return null;
  if (!estaCifrado(valor)) return valor; // legado em texto puro, ainda não migrado
  const [, versao, dados] = valor.split(".");
  const chave = carregarChaveiro().chaves.get(versao ?? "");
  if (!chave) throw new Error(`Chave ${versao} não está mais em PII_CHAVES: dado não pode ser aberto.`);
  const bruto = Buffer.from(dados ?? "", "base64url");
  if (bruto.length < IV_BYTES + TAG_BYTES) throw new Error("Valor cifrado corrompido.");
  const d = createDecipheriv("aes-256-gcm", chave, bruto.subarray(0, IV_BYTES));
  d.setAAD(aad(ctx));
  d.setAuthTag(bruto.subarray(bruto.length - TAG_BYTES));
  return Buffer.concat([d.update(bruto.subarray(IV_BYTES, bruto.length - TAG_BYTES)), d.final()]).toString("utf8");
}

/** O valor foi cifrado com uma chave que não é a atual (rotina de rotação regrava). */
export function precisaRecifrar(valor: string | null | undefined): boolean {
  if (!estaCifrado(valor)) return valor != null;
  return valor!.split(".")[1] !== carregarChaveiro().atual;
}

/** Abre com a chave antiga e fecha de novo com a atual. */
export function recifrar(valor: string, ctx: Contexto): string {
  return cifrar(decifrar(valor, ctx), ctx);
}

/** Telefone só com dígitos e DDI 55 quando vier no formato nacional. */
export function normalizarTelefoneIndice(tel: string): string {
  const d = tel.replace(/\D/g, "");
  return d.length === 10 || d.length === 11 ? `55${d}` : d;
}

export function normalizarEmailIndice(email: string): string {
  return email.trim().toLowerCase();
}

/** HMAC-SHA256 do valor já normalizado, preso à org e ao campo. */
export function indiceCego(valorNormalizado: string, ctx: Contexto): string {
  return createHmac("sha256", carregarChaveiro().indice)
    .update(`${ctx.org}|${ctx.campo}|${valorNormalizado}`)
    .digest("hex");
}

export const indiceTelefone = (org: string, tel: string) =>
  indiceCego(normalizarTelefoneIndice(tel), { org, campo: "telefone" });

export const indiceEmail = (org: string, email: string) =>
  indiceCego(normalizarEmailIndice(email), { org, campo: "email" });

/** Últimos 4 dígitos para a tela identificar o contato sem abrir o número inteiro. */
export function finalTelefone(tel: string | null | undefined): string {
  return tel ? tel.replace(/\D/g, "").slice(-4) : "";
}
