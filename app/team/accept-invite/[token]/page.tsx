/**
 * /team/accept-invite/[token] — public route (added to PUBLIC_PATHS).
 *
 * Behavior matrix:
 *  - Invalid/expired token         → render error
 *  - Unauthenticated user          → cria a senha ali mesmo (cadastro fechado) ou
 *                                    entra pelo /login?next=... se já tem conta
 *  - Authenticated, email mismatch → render mismatch + sign-out CTA
 *  - Authenticated, email match    → form posts to Server Action which inserts
 *                                    membership and redirects to /app/inbox
 */
import Link from "next/link";

import { verifyInviteToken } from "@/lib/auth/invite-token";
import { authRateLimited, AUTH_LIMITS } from "@/lib/auth/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { acceptInviteAction } from "@/app/actions/team/acceptInvite";
import { criarContaPeloConvite } from "@/app/actions/team/criarContaPeloConvite";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ erro?: string }>;
}

const ERROS: Record<string, string> = {
  convite: "Este convite não vale mais. Peça um novo.",
  tentativas: "Muitas tentativas. Aguarde alguns minutos.",
  nome: "Escreva seu nome.",
  senha: "A senha precisa ter pelo menos 12 caracteres.",
  confirma: "As duas senhas não são iguais.",
  existe: "Esse e-mail já tem conta. Entre com a sua senha para aceitar o convite.",
  falhou: "Não deu para criar o acesso agora. Tente de novo.",
};

export default async function AcceptInvitePage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { erro } = await searchParams;

  // O gargalo de enumeração é AQUI, não no aceite: a rota é pública e cada
  // GET testa um token. Sem teto, varrer o espaço de tokens sai de graça
  // (issue #64). Barrar antes de verificar mantém a resposta indistinguível
  // entre token válido e inválido para quem está varrendo.
  if (await authRateLimited("invite_accept", null, AUTH_LIMITS.invite_accept)) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Muitas tentativas</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Aguarde alguns minutos e abra o link do convite de novo.
        </p>
      </Shell>
    );
  }

  const payload = verifyInviteToken(token);

  if (!payload) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Convite inválido ou expirado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Este link não é válido ou já passou da janela de 24h. Peça um novo convite ao admin do tenant.
        </p>
      </Shell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = encodeURIComponent(`/team/accept-invite/${token}`);
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Você foi convidado</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Crie sua senha para entrar como <strong>{payload.role}</strong> com o e-mail{" "}
          <strong>{payload.email}</strong>.
        </p>
        {erro && ERROS[erro] && (
          <p role="alert" className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {ERROS[erro]}
          </p>
        )}
        <form action={criarContaPeloConvite.bind(null, token)} className="mt-4 space-y-3">
          <input
            name="nome"
            required
            autoComplete="name"
            placeholder="Seu nome"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            name="senha"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            placeholder="Senha (12 caracteres ou mais)"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <input
            name="confirma"
            type="password"
            required
            minLength={12}
            autoComplete="new-password"
            placeholder="Repita a senha"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Criar acesso e entrar
          </button>
        </form>
        <p className="mt-4 text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link href={`/login?next=${next}`} className="font-medium text-foreground underline underline-offset-4">
            Entrar
          </Link>
        </p>
      </Shell>
    );
  }

  const userEmail = (user.email ?? "").trim().toLowerCase();
  if (userEmail !== payload.email.trim().toLowerCase()) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">Email não corresponde</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Você está logado como <strong>{user.email}</strong>, mas o convite foi enviado para{" "}
          <strong>{payload.email}</strong>. Saia e faça login com o email correto.
        </p>
        <form action="/api/auth/signout" method="post" className="mt-4">
          <button
            type="submit"
            className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Sair
          </button>
        </form>
      </Shell>
    );
  }

  async function accept() {
    "use server";
    await acceptInviteAction(token);
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold">Aceitar convite</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Você foi convidado para entrar como <strong>{payload.role}</strong>. Confirme abaixo para
        ativar seu acesso.
      </p>
      <form action={accept} className="mt-4">
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Aceitar convite
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-sm">{children}</div>
    </div>
  );
}
