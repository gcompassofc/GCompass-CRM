"use client";

import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  ArrowsClockwise,
  Bell,
  BellSlash,
  Buildings,
  ChatCircle,
  Check,
  Clock,
  Fire,
  Globe,
  Infinito,
  Lock,
  Megaphone,
  Snowflake,
  Thermometer,
  UserCircle,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { marcarRespondido, moverEtapa } from "../leads/actions";

export interface CartaoQuadro {
  id: string;
  nome: string;
  imovel: { tipo: string; codigo: string; valor: string; titulo: string } | null;
  /** Captação e relacionamento: o imóvel do proprietário (tipo, bairro, valor pretendido). */
  proprietario: { tipo: string; bairro: string; valor: string } | null;
  anuncio: string | null;
  origem: string;
  pago: boolean;
  temperatura: "quente" | "morno" | "frio" | null;
  offMarket: "comprador" | "proprietario" | null;
  voltou: number | null;
  proprio: boolean;
  lembretesDesligados: boolean;
  parecidos: number;
  esperandoMin: number | null;
  dono: string | null;
}

export interface ColunaQuadro {
  id: string;
  nome: string;
  cor: string | null;
  evento: string | null;
  lembrete: string | null;
  trava: boolean;
  total: number;
  cartoes: CartaoQuadro[];
}

