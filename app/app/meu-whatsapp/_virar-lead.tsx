"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { UserPlus } from "@/lib/ui/icons";

import { numeroViraLead } from "../leads/pessoal-actions";
import { Cartao } from "../_opa/ui";

/**
 * Contato pessoal que virou cliente: o CRM não guarda nada de quem é pessoal,
 * então o caminho é o número. Faz o mesmo que a etiqueta "Lead OPA" no aparelho
 * (03/11/2026).
 */
export function NumeroViraLead() {
  const [numero, setNumero] = useState("");
  const [pendente, iniciar] = useTransition();
  return (
    <Cartao className="flex flex-col gap-3">
      <div>
        <p className="flex items-center gap-2 text-[15px] font-semibold text-[#0a2d40]">
          <UserPlus className="size-4 text-[#2a7ca8]" /> Contato pessoal que virou cliente
        </p>
        <p className="mt-1 text-[13px] text-[#5b7284]">
          Digite o número e ele vira lead seu, com a etiqueta &quot;Lead OPA&quot; no WhatsApp. A conversa daqui para frente entra no CRM.
        </p>
      </div>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            const r = await numeroViraLead(numero);
            if (!r.ok) return void toast.error(r.erro);
            toast.success("Virou lead. Ele já aparece em Meus leads.");
            setNumero("");
          });
        }}
      >
        <input
          inputMode="tel"
          placeholder="12 99999-9999"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          className="h-11 min-w-0 flex-1 rounded-full border border-[#d5e2ea] bg-white px-4 text-[14px] text-[#0a2d40]"
          aria-label="Número do WhatsApp com DDD"
        />
        <button
          type="submit"
          disabled={pendente || numero.replace(/\D/g, "").length < 10}
          className="inline-flex h-11 items-center rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white hover:bg-[#12455f] disabled:opacity-50"
        >
          {pendente ? "Enviando..." : "Virar lead"}
        </button>
      </form>
    </Cartao>
  );
}
