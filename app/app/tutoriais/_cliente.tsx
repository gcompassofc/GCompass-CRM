"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  agruparPorTela,
  buscarTutoriais,
  nomeDaTela,
  PASSOS,
  type Topico,
  type VersaoTutorial,
} from "@/lib/opa/tutorial";
import { linkDoTour, tourDaTela, toursPermitidos } from "@/lib/opa/tour";
import { ArrowRight, CaretDown, CheckCircle, Handshake, MagnifyingGlass, Question, Sparkle, UsersThree, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { PassoAPasso, useMarcarVisto } from "../_opa/tutorial";
import { Cartao, TituloBloco } from "../_opa/ui";

const VERSAO = {
  corretor: { icone: Handshake, titulo: "Versão do corretor", sub: "O dia a dia: Fila, leads, ficha, imóveis e WhatsApp" },
  gestor: { icone: UsersThree, titulo: "Versão do gestor", sub: "O que muda para quem cuida da equipe" },
} as const;

export function TutoriaisCliente({
  versoes,
  minha,
  abrir,
  feitos,
}: {
  versoes: VersaoTutorial[];
  minha: VersaoTutorial | null;
  /** Vindo de `?passo=`: abre direto ao carregar. */
  abrir: { versao: VersaoTutorial; indice: number } | null;
  /** Tours de tela que a pessoa já terminou. */
  feitos: string[];
}) {
  const [termo, setTermo] = useState("");
  const [aberto, setAberto] = useState(abrir);
  const marcar = useMarcarVisto();
  const conferindo = versoes.length > 1;
  // Admin e gestor escolhem de que lado fazem o tour: o do corretor roda com `como=corretor`.
  const [como, setComo] = useState<VersaoTutorial>(minha ?? versoes[0] ?? "corretor");
  const toursDoLado = useMemo(() => new Set(toursPermitidos(como).map((t) => t.id)), [como]);
  const achados = useMemo(() => buscarTutoriais(termo, versoes), [termo, versoes]);
  const buscando = termo.trim().length > 0;

  const fechar = () => {
    setAberto(null);
    // Tira o `?passo=` do endereço: recarregar a página não reabre o passo.
    if (window.location.search) window.history.replaceState(null, "", "/app/tutoriais");
  };

  const topico = (t: Topico) => (
    <li key={`${t.versao}:${t.passo.id}`}>
      <button
        type="button"
        onClick={() => setAberto({ versao: t.versao, indice: t.indice })}
        className="flex w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left transition-colors hover:bg-[#f2f6f9]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-medium text-[#0a2d40]">{t.passo.titulo}</span>
          {buscando && <span className="block text-[13px] text-[#5b7284]">{nomeDaTela(t.passo.tela)}</span>}
        </span>
        {conferindo && (
          <span className="shrink-0 rounded-full bg-[#eef3f6] px-2.5 py-0.5 text-[12px] font-semibold text-[#12455f]">
            {t.versao === "gestor" ? "Gestor" : "Corretor"}
          </span>
        )}
        <ArrowRight className="size-4 shrink-0 text-[#8aa3b3]" weight="bold" />
      </button>
    </li>
  );

  return (
    <>
      <label className="relative block">
        <span className="sr-only">Buscar nos tutoriais</span>
        <MagnifyingGlass className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-[#8aa3b3]" />
        <input
          type="search"
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Busque: roleta, prazo, WhatsApp"
          className="h-14 w-full rounded-full bg-white pl-[3.25rem] pr-12 text-[15px] text-[#0a2d40] shadow-[0_1px_2px_rgba(9,44,62,0.04)] outline-none placeholder:text-[#8aa3b3] focus:ring-2 focus:ring-[#2a7ca8]/40"
        />
        {buscando && (
          <button
            type="button"
            onClick={() => setTermo("")}
            aria-label="Limpar a busca"
            className="absolute right-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full text-[#5b7284] hover:bg-[#eef3f6]"
          >
            <X className="size-4" weight="bold" />
          </button>
        )}
      </label>

      {buscando ? (
        <Cartao bloco>
          {achados.topicos.length + achados.duvidas.length === 0 ? (
            <p className="text-[15px] text-[#5b7284]">Nada encontrado para “{termo.trim()}”. Tente outra palavra.</p>
          ) : (
            <div className="flex flex-col gap-6">
              {achados.topicos.length > 0 && (
                <div>
                  <h2 className="px-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#8aa3b3]">Passo a passo</h2>
                  <ul className="mt-2 flex flex-col gap-0.5">{achados.topicos.map(topico)}</ul>
                </div>
              )}
              {achados.duvidas.length > 0 && <Duvidas duvidas={achados.duvidas} titulo="Dúvidas" />}
            </div>
          )}
        </Cartao>
      ) : (
        <>
          {/* min-w-0: sem ele o subtítulo com reticências alarga o cartão além da tela no celular. */}
          <div className={cn("grid gap-5 [&>*]:min-w-0", versoes.length > 1 && "md:grid-cols-2")}>
            {versoes.map((v) => {
              const info = VERSAO[v];
              return (
                <Cartao key={v} bloco className="flex flex-col">
                  <TituloBloco icone={info.icone} titulo={info.titulo} sub={info.sub} tom={v === minha ? "escuro" : "claro"} />
                  <div className="mt-6 flex items-center justify-between gap-3">
                    <span className="text-[13px] text-[#5b7284]">{PASSOS[v].length} passos, uns 2 minutos</span>
                    <button
                      type="button"
                      onClick={() => setAberto({ versao: v, indice: 0 })}
                      className={cn(
                        "inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold transition-colors",
                        v === minha ? "bg-[#0a2d40] text-white hover:bg-[#12455f]" : "bg-[#eef3f6] text-[#0a2d40] hover:bg-[#e2ecf2]",
                      )}
                    >
                      {conferindo ? `Ver como ${v}` : "Começar"}
                      <ArrowRight className="size-4" weight="bold" />
                    </button>
                  </div>
                </Cartao>
              );
            })}
          </div>

          <Cartao bloco>
            <TituloBloco
              icone={MagnifyingGlass}
              titulo="Por tela"
              sub="Toque num tópico para abrir só aquele passo, ou faça o tour na tela de verdade"
            />
            {conferindo && (
              <div className="mt-5 flex flex-wrap items-center gap-2 px-1" role="radiogroup" aria-label="Fazer os tours como">
                <span className="text-[13px] text-[#5b7284]">Tours como</span>
                {versoes.map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="radio"
                    aria-checked={como === v}
                    onClick={() => setComo(v)}
                    className={cn(
                      "h-9 rounded-full px-4 text-[13px] font-semibold transition-colors",
                      como === v ? "bg-[#0a2d40] text-white" : "bg-[#eef3f6] text-[#0a2d40] hover:bg-[#e2ecf2]",
                    )}
                  >
                    {v === "gestor" ? "Gestor" : "Corretor"}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-5 flex flex-col gap-5">
              {agruparPorTela(achados.topicos).map(({ tela, topicos }) => {
                const tour = tourDaTela(tela.id);
                const podeTour = tour !== null && toursDoLado.has(tour.id);
                const feito = tour !== null && feitos.includes(tour.id);
                return (
                  <div key={tela.id}>
                    <div className="flex items-center justify-between gap-3 px-4">
                      <h3 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-[#8aa3b3]">{tela.nome}</h3>
                      {podeTour && (
                        <Link
                          href={linkDoTour(tour.id, como)}
                          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-[#eef3f6] px-3.5 text-[13px] font-semibold text-[#0a2d40] hover:bg-[#e2ecf2]"
                        >
                          {feito ? <CheckCircle className="size-4 text-[#1d6b43]" weight="fill" /> : <Sparkle className="size-4 text-[#2a7ca8]" weight="fill" />}
                          {feito ? "Fazer de novo" : "Fazer o tour"}
                        </Link>
                      )}
                    </div>
                    <ul className="mt-1 flex flex-col gap-0.5">{topicos.map(topico)}</ul>
                  </div>
                );
              })}
            </div>
          </Cartao>

          <Cartao bloco>
            <Duvidas duvidas={achados.duvidas} titulo="Dúvidas frequentes" comIcone />
          </Cartao>
        </>
      )}

      {aberto && (
        <PassoAPasso
          versao={aberto.versao}
          inicio={aberto.indice}
          aberto
          onFechar={fechar}
          onConcluir={() => {
            marcar(aberto.versao);
            fechar();
          }}
        />
      )}
    </>
  );
}

function Duvidas({
  duvidas,
  titulo,
  comIcone,
}: {
  duvidas: ReturnType<typeof buscarTutoriais>["duvidas"];
  titulo: string;
  comIcone?: boolean;
}) {
  return (
    <div>
      {comIcone ? (
        <TituloBloco icone={Question} titulo={titulo} sub="Resposta curta e o caminho na tela" />
      ) : (
        <h2 className="px-4 text-[13px] font-semibold uppercase tracking-[0.12em] text-[#8aa3b3]">{titulo}</h2>
      )}
      <ul className={cn("flex flex-col gap-1.5", comIcone ? "mt-5" : "mt-2")}>
        {duvidas.map((d) => (
          <li key={d.id}>
            <details className="group rounded-[18px] bg-[#f2f6f9] open:bg-[#eef3f6]">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-[15px] font-medium text-[#0a2d40] [&::-webkit-details-marker]:hidden">
                <span className="flex-1">{d.pergunta}</span>
                <CaretDown className="size-4 shrink-0 text-[#5b7284] transition-transform group-open:rotate-180" weight="bold" />
              </summary>
              <div className="px-4 pb-4">
                <p className="text-[14px] leading-relaxed text-[#34566b]">{d.resposta}</p>
                {d.href && (
                  <Link href={d.href} className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#2a7ca8] hover:underline">
                    {d.rotuloLink ?? "Abrir a tela"}
                    <ArrowRight className="size-4" weight="bold" />
                  </Link>
                )}
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
