"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { branding } from "@/lib/branding";
import { menuImobiliaria, type NavDestination } from "@/lib/navigation/registry";
import { Question, ShieldCheck, SignOut } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Menu do perfil imobiliária (reformulação de 30/10/2026): um cartão branco
 * flutuante sobre o fundo cinza-azulado, como na Planta. Cada item tem ícone;
 * o ativo vira pílula petróleo. A Fila mostra quantos esperam resposta.
 */
const PAPEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Gestor",
  agent: "Corretor",
  viewer: "Leitura",
};

function iniciais(nome: string): string {
  const p = nome.split(" ").filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p.at(-1)![0] : "")).toUpperCase();
}

export function SidebarOpa({ filaCount = 0, onNavClick }: { filaCount?: number; onNavClick?: () => void }) {
  const pathname = usePathname();
  const { user, activeOrg, signOut } = useAuth();
  const [saindo, iniciar] = useTransition();
  const { principal, configuracao } = menuImobiliaria(user.is_platform_admin, activeOrg?.role ?? null);
  const nome = user.full_name ?? user.email.split("@")[0] ?? "";

  const item = (d: NavDestination) => {
    const ativo = pathname === d.href || pathname.startsWith(`${d.href}/`);
    const Icon = d.icon;
    return (
      <li key={d.href}>
        <Link
          href={d.href}
          prefetch
          onClick={onNavClick}
          aria-current={ativo ? "page" : undefined}
          className={cn(
            "flex h-11 items-center gap-3 rounded-full px-3.5 text-[14px] transition-colors",
            ativo ? "bg-[#0a2d40] font-semibold text-white" : "text-[#34566b] hover:bg-[#eef3f6] hover:text-[#0a2d40]",
          )}
        >
          <Icon size={20} weight={ativo ? "fill" : "regular"} aria-hidden />
          <span className="flex-1 leading-tight">{d.label}</span>
          {d.href === "/app/fila" && filaCount > 0 && (
            <span
              className={cn(
                "min-w-6 rounded-full px-1.5 text-center text-[12px] font-semibold tabular-nums",
                ativo ? "bg-white text-[#0a2d40]" : "bg-[#2a7ca8] text-white",
              )}
            >
              {filaCount}
            </span>
          )}
        </Link>
      </li>
    );
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 w-[272px] p-3">
      <div className="flex h-full flex-col rounded-[28px] bg-white shadow-[0_1px_2px_rgba(9,44,62,0.05)]">
        <div className="flex items-center gap-3 px-6 pb-5 pt-6">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo da instalação, ver lib/branding.ts */}
          <img src="/opa/opa-logo.svg" alt={branding().name} className="h-7 w-auto" />
          <span className="rounded-full bg-[#e7f0f5] px-2 py-0.5 text-[11px] font-semibold tracking-[0.16em] text-[#12455f]">CRM</span>
        </div>

        <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto px-3">
          <ul className="space-y-1">{principal.map(item)}</ul>
          {configuracao.length > 0 && (
            <>
              <p className="mb-2 mt-6 px-3.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8aa3b3]">Configuração</p>
              <ul className="space-y-1">{configuracao.map(item)}</ul>
            </>
          )}
        </nav>

        {/* Tutoriais sempre à mão, fora das listas: não disputa com as telas de trabalho. */}
        <Link
          href="/app/tutoriais"
          onClick={onNavClick}
          aria-current={pathname === "/app/tutoriais" ? "page" : undefined}
          className={cn(
            "mx-3 mt-2 flex h-10 items-center gap-3 rounded-full px-3.5 text-[13px] transition-colors",
            pathname === "/app/tutoriais" ? "bg-[#eef3f6] font-semibold text-[#0a2d40]" : "text-[#5b7284] hover:bg-[#eef3f6] hover:text-[#0a2d40]",
          )}
        >
          <Question size={18} aria-hidden />
          Tutoriais
        </Link>
        {/* Cada pessoa liga, troca ou desliga a verificação em duas etapas (03/11/2026). */}
        <Link
          href="/app/settings/security"
          onClick={onNavClick}
          aria-current={pathname === "/app/settings/security" ? "page" : undefined}
          className={cn(
            "mx-3 mt-1 flex h-10 items-center gap-3 rounded-full px-3.5 text-[13px] transition-colors",
            pathname === "/app/settings/security" ? "bg-[#eef3f6] font-semibold text-[#0a2d40]" : "text-[#5b7284] hover:bg-[#eef3f6] hover:text-[#0a2d40]",
          )}
        >
          <ShieldCheck size={18} aria-hidden />
          Segurança da conta
        </Link>

        <div className="m-3 flex items-center gap-3 rounded-[22px] bg-[#f2f6f9] p-2.5">
          {user.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element -- foto pequena do site da OPA
            <img src={user.avatar_url} alt="" className="size-10 shrink-0 rounded-full bg-[#e7f0f5] object-cover" />
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#0a2d40] text-[13px] font-semibold text-white">
              {iniciais(nome)}
            </span>
          )}
          <Link href="/app/settings/profile" onClick={onNavClick} className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-semibold text-[#0a2d40]">{nome}</p>
            <p className="truncate text-[12px] text-[#5b7284]">{PAPEL[activeOrg?.role ?? ""] ?? ""}</p>
          </Link>
          <button
            type="button"
            title="Sair"
            aria-label="Sair"
            disabled={saindo}
            onClick={() => iniciar(async () => { await signOut(); })}
            className="flex size-9 items-center justify-center rounded-full text-[#5b7284] hover:bg-white hover:text-[#0a2d40]"
          >
            <SignOut size={18} aria-hidden />
          </button>
        </div>
      </div>
    </aside>
  );
}
