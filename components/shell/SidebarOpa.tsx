"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { useAuth } from "@/hooks/auth/AuthProvider";
import { branding } from "@/lib/branding";
import { gruposImobiliaria, type GrupoMenuOpa, type NavDestination } from "@/lib/navigation/registry";
import { CaretDown, Question, ShieldCheck, SidebarSimple, SignOut } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Menu do perfil imobiliária (reformulação de 30/10/2026): um cartão branco
 * flutuante sobre o fundo cinza-azulado, como na Planta. Cada item tem ícone;
 * o ativo vira pílula petróleo. A Fila mostra quantos esperam resposta.
 *
 * Recolhe e expande como no Claude e no ChatGPT (pedido do Allyson, 03/11/2026):
 * recolhido, fica só a coluna de ícones e o nome de cada item aparece ao passar
 * o mouse. Quem decide e guarda o estado é o AppShell.
 *
 * Desde 05/11/2026 o menu tem níveis: só o módulo atual fica aberto, para a pessoa
 * não ler 14 itens soltos. Ele nasce aberto, com os nomes: ícone sozinho se decora.
 */
const PAPEL: Record<string, string> = {
  admin: "Administrador",
  manager: "Gestor",
  agent: "Corretor",
  viewer: "Leitura",
};

/** Largura do menu no computador. O AppShell usa as mesmas para a margem do conteúdo. */
export const LARGURA_MENU = { aberto: 272, recolhido: 88 } as const;

/** Curva das animações do menu: sai rápido e assenta devagar, sem quique. */
export const SUAVE_MENU = "duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none";

function iniciais(nome: string): string {
  const p = nome.split(" ").filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p.length > 1 ? p.at(-1)![0] : "")).toUpperCase();
}

