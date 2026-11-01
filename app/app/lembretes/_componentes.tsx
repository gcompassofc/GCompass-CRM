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
import { cn } from "@/lib/utils";

import { agendarMensagem } from "./actions";

export interface LeadSimples {
  id: string;
  nome: string;
}

/** Dia daqui a `dias`, às `hora`, no horário de Ilhabela, no formato do datetime-local. */
function diaHora(dias: number, hora: number): string {
  const d = new Date(Date.now() + dias * 86_400_000);
  const dia = d.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
  return `${dia}T${String(hora).padStart(2, "0")}:00`;
}

/** Hora cheia agora em Ilhabela (0 a 23). */
function horaAgora(): number {
  return Number(new Date().toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" })) % 24;
}

const DESTINOS = [
  { valor: "para_lead", titulo: "Mensagem para o cliente", sub: "Você recebe o texto pronto e manda do seu número" },
  { valor: "para_corretor", titulo: "Só me lembrar", sub: "Um lembrete para você, no seu WhatsApp" },
];

/**
 * "Agendar lembrete": para o cliente (o aviso traz a mensagem pronta para o
 * corretor mandar do número dele) ou só para o corretor (sai do OPA Lembretes).
 * Grava em lembretes_agendados.
 */
export function AgendarMensagem({ leads, leadInicial }: { leads: LeadSimples[]; leadInicial?: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [destino, setDestino] = useState("para_lead");
  const [quando, setQuando] = useState("");
  const [atalhos, setAtalhos] = useState<Array<{ rotulo: string; valor: string }>>([]);
  const [pendente, iniciar] = useTransition();

  // Os atalhos dependem da hora de agora: montados ao abrir, não no render.
  const abrir = () => {
    setAtalhos([
      ...(horaAgora() < 17 ? [{ rotulo: "Hoje, 18h", valor: diaHora(0, 18) }] : []),
      { rotulo: "Amanhã, 9h", valor: diaHora(1, 9) },
      { rotulo: "Amanhã, 18h", valor: diaHora(1, 18) },
      { rotulo: "Em 3 dias, 9h", valor: diaHora(3, 9) },
    ]);
    setQuando(diaHora(1, 9));
    setAberto(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white hover:bg-[#12455f]"
      >
        <CalendarBlank className="size-4" /> Agendar lembrete
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto rounded-[28px] [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[20px] tracking-[-0.02em] text-[#0a2d40]">Agendar lembrete</DialogTitle>
            <DialogDescription className="text-[14px] text-[#5b7284]">Na hora marcada, o OPA Lembretes te avisa no WhatsApp.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              iniciar(async () => {
                const r = await agendarMensagem(fd);
                if (!r.ok) {
                  toast.error(r.erro);
                  return;
                }
                toast.success("Lembrete agendado.");
                setAberto(false);
                router.refresh();
              });
            }}
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 text-[13px] font-semibold text-[#34566b]">O que você quer?</legend>
              {DESTINOS.map((d) => {
                const on = destino === d.valor;
                return (
                  <label
                    key={d.valor}
                    className={cn(
                      "flex min-h-[60px] cursor-pointer items-center gap-3 rounded-[18px] border-2 px-4 py-3 transition-colors",
                      on ? "border-[#2a7ca8] bg-[#e7f0f5]" : "border-transparent bg-[#f2f6f9] hover:bg-[#e7f0f5]",
                    )}
                  >
                    <input type="radio" name="destino" value={d.valor} checked={on} onChange={() => setDestino(d.valor)} className="size-4 accent-[#2a7ca8]" />
                    <span className="min-w-0">
                      <span className="block text-[15px] font-semibold text-[#0a2d40]">{d.titulo}</span>
                      <span className="block text-[13px] text-[#5b7284]">{d.sub}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#34566b]">
              {destino === "para_corretor" ? "Sobre qual cliente (se for o caso)" : "Para qual cliente"}
              <select
                name="leadId"
                defaultValue={leadInicial ?? ""}
                className="h-11 w-full rounded-[14px] bg-[#f2f6f9] px-3 text-[14px] font-normal text-[#0a2d40] outline-none focus:ring-2 focus:ring-[#8fc4dd]"
              >
                <option value="">{destino === "para_corretor" ? "Nenhum cliente" : "Escolha o cliente"}</option>
                {leads.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-semibold text-[#34566b]">Quando</span>
              <div className="flex flex-wrap gap-2">
                {atalhos.map((a) => (
                  <button
                    key={a.rotulo}
                    type="button"
                    aria-pressed={quando === a.valor}
                    onClick={() => setQuando(a.valor)}
                    className={cn(
                      "inline-flex h-11 items-center rounded-full px-4 text-[13px] font-semibold transition-colors",
                      quando === a.valor ? "bg-[#0a2d40] text-white" : "bg-[#f2f6f9] text-[#0a2d40] hover:bg-[#e7f0f5]",
                    )}
                  >
                    {a.rotulo}
                  </button>
                ))}
              </div>
              <label className="flex flex-col gap-1 text-[12px] font-medium text-[#5b7284]">
                Ou escolha o dia e a hora
                <input
                  type="datetime-local"
                  name="quando"
                  required
                  value={quando}
                  onChange={(e) => setQuando(e.target.value)}
                  className="h-11 rounded-[14px] bg-[#f2f6f9] px-3 text-[14px] text-[#0a2d40] outline-none focus:ring-2 focus:ring-[#8fc4dd]"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#34566b]">
              {destino === "para_corretor" ? "Do que você quer lembrar" : "A mensagem para o cliente"}
              <textarea
                name="mensagem"
                required
                rows={3}
                placeholder={destino === "para_corretor" ? "Ex.: Ligar para a Fernanda sobre a visita" : "Ex.: Oi Fernanda, consegui as fotos do terreno que você pediu."}
                className="rounded-[14px] bg-[#f2f6f9] px-3 py-2.5 text-[14px] font-normal text-[#0a2d40] outline-none placeholder:text-[#5b7284] focus:ring-2 focus:ring-[#8fc4dd]"
              />
            </label>

            <DialogFooter className="gap-2">
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="h-11 rounded-full bg-[#eef3f6] px-5 text-[14px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pendente}
                className="h-11 rounded-full bg-[#0a2d40] px-6 text-[14px] font-semibold text-white hover:bg-[#12455f] disabled:opacity-50"
              >
                {pendente ? "Agendando..." : "Agendar"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
