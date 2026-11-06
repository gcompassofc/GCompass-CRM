"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { CaretRight, ChatCircle, ClockCounterClockwise, Phone, Sparkle } from "@/lib/ui/icons";

import { moverEtapa } from "../leads/actions";
import { resumoDoLead, type ResumoDoLead } from "../leads/painel-actions";
import { AgendarMensagem } from "../leads/[id]/_componentes";
import { MudarNome } from "../leads/[id]/_nome";
import { RegistrarLigacao } from "../leads/[id]/_ligacao";

const PEDIR = "opa:abrir-lead";

/**
 * Link para o lead que abre o painel lateral: a pessoa consulta sem perder a lista,
 * os filtros nem a rolagem. Ctrl ou botão do meio seguem abrindo a ficha em outra aba.
 */
export function AbrirLead({ leadId, className, children, "data-tour": tour }: { leadId: string; className?: string; children: React.ReactNode; "data-tour"?: string }) {
  return (
    <Link
      href={`/app/leads/${leadId}`}
      data-tour={tour}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        window.dispatchEvent(new CustomEvent(PEDIR, { detail: leadId }));
      }}
    >
      {children}
    </Link>
  );
}

/** Troca a etapa ali mesmo, com aviso e Desfazer. A trava do banco responde pela mesma frase da ficha. */
export function SeletorEtapa({
  leadId,
  nome,
  atual,
  etapas,
  className,
}: {
  leadId: string;
  nome: string;
  atual: string;
  etapas: Array<{ id: string; nome: string }>;
  className?: string;
}) {
  const router = useRouter();
  const [valor, setValor] = useState(atual);
  const [pendente, iniciar] = useTransition();
  useEffect(() => setValor(atual), [atual]);

  const enviar = async (etapaId: string) => {
    const fd = new FormData();
    fd.set("leadId", leadId);
    fd.set("etapaId", etapaId);
    return moverEtapa(fd);
  };

  const mudar = (destino: string) => {
    const antes = valor;
    setValor(destino);
    iniciar(async () => {
      const r = await enviar(destino);
      if (!r.ok) {
        setValor(antes);
        toast.error(r.erro);
        return;
      }
      router.refresh();
      toast.success(`${nome} foi para ${etapas.find((e) => e.id === destino)?.nome ?? "outra etapa"}.`, {
        action: {
          label: "Desfazer",
          onClick: () => {
            setValor(antes);
            void enviar(antes).then(() => router.refresh());
          },
        },
      });
    });
  };

  return (
    <select
      aria-label={`Etapa de ${nome}`}
      value={valor}
      disabled={pendente}
      onChange={(e) => mudar(e.target.value)}
      className={className ?? "h-11 max-w-full rounded-full border-0 bg-[#f2f6f9] px-3 text-[13px] font-medium text-[#0a2d40] outline-none hover:bg-[#e7f0f5] focus-visible:ring-2 focus-visible:ring-[#2a7ca8] disabled:opacity-60"}
    >
      {!etapas.some((e) => e.id === valor) && <option value={valor}>Etapa atual</option>}
      {etapas.map((e) => (
        <option key={e.id} value={e.id}>
          {e.nome}
        </option>
      ))}
    </select>
  );
}

const botao = "inline-flex h-11 items-center justify-center gap-2 rounded-full px-4 text-[14px] font-semibold";

