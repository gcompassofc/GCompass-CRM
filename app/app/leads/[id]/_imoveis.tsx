"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Copy, MagnifyingGlass, Plus, Target, X } from "@/lib/ui/icons";
import {
  PONTOS_RADAR,
  REGIOES_RADAR,
  TIPOS_RADAR,
  pedidoParaRadar,
  type PedidoRadar,
} from "@/lib/opa/pedido-radar";
import { cn } from "@/lib/utils";

import { adicionarImovelInteresse, removerImovelInteresse, salvarPedidoRadar } from "../actions";

/** O mínimo de cada imóvel do acervo para a busca (a foto já vem em URL). */
export interface ImovelEscolha {
  codigo: string;
  titulo: string;
  preco: string;
  bairro: string | null;
  foto: string | null;
}

const BOTAO =
  "inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold disabled:opacity-50";

const semAcento = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** "Adicionar imóvel": busca no acervo da OPA por código, título ou bairro. */
export function AdicionarImovel({ leadId, acervo, jaTem }: { leadId: string; acervo: ImovelEscolha[]; jaTem: string[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [pendente, iniciar] = useTransition();

  const lista = useMemo(() => {
    const q = semAcento(busca.trim());
    const fora = acervo.filter((i) => !jaTem.includes(i.codigo));
    if (!q) return fora.slice(0, 40);
    return fora.filter((i) => semAcento(`${i.codigo} ${i.titulo} ${i.bairro ?? ""}`).includes(q)).slice(0, 40);
  }, [acervo, busca, jaTem]);

  const escolher = (codigo: string) =>
    iniciar(async () => {
      const r = await adicionarImovelInteresse(leadId, codigo);
      if (!r.ok) return void toast.error(r.erro ?? "Não deu para adicionar.");
      toast.success(`${codigo} entrou nos imóveis de interesse.`);
      setAberto(false);
      setBusca("");
      router.refresh();
    });

  return (
    <>
      <button type="button" onClick={() => setAberto(true)} className={cn(BOTAO, "bg-[#2a7ca8] text-white hover:bg-[#1f6a93]")}>
        <Plus className="size-4" weight="bold" /> Adicionar imóvel
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[85dvh] overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Adicionar imóvel de interesse</DialogTitle>
            <DialogDescription>Imóveis do acervo da OPA. Busque por código, nome ou bairro.</DialogDescription>
          </DialogHeader>
          <label className="flex items-center gap-2 rounded-full bg-[#f2f6f9] px-4">
            <MagnifyingGlass className="size-4 text-[#5b7284]" />
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="CA006943, Perequê, frente mar..."
              className="h-11 w-full bg-transparent text-[15px] outline-none"
            />
          </label>
          <ul className="-mx-2 flex max-h-[55dvh] flex-col gap-1 overflow-y-auto px-2">
            {lista.map((i) => (
              <li key={i.codigo}>
                <button
                  type="button"
                  disabled={pendente}
                  onClick={() => escolher(i.codigo)}
                  className="flex w-full items-center gap-3 rounded-[18px] p-2 text-left hover:bg-[#f2f6f9] disabled:opacity-50"
                >
                  {i.foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={i.foto} alt="" className="h-12 w-16 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span className="h-12 w-16 shrink-0 rounded-xl bg-[#e7f0f5]" />
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-[#0a2d40]">{i.titulo}</span>
                    <span className="block truncate text-[13px] text-[#5b7284]">
                      {i.codigo} · {i.preco}
                      {i.bairro ? ` · ${i.bairro}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
            {lista.length === 0 && <li className="px-2 py-6 text-center text-[14px] text-[#5b7284]">Nenhum imóvel com essa busca.</li>}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** "X" de cada imóvel que ele também pediu (o de entrada não sai). */
export function RemoverImovel({ leadId, codigo }: { leadId: string; codigo: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      aria-label={`Tirar ${codigo} dos imóveis de interesse`}
      title="Tirar da lista"
      onClick={() =>
        iniciar(async () => {
          const r = await removerImovelInteresse(leadId, codigo);
          if (!r.ok) return void toast.error(r.erro ?? "Não deu para tirar.");
          router.refresh();
        })
      }
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-[#5b7284] hover:bg-white hover:text-[#0a2d40] disabled:opacity-50"
    >
      <X className="size-4" />
    </button>
  );
}

function Pilula({ ativo, onClick, children }: { ativo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "min-h-9 rounded-full px-3.5 text-[13px] font-medium ring-1",
        ativo ? "bg-[#0a2d40] text-white ring-[#0a2d40]" : "bg-white text-[#34566b] ring-[#d5e1e8] hover:bg-[#f2f6f9]",
      )}
    >
      {children}
    </button>
  );
}

const alterna = <T,>(lista: T[], v: T) => (lista.includes(v) ? lista.filter((x) => x !== v) : [...lista, v]);
const milhoes = (v: number | null) => (v ? String(v / 1_000_000).replace(".", ",") : "");
const deMilhoes = (t: string) => {
  const n = Number(t.replace(",", "."));
  return t.trim() && Number.isFinite(n) && n > 0 ? Math.round(n * 1_000_000) : null;
};

/**
 * "Pesquisar no OPA Radar": filtros do pedido de comprador, já preenchidos com o
 * que a ficha sabe. Salva no lead e entrega o pedido pronto para o Radar.
 */
export function PesquisarRadar({ leadId, inicial }: { leadId: string; inicial: PedidoRadar }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [p, setP] = useState<PedidoRadar>(inicial);
  const [min, setMin] = useState(milhoes(inicial.preco_min));
  const [max, setMax] = useState(milhoes(inicial.preco_max));
  const [pendente, iniciar] = useTransition();
  const muda = (m: Partial<PedidoRadar>) => setP((x) => ({ ...x, ...m }));

  const salvar = () =>
    iniciar(async () => {
      const pedido = { ...p, preco_min: deMilhoes(min), preco_max: deMilhoes(max) };
      const r = await salvarPedidoRadar(leadId, pedido);
      if (!r.ok) return void toast.error(r.erro ?? "Não deu para salvar.");
      toast.success("Pedido ao Radar salvo no lead.");
      setAberto(false);
      router.refresh();
    });

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={cn(BOTAO, "bg-white text-[#0a2d40] ring-1 ring-[#d5e1e8] hover:bg-[#f2f6f9]")}
      >
        <Target className="size-4" /> Pesquisar no OPA Radar
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Pesquisar no OPA Radar</DialogTitle>
            <DialogDescription>Imóveis do mercado de Ilhabela, inclusive os que a OPA ainda não tem.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              <Pilula ativo={p.finalidade === "venda"} onClick={() => muda({ finalidade: "venda" })}>
                Comprar
              </Pilula>
              <Pilula ativo={p.finalidade === "locacao_anual"} onClick={() => muda({ finalidade: "locacao_anual" })}>
                Alugar (anual)
              </Pilula>
            </div>

            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-[#5b7284]">Tipo</legend>
              <div className="flex flex-wrap gap-2">
                {TIPOS_RADAR.map((t) => (
                  <Pilula key={t} ativo={p.tipos.includes(t)} onClick={() => muda({ tipos: alterna(p.tipos, t) })}>
                    {t[0]!.toUpperCase() + t.slice(1)}
                  </Pilula>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-[#5b7284]">Região (nenhuma = a ilha toda)</legend>
              <div className="flex flex-wrap gap-2">
                {REGIOES_RADAR.map((r) => (
                  <Pilula key={r} ativo={p.regioes.includes(r)} onClick={() => muda({ regioes: alterna(p.regioes, r) })}>
                    {r}
                  </Pilula>
                ))}
              </div>
            </fieldset>

            <div className="grid grid-cols-3 gap-3">
              <label className="text-[13px] font-medium text-[#5b7284]">
                De (R$ mi)
                <input inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="2"
                  className="mt-1 h-11 w-full rounded-xl bg-[#f2f6f9] px-3 text-[15px] text-[#0a2d40] outline-none" />
              </label>
              <label className="text-[13px] font-medium text-[#5b7284]">
                Até (R$ mi)
                <input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} placeholder="5"
                  className="mt-1 h-11 w-full rounded-xl bg-[#f2f6f9] px-3 text-[15px] text-[#0a2d40] outline-none" />
              </label>
              <label className="text-[13px] font-medium text-[#5b7284]">
                Suítes (mín.)
                <input inputMode="numeric" value={p.suites_min ?? ""} placeholder="3"
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    muda({ suites_min: e.target.value && Number.isInteger(n) && n >= 1 && n <= 20 ? n : null });
                  }}
                  className="mt-1 h-11 w-full rounded-xl bg-[#f2f6f9] px-3 text-[15px] text-[#0a2d40] outline-none" />
              </label>
            </div>

            <fieldset>
              <legend className="mb-2 text-[13px] font-medium text-[#5b7284]">
                Toque uma vez: <b className="text-[#0a2d40]">precisa ter</b>. Duas vezes: <b className="text-[#2a7ca8]">seria bom</b>.
              </legend>
              <div className="flex flex-wrap gap-2">
                {PONTOS_RADAR.map(({ chave, rotulo }) => {
                  const precisa = p.obrigatorio.includes(chave);
                  const bom = p.desejavel.includes(chave);
                  return (
                    <button
                      key={chave}
                      type="button"
                      onClick={() =>
                        // nada -> precisa -> seria bom -> nada
                        muda(
                          precisa
                            ? { obrigatorio: p.obrigatorio.filter((k) => k !== chave), desejavel: [...p.desejavel, chave] }
                            : bom
                              ? { desejavel: p.desejavel.filter((k) => k !== chave) }
                              : { obrigatorio: [...p.obrigatorio, chave] },
                        )
                      }
                      className={cn(
                        "min-h-9 rounded-full px-3.5 text-[13px] font-medium ring-1",
                        precisa
                          ? "bg-[#0a2d40] text-white ring-[#0a2d40]"
                          : bom
                            ? "bg-[#e3eff6] text-[#12455f] ring-[#2a7ca8]"
                            : "bg-white text-[#34566b] ring-[#d5e1e8] hover:bg-[#f2f6f9]",
                      )}
                    >
                      {precisa ? "✓ " : bom ? "+ " : ""}
                      {rotulo}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <button
              type="button"
              disabled={pendente}
              onClick={salvar}
              className={cn(BOTAO, "h-12 justify-center bg-[#2a7ca8] text-white hover:bg-[#1f6a93]")}
            >
              <Target className="size-4" /> {pendente ? "Salvando..." : "Salvar pedido ao Radar"}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Copia o pedido no formato que o Radar lê (scripts/pedido/pedido.mjs). */
export function CopiarPedidoRadar({ pedido }: { pedido: PedidoRadar }) {
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(JSON.stringify(pedidoParaRadar(pedido), null, 2));
          toast.success("Pedido copiado no formato do Radar.");
        } catch {
          toast.error("Não deu para copiar.");
        }
      }}
      className="inline-flex items-center gap-1 text-[13px] font-semibold text-[#2a7ca8]"
    >
      <Copy className="size-3.5" /> Copiar pedido
    </button>
  );
}
