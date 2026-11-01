"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Check, CircleNotch, Lock, UserPlus } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { decidirContato, type ContatoNovo } from "./contatos-novos-actions";
import { Cartao, TituloBloco } from "./ui";

/**
 * "Contatos novos: é lead?" no Hoje do corretor e no Meu WhatsApp. Nada da
 * conversa desses contatos foi guardado: o CRM só sabe que alguém escreveu. Um
 * toque decide; lead passa a ser lido pela IA, pessoal some daqui para sempre.
 */

function quando(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(iso));
}

function telefoneLegivel(tel: string | null): string {
  if (!tel) return "Número protegido pelo WhatsApp";
  const d = tel.replace(/\D/g, "").replace(/^55/, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return tel;
}

const BOTAO = "inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-[14px] font-semibold transition-colors disabled:opacity-60";

export function ContatosNovos({ inicial, compacto }: { inicial: ContatoNovo[]; compacto?: boolean }) {
  const [lista, setLista] = useState(inicial);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  if (!lista.length) return null;

  const decidir = (c: ContatoNovo, d: "lead" | "pessoal") =>
    iniciar(async () => {
      setOcupado(c.id);
      try {
        const r = await decidirContato(c.id, d);
        if (!r.ok) {
          toast.error(r.erro ?? "Não deu certo agora.");
          return;
        }
        setLista((l) => l.filter((x) => x.id !== c.id));
        toast.success(d === "lead" ? "Virou lead. A IA já está lendo a conversa." : "Marcado como pessoal. Não aparece mais no CRM.");
      } catch {
        toast.error("Não deu certo agora. Tente de novo em instantes.");
      } finally {
        setOcupado(null);
      }
    });

  return (
    <Cartao bloco tour="contatos-novos" className={cn(compacto ? "" : "mb-6")}>
      <TituloBloco
        icone={UserPlus}
        titulo="Contatos novos: é lead?"
        sub="Escreveram no seu WhatsApp. Nada da conversa foi guardado até você decidir."
      />
      <ul className="mt-5 flex flex-col gap-2">
        {lista.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-[22px] bg-[#f2f6f9] px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-[#0a2d40]">{c.nome ?? telefoneLegivel(c.telefone)}</p>
              <p className="truncate text-[13px] text-[#5b7284]">
                {c.nome ? `${telefoneLegivel(c.telefone)} · ` : ""}
                {c.mensagens > 0 ? `${c.mensagens} ${c.mensagens === 1 ? "mensagem" : "mensagens"}, ` : ""}
                {quando(c.ultimoContatoEm)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => decidir(c, "lead")}
                disabled={ocupado === c.id}
                className={cn(BOTAO, "bg-[#0a2d40] text-white hover:bg-[#12455f]")}
              >
                {ocupado === c.id ? <CircleNotch className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                É lead
              </button>
              <button
                type="button"
                onClick={() => decidir(c, "pessoal")}
                disabled={ocupado === c.id}
                className={cn(BOTAO, "bg-white text-[#0a2d40] hover:bg-[#e7f0f5]")}
              >
                <Lock className="size-4" aria-hidden />
                Pessoal
              </button>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[13px] leading-relaxed text-[#5b7284]">
        No WhatsApp Business você também pode marcar a conversa com a etiqueta <strong>Lead OPA</strong> ou <strong>Pessoal</strong>.
      </p>
    </Cartao>
  );
}
