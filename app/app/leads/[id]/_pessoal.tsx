"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ArrowsClockwise, UserCircle } from "@/lib/ui/icons";

import { marcarLeadComoPessoal, voltarParaLead } from "../pessoal-actions";

const CONFIRMA =
  "Marcar como contato pessoal?\n\nA conversa sai do CRM, a IA para de ler, o contato ganha a etiqueta \"Pessoal\" no WhatsApp e o lead é encerrado. Dá para voltar atrás, mas a conversa apagada não volta.";

/** Lead que na verdade é contato pessoal (03/11/2026). `depois` diz para onde ir ao terminar. */
export function MarcarPessoal({ leadId, depois, className }: { leadId: string; depois?: string; className?: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() => {
        if (!confirm(CONFIRMA)) return;
        iniciar(async () => {
          const r = await marcarLeadComoPessoal(leadId);
          if (!r.ok) return void toast.error(r.erro);
          toast.success("Marcado como contato pessoal.");
          if (depois) router.push(depois);
          else router.refresh();
        });
      }}
      className={
        className ??
        "inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#5b7284] shadow-[0_1px_2px_rgba(9,44,62,0.06)] hover:bg-[#e7f0f5] hover:text-[#0a2d40] disabled:opacity-50"
      }
    >
      <UserCircle className="size-4" /> {pendente ? "Marcando..." : "É contato pessoal"}
    </button>
  );
}

/** O caminho de volta: o contato pessoal volta a ser lead, na primeira etapa. */
export function VoltarParaLead({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() =>
        iniciar(async () => {
          const r = await voltarParaLead(leadId);
          if (!r.ok) return void toast.error(r.erro);
          toast.success("Voltou a ser lead, na primeira etapa do funil.");
          router.refresh();
        })
      }
      className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white transition-colors hover:brightness-110 disabled:opacity-50"
    >
      <ArrowsClockwise className="size-4" /> {pendente ? "Voltando..." : "Voltar a ser lead"}
    </button>
  );
}
