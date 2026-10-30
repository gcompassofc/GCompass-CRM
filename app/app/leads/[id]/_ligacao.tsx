"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Phone } from "@/lib/ui/icons";

import { registrarLigacao, type ResultadoLigacao } from "../actions";

const OPCOES: Array<[ResultadoLigacao, string, string]> = [
  ["atendeu", "Atendeu", "Conversamos por telefone"],
  ["nao_atendeu", "Não atendeu", "Tentei e não consegui falar"],
  ["retorno", "Pediu retorno", "Combinei de ligar de novo"],
];

/** "Liguei" em um toque: registra a ligação no histórico e para o relógio da fila. */
export function RegistrarLigacao({ leadId, tentativas }: { leadId: string; tentativas: number }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const registrar = (r: ResultadoLigacao, rotulo: string) =>
    iniciar(async () => {
      const res = await registrarLigacao(leadId, r);
      if (!res.ok) {
        toast.error(res.erro ?? "Não deu para registrar.");
        return;
      }
      toast.success(
        r === "nao_atendeu" && tentativas + 1 >= 2
          ? `Ligação registrada: ${rotulo.toLowerCase()}. ${tentativas + 1}ª tentativa: vale mandar mensagem.`
          : `Ligação registrada: ${rotulo.toLowerCase()}.`,
      );
      router.refresh();
    });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pendente}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0a2d40] shadow-[0_1px_2px_rgba(9,44,62,0.06)] outline-none hover:bg-[#e7f0f5] focus-visible:ring-2 focus-visible:ring-[#8fc4dd] disabled:opacity-60"
      >
        <Phone className="size-4" /> Registrar ligação
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={8} className="w-64 rounded-[22px] border-0 bg-white p-2 shadow-[0_12px_40px_rgba(9,44,62,0.14)]">
        {OPCOES.map(([r, rotulo, dica]) => (
          <DropdownMenuItem
            key={r}
            onSelect={() => registrar(r, rotulo)}
            className="flex-col items-start gap-0.5 rounded-2xl px-3 py-2.5 focus:bg-[#f2f6f9]"
          >
            <span className="text-[14px] font-semibold text-[#0a2d40]">{rotulo}</span>
            <span className="text-[12px] text-[#5b7284]">{dica}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
