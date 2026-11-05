"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kanban, List, Plus, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/** Lista ou Funil: os mesmos leads em dois formatos. */
export function FormatoLeads({ atual, corretor }: { atual: "lista" | "funil"; corretor?: string }) {
  const sufixo = corretor ? `?corretor=${corretor}` : "";
  const base = "inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-medium";
  return (
    <div role="group" aria-label="Formato" className="inline-flex gap-1 rounded-full bg-white p-1 shadow-[0_1px_2px_rgba(9,44,62,0.04)]">
      <Link href={`/app/leads${sufixo}`} aria-current={atual === "lista" ? "page" : undefined} className={cn(base, atual === "lista" ? "bg-[#0a2d40] text-white" : "text-[#34566b] hover:bg-[#eef3f6]")}>
        <List className="size-4" aria-hidden /> Lista
      </Link>
      <Link href={`/app/pipeline${sufixo}`} aria-current={atual === "funil" ? "page" : undefined} className={cn(base, atual === "funil" ? "bg-[#0a2d40] text-white" : "text-[#34566b] hover:bg-[#eef3f6]")}>
        <Kanban className="size-4" aria-hidden /> Funil
      </Link>
    </div>
  );
}

export interface OpcaoFiltro {
  campo: string;
  campoRotulo: string;
  valor: string;
  rotulo: string;
}

const CHAVE_VISOES = "opa-visoes-leads";

/**
 * Filtros como etiquetas: o que está ligado fica à vista, sai com um toque e pode
 * virar uma visão salva. A visão fica neste navegador (preferência de tela).
 */
