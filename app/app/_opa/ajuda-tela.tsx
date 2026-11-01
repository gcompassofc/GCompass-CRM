"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { tourDaRota, toursPermitidos } from "@/lib/opa/tour";
import { linkDoPasso, nomeDaTela, passoDaTela, telaDaRota, versaoDoPapel, versoesPermitidas } from "@/lib/opa/tutorial";
import { BookOpen, Question, Sparkle } from "@/lib/ui/icons";

import { iniciarTour } from "./tour";

/**
 * O "?" discreto ao lado do título das telas da OPA. Abre um menu curto:
 * "Tour desta tela" (o recorte passeia pela tela de verdade) e "Ver no
 * Tutoriais" (o passo daquela tela, em cartão). Tela sem nenhum dos dois, nada.
 */
export function AjudaDaTela() {
  const pathname = usePathname();
  const { user, activeOrg } = useAuth();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberto(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberto]);

  const papel = activeOrg?.role ?? null;
  const minha = versaoDoPapel(papel, user.is_platform_admin);
  const tela = telaDaRota(pathname);
  const passo = tela ? passoDaTela(tela, versoesPermitidas(papel, user.is_platform_admin), minha) : null;
  const tour = tourDaRota(pathname);
  const temTour = tour !== null && minha !== null && toursPermitidos(minha).some((t) => t.id === tour);
  if (!passo && !temTour) return null;
  const rotulo = `Ajuda${tela ? `: ${nomeDaTela(tela)}` : ""}`;
  const item = "flex h-11 w-full items-center gap-3 rounded-full px-4 text-left text-[14px] font-medium text-[#0a2d40] hover:bg-[#eef3f6]";

  return (
    <div ref={caixa} className="relative" data-tour="cab-ajuda">
      <button
        type="button"
        title={rotulo}
        aria-label={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-[#8aa3b3] transition-colors hover:bg-white hover:text-[#0a2d40]"
      >
        <Question className="size-5" />
      </button>
      {aberto && (
        <div role="menu" className="absolute left-0 top-10 z-40 w-[240px] rounded-[24px] bg-white p-1.5 shadow-[0_18px_40px_rgba(9,44,62,0.16)]">
          {temTour && (
            <button
              type="button"
              role="menuitem"
              className={item}
              onClick={() => {
                setAberto(false);
                if (tour) iniciarTour(tour);
              }}
            >
              <Sparkle className="size-4 text-[#2a7ca8]" weight="fill" /> Tour desta tela
            </button>
          )}
          {passo && (
            <Link role="menuitem" href={linkDoPasso(passo.versao, passo.passoId)} className={item} onClick={() => setAberto(false)}>
              <BookOpen className="size-4 text-[#2a7ca8]" /> Ver no Tutoriais
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
