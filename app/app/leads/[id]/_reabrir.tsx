"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { ArrowsClockwise } from "@/lib/ui/icons";

import { reabrirNegocio } from "../actions";

/** Reabrir um negócio perdido (F9). O botão só aparece para gestor e administrador; a ação confere de novo no servidor. */
export function ReabrirNegocio({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() => {
        const fd = new FormData();
        fd.set("leadId", leadId);
        iniciar(async () => {
          const r = await reabrirNegocio(fd);
          if (!r.ok) return void toast.error(r.erro);
          toast.success("Negócio reaberto. Ele voltou para a primeira etapa do funil.");
          router.refresh();
        });
      }}
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50"
    >
      <ArrowsClockwise className="size-4" /> {pendente ? "Reabrindo..." : "Reabrir"}
    </button>
  );
}
