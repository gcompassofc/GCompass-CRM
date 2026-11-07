"use client";

import { useMemo, useState } from "react";

import { Check, Lock } from "@/lib/ui/icons";
import { mensagemSelecao, type ItemSelecao } from "@/lib/opa/mensagens";
import { toast } from "sonner";

import { marcarSelecaoEnviada } from "../actions";

import { MensagemPronta } from "./_componentes";

/**
 * Montar seleção: o corretor marca até 3 imóveis que combinam e manda uma
 * mensagem só, no tom do Kit. Off market sai sem link nem valor.
 */
export function MontarSelecao({
  leadId,
  nome,
  telefone,
  inegociavel,
  itens,
}: {
  leadId: string;
  nome: string;
  telefone: string | null;
  inegociavel: string | null;
  itens: ItemSelecao[];
}) {
  // Os 2 que mais combinam já vêm marcados como sugestão; o corretor troca à vontade.
  const sugeridos = useMemo(() => itens.slice(0, 2).map((i) => i.codigo), [itens]);
  const [marcados, setMarcados] = useState<string[]>(sugeridos);
  const aindaSugestao = marcados.length > 0 && marcados.length === sugeridos.length && marcados.every((c) => sugeridos.includes(c));
  const escolhidos = useMemo(() => itens.filter((i) => marcados.includes(i.codigo)), [itens, marcados]);
  const texto = mensagemSelecao({ nome, inegociavel, itens: escolhidos });

  if (itens.length === 0) return null;
  const alternar = (codigo: string) =>
    setMarcados((m) => (m.includes(codigo) ? m.filter((c) => c !== codigo) : m.length >= 3 ? m : [...m, codigo]));

  return (
    <div className="mt-6 rounded-[24px] bg-[#f2f6f9] p-4">
      <p className="text-[15px] font-semibold text-[#0a2d40]">Montar seleção</p>
      <p className="mt-0.5 text-[13px] text-[#5b7284]">
        {aindaSugestao
          ? `Sugestão: ${sugeridos.length === 1 ? "marcamos o que mais combina" : `marcamos os ${sugeridos.length} que mais combinam`}. Troque à vontade, até 3.`
          : "Marque até 3. A mensagem sai pronta, uma só."}
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {itens.map((i) => {
          const on = marcados.includes(i.codigo);
          return (
            <li key={i.codigo}>
              <button
                type="button"
                aria-pressed={on}
                title={`${i.codigo}: ${i.titulo}`}
                onClick={() => alternar(i.codigo)}
                className={`inline-flex h-11 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ${
                  on ? "bg-[#12455f] text-white" : "bg-white text-[#12455f]"
                }`}
              >
                {on && <Check className="size-3.5" weight="bold" />}
                {i.offMarket && <Lock className="size-3.5" weight="fill" />}
                {i.bairro ?? i.codigo} · {i.preco}
              </button>
            </li>
          );
        })}
      </ul>
      {texto ? (
        <div className="mt-4">
          <MensagemPronta
            texto={texto}
            telefone={telefone}
            aoAbrirWhatsapp={() => {
              // Registra a seleção e, se der, leva o card para "Seleção enviada". Não segura o WhatsApp.
              void marcarSelecaoEnviada(leadId, marcados).then((r) => {
                if (r.etapa) toast.success("Seleção registrada: o card foi para Seleção enviada.");
              });
            }}
          />
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-[#5b7284]">Marque pelo menos um imóvel.</p>
      )}
    </div>
  );
}
