import Link from "next/link";

import { CabecalhoAcesso } from "@/components/auth/AcessoOpa";
import { LoginForm } from "@/components/auth/LoginForm";
import { branding, marcaOpa } from "@/lib/branding";
import { env } from "@/lib/env";
import { cn } from "@/lib/utils";
import { chaveDoCaptcha } from "@/lib/seguranca/captcha";

export const metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; reset?: string; error?: string }>;
}) {
  const { next, reset, error } = await searchParams;
  const opa = marcaOpa();
  return (
    <div className={opa ? "space-y-7" : "space-y-6"}>
      {opa ? (
        <CabecalhoAcesso
          opa
          titulo="Bem-vindo de volta"
          subtitulo="Entre para ver seus clientes e o que fazer hoje."
        />
      ) : (
        <CabecalhoAcesso opa={false} titulo="Entrar" subtitulo={branding().name} />
      )}
      {reset === "success" && (
        <div
          className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm"
          role="status"
        >
          Senha redefinida com sucesso. Entre com a nova senha.
        </div>
      )}
      {error === "link_invalido" && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          Link inválido ou expirado. Peça um novo em Recuperar senha ou refaça o
          cadastro.
        </div>
      )}
      {error === "provisionamento" && (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          Sua conta foi confirmada, mas houve um erro ao preparar seu ambiente.
          Tente entrar novamente em instantes.
        </div>
      )}
      <LoginForm next={next} captchaSiteKey={chaveDoCaptcha()} />
      <div className={cn("space-y-2 text-sm", opa ? "text-left" : "text-center")}>
        <p>
          <Link
            href="/login/forgot"
            className={
              opa
                ? "inline-flex min-h-11 items-center font-semibold text-[#0a2d40] underline-offset-4 hover:underline"
                : "text-muted-foreground underline underline-offset-4 hover:text-foreground"
            }
          >
            Esqueci minha senha
          </Link>
        </p>
        {env.CADASTRO_ABERTO === "true" ? (
          <p className="text-muted-foreground">
            Não tem conta?{" "}
            <Link
              href="/signup"
              className="font-medium text-foreground underline underline-offset-4"
            >
              Criar conta
            </Link>
          </p>
        ) : (
          <p className={opa ? "border-t border-[#e6dfd5] pt-5 text-[13px] text-[#6f6a62]" : "text-muted-foreground"}>
            O acesso é por convite da sua equipe.
          </p>
        )}
      </div>
    </div>
  );
}
