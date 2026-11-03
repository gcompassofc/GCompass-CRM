"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";
import { exigeCodigo } from "@/lib/auth/segundo-fator-cookie";
import {
  conferirCodigo,
  destinoSeguro,
  enviarCodigo,
  liberarSessao,
  type Canal,
  type ResultadoEnvio,
} from "@/lib/auth/segundo-fator";

export type ResultadoCodigo =
  | { ok: false; erro: "errado"; restam?: number }
  | { ok: false; erro: "expirado" | "tentativas" | "sem_codigo" | "invalido" };

/** Login com código do e-mail ou WhatsApp: confere e libera a sessão (tela /login/codigo). */
export async function confirmarCodigoDeAcesso(codigo: string, next?: string): Promise<ResultadoCodigo> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!exigeCodigo(user.app_metadata)) redirect(destinoSeguro(next));
  if (!/^\d{6}$/.test(codigo)) return { ok: false, erro: "invalido" };

  const hdrs = await headers();
  const contexto = {
    actorUserId: user.id,
    requestId: hdrs.get("x-request-id"),
    ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: hdrs.get("user-agent") ?? null,
  };

  const r = await conferirCodigo({ userId: user.id, finalidade: "entrar", codigo });
  if (!r.ok) {
    await audit({ action: "auth.codigo_login_falhou", metadata: { motivo: r.erro }, ...contexto });
    return r.erro === "errado" ? { ok: false, erro: "errado", restam: r.restam } : { ok: false, erro: r.erro };
  }

  await liberarSessao(supabase, user.id);
  await audit({ action: "auth.codigo_login_ok", metadata: { canal: r.canal }, ...contexto });
  await audit({ action: "auth.login_success", metadata: { segundo_fator: r.canal }, ...contexto });
  redirect(destinoSeguro(next));
}

/**
 * Manda outro código. `porEmail` manda para o e-mail da conta mesmo quando o
 * método é WhatsApp: é a saída quando o número de avisos está fora do ar.
 */
export async function reenviarCodigoDeAcesso(porEmail = false): Promise<ResultadoEnvio> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!exigeCodigo(user.app_metadata)) redirect("/app");

  const canal: Canal = porEmail ? "email" : (user.app_metadata.segundo_fator as Canal);
  const destino =
    canal === "whatsapp" ? String(user.app_metadata.segundo_fator_whatsapp ?? "") : (user.email ?? "");
  return enviarCodigo({ userId: user.id, canal, destino, finalidade: "entrar" });
}
