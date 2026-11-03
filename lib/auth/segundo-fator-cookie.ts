/**
 * Marca de "esta sessão já confirmou o código do e-mail ou do WhatsApp".
 *
 * O código por e-mail ou WhatsApp não passa pelo MFA do Supabase, então a
 * sessão não sobe para aal2. Quem prova o segundo fator é este cookie: HMAC do
 * usuário com o `session_id` do JWT, assinado com INTERNAL_SECRET. Vale só para
 * aquela sessão (outro aparelho, ou sair e entrar de novo, pede código novo) e
 * não serve para outra pessoa.
 *
 * Só Web Crypto, para rodar tanto no proxy quanto nas Server Actions.
 */
export const COOKIE_SEGUNDO_FATOR = "opa-segundo-fator";

const encoder = new TextEncoder();

function paraB64url(bytes: ArrayBuffer): string {
  let bin = "";
  for (const b of new Uint8Array(bytes)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function chave(segredo: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(segredo), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
}

export async function assinarSegundoFator(segredo: string, userId: string, sessionId: string): Promise<string> {
  if (!segredo) throw new Error("INTERNAL_SECRET ausente: não dá para assinar o segundo fator");
  const assinatura = await crypto.subtle.sign("HMAC", await chave(segredo), encoder.encode(`sf1:${userId}:${sessionId}`));
  return paraB64url(assinatura);
}

/** Comparação em tempo constante sobre o texto já assinado. */
export async function segundoFatorConfere(
  segredo: string,
  userId: string,
  sessionId: string | null | undefined,
  valor: string | null | undefined,
): Promise<boolean> {
  if (!segredo || !sessionId || !valor) return false;
  const esperado = await assinarSegundoFator(segredo, userId, sessionId);
  if (esperado.length !== valor.length) return false;
  let diferenca = 0;
  for (let i = 0; i < esperado.length; i++) diferenca |= esperado.charCodeAt(i) ^ valor.charCodeAt(i);
  return diferenca === 0;
}

/** Método que exige este cookie (o "app" é cobrado pelo aal2 do Supabase). */
export function exigeCodigo(appMetadata: Record<string, unknown> | null | undefined): boolean {
  const m = appMetadata?.segundo_fator;
  return m === "email" || m === "whatsapp";
}
