"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Check, Copy } from "@/lib/ui/icons";

import { pegarTokenEntrada } from "./actions";

/** Token mascarado na tela; o completo só vai para a área de transferência. */
export function CopiarPorta({ porta, finalToken }: { porta: string; finalToken: string | null }) {
  const [copiado, setCopiado] = useState<"porta" | "token" | null>(null);
  const [pendente, iniciar] = useTransition();
  const final = finalToken ? `••••${finalToken}` : "sem token";

  const marcar = (o: "porta" | "token") => {
    setCopiado(o);
    setTimeout(() => setCopiado(null), 2000);
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[12px] text-[#5b7284]">token {final}</span>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(`${window.location.origin}${porta}`);
          marcar("porta");
        }}
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
      >
        {copiado === "porta" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copiar endereço
      </button>
      {finalToken && (
        <button
          type="button"
          disabled={pendente}
          onClick={() =>
            iniciar(async () => {
              const t = await pegarTokenEntrada();
              if (!t) {
                toast.error("Só gestor copia o token.");
                return;
              }
              await navigator.clipboard.writeText(t);
              marcar("token");
            })
          }
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white px-3 text-[12px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
        >
          {copiado === "token" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Copiar token
        </button>
      )}
    </div>
  );
}
