"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { TIPOS_DE_LEAD, type TipoDeLead } from "@/lib/opa/tipo-lead";
import { CircleNotch, HouseLine, Key } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { mudarTipoDoLead } from "../actions";

const ICONE = { comprador: HouseLine, vendedor: Key } as const;

/**
 * "Este cliente é: Comprador ou Vendedor", em um toque na ficha (pedido do Allyson,
 * 05/11/2026). O lead continua o mesmo: conversa, dono e histórico vão junto, e dá
 * para voltar com outro toque, por isso não pede confirmação.
 */
export function TipoDoLead({ leadId, atual }: { leadId: string; atual: TipoDeLead }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const escolher = (tipo: TipoDeLead) =>
    iniciar(async () => {
      const fd = new FormData();
      fd.set("leadId", leadId);
      fd.set("tipo", tipo);
      try {
        const r = await mudarTipoDoLead(fd);
        if (!r.ok) return void toast.error(r.erro);
        toast.success(tipo === "vendedor" ? "Agora é vendedor. Foi para o funil Captação de imóvel." : "Agora é comprador. Foi para o funil Compradores.");
        router.refresh();
      } catch {
        toast.error("Não deu para mudar agora. Tente de novo em instantes.");
      }
    });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span id="tipo-do-lead" className="px-1 text-[13px] font-medium text-[#5b7284]">
        Este cliente é
      </span>
      <div role="group" aria-labelledby="tipo-do-lead" className="inline-flex rounded-full bg-[#f2f6f9] p-1">
        {(Object.keys(TIPOS_DE_LEAD) as TipoDeLead[]).map((tipo) => {
          const Icone = ICONE[tipo];
          const ativo = tipo === atual;
          return (
            <button
              key={tipo}
              type="button"
              disabled={pendente}
              aria-pressed={ativo}
              onClick={() => {
                if (!ativo) escolher(tipo);
              }}
              className={cn(
                "inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-colors disabled:opacity-60",
                ativo ? "bg-[#0a2d40] text-white" : "text-[#0a2d40] hover:bg-[#e7f0f5]",
              )}
            >
              {pendente && !ativo ? <CircleNotch className="size-4 animate-spin" aria-hidden /> : <Icone className="size-4" aria-hidden />}
              {TIPOS_DE_LEAD[tipo].rotulo}
            </button>
          );
        })}
      </div>
    </div>
  );
}
