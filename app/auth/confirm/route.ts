import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";
import { ensureTenantForUser } from "@/lib/auth/provision";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";

/**
 * GET /auth/confirm — troca o token do e-mail (token_hash) por uma sessão.
 *
 * É o destino único dos links de e-mail do GoTrue (templates customizados em
 * supabase/templates/): confirmação de signup E redefinição de senha.
 *
 * - type=signup  → provisiona o tenant (org + membership admin) e entra no
 *                  onboarding. Provisionamento é idempotente (link clicado 2x).
 * - type=recovery → sessão de recovery estabelecida; segue para /login/reset
 *                  onde o usuário define a senha nova.
 *
 * Fluxo canônico do @supabase/ssr: verifyOtp grava os cookies de sessão via
 * cookies() do next/headers; o Next anexa os Set-Cookie ao redirect retornado.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const requestId = request.headers.get("x-request-id");

  // NÃO use `url.origin` como base: atrás de um proxy reverso (Caddy/Traefik) o
  // Next enxerga o endereço em que ELE escuta, não o público — numa VPS isso é
  // `http://0.0.0.0:3000`, e o usuário que clica no link do e-mail recebia um
  // redirect para esse endereço, que só existe dentro do contêiner
  // (ERR_ADDRESS_INVALID no browser). O token era validado com sucesso; o que
  // quebrava era o passo seguinte.
  //
  // `x-forwarded-*` é o que o proxy preenche com o host público; NEXT_PUBLIC_APP_URL
  // é a verdade declarada da instalação e fecha o caso quando não há proxy (ou
  // quando ele não repassa os headers). `url.origin` fica como último recurso.
  const fwdHost = request.headers.get("x-forwarded-host");
  const fwdProto = request.headers.get("x-forwarded-proto") ?? "https";
  const publicOrigin = fwdHost
    ? `${fwdProto}://${fwdHost}`
    : (env.NEXT_PUBLIC_APP_URL || url.origin);

  const redirectTo = (path: string) => NextResponse.redirect(new URL(path, publicOrigin));

  if (!tokenHash || !type) {
    return redirectTo("/login?error=link_invalido");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error || !data.user) {
    await audit({
      action: "auth.email_link_rejected",
      metadata: { type, reason: error?.message ?? "no_user" },
      requestId,
    });
    return redirectTo("/login?error=link_invalido");
  }

  if (type === "recovery") {
    return redirectTo("/login/reset");
  }

  try {
    await ensureTenantForUser(data.user);
  } catch (e) {
    await audit({
      action: "auth.signup_provision_failed",
      actorUserId: data.user.id,
      metadata: { reason: e instanceof Error ? e.message : String(e) },
      requestId,
    });
    return redirectTo("/login?error=provisionamento");
  }

  void audit({
    action: "auth.signup_confirmed",
    actorUserId: data.user.id,
    metadata: {},
    requestId,
  });

  return redirectTo("/onboarding/welcome");
}
