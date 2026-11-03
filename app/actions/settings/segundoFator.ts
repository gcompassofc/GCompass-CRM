"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { COOKIE_SEGUNDO_FATOR } from "@/lib/auth/segundo-fator-cookie";
import {
  conferirCodigo,
  enviarCodigo,
  gravarMetodo,
  liberarSessao,
  normalizarWhatsapp,
  removerAplicativos,
  type Canal,
  type Metodo,
  type ResultadoEnvio,
} from "@/lib/auth/segundo-fator";

async function usuarioLogado() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, user };
}

async function registrar(userId: string, metodo: Metodo, anterior?: string) {
  const hdrs = await headers();
  await audit({
    action: "auth.segundo_fator_alterado",
    actorUserId: userId,
    metadata: { metodo, anterior: anterior ?? null },
    requestId: hdrs.get("x-request-id"),
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  });
}

/** Primeiro passo para ligar e-mail ou WhatsApp: manda um código para provar o canal. */
export async function pedirCodigoDeAtivacao(
  canal: Canal,
  numero?: string,
): Promise<ResultadoEnvio | { ok: false; erro: "numero_invalido" }> {
  const { user } = await usuarioLogado();
  let destino: string;
  if (canal === "whatsapp") {
    const n = normalizarWhatsapp(numero ?? "");
    if (!n) return { ok: false, erro: "numero_invalido" };
    destino = n;
  } else {
    destino = user.email ?? "";
  }
  return enviarCodigo({ userId: user.id, canal, destino, finalidade: "ativar" });
}

export type ResultadoAtivacao =
  | { ok: true }
  | { ok: false; erro: "errado"; restam?: number }
  | { ok: false; erro: "expirado" | "tentativas" | "sem_codigo" | "falhou" };

/**
 * Confere o código e liga o canal. Tira os aplicativos autenticadores (um método
 * por vez) e já libera esta sessão, para a pessoa não ter de digitar outro código.
 */
export async function confirmarAtivacao(codigo: string): Promise<ResultadoAtivacao> {
  const { supabase, user } = await usuarioLogado();
  const r = await conferirCodigo({ userId: user.id, finalidade: "ativar", codigo });
  if (!r.ok) return r.erro === "errado" ? { ok: false, erro: "errado", restam: r.restam } : { ok: false, erro: r.erro };
  try {
    await gravarMetodo(user, r.canal, r.canal === "whatsapp" ? r.destino : null);
    await liberarSessao(supabase, user.id);
    await removerAplicativos(supabase);
  } catch {
    return { ok: false, erro: "falhou" };
  }
  await registrar(user.id, r.canal, String(user.app_metadata?.segundo_fator ?? ""));
  revalidatePath("/app/settings/security");
  return { ok: true };
}

/**
 * Depois de confirmar o aplicativo novo (enrollMfa + confirmMfaEnroll): ele passa
 * a ser o único. Serve tanto para ligar quanto para trocar de aplicativo.
 */
export async function concluirAplicativo(fatorNovo: string): Promise<{ ok: boolean }> {
  const { supabase, user } = await usuarioLogado();
  const { data } = await supabase.auth.mfa.listFactors();
  const novo = data?.totp?.find((f) => f.id === fatorNovo && f.status === "verified");
  if (!novo) return { ok: false };
  try {
    await removerAplicativos(supabase, fatorNovo);
    await gravarMetodo(user, "app");
  } catch {
    return { ok: false };
  }
  await registrar(user.id, "app");
  revalidatePath("/app/settings/security");
  return { ok: true };
}

/** Desliga a verificação em duas etapas: a pessoa passa a entrar só com a senha. */
export async function desligarSegundoFator(): Promise<{ ok: boolean }> {
  const { supabase, user } = await usuarioLogado();
  try {
    await removerAplicativos(supabase);
    await gravarMetodo(user, "nenhum");
  } catch {
    return { ok: false };
  }
  (await cookies()).delete(COOKIE_SEGUNDO_FATOR);
  await registrar(user.id, "nenhum");
  revalidatePath("/app/settings/security");
  return { ok: true };
}
