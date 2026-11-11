"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, PaperPlaneTilt } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { Avatar } from "../_opa/ui";
import { mandarAviso } from "./actions";

export interface PessoaDoAviso {
  id: string;
  nome: string;
  foto: string | null;
  iniciais: string;
  /** Tem WhatsApp conectado no CRM (é para onde o aviso vai). */
  temNumero: boolean;
}

const MAX = 1000;

/**
 * "Mandar aviso": o gestor escreve um texto e escolhe quem da equipe recebe, pelo número
 * OPA Lembretes (pedido do Allyson, 10/11/2026). Fica gravado com o nome de quem mandou.
 */
export function MandarAviso({ pessoas, conectado, emTeste }: { pessoas: PessoaDoAviso[]; conectado: boolean; emTeste: boolean }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const [texto, setTexto] = useState("");
  const [pendente, iniciar] = useTransition();

  const comNumero = pessoas.filter((p) => p.temNumero);
  const todos = comNumero.length > 0 && escolhidos.length === comNumero.length;
  const alternar = (id: string) => setEscolhidos((atual) => (atual.includes(id) ? atual.filter((x) => x !== id) : [...atual, id]));
  const pronto = escolhidos.length > 0 && texto.trim().length > 0 && texto.length <= MAX;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white hover:bg-[#12455f]"
      >
        <PaperPlaneTilt className="size-4" /> Mandar aviso
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[92vh] max-w-md overflow-y-auto rounded-[28px] [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle className="text-[20px] tracking-[-0.02em] text-[#0a2d40]">Mandar aviso</DialogTitle>
            <DialogDescription className="text-[14px] text-[#5b7284]">
              Sai agora pelo número OPA Lembretes, no WhatsApp de quem você escolher. Fica registrado com o seu nome.
            </DialogDescription>
          </DialogHeader>

          {!conectado ? (
            <p className="rounded-[16px] bg-[#fdf1dc] px-4 py-3 text-[14px] text-[#9a5b00]">O OPA Lembretes está desconectado. Religue em Conexões para mandar avisos.</p>
          ) : (
            <form
              className="flex flex-col gap-5"
              onSubmit={(e) => {
                e.preventDefault();
                if (!pronto) return;
                const fd = new FormData();
                fd.set("texto", texto);
                for (const id of escolhidos) fd.append("para", id);
                iniciar(async () => {
                  const r = await mandarAviso(fd);
                  if (!r.ok) {
                    toast.error(r.erro);
                    return;
                  }
                  if (r.enviados > 0) toast.success(r.enviados === 1 ? "Aviso enviado." : `Aviso enviado para ${r.enviados} pessoas.`);
                  for (const falha of r.falhas) toast.error(falha);
                  if (r.falhas.length === 0) {
                    setAberto(false);
                    setTexto("");
                    setEscolhidos([]);
                  }
                  router.refresh();
                });
              }}
            >
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 flex w-full items-center justify-between text-[13px] font-semibold text-[#34566b]">
                  Para quem
                  {comNumero.length > 1 && (
                    <button type="button" onClick={() => setEscolhidos(todos ? [] : comNumero.map((p) => p.id))} className="text-[13px] font-semibold text-[#2a7ca8] hover:underline">
                      {todos ? "Limpar" : "Marcar todos"}
                    </button>
                  )}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {pessoas.map((p) => {
                    const on = escolhidos.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={!p.temNumero}
                        aria-pressed={on}
                        title={p.temNumero ? undefined : "Sem WhatsApp conectado no CRM"}
                        onClick={() => alternar(p.id)}
                        className={cn(
                          "inline-flex h-11 items-center gap-2 rounded-full pl-1 pr-4 text-[14px] font-semibold transition-colors",
                          on ? "bg-[#0a2d40] text-white" : "bg-[#f2f6f9] text-[#0a2d40] hover:bg-[#e7f0f5]",
                          !p.temNumero && "cursor-not-allowed opacity-45 hover:bg-[#f2f6f9]",
                        )}
                      >
                        {on ? (
                          <span className="inline-flex size-9 items-center justify-center rounded-full bg-[#2a7ca8] text-white">
                            <Check className="size-4" weight="bold" />
                          </span>
                        ) : (
                          <Avatar texto={p.iniciais} foto={p.foto} />
                        )}
                        {p.nome.split(/\s+/)[0]}
                      </button>
                    );
                  })}
                </div>
                {pessoas.some((p) => !p.temNumero) && <p className="text-[12px] text-[#5b7284]">Quem está apagado ainda não conectou o WhatsApp no CRM.</p>}
              </fieldset>

              <label className="flex flex-col gap-1.5 text-[13px] font-semibold text-[#34566b]">
                Mensagem
                <textarea
                  required
                  rows={5}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  placeholder="Ex.: Pessoal, amanhã às 9h tem reunião rápida sobre os leads da semana."
                  className="rounded-[14px] bg-[#f2f6f9] px-3 py-2.5 text-[14px] font-normal leading-relaxed text-[#0a2d40] outline-none placeholder:text-[#5b7284] focus:ring-2 focus:ring-[#8fc4dd]"
                />
                <span className={cn("self-end text-[12px] font-normal tabular-nums", texto.length > MAX ? "text-[#a4410e]" : "text-[#5b7284]")}>
                  {texto.length} de {MAX}
                </span>
              </label>

              {emTeste && <p className="rounded-[16px] bg-[#fdf1dc] px-4 py-3 text-[13px] text-[#9a5b00]">Modo de teste ligado: só os números de teste recebem.</p>}

              <DialogFooter className="gap-2">
                <button type="button" onClick={() => setAberto(false)} className="h-11 rounded-full bg-[#eef3f6] px-5 text-[14px] font-semibold text-[#0a2d40] hover:bg-[#e7f0f5]">
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={pendente || !pronto}
                  className="h-11 rounded-full bg-[#0a2d40] px-6 text-[14px] font-semibold text-white hover:bg-[#12455f] disabled:opacity-50"
                >
                  {pendente ? "Enviando..." : escolhidos.length > 1 ? `Enviar para ${escolhidos.length}` : "Enviar"}
                </button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
