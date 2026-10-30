import "server-only";

import { randomBytes, timingSafeEqual } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Segredos da org (tabela `opa_segredos`, migration 0113). A tabela não tem
 * policy: só o client admin do servidor lê e grava. Antes o token ficava em
 * organizations.settings, que qualquer membro lê pelo PostgREST.
 */
export async function tokenDeEntrada(admin: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await admin.from("opa_segredos").select("entrada_token").eq("organization_id", orgId).maybeSingle();
  return (data as { entrada_token: string } | null)?.entrada_token ?? null;
}

/** Gera (ou troca) o token. Quem tinha o anterior para de entrar na hora. */
export async function novoTokenDeEntrada(admin: SupabaseClient, orgId: string): Promise<string> {
  const token = randomBytes(24).toString("hex");
  const { error } = await admin
    .from("opa_segredos")
    .upsert({ organization_id: orgId, entrada_token: token, atualizado_em: new Date().toISOString() });
  if (error) throw new Error(`Não gravou o token: ${error.message}`);
  return token;
}

/** Comparação em tempo constante (não vaza, pelo tempo de resposta, quantos caracteres bateram). */
export function mesmoSegredo(esperado: string, recebido: string): boolean {
  const a = Buffer.from(esperado);
  const b = Buffer.from(recebido);
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Lê o corpo da requisição até `limite` bytes. Passou disso, para de ler e
 * devolve null (a rota responde 413), em vez de carregar 20 MB na memória.
 */
export async function lerCorpoLimitado(req: Request, limite = 32 * 1024): Promise<string | null> {
  const declarado = Number(req.headers.get("content-length") ?? "0");
  if (declarado > limite) return null;
  if (!req.body) return "";
  const leitor = req.body.getReader();
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.byteLength;
    if (total > limite) {
      await leitor.cancel();
      return null;
    }
    partes.push(value);
  }
  return Buffer.concat(partes).toString("utf8");
}
