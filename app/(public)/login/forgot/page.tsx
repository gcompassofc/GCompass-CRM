import Link from "next/link";

import { CabecalhoAcesso } from "@/components/auth/AcessoOpa";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";
import { marcaOpa } from "@/lib/branding";

export const metadata = { title: "Recuperar senha" };

export default function ForgotPasswordPage() {
  const opa = marcaOpa();
  return (
    <div className={opa ? "space-y-7" : "space-y-6"}>
      <CabecalhoAcesso
        opa={opa}
        titulo={opa ? "Esqueceu a senha?" : "Recuperar senha"}
        subtitulo={
          opa
            ? "Digite seu e-mail. Mandamos um link para você criar uma senha nova."
            : "Informe seu e-mail e enviaremos um link de redefinição"
        }
      />
      <ForgotPasswordForm />
      <p className={opa ? "text-[14px] text-[#6f6a62]" : "text-center text-sm text-muted-foreground"}>
        Lembrou a senha?{" "}
        <Link
          href="/login"
          className={
            opa
              ? "inline-flex min-h-11 items-center font-semibold text-[#0a2d40] underline-offset-4 hover:underline"
              : "font-medium text-foreground underline underline-offset-4"
          }
        >
          Voltar para entrar
        </Link>
      </p>
    </div>
  );
}
