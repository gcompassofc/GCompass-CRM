"use client";

import { useMemo, useState } from "react";

import { Check, Lock } from "@/lib/ui/icons";
import { mensagemSelecao, type ItemSelecao } from "@/lib/opa/mensagens";

import { MensagemPronta } from "./_componentes";

/**
 * Montar seleção: o corretor marca até 3 imóveis que combinam e manda uma
 * mensagem só, no tom do Kit. Off market sai sem link nem valor.
 */
export function MontarSelecao({
  nome,
  telefone,
  inegociavel,
  itens,
}: {
  nome: string;
  telefone: string | null;
  inegociavel: string | null;
  itens: ItemSelecao[];
}) {
  const [marcados, setMarcados] = useState<string[]>(() => itens.slice(0, 2).map((i) => i.codigo));
  const escolhidos = useMemo(() => itens.filter((i) => marcados.includes(i.codigo)), [itens, marcados]);
  const texto = mensagemSelecao({ nome, inegociavel, itens: escolhidos });

  if (itens.length === 0) return null;
  const alternar = (codigo: string) =>
    setMarcados((m) => (m.includes(codigo) ? m.filter((c) => c !== codigo) : m.length >= 3 ? m : [...m, codigo]));

  return (
    <div className="mt-6 rounded-[24px] bg-[#f2f6f9] p-4">
      <p className="text-[15px] font-semibold text-[#0a2d40]">Montar seleção</p>
      <p className="mt-0.5 text-[13px] text-[#5b7284]">Marque até 3. A mensagem sai pronta, uma só.</p>
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
                className={`inline-flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ${
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
          <MensagemPronta texto={texto} telefone={telefone} />
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-[#5b7284]">Marque pelo menos um imóvel.</p>
      )}
    </div>
  );
}
