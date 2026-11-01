"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState, useTransition } from "react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ATALHOS, rotuloIntervalo, type ChavePeriodo } from "@/lib/opa/periodo";
import { CalendarBlank, CaretDown, CaretLeft, CaretRight, Check } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Filtro de período no jeito do Airbnb: atalhos à esquerda, dois meses à
 * direita. Toca no primeiro dia, toca no último, a faixa aparece entre eles
 * (passando o mouse, a faixa já acompanha). No celular, um mês por vez.
 * Grava na URL e mantém os outros filtros (?corretor=).
 */

const NOMES_MES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

function mesDe(dia: string): string {
  return dia.slice(0, 7);
}

function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a!, m! - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** Dias do mês em semanas (domingo primeiro); null nas casas vazias. */
function grade(mes: string): Array<string | null> {
  const [a, m] = mes.split("-").map(Number);
  const primeiro = new Date(Date.UTC(a!, m! - 1, 1)).getUTCDay();
  const total = new Date(Date.UTC(a!, m!, 0)).getUTCDate();
  const casas: Array<string | null> = Array.from({ length: primeiro }, () => null);
  for (let d = 1; d <= total; d++) casas.push(`${mes}-${String(d).padStart(2, "0")}`);
  return casas;
}

function Mes({
  mes,
  hoje,
  de,
  ate,
  hover,
  onDia,
  onHover,
}: {
  mes: string;
  hoje: string;
  de: string | null;
  ate: string | null;
  hover: string | null;
  onDia: (d: string) => void;
  onHover: (d: string | null) => void;
}) {
  const [a, m] = mes.split("-").map(Number);
  // Com só o início marcado, a faixa segue o mouse.
  const fim = ate ?? (de && hover && hover > de ? hover : null);
  return (
    <div className="w-full min-w-0">
      <p className="mb-3 text-center text-[15px] font-semibold text-[#0a2d40]">
        {NOMES_MES[m! - 1]} {a}
      </p>
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-[#5b7284]">
        {SEMANA.map((s, i) => (
          <span key={i} className="pb-2">
            {s}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7" onMouseLeave={() => onHover(null)}>
        {grade(mes).map((dia, i) => {
          if (!dia) return <span key={i} />;
          const futuro = dia > hoje;
          const ponta = dia === de || dia === fim;
          const meio = Boolean(de && fim && dia > de && dia < fim);
          const coluna = i % 7;
          return (
            <span
              key={dia}
              className={cn(
                "relative flex h-10 items-center justify-center",
                meio && "bg-[#e7f0f5]",
                meio && coluna === 0 && "rounded-l-full",
                meio && coluna === 6 && "rounded-r-full",
                dia === de && fim && fim !== de && "bg-gradient-to-r from-transparent from-50% to-[#e7f0f5] to-50%",
                dia === fim && de && fim !== de && "bg-gradient-to-l from-transparent from-50% to-[#e7f0f5] to-50%",
              )}
            >
              <button
                type="button"
                disabled={futuro}
                onClick={() => onDia(dia)}
                onMouseEnter={() => onHover(dia)}
                aria-label={dia}
                aria-pressed={ponta}
                className={cn(
                  "relative z-10 flex size-10 items-center justify-center rounded-full text-[14px] tabular-nums transition-colors",
                  futuro && "cursor-not-allowed text-[#c8d6df]",
                  !futuro && !ponta && "text-[#0a2d40] hover:border hover:border-[#0a2d40]",
                  ponta && "bg-[#0a2d40] font-semibold text-white",
                  dia === hoje && !ponta && "font-semibold underline decoration-[#2a7ca8] decoration-2 underline-offset-4",
                )}
              >
                {Number(dia.slice(8))}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}

type PropsFiltro = { chave: ChavePeriodo; rotulo: string; deDia: string; ateDia: string; hoje: string };

/** useSearchParams pede Suspense; sem ele a página inteira cai para render no cliente. */
export function FiltroPeriodo(props: PropsFiltro) {
  return (
    <Suspense fallback={null}>
      <FiltroPeriodoInterno {...props} />
    </Suspense>
  );
}

function FiltroPeriodoInterno({
  chave,
  rotulo,
  deDia,
  ateDia,
  hoje,
}: PropsFiltro) {
  const router = useRouter();
  const pathname = usePathname();
  const busca = useSearchParams();
  const [aberto, setAberto] = useState(false);
  const [indo, iniciar] = useTransition();
  const [de, setDe] = useState<string | null>(chave === "personalizado" ? deDia : null);
  const [ate, setAte] = useState<string | null>(chave === "personalizado" ? ateDia : null);
  const [hover, setHover] = useState<string | null>(null);
  // O mês da direita é o do fim escolhido (ou o atual); o da esquerda, o anterior.
  const [mesDireita, setMesDireita] = useState(mesDe(chave === "personalizado" ? ateDia : hoje));

  function ir(params: Record<string, string>) {
    const p = new URLSearchParams(busca.toString());
    for (const k of ["periodo", "de", "ate"]) p.delete(k);
    for (const [k, v] of Object.entries(params)) p.set(k, v);
    setAberto(false);
    iniciar(() => router.push(`${pathname}${p.size ? `?${p}` : ""}`, { scroll: false }));
  }

  function tocar(dia: string) {
    if (!de || ate || dia < de) {
      setDe(dia);
      setAte(null);
      return;
    }
    setAte(dia);
  }

  const fimMostrado = ate ?? (de ? de : null);
  const resumo = de ? rotuloIntervalo(de, fimMostrado ?? de) : "Escolha o primeiro dia";

  return (
    <Popover
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) {
          setDe(chave === "personalizado" ? deDia : null);
          setAte(chave === "personalizado" ? ateDia : null);
          setMesDireita(mesDe(chave === "personalizado" ? ateDia : hoje));
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-semibold text-[#0a2d40] shadow-[0_1px_2px_rgba(9,44,62,0.06)] hover:bg-[#e7f0f5]",
            indo && "opacity-70",
          )}
        >
          <CalendarBlank className="size-4 text-[#2a7ca8]" weight="bold" />
          {rotulo}
          <CaretDown className="size-3.5 text-[#5b7284]" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        className="w-[calc(100vw-32px)] max-w-[760px] rounded-[28px] border-0 bg-white p-0 shadow-[0_24px_60px_rgba(9,44,62,0.18)]"
      >
        <div className="flex flex-col md:flex-row">
          {/* Atalhos */}
          <ul className="flex gap-2 overflow-x-auto border-b border-[#eef3f6] p-4 md:w-[200px] md:shrink-0 md:flex-col md:gap-1 md:overflow-visible md:border-b-0 md:border-r">
            {ATALHOS.map((a) => {
              const ativo = chave === a.chave;
              return (
                <li key={a.chave} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => ir(a.chave === "7d" ? {} : { periodo: a.chave })}
                    className={cn(
                      "flex h-10 w-full items-center justify-between gap-3 whitespace-nowrap rounded-full px-4 text-left text-[14px] transition-colors",
                      ativo ? "bg-[#0a2d40] font-semibold text-white" : "text-[#34566b] hover:bg-[#eef3f6]",
                    )}
                  >
                    {a.rotulo}
                    {ativo && <Check className="size-4" weight="bold" />}
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Calendário */}
          <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
            <div className="flex items-center justify-between">
              <button
                type="button"
                aria-label="Mês anterior"
                onClick={() => setMesDireita((m) => somarMeses(m, -1))}
                className="flex size-11 items-center justify-center rounded-full text-[#0a2d40] hover:bg-[#eef3f6]"
              >
                <CaretLeft className="size-4" weight="bold" />
              </button>
              <p className="text-[13px] font-medium text-[#5b7284]">
                {chave === "personalizado" && !de ? "Personalizado" : resumo}
                {de && !ate && " · agora o último dia"}
              </p>
              <button
                type="button"
                aria-label="Próximo mês"
                disabled={mesDireita >= mesDe(hoje)}
                onClick={() => setMesDireita((m) => somarMeses(m, 1))}
                className="flex size-11 items-center justify-center rounded-full text-[#0a2d40] hover:bg-[#eef3f6] disabled:opacity-30"
              >
                <CaretRight className="size-4" weight="bold" />
              </button>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              <div className="hidden md:block">
                <Mes mes={somarMeses(mesDireita, -1)} hoje={hoje} de={de} ate={ate} hover={hover} onDia={tocar} onHover={setHover} />
              </div>
              <Mes mes={mesDireita} hoje={hoje} de={de} ate={ate} hover={hover} onDia={tocar} onHover={setHover} />
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[#eef3f6] pt-4">
              <button
                type="button"
                onClick={() => {
                  setDe(null);
                  setAte(null);
                }}
                className="text-[14px] font-semibold text-[#0a2d40] underline underline-offset-4 disabled:opacity-40"
                disabled={!de}
              >
                Limpar datas
              </button>
              <button
                type="button"
                disabled={!de}
                onClick={() => de && ir({ periodo: "personalizado", de, ate: ate ?? de })}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0a2d40] px-6 text-[14px] font-semibold text-white hover:bg-[#12455f] disabled:opacity-40"
              >
                Aplicar
              </button>
            </div>
            {/* Atalho que conta: um dia só também vale (início = fim). */}
            {de && !ate && <p className="-mt-2 text-[12px] text-[#5b7284]">Aplicar agora mostra só {rotuloIntervalo(de, de)}.</p>}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