/** Texto do item: some com fade quando o menu recolhe, sem mexer no ícone. */
function Rotulo({ recolhido, children, className }: { recolhido: boolean; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "min-w-0 truncate whitespace-nowrap leading-tight transition-opacity",
        SUAVE_MENU,
        recolhido ? "pointer-events-none opacity-0" : "opacity-100",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function SidebarOpa({
  filaCount = 0,
  onNavClick,
  recolhido = false,
  onAlternar,
  dica = false,
}: {
  filaCount?: number;
  onNavClick?: () => void;
  /** Só a coluna de ícones (computador). */
  recolhido?: boolean;
  /** Sem esta função não há botão de recolher (gaveta do celular ocupa a largura dela). */
  onAlternar?: () => void;
  /** Balão que ensina onde abrir e recolher o menu (primeiro acesso). */
  dica?: boolean;
}) {
  const pathname = usePathname();
  const { user, activeOrg, signOut } = useAuth();
  const [saindo, iniciar] = useTransition();
  const grupos = gruposImobiliaria(user.is_platform_admin, activeOrg?.role ?? null);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  // Trocou de tela, volta a valer o módulo da tela atual.
  useEffect(() => setEscolhido(null), [pathname]);
  const estaAtivo = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const nome = user.full_name ?? user.email.split("@")[0] ?? "";

  const contagemFila = (ativo: boolean) =>
    recolhido ? (
      // Recolhido, o número vira um ponto no canto do ícone.
      <span className="absolute left-[30px] top-2 size-2.5 rounded-full bg-[#2a7ca8] ring-2 ring-white" aria-label={`${filaCount} esperando resposta`} />
    ) : (
      <span className={cn("min-w-6 shrink-0 rounded-full px-1.5 text-center text-[12px] font-semibold tabular-nums", ativo ? "bg-white text-[#0a2d40]" : "bg-[#2a7ca8] text-white")}>
        {filaCount}
      </span>
    );

  /** Link direto do primeiro nível (Início, Imóveis). */
  const itemPrincipal = (d: NavDestination) => {
    const ativo = estaAtivo(d.href);
    const Icon = d.icon;
    return (
      <li key={d.href}>
        <Link
          href={d.href}
          prefetch
          onClick={onNavClick}
          title={recolhido ? d.label : undefined}
          aria-label={recolhido ? d.label : undefined}
          aria-current={ativo ? "page" : undefined}
          className={cn(
            "relative flex h-11 items-center gap-3 overflow-hidden rounded-full px-[14px] text-[14px] transition-colors",
            ativo ? "bg-[#0a2d40] font-semibold text-white" : "text-[#34566b] hover:bg-[#eef3f6] hover:text-[#0a2d40]",
          )}
        >
          <Icon size={20} weight={ativo ? "fill" : "regular"} aria-hidden className="shrink-0" />
          <Rotulo recolhido={recolhido} className="flex-1">
            {d.label}
          </Rotulo>
        </Link>
      </li>
    );
  };

  /** Módulo com subitens: abre um por vez. Recolhido, o toque abre o menu nesse módulo. */
  const itemGrupo = (g: GrupoMenuOpa) => {
    const contem = g.itens.some((d) => estaAtivo(d.href));
    const aberto = !recolhido && (escolhido ? escolhido === g.id : contem);
    const Icon = g.icone;
    const temFila = g.itens.some((d) => d.href === "/app/fila") && filaCount > 0;
    return (
      <li key={g.id}>
        <button
          type="button"
          aria-expanded={aberto}
          title={recolhido ? g.rotulo : undefined}
          aria-label={recolhido ? g.rotulo : undefined}
          onClick={() => {
            if (recolhido) onAlternar?.();
            setEscolhido(aberto ? "-" : g.id);
          }}
          className={cn(
            "relative flex h-11 w-full items-center gap-3 overflow-hidden rounded-full px-[14px] text-left text-[14px] transition-colors",
            contem && recolhido ? "bg-[#0a2d40] font-semibold text-white" : contem ? "font-semibold text-[#0a2d40]" : "text-[#34566b]",
            !(contem && recolhido) && "hover:bg-[#eef3f6] hover:text-[#0a2d40]",
          )}
        >
          <Icon size={20} weight={contem ? "fill" : "regular"} aria-hidden className="shrink-0" />
          <Rotulo recolhido={recolhido} className="flex-1">
            {g.rotulo}
          </Rotulo>
          {temFila && !aberto && contagemFila(contem && recolhido)}
          {!recolhido && <CaretDown size={14} aria-hidden className={cn("shrink-0 text-[#5b7284] transition-transform", aberto && "rotate-180")} />}
        </button>
        {aberto && (
          <ul className="mb-1 mt-0.5 space-y-0.5">
            {g.itens.map((d) => {
              const ativo = estaAtivo(d.href);
              return (
                <li key={d.href}>
                  <Link
                    href={d.href}
                    prefetch
                    onClick={onNavClick}
                    aria-current={ativo ? "page" : undefined}
                    className={cn(
                      "flex h-11 items-center gap-2 rounded-full pl-[46px] pr-3 text-[14px] transition-colors",
                      ativo ? "bg-[#0a2d40] font-semibold text-white" : "text-[#34566b] hover:bg-[#eef3f6] hover:text-[#0a2d40]",
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{d.label}</span>
                    {d.href === "/app/fila" && filaCount > 0 && contagemFila(ativo)}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </li>
    );
  };

  const linkRodape = (href: string, rotulo: string, Icon: typeof Question) => (
    <Link
      href={href}
      onClick={onNavClick}
      title={recolhido ? rotulo : undefined}
      aria-label={recolhido ? rotulo : undefined}
      aria-current={pathname === href ? "page" : undefined}
      className={cn(
        "mx-2 mt-1 flex h-10 items-center gap-3 overflow-hidden rounded-full px-[15px] text-[13px] transition-colors",
        pathname === href ? "bg-[#eef3f6] font-semibold text-[#0a2d40]" : "text-[#5b7284] hover:bg-[#eef3f6] hover:text-[#0a2d40]",
      )}
    >
      <Icon size={18} aria-hidden className="shrink-0" />
      <Rotulo recolhido={recolhido}>{rotulo}</Rotulo>
    </Link>
  );

  return (
    <aside
      style={onAlternar ? { width: recolhido ? LARGURA_MENU.recolhido : LARGURA_MENU.aberto } : undefined}
      className={cn("fixed inset-y-0 left-0 z-30 p-3 transition-[width]", SUAVE_MENU, !onAlternar && "w-full")}
    >
      <div className="flex h-full flex-col overflow-hidden rounded-[28px] bg-white shadow-[0_1px_2px_rgba(9,44,62,0.05)]">
        <div className={cn("flex h-[76px] shrink-0 items-center transition-[padding]", SUAVE_MENU, recolhido ? "px-3" : "pl-6 pr-3")}>
          <div
            className={cn(
              "flex min-w-0 items-center gap-3 overflow-hidden transition-[opacity,max-width]",
              SUAVE_MENU,
              recolhido ? "max-w-0 opacity-0" : "max-w-[180px] opacity-100",
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- logo da instalação, ver lib/branding.ts */}
            <img src="/opa/opa-logo.svg" alt={branding().name} className="h-7 w-auto shrink-0" />
            <span className="shrink-0 rounded-full bg-[#e7f0f5] px-2 py-0.5 text-[11px] font-semibold tracking-[0.16em] text-[#12455f]">CRM</span>
          </div>
          {onAlternar && (
            <button
              type="button"
              onClick={onAlternar}
              title={recolhido ? "Abrir o menu (Ctrl + B)" : "Recolher o menu (Ctrl + B)"}
              aria-label={recolhido ? "Abrir o menu" : "Recolher o menu"}
              aria-expanded={!recolhido}
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full text-[#5b7284] transition-colors hover:bg-[#eef3f6] hover:text-[#0a2d40]",
                recolhido ? "mx-auto" : "ml-auto",
                dica && "bg-[#e3eff6] text-[#0a2d40] ring-2 ring-[#2a7ca8]",
              )}
            >
              <SidebarSimple size={20} aria-hidden />
            </button>
          )}
        </div>

        <nav aria-label="Navegação principal" className="flex-1 overflow-y-auto overflow-x-hidden px-2">
          <ul className="space-y-1">{grupos.map((g) => (g.itens.length === 1 ? itemPrincipal(g.itens[0]!) : itemGrupo(g)))}</ul>
        </nav>

        {/* Tutoriais sempre à mão, fora das listas: não disputa com as telas de trabalho. */}
        <div className="mt-2">{linkRodape("/app/tutoriais", "Tutoriais", Question)}</div>
        {/* Cada pessoa liga, troca ou desliga a verificação em duas etapas (03/11/2026). */}
        {linkRodape("/app/settings/security", "Segurança da conta", ShieldCheck)}

        <div className="m-2 flex items-center gap-3 overflow-hidden rounded-[22px] bg-[#f2f6f9] p-1">
          <Link
            href="/app/settings/profile"
            onClick={onNavClick}
            title={recolhido ? nome : undefined}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            {user.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- foto pequena do site da OPA
              <img src={user.avatar_url} alt="" className="size-10 shrink-0 rounded-full bg-[#e7f0f5] object-cover" />
            ) : (
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#0a2d40] text-[13px] font-semibold text-white">
                {iniciais(nome)}
              </span>
            )}
            <span className={cn("min-w-0 flex-1 transition-opacity", SUAVE_MENU, recolhido ? "opacity-0" : "opacity-100")}>
              <span className="block truncate text-[14px] font-semibold text-[#0a2d40]">{nome}</span>
              <span className="block truncate text-[12px] text-[#5b7284]">{PAPEL[activeOrg?.role ?? ""] ?? ""}</span>
            </span>
          </Link>
          {!recolhido && (
            <button
              type="button"
              title="Sair"
              aria-label="Sair"
              disabled={saindo}
              onClick={() => iniciar(async () => { await signOut(); })}
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#5b7284] hover:bg-white hover:text-[#0a2d40]"
            >
              <SignOut size={18} aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Primeiro acesso: o menu abre cheio, recolhe sozinho e o balão mostra onde mexer. */}
      {dica && onAlternar && (
        <div
          role="status"
          className="opa-dica-menu pointer-events-none absolute left-[calc(100%-2px)] top-5 w-60 rounded-2xl bg-[#0a2d40] px-4 py-3 text-[13px] leading-snug text-white shadow-[0_12px_32px_rgba(9,44,62,0.25)]"
        >
          <span className="absolute -left-1.5 top-5 size-3 rotate-45 bg-[#0a2d40]" aria-hidden />
          O menu recolhe para dar espaço. Toque neste botão para abrir ou recolher. Atalho: <b>Ctrl + B</b>.
        </div>
      )}
    </aside>
  );
}
