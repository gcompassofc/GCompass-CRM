"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { loginSchema, type LoginInput } from "@/lib/auth/schemas";
import { audit, hashEmail } from "@/lib/audit";
import {
  authRateLimited,
  contaBloqueadaPorFalhas,
  registrarFalhaDeLogin,
  AUTH_LIMITS,
} from "@/lib/auth/rate-limit";
import { IS_DEMO_MODE } from "@/lib/demo-mode";
import { exigeCodigo } from "@/lib/auth/segundo-fator-cookie";
import { enviarCodigo } from "@/lib/auth/segundo-fator";
import { COOKIE_LEMBRAR, novoLembrar } from "@/lib/auth/lembrar";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { codigoDoCaptcha, recusaDeCaptcha } from "@/lib/seguranca/captcha";

export type SignInResult = {
  ok: false;
  error:
    | "invalid_credentials"
    | "rate_limited"
    | "validation_error"
    | "mfa_required"
    | "codigo_required"
    | "captcha_failed";
  details?: Record<string, unknown>;
  challengeId?: string;
};

/**
 * Sign in with password.
 *
 * On success: redirects server-side to `next` (or /app/inbox / /onboarding/mfa).
 * The redirect ensures Set-Cookie headers from supabase.auth propagate before
 * middleware re-evaluates the session — fixes Next 15 Server Action cookie
 * propagation race.
 *
 * On failure: returns an error discriminator. Caller renders inline message.
 */
export async function signInWithPassword(
  input: LoginInput,
  next?: string,
  captcha?: string,
): Promise<SignInResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation_error",
      details: parsed.error.flatten().fieldErrors,
    };
  }

  // "Lembrar de mim": decide a validade dos cookies que o login vai gravar.
  const lembrar = parsed.data.lembrar !== false ? novoLembrar() : null;
  const supabase = await createClient({ lembrarRestante: lembrar?.maxAge ?? null });
  const hdrs = await headers();
  const requestId = hdrs.get("x-request-id");
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;

  // Na demo não há GoTrue para autenticar: qualquer login entra direto.
  // ANTES do teto de tentativas porque na vitrine não há o que proteger — e
  // DEPOIS de nada mais, para que o caminho real continue passando pelo teto.
  if (IS_DEMO_MODE) {
    redirect(next || "/app");
  }

  // Antes de falar com o GoTrue: sem isto, tentar senha é de graça e ilimitado
  // (issue #64). Conta por IP e por conta — o ataque distribuído contra um
  // e-mail só não aparece na contagem por IP.
  //
  // Este bloco tinha sido REMOVIDO junto com a entrada do modo demo, e não
  // apenas desviado: a proteção contra força bruta sumia também em produção,
  // onde a demo nunca está ligada. Quem apontou foi o teste do teto de
  // tentativas — a 6ª tentativa voltava `invalid_credentials` em vez de
  // `rate_limited`, ou seja, o GoTrue seguia sendo chamado sem limite.
  if (
    (await authRateLimited("login", null, AUTH_LIMITS.login)) ||
    (await contaBloqueadaPorFalhas(parsed.data.email, AUTH_LIMITS.login))
  ) {
    await audit({
      action: "auth.login_rate_limited",
      metadata: { email_hash: hashEmail(parsed.data.email) },
      requestId,
      ip,
      userAgent,
    });
    return { ok: false, error: "rate_limited" };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { captchaToken: codigoDoCaptcha(captcha) },
  });

  // Recusa do CAPTCHA (código vencido, já usado ou ausente) não é senha errada:
  // não gasta o orçamento da conta e a tela pede só para tentar de novo.
  if (error && recusaDeCaptcha(error)) {
    await audit({
      action: "auth.login_captcha_failed",
      metadata: { email_hash: hashEmail(parsed.data.email), reason: error.message },
      requestId,
      ip,
      userAgent,
    });
    return { ok: false, error: "captcha_failed" };
  }

  if (!error && data.user) {
    const loja = await cookies();
    if (lembrar) {
      loja.set(COOKIE_LEMBRAR, lembrar.valor, {
        httpOnly: true,
        sameSite: "strict",
        secure: cookieSecure(),
        path: "/",
        maxAge: lembrar.maxAge,
      });
    } else {
      loja.delete(COOKIE_LEMBRAR);
    }
  }

  if (error || !data.user) {
    // Só senha errada gasta o orçamento da conta.
    await registrarFalhaDeLogin(parsed.data.email, AUTH_LIMITS.login);
    await audit({
      action: "auth.login_failed",
      metadata: {
        email_hash: hashEmail(parsed.data.email),
        reason: error?.message ?? "unknown",
      },
      requestId,
      ip,
      userAgent,
    });
    return { ok: false, error: "invalid_credentials" };
  }

  // MFA gating — if the user has any verified TOTP factor enrolled, they must
  // complete the challenge in /login/mfa before reaching the app.
  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const verifiedTotp = factorsData?.totp?.find((f) => f.status === "verified");
  if (verifiedTotp) {
    return { ok: false, error: "mfa_required", challengeId: verifiedTotp.id };
  }

  // Código por e-mail ou WhatsApp (0125): manda agora e segue para /login/codigo.
  // Se o envio falhar, a tela do código mostra e oferece mandar de novo.
  if (exigeCodigo(data.user.app_metadata)) {
    const canal = data.user.app_metadata.segundo_fator as "email" | "whatsapp";
    const destino =
      canal === "whatsapp" ? String(data.user.app_metadata.segundo_fator_whatsapp ?? "") : (data.user.email ?? "");
    await enviarCodigo({ userId: data.user.id, canal, destino, finalidade: "entrar" });
    return { ok: false, error: "codigo_required" };
  }

  await audit({
    action: "auth.login_success",
    actorUserId: data.user.id,
    metadata: {},
    requestId,
    ip,
    userAgent,
  });

  // Server-side redirect ensures fresh session cookie is sent to browser.
  redirect(next || "/app");
}
