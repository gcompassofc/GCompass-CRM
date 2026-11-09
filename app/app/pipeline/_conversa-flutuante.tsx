"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { ChatThread } from "@/components/inbox/ChatThread";
import { Composer } from "@/components/inbox/Composer";
import { ArrowSquareOut, CircleNotch, X } from "@/lib/ui/icons";

/**
 * Conversa do card em uma janela no canto inferior direito do Funil (pedido do
 * Allyson, 09/11/2026): o corretor responde sem sair do quadro. O X fecha; "Abrir
 * no Multi-atendimento" leva à tela completa. A conversa sai da mesma regra do
 * botão "Abrir conversa" da ficha (/app/leads/<id>/conversa), em JSON.
 */
export interface LeadDaJanela {
  id: string;
  nome: string;
}

const MOTIVO: Record<string, string> = {
  sem_numero: "Não há WhatsApp conectado para abrir esta conversa. Conecte o seu em Meu WhatsApp.",
  sem_conversa: "Este lead ainda não tem conversa no CRM.",
  sem_lead: "Lead não encontrado.",
};

export function ConversaFlutuante({ lead, onFechar }: { lead: LeadDaJanela; onFechar: () => void }) {
  const [estado, setEstado] = useState<{ leadId: string; conversaId?: string; erro?: string } | null>(null);

  useEffect(() => {
    let vivo = true;
    fetch(`/app/leads/${lead.id}/conversa?json=1`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ ok: boolean; conversaId?: string; motivo?: string }>)
      .then((r) => {
        if (!vivo) return;
        setEstado(r.ok && r.conversaId ? { leadId: lead.id, conversaId: r.conversaId } : { leadId: lead.id, erro: MOTIVO[r.motivo ?? ""] ?? "Não deu para abrir a conversa agora." });
      })
      .catch(() => vivo && setEstado({ leadId: lead.id, erro: "Não deu para abrir a conversa agora." }));
    return () => {
      vivo = false;
    };
  }, [lead.id]);

  // Esc fecha, como nos outros painéis do CRM.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [onFechar]);

  // Troca de card: o estado antigo não vale para o lead novo.
  const atual = estado?.leadId === lead.id ? estado : null;

  return (
    <section
      role="dialog"
      aria-label={`Conversa com ${lead.nome}`}
      // Acima do botão de ajuda do canto (que cobria o enviar).
      className="fixed inset-x-2 bottom-20 z-50 flex h-[min(72vh,600px)] flex-col overflow-hidden rounded-[24px] bg-white shadow-[0_18px_50px_rgba(9,44,62,0.28)] sm:inset-x-auto sm:bottom-24 sm:right-5 sm:w-[420px]"
    >
      <header className="flex shrink-0 items-center gap-2 bg-[#0a2d40] px-4 py-3 text-white">
        <p className="min-w-0 flex-1 truncate text-[15px] font-semibold">{lead.nome}</p>
        {atual?.conversaId && (
          <Link
            href={`/app/inbox?id=${atual.conversaId}`}
            prefetch={false}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 text-[12px] font-semibold hover:bg-white/20"
          >
            <ArrowSquareOut className="size-3.5" /> Multi-atendimento
          </Link>
        )}
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar a conversa"
          title="Fechar"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-full hover:bg-white/15"
        >
          <X className="size-4" />
        </button>
      </header>
      {!atual ? (
        <div className="flex flex-1 items-center justify-center text-[#5b7284]">
          <CircleNotch className="size-6 animate-spin" aria-label="Abrindo a conversa" />
        </div>
      ) : atual.erro ? (
        <p className="m-4 rounded-2xl bg-[#fdf1e7] px-4 py-3 text-[14px] text-[#7a3f12]">{atual.erro}</p>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-hidden">
            <ChatThread conversationId={atual.conversaId!} />
          </div>
          <Composer conversationId={atual.conversaId!} contactName={lead.nome} />
        </>
      )}
    </section>
  );
}
