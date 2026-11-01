"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CaretDown, Check, MagnifyingGlass, Plus, UsersFour } from "@/lib/ui/icons";

import { criarLeadManual, verificarTelefone, type NumeroExistente } from "./actions";
import { Avatar, iniciaisDe } from "./ui";

export interface PessoaSimples {
  id: string;
  nome: string;
  /** Foto do perfil (vem do site da OPA); sem foto, as iniciais. */
  foto?: string | null;
}

export interface ImovelSimples {
  codigo: string;
  titulo: string;
}

/**
 * "Equipe toda / corretor": gestor vê a operação de uma pessoa (?corretor=id).
 * Cada corretor aparece com a foto redonda e o nome; "Equipe toda" mostra as
 * três primeiras fotos sobrepostas.
 */
export function FiltroEquipe({ pessoas }: { pessoas: PessoaSimples[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const atual = params.get("corretor") ?? "";
  const escolhida = pessoas.find((p) => p.id === atual);

  function ir(id: string) {
    const p = new URLSearchParams(params.toString());
    if (id) p.set("corretor", id);
    else p.delete("corretor");
    router.push(`${pathname}${p.size ? `?${p}` : ""}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Ver a operação de"
        className="flex h-11 items-center gap-2 rounded-full bg-white pl-1.5 pr-3 text-[14px] font-medium text-[#0a2d40] shadow-[0_1px_2px_rgba(9,44,62,0.04)] outline-none focus-visible:ring-2 focus-visible:ring-[#8fc4dd]"
      >
        {escolhida ? (
          <Avatar texto={iniciaisDe(escolhida.nome)} foto={escolhida.foto} tom="acao" className="size-8 text-[11px]" />
        ) : (
          <span className="flex size-8 items-center justify-center rounded-full bg-[#e7f0f5]">
            <UsersFour className="size-4 text-[#2a7ca8]" aria-hidden />
          </span>
        )}
        <span className="max-w-[160px] truncate">{escolhida ? escolhida.nome : "Equipe toda"}</span>
        <CaretDown className="size-3.5 shrink-0 text-[#5b7284]" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-64 rounded-[22px] border-0 bg-white p-2 shadow-[0_12px_40px_rgba(9,44,62,0.14)]">
        <DropdownMenuItem onSelect={() => ir("")} className="gap-3 rounded-2xl px-2.5 py-2 text-[14px] text-[#0a2d40] focus:bg-[#f2f6f9]">
          <span className="flex -space-x-2">
            {pessoas.slice(0, 3).map((p) => (
              <Avatar key={p.id} texto={iniciaisDe(p.nome)} foto={p.foto} className="size-7 text-[10px] ring-2 ring-white" />
            ))}
          </span>
          <span className="flex-1 font-medium">Equipe toda</span>
          {!escolhida && <Check className="size-4 text-[#2a7ca8]" aria-hidden />}
        </DropdownMenuItem>
        <DropdownMenuSeparator className="mx-2 my-1 bg-[#e7f0f5]" />
        {pessoas.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => ir(p.id)} className="gap-3 rounded-2xl px-2.5 py-2 text-[14px] text-[#0a2d40] focus:bg-[#f2f6f9]">
            <Avatar texto={iniciaisDe(p.nome)} foto={p.foto} className="size-8 text-[11px]" />
            <span className="min-w-0 flex-1 truncate">{p.nome}</span>
            {p.id === atual && <Check className="size-4 text-[#2a7ca8]" aria-hidden />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function BuscaGlobal() {
  return (
    <form action="/app/leads" className="relative hidden h-11 w-64 lg:block">
      <MagnifyingGlass className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#5b7284]" aria-hidden />
      <input
        name="q"
        placeholder="Buscar lead, telefone ou imóvel"
        className="h-full w-full rounded-full bg-white pl-10 pr-4 text-[14px] text-[#0a2d40] shadow-[0_1px_2px_rgba(9,44,62,0.04)] outline-none placeholder:text-[#5b7284] focus:ring-2 focus:ring-[#8fc4dd]"
      />
    </form>
  );
}

const ORIGENS: Array<[string, string]> = [
  ["whatsapp", "WhatsApp"],
  ["indicacao", "Indicação"],
  ["linkbio", "Link da bio"],
  ["site", "Site"],
  ["meta", "Formulário Meta"],
];

/** "Novo lead": começa pelo celular e avisa se o número já existe. */
export function NovoLead({
  gestor,
  pessoas,
  imoveis,
  variante = "claro",
}: {
  gestor: boolean;
  pessoas: PessoaSimples[];
  imoveis: ImovelSimples[];
  variante?: "claro" | "solido";
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  // O botão "Novo" da barra do celular chega com ?novo=1 e abre este formulário.
  // Também atende o evento "opa:novo-lead" do botão, quando a tela já está aberta.
  useEffect(() => {
    const abrir = () => setAberto(true);
    window.addEventListener("opa:novo-lead", abrir);
    (window as { __opaNovoLead?: boolean }).__opaNovoLead = true;
    const p = new URLSearchParams(window.location.search);
    if (p.get("novo") === "1") {
      p.delete("novo");
      window.history.replaceState(null, "", `${window.location.pathname}${p.size ? `?${p}` : ""}`);
      abrir();
    }
    return () => {
      window.removeEventListener("opa:novo-lead", abrir);
      (window as { __opaNovoLead?: boolean }).__opaNovoLead = false;
    };
  }, []);
  const [telefone, setTelefone] = useState("");
  const [existente, setExistente] = useState<NumeroExistente | null>(null);
  const [pendente, iniciar] = useTransition();

  const conferir = () =>
    iniciar(async () => {
      setExistente(await verificarTelefone(telefone));
    });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setAberto(true);
          setExistente(null);
          setTelefone("");
        }}
        className={
          variante === "claro"
            ? "inline-flex h-11 items-center gap-2 rounded-full bg-[#0a2d40] px-5 text-[14px] font-semibold text-white hover:bg-[#12455f]"
            : "inline-flex h-11 items-center gap-2 rounded-full bg-[#2a7ca8] px-5 text-[14px] font-semibold text-white hover:bg-[#1f6a93]"
        }
      >
        <Plus className="size-4" weight="bold" /> Novo lead
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md [&>*]:min-w-0">
          <DialogHeader>
            <DialogTitle>Novo lead</DialogTitle>
            <DialogDescription>Comece pelo celular: se o número já estiver no CRM, ele não duplica.</DialogDescription>
          </DialogHeader>
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              iniciar(async () => {
                const r = await criarLeadManual(fd);
                if (!r.ok) {
                  toast.error(r.erro);
                  return;
                }
                toast.success(r.voltou ? "Esse número já estava no CRM: o lead voltou para quem cuida dele." : "Lead criado.");
                setAberto(false);
                router.push(`/app/leads/${r.leadId}`);
              });
            }}
          >
            <label className="flex flex-col gap-1 text-sm font-medium">
              Celular com DDD
              <input
                name="telefone"
                required
                autoFocus
                inputMode="tel"
                value={telefone}
                onChange={(e) => {
                  setTelefone(e.target.value);
                  setExistente(null);
                }}
                onBlur={conferir}
                placeholder="(11) 99999-9999"
                className="h-10 rounded-lg border border-border bg-surface-elevated px-3 font-normal outline-none focus:border-accent"
              />
            </label>
            {existente?.existe && (
              <div className="rounded-xl border border-warning/40 bg-warning-bg px-3 py-2 text-sm text-warning-fg">
                {existente.meu ? "Esse número já é seu" : `Esse número já está no CRM${existente.dono ? `, com ${existente.dono}` : ""}`}
                {existente.nome ? `: ${existente.nome}` : ""}.{" "}
                {existente.leadId && (
                  <button type="button" className="font-semibold underline" onClick={() => router.push(`/app/leads/${existente.leadId}`)}>
                    Abrir o lead
                  </button>
                )}
              </div>
            )}
            <label className="flex flex-col gap-1 text-sm font-medium">
              Nome
              <input name="nome" required className="h-10 rounded-lg border border-border bg-surface-elevated px-3 font-normal outline-none focus:border-accent" />
            </label>
            <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <label className="flex flex-col gap-1 text-sm font-medium">
                Origem
                <select name="origem" className="h-10 rounded-lg border border-border bg-surface-elevated px-2 font-normal outline-none">
                  {ORIGENS.map(([v, r]) => (
                    <option key={v} value={v}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              {gestor ? (
                <label className="flex flex-col gap-1 text-sm font-medium">
                  Corretor
                  <select name="dono" className="h-10 rounded-lg border border-border bg-surface-elevated px-2 font-normal outline-none">
                    <option value="">Próximo da roleta</option>
                    {pessoas.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nome}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="self-end pb-2 text-xs text-text-muted">Fica com você, como lead próprio.</p>
              )}
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Imóvel de interesse
              <select name="imovel" className="h-10 w-full rounded-lg border border-border bg-surface-elevated px-2 font-normal outline-none">
                <option value="">Sem imóvel ainda</option>
                {imoveis.map((i) => (
                  <option key={i.codigo} value={i.codigo}>
                    {i.codigo} · {i.titulo.slice(0, 50)}
                  </option>
                ))}
              </select>
            </label>
            <DialogFooter>
              <button type="button" onClick={() => setAberto(false)} className="h-10 rounded-full border border-border px-4 text-sm font-medium">
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pendente || Boolean(existente?.existe && existente.meu)}
                className="h-10 rounded-full bg-accent px-5 text-sm font-semibold text-white disabled:opacity-50"
              >
                Criar lead
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
