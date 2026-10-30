"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CalendarBlank } from "@/lib/ui/icons";

import { agendarMensagem } from "./actions";

export interface LeadSimples {
  id: string;
  nome: string;
}

/** Amanhã às 9h, no horário de Ilhabela, no formato do datetime-local. */
function amanhaNove(): string {
  const d = new Date(Date.now() + 86_400_000);
  const dia = d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return `${dia}T09:00`;
}

/**
 * "Agendar mensagem": para o lead (sai do WhatsApp do corretor) ou para o
 * próprio corretor (sai do OPA Lembretes). Grava em lembretes_agendados.
 */
export function AgendarMensagem({ leads, leadInicial }: { leads: LeadSimples[]; leadInicial?: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [destino, setDestino] = useState("para_lead");
  const [pendente, iniciar] = useTransition();

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white hover:bg-[#12455f]"
      >
        <CalendarBlank className="size-4" /> Agendar mensagem
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Agendar mensagem</DialogTitle>
            <DialogDescription>
              Para o lead, sai do seu WhatsApp. Para você, chega pelo OPA Lembretes na hora marcada.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              iniciar(async () => {
                const r = await agendarMensagem(fd);
                if (!r.ok) {
                  toast.error(r.erro);
                  return;
                }
                toast.success("Mensagem agendada.");
                setAberto(false);
                router.refresh();
              });
            }}
          >
            <label className="flex flex-col gap-1 text-sm font-medium">
              Para quem
              <select
                name="destino"
                value={destino}
                onChange={(e) => setDestino(e.target.value)}
                className="h-10 rounded-lg border border-border bg-surface-elevated px-2 font-normal outline-none focus:border-accent"
              >
                <option value="para_lead">Para o lead, pelo meu WhatsApp</option>
                <option value="para_corretor">Para mim, pelo OPA Lembretes</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Lead{destino === "para_corretor" ? " (opcional)" : ""}
              <select
                name="leadId"
                defaultValue={leadInicial ?? ""}
                className="h-10 w-full rounded-lg border border-border bg-surface-elevated px-2 font-normal outline-none focus:border-accent"
              >
                <option value="">Escolha o lead</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Dia e hora
              <input
                type="datetime-local"
                name="quando"
                required
                defaultValue={amanhaNove()}
                className="h-10 rounded-lg border border-border bg-surface-elevated px-3 font-normal outline-none focus:border-accent"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Mensagem
              <textarea
                name="mensagem"
                required
                rows={4}
                placeholder="Uma linha por toque, sem exclamação. Cada mensagem com um motivo."
                className="rounded-lg border border-border bg-surface-elevated px-3 py-2 font-normal outline-none focus:border-accent"
              />
            </label>
            <DialogFooter>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="h-10 rounded-full border border-border px-4 text-sm font-medium"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pendente}
                className="h-10 rounded-full bg-accent px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Agendar
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