export function FiltrosLeads({ opcoes, total }: { opcoes: OpcaoFiltro[]; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [visoes, setVisoes] = useState<Array<{ nome: string; busca: string }>>([]);

  useEffect(() => {
    try {
      setVisoes(JSON.parse(localStorage.getItem(CHAVE_VISOES) ?? "[]"));
    } catch {
      setVisoes([]);
    }
  }, []);

  const guardar = (lista: Array<{ nome: string; busca: string }>) => {
    setVisoes(lista);
    try {
      localStorage.setItem(CHAVE_VISOES, JSON.stringify(lista));
    } catch {
      // sem o navegador guardar, a visão vale até recarregar
    }
  };

  const ir = (mudar: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(params.toString());
    p.delete("pagina");
    mudar(p);
    router.push(`${pathname}${p.size ? `?${p}` : ""}`);
  };

  const ativos = opcoes.filter((o) => params.get(o.campo) === o.valor);
  const disponiveis = opcoes.filter((o) => !params.has(o.campo));
  const busca = params.toString();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {visoes.map((v) => (
        <span key={v.nome} className="inline-flex h-9 items-center rounded-full bg-white text-[13px] font-medium text-[#0a2d40]">
          <Link href={`${pathname}?${v.busca}`} className="pl-3 pr-1 hover:underline">
            {v.nome}
          </Link>
          <button type="button" aria-label={`Apagar a visão ${v.nome}`} onClick={() => guardar(visoes.filter((x) => x !== v))} className="flex size-9 items-center justify-center rounded-full text-[#5b7284] hover:text-[#0a2d40]">
            <X className="size-3.5" aria-hidden />
          </button>
        </span>
      ))}
      {ativos.map((o) => (
        <button
          key={o.campo}
          type="button"
          aria-label={`Tirar o filtro ${o.campoRotulo}: ${o.rotulo}`}
          onClick={() => ir((p) => p.delete(o.campo))}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-[#e3eff6] px-3 text-[13px] font-medium text-[#0a2d40] hover:bg-[#cfe0ea]"
        >
          {o.campoRotulo}: {o.rotulo} <X className="size-3.5" aria-hidden />
        </button>
      ))}
      {disponiveis.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex h-9 items-center gap-1.5 rounded-full bg-white px-3 text-[13px] font-medium text-[#34566b] outline-none hover:bg-[#f2f6f9] focus-visible:ring-2 focus-visible:ring-[#8fc4dd]">
            <Plus className="size-3.5" aria-hidden /> Filtro
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" sideOffset={8} className="max-h-[60dvh] w-60 overflow-y-auto rounded-[22px] border-0 bg-white p-2 shadow-[0_12px_40px_rgba(9,44,62,0.14)]">
            {disponiveis.map((o) => (
              <DropdownMenuItem key={`${o.campo}:${o.valor}`} className="rounded-2xl px-3 py-2.5 text-[14px] text-[#0a2d40] focus:bg-[#f2f6f9]" onSelect={() => ir((p) => p.set(o.campo, o.valor))}>
                {o.campoRotulo}: {o.rotulo}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {ativos.length > 0 && !visoes.some((v) => v.busca === busca) && (
        <button
          type="button"
          onClick={() => {
            guardar([...visoes, { nome: ativos.map((o) => o.rotulo).join(" + "), busca }]);
            toast.success("Visão salva neste navegador.");
          }}
          className="inline-flex h-9 items-center rounded-full px-3 text-[13px] font-medium text-[#1f6a93] hover:bg-white"
        >
          Salvar esta visão
        </button>
      )}
      <span className="px-1 text-[13px] text-[#5b7284]">
        {total} {total === 1 ? "lead" : "leads"}
      </span>
    </div>
  );
}

const CHAVE_DENSIDADE = "opa-densidade-leads";

interface Selecao {
  ids: string[];
  alternar: (id: string) => void;
  limpar: () => void;
}
const ContextoSelecao = createContext<Selecao | null>(null);

/** Lista do gestor: marcar vários e escolher quanto cabe na tela. */
export function ListaDoGestor({
  children,
  corretores,
  etapasPorLead,
}: {
  children: React.ReactNode;
  corretores: Array<{ id: string; nome: string }>;
  /** Etapas do funil de cada lead visível, para mover em lote só dentro do mesmo funil. */
  etapasPorLead: Record<string, Array<{ id: string; nome: string }>>;
}) {
  const router = useRouter();
  const [ids, setIds] = useState<string[]>([]);
  const [compacta, setCompacta] = useState(false);
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    try {
      setCompacta(localStorage.getItem(CHAVE_DENSIDADE) === "compacta");
    } catch {
      // começa confortável
    }
  }, []);

  const mudarDensidade = (v: boolean) => {
    setCompacta(v);
    try {
      localStorage.setItem(CHAVE_DENSIDADE, v ? "compacta" : "confortavel");
    } catch {
      // vale até recarregar
    }
  };

  const enviar = (corpo: Record<string, unknown>, feito: string) =>
    iniciar(async () => {
      const res = await fetch("/api/v1/leads/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...corpo, lead_ids: ids }),
      }).catch(() => null);
      if (!res?.ok) {
        toast.error("Não deu para aplicar nos leads marcados. Tente de novo.");
        return;
      }
      toast.success(feito);
      setIds([]);
      router.refresh();
    });

  const etapas = etapasPorLead[ids[0] ?? ""] ?? [];
  const mesmoFunil = ids.length > 0 && ids.every((id) => etapasPorLead[id]?.[0]?.id === etapas[0]?.id);
  const seletor = "h-11 max-w-full rounded-full border-0 bg-white px-3 text-[14px] text-[#0a2d40] outline-none disabled:opacity-60";

  return (
    <ContextoSelecao.Provider value={{ ids, alternar: (id) => setIds((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id])), limpar: () => setIds([]) }}>
      <div className="flex justify-end">
        <label className="flex items-center gap-2 text-[13px] text-[#34566b]">
          Espaçamento
          <select value={compacta ? "compacta" : "confortavel"} onChange={(e) => mudarDensidade(e.target.value === "compacta")} className="h-9 rounded-full border-0 bg-white px-3 text-[13px] text-[#0a2d40] outline-none">
            <option value="confortavel">Confortável</option>
            <option value="compacta">Compacta</option>
          </select>
        </label>
      </div>
      {ids.length > 0 && (
        <div role="region" aria-label="Ações nos leads marcados" className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-[22px] bg-[#0a2d40] px-4 py-2.5 text-white">
          <strong className="text-[14px] font-semibold">
            {ids.length} {ids.length === 1 ? "marcado" : "marcados"}
          </strong>
          <select
            aria-label="Atribuir a um corretor"
            className={seletor}
            value=""
            disabled={pendente}
            onChange={(e) => {
              const c = corretores.find((x) => x.id === e.target.value);
              if (c) enviar({ action: "assign", params: { owner_user_id: c.id } }, `${ids.length} ${ids.length === 1 ? "lead atribuído" : "leads atribuídos"} a ${c.nome}.`);
            }}
          >
            <option value="">Atribuir a...</option>
            {corretores.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
          {mesmoFunil && (
            <select
              aria-label="Mover de etapa"
              className={seletor}
              value=""
              disabled={pendente}
              onChange={(e) => {
                const c = etapas.find((x) => x.id === e.target.value);
                if (c) enviar({ action: "move", params: { stage_id: c.id, position_in_stage: 1000 } }, `${ids.length} ${ids.length === 1 ? "lead foi" : "leads foram"} para ${c.nome}.`);
              }}
            >
              <option value="">Mover para...</option>
              {etapas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => setIds([])} className="inline-flex h-11 items-center rounded-full px-3 text-[14px] font-medium hover:bg-[#12455f]">
            Limpar
          </button>
        </div>
      )}
      <div data-densidade={compacta ? "compacta" : undefined}>{children}</div>
    </ContextoSelecao.Provider>
  );
}

/** Caixa de marcar da linha. Fora da lista do gestor não aparece. */
export function MarcarLead({ id, nome }: { id: string; nome: string }) {
  const s = useContext(ContextoSelecao);
  if (!s) return null;
  return (
    <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center" title="Marcar">
      <input type="checkbox" aria-label={`Marcar ${nome}`} checked={s.ids.includes(id)} onChange={() => s.alternar(id)} className="size-5 accent-[#1f6a93]" />
    </label>
  );
}
