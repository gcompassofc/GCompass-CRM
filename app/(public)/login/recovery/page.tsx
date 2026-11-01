import Link from "next/link";

import { CabecalhoAcesso } from "@/components/auth/AcessoOpa";
import { RecoveryForm } from "@/components/auth/RecoveryForm";
import { marcaOpa } from "@/lib/branding";

export const metadata = { title: "Recuperar acesso" };

export default async function RecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const opa = marcaOpa();
  return (
    <div className={opa ? "space-y-7" : "space-y-6"}>
      <CabecalhoAcesso
        opa={opa}
        titulo={opa ? "Perdeu o celular?" : "Recuperar acesso"}
        subtitulo={
          opa
            ? "Use um dos códigos de recuperação que você guardou para cadastrar o autenticador de novo."
            : "Use um código de recuperação para reconfigurar sua autenticação em duas etapas."
        }
      />
      <RecoveryForm next={next} />
      <div className={opa ? "text-sm" : "text-center text-sm"}>
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className={
            opa
              ? "inline-flex min-h-11 items-center font-semibold text-[#0a2d40] underline-offset-4 hover:underline"
              : "text-muted-foreground underline-offset-4 hover:underline"
          }
        >
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}
