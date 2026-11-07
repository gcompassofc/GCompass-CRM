"use client";

import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore, useTransition } from "react";
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
import { AbrirLead } from "../_opa/painel-lead";
import { EnviarEtapa, type EnvioDaEtapa } from "./_enviar-etapa";
import { moverCartao } from "./mover";

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
  /** Valor do negócio, para o total da etapa acompanhar o card que muda de coluna (F7). */
  valorCents: number;
  dono: string | null;
}

export interface ColunaQuadro {
  id: string;
  nome: string;
  /** Slug da etapa: escolhe a sugestão do "Mandar para todos". */
  slug: string;
  cor: string | null;
  evento: string | null;
  lembrete: string | null;
  trava: boolean;
  total: number;
  cartoes: CartaoQuadro[];
  /** Leads da etapa que não vieram para o quadro (limite por coluna). */
  ocultos: number;
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
  quente: { Icone: Fire, cls: "bg-[#fdeee3] text-[#a4410e]", rotulo: "Quente" },
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

/** Tela de toque (celular, tablet): arrastar card com o dedo briga com a rolagem, então lá o card muda de etapa pelo menu "Mover" (U6). */
function useToque(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mq = window.matchMedia("(pointer: coarse)");
      mq.addEventListener("change", avisar);
      return () => mq.removeEventListener("change", avisar);
    },
    () => window.matchMedia("(pointer: coarse)").matches,
    () => false,
  );
}

