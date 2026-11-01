import { redirect } from "next/navigation";

import { CabecalhoAcesso } from "@/components/auth/AcessoOpa";
import { MfaForm } from "@/components/auth/MfaForm";
import { marcaOpa } from "@/lib/branding";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Verificação em duas etapas" };

export default async function MfaChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: factorsData } = await supabase.auth.mfa.listFactors();
  const hasVerified = !!factorsData?.totp?.some((f) => f.status === "verified");
  if (!hasVerified) redirect("/app");

  const opa = marcaOpa();

  return (
    <div className={opa ? "space-y-7" : "space-y-6"}>
      <CabecalhoAcesso
        opa={opa}
        titulo={opa ? "Confirme que é você" : "Verificação em duas etapas"}
        subtitulo={
          opa
            ? "Abra o aplicativo autenticador no celular e digite o código de 6 números."
            : "Digite o código de 6 dígitos do seu autenticador."
        }
      />
      <MfaForm next={next} />
    </div>
  );
}
