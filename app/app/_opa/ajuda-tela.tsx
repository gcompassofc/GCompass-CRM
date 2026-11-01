"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { linkDoPasso, nomeDaTela, passoDaTela, telaDaRota, versaoDoPapel, versoesPermitidas } from "@/lib/opa/tutorial";
import { Question } from "@/lib/ui/icons";

/**
 * O "?" discreto ao lado do título das telas da OPA: abre em Tutoriais o passo
 * daquela tela, na versão de quem está vendo. Tela sem passo, nada aparece.
 */
export function AjudaDaTela() {
  const pathname = usePathname();
  const { user, activeOrg } = useAuth();
  const tela = telaDaRota(pathname);
  if (!tela) return null;
  const papel = activeOrg?.role ?? null;
  const alvo = passoDaTela(tela, versoesPermitidas(papel, user.is_platform_admin), versaoDoPapel(papel, user.is_platform_admin));
  if (!alvo) return null;
  const rotulo = `Como funciona: ${nomeDaTela(tela)}`;
  return (
    <Link
      href={linkDoPasso(alvo.versao, alvo.passoId)}
      title={rotulo}
      aria-label={rotulo}
      className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#8aa3b3] transition-colors hover:bg-white hover:text-[#0a2d40]"
    >
      <Question className="size-5" />
    </Link>
  );
}