const brl = (c: number) =>
  c >= 100_000_000
    ? `R$ ${(c / 100_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
    : `R$ ${Math.round(c / 100_000).toLocaleString("pt-BR")} mil`;

function tempo(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

/** Temperatura só por ícone (com title): quente, morno, frio. */
const TEMP = {
  quente: { Icone: Fire, cls: "bg-[#fde8e6] text-[#b42318]", rotulo: "Quente" },
  morno: { Icone: Thermometer, cls: "bg-[#fdf1dc] text-[#9a5b00]", rotulo: "Morno" },
  frio: { Icone: Snowflake, cls: "bg-[#e7f0f5] text-[#2a7ca8]", rotulo: "Frio" },
} as const;

/** Selo de etapa só com ícone, explicado no title. */
function SeloEtapa({ icone: I, titulo }: { icone: typeof Bell; titulo: string }) {
  return (
    <span title={titulo} aria-label={titulo} className="inline-flex size-7 items-center justify-center rounded-full bg-white text-[#2a7ca8]">
      <I className="size-3.5" weight="bold" />
    </span>
  );
}

export function QuadroOpa({ colunas: inicial }: { colunas: ColunaQuadro[] }) {
  const router = useRouter();
  const [colunas, setColunas] = useState(inicial);
  const [, iniciar] = useTransition();

  const soltar = (r: DropResult) => {
    if (!r.destination || r.destination.droppableId === r.source.droppableId) return;
    const antes = colunas;
    const de = colunas.find((c) => c.id === r.source.droppableId)!;
    const cartao = de.cartoes.find((c) => c.id === r.draggableId)!;
    setColunas(
      colunas.map((c) =>
        c.id === r.source.droppableId
          ? { ...c, cartoes: c.cartoes.filter((x) => x.id !== cartao.id) }
          : c.id === r.destination!.droppableId
            ? { ...c, cartoes: [cartao, ...c.cartoes] }
            : c,
      ),
    );
    iniciar(async () => {
      const fd = new FormData();
      fd.set("leadId", cartao.id);
      fd.set("etapaId", r.destination!.droppableId);
      const res = await moverEtapa(fd);
      if (!res.ok) {
        setColunas(antes);
        toast.error(res.erro);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <DragDropContext onDragEnd={soltar}>
      <div className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-4 md:-mx-10 md:px-10">
        {colunas.map((col) => (
          <section key={col.id} className="flex w-[296px] shrink-0 flex-col rounded-[28px] bg-[#f2f6f9] p-3">
            <header className="px-2 pb-3 pt-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-[#0a2d40]">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: col.cor ?? "#2a7ca8" }} />
                  <span className="truncate">{col.nome}</span>
                </p>
                <span className="shrink-0 rounded-full bg-white px-2 text-[12px] font-semibold tabular-nums text-[#34566b]">{col.cartoes.length}</span>
              </div>
              <div className="mt-2 flex min-h-7 items-center justify-between gap-2">
                <span className="text-[12px] text-[#5b7284]">{col.total ? brl(col.total) : ""}</span>
                <div className="flex gap-1">
                  {col.evento && <SeloEtapa icone={Infinito} titulo={`Envia ao Meta: ${col.evento}`} />}
                  {col.lembrete && <SeloEtapa icone={Bell} titulo={`Lembrete: ${col.lembrete}`} />}
                  {col.trava && <SeloEtapa icone={Lock} titulo="Pede campos confirmados para entrar" />}
                </div>
              </div>
            </header>
            <Droppable droppableId={col.id}>
              {(prov, snap) => (
                <div
                  ref={prov.innerRef}
                  {...prov.droppableProps}
                  className={cn("flex min-h-24 flex-1 flex-col gap-2.5 rounded-[22px] transition-colors", snap.isDraggingOver && "bg-[#e7f0f5]")}
                >
                  {col.cartoes.map((c, i) => {
                    const temp = c.temperatura ? TEMP[c.temperatura] : null;
                    const OrigemIcone = c.pago ? Megaphone : Globe;
                    return (
                      <Draggable key={c.id} draggableId={c.id} index={i}>
                        {(p, s) => (
                          <article
                            ref={p.innerRef}
                            {...p.draggableProps}
                            {...p.dragHandleProps}
                            className={cn(
                              "rounded-[22px] bg-white p-4 shadow-[0_1px_2px_rgba(9,44,62,0.05)]",
                              s.isDragging && "shadow-[0_18px_40px_rgba(9,44,62,0.18)]",
                            )}
                          >
                            <Link href={`/app/leads/${c.id}`} className="block">
                              <p className="flex items-center gap-2 text-[15px] font-semibold text-[#0a2d40]">
                                <span
                                  className={cn(
                                    "flex size-[22px] shrink-0 items-center justify-center rounded-full text-[11px]",
                                    c.esperandoMin != null ? "bg-[#0a2d40] text-white" : "bg-[#eef3f6] text-[#5b7284]",
                                  )}
                                >
                                  {i + 1}
                                </span>
                                <span className="truncate">{c.nome}</span>
                                <span className="ml-auto flex shrink-0 items-center gap-1 text-[#5b7284]">
                                  {c.offMarket && (
                                    <span title="Off market">
                                      <Lock weight="fill" className="size-3.5 text-[#0a2d40]" />
                                    </span>
                                  )}
                                  {c.voltou && c.voltou > 1 && (
                                    <span title={`Voltou pelo ${c.voltou}º formulário`}>
                                      <ArrowsClockwise className="size-3.5 text-[#2a7ca8]" />
                                    </span>
                                  )}
                                  {c.proprio && (
                                    <span title="Lead próprio">
                                      <UserCircle weight="fill" className="size-3.5 text-[#12455f]" />
                                    </span>
                                  )}
                                  {c.lembretesDesligados && (
                                    <span title="Lembretes desligados">
                                      <BellSlash className="size-3.5" />
                                    </span>
                                  )}
                                </span>
                              </p>
                              <p className="mt-1.5 truncate text-[13px] text-[#5b7284]">
                                {c.imovel ? (
                                  <>
                                    <b className="font-semibold text-[#34566b]">{c.imovel.tipo}</b> · {c.imovel.codigo} · {c.imovel.valor}
                                  </>
                                ) : c.proprietario ? (
                                  <>
                                    <b className="font-semibold text-[#34566b]">{c.proprietario.tipo}</b> · {c.proprietario.bairro}
                                    {c.proprietario.valor ? ` · pede ${c.proprietario.valor}` : ""}
                                  </>
                                ) : (
                                  "Sem imóvel definido"
                                )}
                              </p>
                              <div className="mt-3 flex items-center gap-1.5">
                                <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[#eef3f6] px-2 py-1 text-[11px] font-medium text-[#34566b]">
                                  <OrigemIcone className="size-3 shrink-0" weight="bold" />
                                  <span className="truncate">{c.origem}</span>
                                </span>
                                {temp && (
                                  <span
                                    title={temp.rotulo}
                                    aria-label={temp.rotulo}
                                    className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full", temp.cls)}
                                  >
                                    <temp.Icone weight="fill" className="size-3.5" />
                                  </span>
                                )}
                                {c.parecidos > 0 && (
                                  <span
                                    title={`${c.parecidos} ${c.parecidos === 1 ? "imóvel parecido" : "imóveis parecidos"} no acervo`}
                                    className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-[#e7f0f5] px-2 py-1 text-[11px] font-semibold text-[#12455f]"
                                  >
                                    <Buildings className="size-3" weight="bold" /> {c.parecidos}
                                  </span>
                                )}
                              </div>
                            </Link>
                            <footer className="mt-3 flex items-center justify-between gap-2 border-t border-[#eef3f6] pt-3">
                              {c.esperandoMin != null ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f0f5] px-2 py-1 text-[12px] font-semibold text-[#12455f]">
                                  <Clock className="size-3.5" /> {tempo(c.esperandoMin)}
                                </span>
                              ) : (
                                <span className="truncate text-[12px] text-[#5b7284]">{c.dono ? `${c.dono} · respondido` : "respondido"}</span>
                              )}
                              <div className="flex shrink-0 gap-1.5">
                                <Link
                                  href={`/app/leads/${c.id}`}
                                  title="Abrir a conversa"
                                  aria-label="Abrir a conversa"
                                  className="relative inline-flex size-9 items-center justify-center rounded-full bg-[#eef3f6] text-[#0a2d40] hover:bg-[#e7f0f5]"
                                >
                                  <ChatCircle className="size-4" />
                                  {c.esperandoMin != null && (
                                    <span className="absolute right-0 top-0 size-2.5 rounded-full bg-[#d64545] ring-2 ring-white" />
                                  )}
                                </Link>
                                {c.esperandoMin != null && (
                                  <form action={marcarRespondido}>
                                    <input type="hidden" name="leadId" value={c.id} />
                                    <button
                                      type="submit"
                                      title="Respondi"
                                      aria-label="Respondi"
                                      className="inline-flex size-9 items-center justify-center rounded-full bg-[#e3f4ea] text-[#1e7a46] hover:bg-[#cdebd9]"
                                    >
                                      <Check className="size-4" weight="bold" />
                                    </button>
                                  </form>
                                )}
                              </div>
                            </footer>
                          </article>
                        )}
                      </Draggable>
                    );
                  })}
                  {prov.placeholder}
                </div>
              )}
            </Droppable>
          </section>
        ))}
      </div>
    </DragDropContext>
  );
}