/** Painel lateral do lead, aberto de qualquer tela. No celular ocupa a largura toda. */
export function PainelLead() {
  const [aberto, setAberto] = useState(false);
  const [lead, setLead] = useState<ResumoDoLead | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let pedido = 0;
    const abrir = async (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const este = ++pedido;
      setAberto(true);
      setLead(null);
      setCarregando(true);
      const r = await resumoDoLead(id).catch(() => null);
      if (este !== pedido) return;
      setCarregando(false);
      setLead(r);
      if (!r) {
        setAberto(false);
        toast.error("Não consegui abrir este lead.");
      }
    };
    window.addEventListener(PEDIR, abrir);
    return () => window.removeEventListener(PEDIR, abrir);
  }, []);

  return (
    <Sheet open={aberto} onOpenChange={setAberto}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto border-0 bg-[#edf2f5] p-5 sm:max-w-[460px]">
        <div className="flex items-center gap-1 pr-10">
          <SheetTitle className="min-w-0 break-words text-[24px] font-semibold leading-tight tracking-[-0.02em] text-[#0a2d40]">
            {lead?.nome ?? (carregando ? "Abrindo..." : "Lead")}
          </SheetTitle>
          {lead?.podeEditar && (
            <MudarNome lapis leadId={lead.id} atual={lead.nome} className="text-[#5b7284]" onSalvo={(nome) => setLead((l) => (l ? { ...l, nome } : l))} />
          )}
        </div>
        {lead && (
          <div className="mt-4 flex flex-col gap-4">
            <p className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className={lead.proprio ? "rounded-full bg-[#e3eff6] px-2.5 py-1 font-semibold text-[#12455f]" : "rounded-full bg-[#12455f] px-2.5 py-1 font-semibold text-white"}>
                {lead.proprio ? "Lead próprio" : "Lead da OPA"}
              </span>
              <span className="text-[#5b7284]">Veio por {lead.origem}</span>
            </p>

            <div className="flex flex-wrap gap-2">
              <Link href={`/app/leads/${lead.id}/conversa`} prefetch={false} className={`${botao} flex-1 bg-[#1f6a93] text-white hover:bg-[#12455f]`}>
                <ChatCircle className="size-4" weight="fill" /> Conversa
              </Link>
              {lead.telefone && (
                <a href={`tel:+${lead.telefone.replace(/\D/g, "")}`} className={`${botao} bg-white text-[#0a2d40] hover:bg-[#e7f0f5]`}>
                  <Phone className="size-4" /> Ligar
                </a>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <RegistrarLigacao leadId={lead.id} tentativas={lead.tentativas} />
              <AgendarMensagem leadId={lead.id} sugestao={lead.sugestao ?? undefined} />
            </div>

            {lead.etapas.length > 0 && (
              <label className="flex flex-col gap-1.5 text-[13px] font-medium text-[#34566b]">
                Etapa
                <SeletorEtapa
                  leadId={lead.id}
                  nome={lead.nome}
                  atual={lead.etapaId}
                  etapas={lead.etapas}
                  className="h-11 w-full rounded-[14px] border-0 bg-white px-3 text-[14px] text-[#0a2d40] outline-none focus-visible:ring-2 focus-visible:ring-[#2a7ca8] disabled:opacity-60"
                />
              </label>
            )}

            {lead.proximo && (
              <section className="flex gap-3 rounded-[20px] bg-white p-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#efe9f7] text-[#4b3a7a]">
                  <Sparkle className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] text-[#5b7284]">Próximo passo</p>
                  <p className="text-[15px] text-[#0a2d40]">{lead.proximo}</p>
                </div>
              </section>
            )}

            {lead.imovel && (
              <section className="rounded-[20px] bg-white p-3">
                {lead.imovel.foto && (
                  // eslint-disable-next-line @next/next/no-img-element -- foto do site da OPA, já no tamanho de cartão
                  <img src={lead.imovel.foto} alt="" className="h-40 w-full rounded-2xl object-cover" />
                )}
                <p className="mt-2 px-1 text-[12px] font-semibold text-[#5b7284]">{lead.imovel.codigo}</p>
                <p className="px-1 pb-1 text-[14px] text-[#0a2d40]">{lead.imovel.titulo}</p>
              </section>
            )}

            {lead.atividades.length > 0 && (
              <details className="group rounded-[20px] bg-white p-4">
                <summary className="flex cursor-pointer list-none items-center gap-3 text-[15px] font-semibold text-[#0a2d40] [&::-webkit-details-marker]:hidden">
                  <span className="flex size-10 items-center justify-center rounded-full bg-[#e3eff6] text-[#12455f]">
                    <ClockCounterClockwise className="size-5" />
                  </span>
                  Últimas atividades
                  <CaretRight className="ml-auto size-4 text-[#5b7284] transition-transform group-open:rotate-90" />
                </summary>
                <ul className="mt-3 flex flex-col gap-2 text-[14px] text-[#34566b]">
                  {lead.atividades.map((a, i) => (
                    <li key={i}>
                      <span className="text-[#5b7284]">{a.quando}</span> · {a.texto}
                    </li>
                  ))}
                </ul>
              </details>
            )}

            <Link href={`/app/leads/${lead.id}`} className={`${botao} bg-white text-[#0a2d40] hover:bg-[#e7f0f5]`} onClick={() => setAberto(false)}>
              Abrir ficha completa
            </Link>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
