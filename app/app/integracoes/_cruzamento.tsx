"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Bell, Buildings, ClockClockwise, Gauge, ListNumbers, MapPin, Sparkle, Tag, Target } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { salvarCruzamento } from "./actions";

const LINHAS: Array<[keyof Pesos, string, typeof MapPin]> = [
  ["bairro", "Bairro e região", MapPin],
  ["preco", "Faixa de preço (até 40% de diferença)", Tag],
  ["suites", "Suítes ou tipo do imóvel", Buildings],
  ["atributos", "Pé na areia, vista, píer, piscina", Sparkle],
  ["demanda", "Finalidade e inegociável preenchidos", Target],
];

type Pesos = { bairro: number; preco: number; suites: number; atributos: number; demanda: number };

/** Pesos da afinidade (somam 100) e o mínimo para o imóvel aparecer ao corretor. */
export function FormCruzamento({ pesos, minimo, editavel }: { pesos: Pesos; minimo: number; editavel: boolean }) {
  const [valores, setValores] = useState<Pesos>(pesos);
  const [min, setMin] = useState(minimo);
  const [pendente, iniciar] = useTransition();
  const soma = Object.values(valores).reduce((s, p) => s + p, 0);

  const regras: Array<[typeof MapPin, string, string]> = [
    [ListNumbers, "Opções do acervo por lead", "3"],
    [Target, "Opções do Radar por lead", "2, quando o Radar ligar"],
    [ClockClockwise, "Refaz quando", "imóvel novo ou demanda muda"],
    [Bell, "Imóvel novo acima de 75%", "avisa pelo OPA Lembretes"],
  ];

  return (
    <form
      className="grid gap-5 lg:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        iniciar(async () => {
          const r = await salvarCruzamento(fd);
          if (r.ok) toast.success("Cruzamento salvo.");
          else toast.error(r.erro);
        });
      }}
    >
      <div className="rounded-[24px] bg-[#f2f6f9] p-5">
        <div className="flex items-center justify-between">
          <p className="text-[14px] font-semibold text-[#0a2d40]">Como a afinidade é calculada</p>
          <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums", soma === 100 ? "bg-[#e3f4ea] text-[#1e7a46]" : "bg-[#fde8e6] text-[#b42318]")}>
            total {soma}
          </span>
        </div>
        <ul className="mt-4 flex flex-col gap-3.5">
          {LINHAS.map(([k, rotulo, I]) => (
            <li key={k} className="flex items-center gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-[#12455f]">
                <I className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-[#34566b]">{rotulo}</p>
                <div className="opa-hachurado mt-1.5 h-2 overflow-hidden rounded-full">
                  <div className="h-full rounded-full bg-gradient-to-r from-[#12455f] to-[#2a7ca8]" style={{ width: `${Math.min(100, valores[k] * 2.5)}%` }} />
                </div>
              </div>
              {editavel ? (
                <input
                  name={k}
                  type="number"
                  min={0}
                  max={100}
                  value={valores[k]}
                  onChange={(e) => setValores({ ...valores, [k]: Number(e.target.value) })}
                  aria-label={rotulo}
                  className="h-9 w-16 rounded-full bg-white px-3 text-right text-[14px] font-semibold tabular-nums text-[#0a2d40] outline-none focus:ring-2 focus:ring-[#8fc4dd]"
                />
              ) : (
                <b className="w-10 text-right tabular-nums">{valores[k]}</b>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-3 rounded-[24px] bg-[#f2f6f9] p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-[#12455f]">
            <Gauge className="size-4" />
          </span>
          <p className="flex-1 text-[14px] font-semibold text-[#0a2d40]">Afinidade mínima para aparecer</p>
          {editavel ? (
            <select
              name="minimo"
              value={min}
              onChange={(e) => setMin(Number(e.target.value))}
              className="h-9 rounded-full bg-white px-3 text-[14px] font-semibold text-[#0a2d40] outline-none"
            >
              {[50, 60, 70, 80].map((v) => (
                <option key={v} value={v}>
                  {v}%
                </option>
              ))}
            </select>
          ) : (
            <b>{min}%</b>
          )}
        </div>
        <ul className="flex flex-col gap-2.5">
          {regras.map(([I, r, v]) => (
            <li key={r} className="flex items-center gap-3 text-[13px]">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-[#12455f]">
                <I className="size-4" />
              </span>
              <span className="flex-1 text-[#34566b]">{r}</span>
              <span className="text-right font-medium text-[#0a2d40]">{v}</span>
            </li>
          ))}
        </ul>
        {editavel && (
          <button
            type="submit"
            disabled={pendente || soma !== 100}
            className="mt-auto inline-flex h-11 items-center justify-center rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white hover:bg-[#12455f] disabled:opacity-50"
          >
            Salvar cruzamento
          </button>
        )}
      </div>
    </form>
  );
}