/** `envio` ausente (leitura) = sem o botão "Mandar para todos". */
export function QuadroOpa({ colunas: inicial, envio, simples = false }: { colunas: ColunaQuadro[]; envio?: EnvioDaEtapa | null; simples?: boolean }) {
  const router = useRouter();
  const [colunas, setColunas] = useState(inicial);
  const [, iniciar] = useTransition();
  const toque = useToque();

  const mover = (cartaoId: string, deId: string, paraId: string) => {
    if (deId === paraId) return;
    const antes = colunas;
    setColunas(moverCartao(colunas, cartaoId, deId, paraId));
    iniciar(async () => {
      const fd = new FormData();
      fd.set("leadId", cartaoId);
      fd.set("etapaId", paraId);
      const res = await moverEtapa(fd);
      if (!res.ok) {
        setColunas(antes);
        toast.error(res.erro);
      } else {
        toast.success(`Card movido para ${colunas.find((c) => c.id === paraId)?.nome ?? "a nova etapa"}.`);
        router.refresh();
      }
    });
  };

  const soltar = (r: DropResult) => {
    if (!r.destination) return;
    mover(r.draggableId, r.source.droppableId, r.destination.droppableId);
  };

  return (
    <DragDropContext onDragEnd={soltar}>
      <div className="-mx-5 flex gap-4 overflow-x-auto px-5 pb-4 md:-mx-10 md:px-10">
        {colunas.map((col) => (
          <section key={col.id} data-tour="funil-etapa" className="flex w-[296px] shrink-0 flex-col rounded-[28px] bg-[#f2f6f9] p-3">
            <header className="px-2 pb-3 pt-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="flex min-w-0 items-center gap-2 text-[15px] font-semibold text-[#0a2d40]">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: col.cor ?? "#2a7ca8" }} />
                  <span className="truncate">{col.nome}</span>
                </p>
                <div className="flex shrink-0 items-center gap-1">
                  <span className="rounded-full bg-white px-2 text-[12px] font-semibold tabular-nums text-[#34566b]">{col.cartoes.length + col.ocultos}</span>
                  {envio && col.cartoes.length + col.ocultos > 0 && (
                    <EnviarEtapa etapa={{ id: col.id, nome: col.nome, slug: col.slug, quantos: col.cartoes.length + col.ocultos }} envio={envio} />
                  )}
                </div>
              </div>
              <div className="mt-2 flex min-h-7 items-center justify-between gap-2">
                <span className="text-[12px] text-[#5b7284]">{!simples && col.total ? brl(col.total) : ""}</span>
                <div className="flex gap-1">
                  {!simples && col.evento && <SeloEtapa icone={Infinito} titulo={`Envia ao Meta: ${col.evento}`} />}
                  {!simples && col.lembrete && <SeloEtapa icone={Bell} titulo={`Lembrete: ${col.lembrete}`} />}
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
                      <Draggable key={c.id} draggableId={c.id} index={i} isDragDisabled={toque}>
                        {(p, s) => (
                          <article
                            ref={p.innerRef}
                            data-tour="funil-cartao"
                            {...p.draggableProps}
                            {...p.dragHandleProps}
                            className={cn(
                              "rounded-[22px] bg-white p-4 shadow-[0_1px_2px_rgba(9,44,62,0.05)]",
                              s.isDragging && "shadow-[0_18px_40px_rgba(9,44,62,0.18)]",
                            )}
                          >
                            <AbrirLead leadId={c.id} className="block">
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
                                <span
                                  title={c.anuncio ? `Anúncio: ${c.anuncio}` : undefined}
                                  className="inline-flex min-w-0 items-center gap-1 rounded-full bg-[#eef3f6] px-2 py-1 text-[11px] font-medium text-[#34566b]"
                                >
                                  <OrigemIcone className="size-3 shrink-0" weight="bold" />
                                  <span className="truncate">{c.origem}</span>
                                </span>
                                {/* Gestor e administrador veem quem atende; o corretor só vê os dele. */}
                                {!simples && (
                                  <span
                                    title={c.dono ? `Atendido por ${c.dono}` : "Sem corretor"}
                                    className={cn(
                                      "inline-flex max-w-[45%] shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold",
                                      c.dono ? "bg-[#e7f0f5] text-[#12455f]" : "bg-[#fdf0e6] text-[#a4410e]",
                                    )}
                                  >
                                    <UserCircle className="size-3 shrink-0" weight="fill" />
                                    <span className="truncate">{c.dono ?? "Sem corretor"}</span>
                                  </span>
                                )}
                                {temp && (
                                  <span
                                    title={temp.rotulo}
                                    aria-label={temp.rotulo}
                                    className={cn("inline-flex size-6 shrink-0 items-center justify-center rounded-full", temp.cls)}
                                  >
                                    <temp.Icone weight="fill" className="size-3.5" />
                                  </span>
                                )}
                                {!simples && c.parecidos > 0 && (
                                  <span
                                    title={`${c.parecidos} ${c.parecidos === 1 ? "imóvel parecido" : "imóveis parecidos"} no acervo`}
                                    className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-[#e7f0f5] px-2 py-1 text-[11px] font-semibold text-[#12455f]"
                                  >
                                    <Buildings className="size-3" weight="bold" /> {c.parecidos}
                                  </span>
                                )}
                              </div>
                            </AbrirLead>
                            <footer className="mt-3 flex items-center justify-between gap-2 border-t border-[#eef3f6] pt-3">
                              {c.esperandoMin != null ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#e7f0f5] px-2 py-1 text-[12px] font-semibold text-[#12455f]">
                                  <Clock className="size-3.5" /> {tempo(c.esperandoMin)}
                                </span>
                              ) : (
                                <span className="truncate text-[12px] text-[#5b7284]">respondido</span>
                              )}
                              <div className="flex shrink-0 gap-1.5">
                                {toque && (
                                  <label data-tour="funil-mover" className="relative inline-flex h-11 items-center rounded-full bg-[#eef3f6] px-3 text-[13px] font-semibold text-[#0a2d40]">
                                    Mover
                                    <select
                                      aria-label={`Mover ${c.nome} para outra etapa`}
                                      value={col.id}
                                      onChange={(ev) => mover(c.id, col.id, ev.target.value)}
                                      className="absolute inset-0 cursor-pointer opacity-0"
                                    >
                                      {colunas.map((o) => (
                                        <option key={o.id} value={o.id}>
                                          {o.nome}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                )}
                                <Link
                                  href={`/app/leads/${c.id}/conversa`}
                                  prefetch={false}
                                  title="Abrir a conversa"
                                  aria-label="Abrir a conversa"
                                  className="relative inline-flex size-11 items-center justify-center rounded-full bg-[#eef3f6] text-[#0a2d40] hover:bg-[#e7f0f5]"
                                >
                                  <ChatCircle className="size-4" />
                                  {c.esperandoMin != null && (
                                    <span className="absolute right-0 top-0 size-2.5 rounded-full bg-[#e07b2e] ring-2 ring-white" />
                                  )}
                                </Link>
                                {c.esperandoMin != null && (
                                  <form action={marcarRespondido}>
                                    <input type="hidden" name="leadId" value={c.id} />
                                    <button
                                      type="submit"
                                      title="Respondi"
                                      aria-label="Respondi"
                                      className="inline-flex size-11 items-center justify-center rounded-full bg-[#e5f3ea] text-[#1d6b43] hover:bg-[#cdebd9]"
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
            {col.ocultos > 0 && (
              <Link href={`/app/leads?etapa=${col.id}`} className="mt-2 rounded-[18px] bg-white px-3 py-3 text-center text-[13px] font-semibold text-[#2a7ca8]">
                Mais {col.ocultos} nesta etapa. Ver na lista
              </Link>
            )}
          </section>
        ))}
      </div>
    </DragDropContext>
  );
}
