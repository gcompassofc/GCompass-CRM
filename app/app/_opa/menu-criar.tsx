"use client";

import Link from "next/link";

import { abrirPaleta } from "@/components/shell/PaletaOpa";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CalendarBlank, CaretDown, MagnifyingGlass, MapPin, Plus, UserPlus } from "@/lib/ui/icons";

/** O lugar único de busca no topo das telas (Ctrl K). No celular, a barra de cima já traz a lupa. */
export function BotaoBusca() {
  return (
    <button
      type="button"
      onClick={abrirPaleta}
      className="hidden h-11 w-64 items-center gap-2.5 rounded-full bg-white pl-4 pr-3 text-left text-[14px] text-[#5b7284] shadow-[0_1px_2px_rgba(9,44,62,0.04)] outline-none hover:bg-[#f7fafc] focus-visible:ring-2 focus-visible:ring-[#8fc4dd] md:inline-flex"
    >
      <MagnifyingGlass className="size-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 truncate">Buscar ou fazer algo</span>
      <kbd className="shrink-0 rounded-md bg-[#eef3f6] px-1.5 py-0.5 font-sans text-[11px] font-medium text-[#34566b]">Ctrl K</kbd>
    </button>
  );
}

/** "Criar": troca os botões de Visita e Novo lead que se repetiam em toda tela. */
export function MenuCriar() {
  const item = "gap-3 rounded-2xl px-3 py-2.5 text-[14px] text-[#0a2d40] focus:bg-[#f2f6f9]";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-11 items-center gap-2 rounded-full bg-[#0a2d40] pl-4 pr-3.5 text-[14px] font-semibold text-white outline-none hover:bg-[#12455f] focus-visible:ring-2 focus-visible:ring-[#8fc4dd]">
        <Plus className="size-4" weight="bold" aria-hidden />
        Criar
        <CaretDown className="size-3.5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-56 rounded-[22px] border-0 bg-white p-2 shadow-[0_12px_40px_rgba(9,44,62,0.14)]">
        <DropdownMenuItem className={item} onSelect={() => window.dispatchEvent(new Event("opa:novo-lead"))}>
          <UserPlus className="size-4 text-[#2a7ca8]" aria-hidden /> Novo lead
        </DropdownMenuItem>
        <DropdownMenuItem className={item} onSelect={() => window.dispatchEvent(new Event("opa:nova-visita"))}>
          <MapPin className="size-4 text-[#2a7ca8]" aria-hidden /> Visita
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={item}>
          <Link href="/app/lembretes">
            <CalendarBlank className="size-4 text-[#2a7ca8]" aria-hidden /> Lembrete
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
