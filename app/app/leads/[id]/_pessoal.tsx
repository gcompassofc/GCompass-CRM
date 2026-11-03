"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ArrowsClockwise, CheckCircle, UserCircle } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { confirmarLead, marcarLeadComoPessoal, voltarParaLead } from "../pessoal-actions";

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

/**
 * "Lead ou pessoal?" em dois toques (pedido do Allyson, 03/11/2026). Aparece logo
 * de cara (ficha, Início, Fila da equipe, Funil e conversa) enquanto ninguém
 * respondeu. "É lead" grava a resposta e a pergunta some; "Pessoal" encerra o
 * lead e tira a conversa do CRM (com uma confirmação, porque apaga).
 *
 * `variante`: "faixa" é a barra larga (ficha, conversa); "pilulas" cabe numa
 * linha de lista; "escuro" é para o cartão de fundo azul.
 */
export function LeadOuPessoal({
  leadId,
  variante = "faixa",
  depois,
  className,
}: {
  leadId: string;
  variante?: "faixa" | "pilulas" | "escuro";
  depois?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [respondido, setRespondido] = useState(false);
  if (respondido) return null;

  const responder = (como: "lead" | "pessoal") => {
    if (como === "pessoal" && !confirm(CONFIRMA)) return;
    iniciar(async () => {
      const r = como === "lead" ? await confirmarLead(leadId) : await marcarLeadComoPessoal(leadId);
      if (!r.ok) return void toast.error(r.erro);
      setRespondido(true);
      toast.success(como === "lead" ? "Confirmado como lead." : "Marcado como contato pessoal.");
      if (como === "pessoal" && depois) router.push(depois);
      else router.refresh();
    });
  };

  // Clique dentro de um cartão que é link: não abre o cartão.
  const parar = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const escuro = variante === "escuro";
  const botoes = (
    <div className="flex shrink-0 gap-2">
      <button
        type="button"
        disabled={pendente}
        onClick={(e) => {
          parar(e);
          responder("lead");
        }}
        className={cn(
          "inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold disabled:opacity-50",
          escuro ? "bg-white text-[#0a2d40] hover:bg-[#e3eff6]" : "bg-[#2a7ca8] text-white hover:bg-[#1f6a93]",
        )}
      >
        <CheckCircle weight="fill" className="size-4" /> É lead
      </button>
      <button
        type="button"
        disabled={pendente}
        onClick={(e) => {
          parar(e);
          responder("pessoal");
        }}
        className={cn(
          "inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold disabled:opacity-50",
          escuro
            ? "bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/20"
            : "bg-white text-[#5b7284] ring-1 ring-[#d5e1e8] hover:bg-[#f4f7f9] hover:text-[#0a2d40]",
        )}
      >
        <UserCircle className="size-4" /> Pessoal
      </button>
    </div>
  );

  if (variante === "pilulas" || escuro) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)} onClick={parar}>
        <span className={cn("text-[13px] font-medium", escuro ? "text-white/80" : "text-[#5b7284]")}>
          {pendente ? "Salvando..." : "Lead ou pessoal?"}
        </span>
        {botoes}
      </div>
    );
  }
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#eaf4f9] px-4 py-3 ring-1 ring-[#cfe3ee]",
        className,
      )}
    >
      <div className="min-w-0">
        <p className="text-[15px] font-semibold text-[#0a2d40]">{pendente ? "Salvando..." : "Lead ou pessoal?"}</p>
        <p className="text-[13px] text-[#5b7284]">Confirme para tirar a dúvida. Pessoal sai do CRM.</p>
      </div>
      {botoes}
    </div>
  );
}
