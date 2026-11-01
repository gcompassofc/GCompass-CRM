import { CabecalhoAcesso } from "@/components/auth/AcessoOpa";
import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";
import { marcaOpa } from "@/lib/branding";

export const metadata = { title: "Nova senha" };

export default function ResetPasswordPage() {
  const opa = marcaOpa();
  return (
    <div className={opa ? "space-y-7" : "space-y-6"}>
      <CabecalhoAcesso
        opa={opa}
        titulo={opa ? "Crie sua senha nova" : "Definir nova senha"}
        subtitulo={
          opa
            ? "Use 12 caracteres ou mais, com letras e números."
            : "Escolha uma nova senha para sua conta"
        }
      />
      <ResetPasswordForm />
    </div>
  );
}
