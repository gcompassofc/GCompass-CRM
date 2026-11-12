"use client";

import { useState, useTransition } from "react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BAIRROS } from "@/lib/opa/config";
import { ClipboardText, Sparkle } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { IconeRedondo } from "../_opa/ui";
import { preencherEMover, type PedidoDiagnostico } from "../leads/actions";

/**
 * "Antes de avançar" (pedido do Allyson, 12/11/2026): o corretor arrasta o card
 * para "Diagnóstico feito" e, se faltam campos, esta janela abre ali mesmo no
 * Funil. Dois dos quatro bastam. O que a IA anotou na conversa já vem escrito,
 * marcado como sugestão, e o corretor confirma ou corrige. Ao salvar, o card
 * anda e a etapa vai para a Meta como sempre.
 */

export interface PedidoDeAvanco {
  leadId: string;
  nome: string;
  etapaId: string;
  etapaNome: string;
  pedido: PedidoDiagnostico;
}

const CAMPOS: Array<{ chave: "finalidade" | "regiao" | "momento" | "inegociavel"; rotulo: string; dica: string; opcoes?: string[] }> = [
  { chave: "finalidade", rotulo: "Finalidade", dica: "Para que é o imóvel", opcoes: ["Moradia", "Temporada", "Locação", "Investimento"] },
  { chave: "regiao", rotulo: "Região", dica: "Onde procura", opcoes: Object.keys(BAIRROS) },
  { chave: "momento", rotulo: "Momento", dica: "Quando pensa em comprar", opcoes: ["Comprar em até 3 meses", "Em até 1 ano", "Sem pressa", "Precisa vender outro imóvel"] },
  { chave: "inegociavel", rotulo: "Inegociável", dica: "Ex.: pé na areia, vista, píer" },
];

const DIALOGO =
  "w-[calc(100%-24px)] max-w-lg max-h-[90dvh] gap-5 overflow-y-auto rounded-[28px] border-0 bg-white p-6 sm:p-7 [&>*]:min-w-0";
const pilula = "inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-colors disabled:opacity-50";

export function AntesDeAvancar({
  avanco,
  onFechar,
  onMovido,
}: {
  avanco: PedidoDeAvanco;
  onFechar: () => void;
  onMovido: () => void;
}) {
  const { pedido } = avanco;
  // Começa com o que já está salvo; onde não há, a sugestão da IA vem escrita.
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(CAMPOS.map((c) => [c.chave, pedido.campos[c.chave] ?? pedido.sugestoes[c.chave] ?? ""])),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();

  const preenchidos = CAMPOS.filter((c) => valores[c.chave]?.trim()).length;
  const faltam = Math.max(0, pedido.minimo - preenchidos);

  const salvar = () => {
    setErro(null);
    iniciar(async () => {
      const fd = new FormData();
      fd.set("leadId", avanco.leadId);
      fd.set("etapaId", avanco.etapaId);
      for (const c of CAMPOS) fd.set(c.chave, valores[c.chave] ?? "");
      const res = await preencherEMover(fd);
      if (res.ok) onMovido();
      else setErro(res.erro);
    });
  };

  return (
    <Dialog open onOpenChange={(aberto) => !aberto && !salvando && onFechar()}>
      <DialogContent className={DIALOGO}>
        <DialogHeader className="flex-row items-start gap-3 space-y-0 pr-6 text-left">
          <IconeRedondo icone={ClipboardText} tom="acao" />
          <div className="min-w-0">
            <DialogTitle className="text-[19px] tracking-[-0.02em] text-[#0a2d40]">Antes de ir para {avanco.etapaNome}</DialogTitle>
            <DialogDescription className="mt-1 text-[13px] leading-relaxed text-[#5b7284]">
              Preencha {pedido.minimo} dos 4 sobre {avanco.nome.split(" ")[0]}. Isso volta para a Meta e ajuda a campanha a achar lead parecido.
            </DialogDescription>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {CAMPOS.map((c) => {
            const valor = valores[c.chave] ?? "";
            const salvo = Boolean(pedido.campos[c.chave]);
            const daIa = !salvo && Boolean(pedido.sugestoes[c.chave]) && valor === pedido.sugestoes[c.chave];
            return (
              <div key={c.chave} className="flex flex-col gap-1.5">
                <label htmlFor={`avanco-${c.chave}`} className="flex items-center gap-1.5 text-[13px] font-medium text-[#34566b]">
                  {c.rotulo}
                  {daIa && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f0f5] px-2 py-0.5 text-[11px] font-semibold text-[#1f6a93]">
                      <Sparkle className="size-3" weight="fill" /> a IA leu na conversa
                    </span>
                  )}
                </label>
                <input
                  id={`avanco-${c.chave}`}
                  value={valor}
                  onChange={(e) => setValores((v) => ({ ...v, [c.chave]: e.target.value }))}
                  placeholder={c.dica}
                  maxLength={200}
                  className={cn(
                    "h-11 w-full rounded-[14px] border border-transparent px-3.5 text-[15px] text-[#0a2d40] outline-none transition-colors focus:border-[#8fc4dd] focus:bg-white",
                    valor.trim() ? "bg-[#e7f0f5]" : "bg-[#f2f6f9]",
                  )}
                />
                {c.opcoes && (
                  <div className="flex flex-wrap gap-1.5">
                    {c.opcoes.map((o) => (
                      <button
                        key={o}
                        type="button"
                        onClick={() => setValores((v) => ({ ...v, [c.chave]: o }))}
                        aria-pressed={valor === o}
                        className={cn(
                          "h-9 rounded-full px-3 text-[13px] font-medium transition-colors",
                          valor === o ? "bg-[#0a2d40] text-white" : "bg-[#f2f6f9] text-[#34566b] hover:bg-[#e7f0f5]",
                        )}
                      >
                        {o}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {erro && <p className="text-[13px] text-[#a4410e]">{erro}</p>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onFechar} disabled={salvando} className={cn(pilula, "bg-[#f2f6f9] text-[#34566b] hover:bg-[#e7f0f5]")}>
            Agora não
          </button>
          <button type="button" onClick={salvar} disabled={salvando || faltam > 0} className={cn(pilula, "bg-[#0a2d40] text-white hover:bg-[#12455f]")}>
            {salvando ? "Salvando" : faltam > 0 ? `Falta ${faltam} ${faltam === 1 ? "campo" : "campos"}` : `Salvar e mover`}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
