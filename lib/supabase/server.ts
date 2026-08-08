/**
 * Supabase client para Server Components, Route Handlers e Server Actions.
 *
 * Lê/escreve cookies via next/headers. Sempre use `getUser()` (valida JWT no
 * backend), NUNCA `getSession()` (confia no cookie local sem revalidar).
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    // O @supabase/ssr usa PKCE por padrão, e PKCE é incompatível com este app em
    // dois pontos: o GoTrue passa a emitir `token_hash=pkce_...`, que o
    // `verifyOtp` de app/auth/confirm/route.ts não lê (o par do PKCE seria
    // `exchangeCodeForSession`); e a validação depende de um code_verifier em
    // cookie que o SameSite=Strict abaixo — doutrina do projeto — não envia numa
    // navegação vinda do cliente de e-mail. O efeito era o link de redefinir
    // senha morrer em /login?error=link_invalido.
    auth: { flowType: "implicit" },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // setAll pode ser chamado de Server Component; nesse caso, ignoramos.
          // Refresh de sessão acontece no middleware do Next.
        }
      },
    },
    // D-01.01: cookie name canônico alinhado ao middleware.
    cookieOptions: {
      name: "sb-deskcomm-auth",
      sameSite: "strict",
      httpOnly: true,
      secure: cookieSecure(),
      path: "/",
    },
  });
}
