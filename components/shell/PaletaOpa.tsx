"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { buscarNaPaleta, type AchadoPaleta } from "@/app/app/_opa/paleta-actions";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { gruposImobiliaria } from "@/lib/navigation/registry";
import { MagnifyingGlass } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Busca e comandos da OPA (Ctrl K): lead, imóvel, ação ou tela, num lugar só
 * (05/11/2026). A pessoa não precisa lembrar onde cada coisa está: "telefonar"
 * acha "Ligar para um lead". O evento "opa:paleta" abre pelos botões de busca.
 */
export function abrirPaleta() {
  window.dispatchEvent(new Event("opa:paleta"));
}

function sem(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

interface Item {
  chave: string;
  grupo: string;
  rotulo: string;
  detalhe?: string;
  fazer: () => void;
}

export function PaletaOpa() {
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    const abrir = () => setAberto(true);
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAberto(true);
      }
    };
    window.addEventListener("opa:paleta", abrir);
    window.addEventListener("keydown", tecla);
    return () => {
      window.removeEventListener("opa:paleta", abrir);
      window.removeEventListener("keydown", tecla);
    };
  }, []);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogContent className="top-[10%] max-w-xl translate-y-0 gap-0 overflow-hidden rounded-[24px] border-0 bg-white p-0">
        <DialogTitle className="sr-only">Buscar ou executar</DialogTitle>
        <Resultados fechar={() => setAberto(false)} />
      </DialogContent>
    </Dialog>
  );
}

function Resultados({ fechar }: { fechar: () => void }) {
  const router = useRouter();
  const { user, activeOrg } = useAuth();
  const [busca, setBusca] = useState("");
  const [achados, setAchados] = useState<AchadoPaleta[]>([]);
  const [destacado, setDestacado] = useState(0);
  const lista = useRef<HTMLUListElement>(null);

  // Um respiro entre teclas: a busca lê a carteira toda de leads.
  useEffect(() => {
    let vale = true;
    const t = setTimeout(async () => {
      const r = await buscarNaPaleta(busca).catch(() => []);
      if (vale) setAchados(r);
    }, 220);
    return () => {
      vale = false;
      clearTimeout(t);
    };
  }, [busca]);

  const itens = useMemo<Item[]>(() => {
    const q = sem(busca.trim());
    const bate = (t: string) => !q || sem(t).includes(q);
    const ir = (href: string) => () => {
      fechar();
      router.push(href);
    };
    const evento = (nome: string, plano: string) => () => {
      fechar();
      const janela = window as unknown as Record<string, boolean | undefined>;
      if (janela[`__${nome}`]) window.dispatchEvent(new Event(nome));
      else router.push(plano);
    };

    const leads: Item[] = achados.map((a) => ({
      chave: `${a.tipo}:${a.id}`,
      grupo: a.tipo === "lead" ? "Leads" : "Imóveis",
      rotulo: a.titulo,
      detalhe: a.detalhe,
      fazer:
        a.tipo === "lead"
          ? () => {
              fechar();
              window.dispatchEvent(new CustomEvent("opa:abrir-lead", { detail: a.id }));
            }
          : ir(`/app/imoveis/${a.id}`),
    }));

    const acoes: Array<[string, string, () => void]> = [
      ["Criar novo lead", "cadastrar cliente adicionar", evento("opa:novo-lead", "/app/hoje?novo=1")],
      ["Registrar visita", "visita mostrar imovel", evento("opa:nova-visita", "/app/hoje?visita=1")],
      ["Agendar lembrete", "retorno agenda marcar", ir("/app/lembretes")],
      ["Ligar para um lead", "telefonar telefone chamar discar", ir("/app/fila")],
      ["Mandar mensagem pronta", "kit whatsapp texto modelo", ir("/app/kit")],
      ["Reconectar meu WhatsApp", "qr code conectar numero", ir("/app/meu-whatsapp")],
    ];
    const itensAcoes = acoes
      .filter(([r, sinonimos]) => bate(`${r} ${sinonimos}`))
      .map(([rotulo, , fazer]): Item => ({ chave: `acao:${rotulo}`, grupo: "Ações rápidas", rotulo, fazer }));

    const destinos = gruposImobiliaria(user.is_platform_admin, activeOrg?.role ?? null).flatMap((g) => g.itens);
    const sinonimosTela: Record<string, string> = {
      "/app/pipeline": "funil kanban etapas quadro",
      "/app/inbox": "conversas multiatendimento mensagens whatsapp",
      "/app/configuracoes": "roleta prazo regras distribuicao",
      "/app/webhooks": "automacoes",
    };
    const itensTelas = destinos
      .filter((d) => bate(`${d.label} ${sinonimosTela[d.href] ?? ""}`))
      .slice(0, q ? 8 : 4)
      .map((d): Item => ({ chave: `tela:${d.href}`, grupo: "Ir para", rotulo: d.label, fazer: ir(d.href) }));

    return [...leads, ...itensAcoes, ...itensTelas];
  }, [busca, achados, user.is_platform_admin, activeOrg?.role, fechar, router]);

  useEffect(() => setDestacado(0), [itens.length]);

  const tecla = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setDestacado((d) => Math.min(d + 1, itens.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setDestacado((d) => Math.max(d - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      itens[destacado]?.fazer();
    }
  };

  useEffect(() => {
    lista.current?.querySelector('[data-destacado="true"]')?.scrollIntoView({ block: "nearest" });
  }, [destacado]);

  return (
    <div className="flex max-h-[76dvh] flex-col">
      <label className="relative block border-b border-[#e7eef2]">
        <span className="sr-only">Buscar lead, imóvel ou o que quer fazer</span>
        <MagnifyingGlass className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-[#5b7284]" aria-hidden />
        <input
          autoFocus
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={tecla}
          placeholder="Buscar lead, imóvel ou o que quer fazer"
          className="h-14 w-full bg-transparent pl-14 pr-5 text-[16px] text-[#0a2d40] outline-none placeholder:text-[#5b7284]"
        />
      </label>
      <ul ref={lista} className="overflow-y-auto p-2">
        {itens.map((it, i) => (
          <li key={it.chave}>
            {(i === 0 || itens[i - 1]?.grupo !== it.grupo) && (
              <p className="px-3 pb-1 pt-3 text-[12px] font-semibold text-[#5b7284]">{it.grupo}</p>
            )}
            <button
              type="button"
              data-destacado={i === destacado}
              onMouseEnter={() => setDestacado(i)}
              onClick={it.fazer}
              className={cn(
                "flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-[15px] text-[#0a2d40]",
                i === destacado && "bg-[#eef3f6]",
              )}
            >
              <span className="min-w-0 truncate">{it.rotulo}</span>
              {it.detalhe && <span className="shrink-0 text-[13px] text-[#5b7284]">{it.detalhe}</span>}
            </button>
          </li>
        ))}
        {itens.length === 0 && <li className="p-6 text-center text-[14px] text-[#5b7284]">Nada encontrado.</li>}
      </ul>
    </div>
  );
}
