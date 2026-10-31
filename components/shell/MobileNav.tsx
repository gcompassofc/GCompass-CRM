"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Buildings, House, List, ListNumbers, Plus } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { canSee, NAV_DESTINATIONS, perfilAtivo } from "@/lib/navigation/registry";

/**
 * Barra flutuante de navegação do celular.
 *
 * PROJEÇÃO do registro de navegação, igual ao Sidebar — não uma segunda lista.
 * Se ela decidisse sozinha o que existe, seria a quarta lista do mesmo conjunto
 * (o problema que `lib/navigation/registry.ts` veio matar) e uma tela nova
 * nasceria inalcançável no celular.
 *
 * O que ela ACRESCENTA ao registro é só uma opinião de PRIORIDADE: numa barra
 * de polegar cabem quatro alvos, não vinte e sete. `PRIORIDADE_MOBILE` diz
 * quais quatro; o resto continua alcançável pelo menu, que é o quinto botão.
 * Por isso ela filtra o registro em vez de repetí-lo: quem não pode ver um
 * destino no desktop também não o vê aqui, sem a permissão precisar ser
 * reescrita.
 */

/**
 * As telas que se abre em pé, na rua, com uma mão.
 *
 * Escolhidas pelo uso, não pelo organograma: Inbox é o trabalho; Radar é quem
 * está morrendo sem resposta; Kanban é o funil; Contatos é a busca de quem
 * ligou. Configurar o sistema é trabalho de mesa e fica no menu.
 */
const PRIORIDADE_MOBILE = [
  "/app/hoje",
  "/app/fila",
  "/app/pipeline",
  "/app/leads",
  "/app/inbox",
  "/app/radar",
  "/app/kanban",
  "/app/contacts",
];
// Cabem quatro na barra. Início, Fila, Pipelines e Leads só existem no perfil
// imobiliária; cada instalação fica com os quatro primeiros que vê.
const MAX_NA_BARRA = 4;

interface Props {
  onOpenMenu: () => void;
  /** Some quando a conversa está aberta — lá o polegar é do composer. */
  hidden?: boolean;
}

/**
 * Barra do celular da OPA (protótipo de 31/10/2026): rótulo embaixo de cada
 * ícone e o "Novo" no meio, que abre o formulário de novo lead da tela.
 */
function BarraOpa({ onOpenMenu, hidden }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  // A tela com o formulário de novo lead aberto escuta o evento; nas outras
  // (ficha do lead, configurações), vai para o Início e abre lá.
  const novo = () => {
    if ((window as { __opaNovoLead?: boolean }).__opaNovoLead) window.dispatchEvent(new Event("opa:novo-lead"));
    else router.push("/app/hoje?novo=1");
  };
  const itens = [
    { href: "/app/hoje", rotulo: "Início", Icon: House },
    { href: "/app/fila", rotulo: "Fila", Icon: ListNumbers },
    null,
    { href: "/app/imoveis", rotulo: "Imóveis", Icon: Buildings },
  ];
  return (
    <nav
      aria-label="Navegação principal"
      aria-hidden={hidden}
      className={cn(
        "fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 items-end border-t border-[#e2edf3] bg-white px-2 pb-[max(14px,env(safe-area-inset-bottom))] pt-2 md:hidden",
        "transition-[opacity,transform] duration-200",
        hidden && "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      {itens.map((it) => {
        if (!it) {
          return (
            <button
              key="novo"
              type="button"
              onClick={novo}
              aria-label="Novo lead"
              tabIndex={hidden ? -1 : undefined}
              className="flex flex-col items-center gap-1 text-[11px] font-semibold text-[#12455f]"
            >
              <span className="-mt-6 flex size-[52px] items-center justify-center rounded-full bg-[#12455f] text-white shadow-[0_12px_34px_rgba(9,44,62,0.18)]">
                <Plus size={24} weight="bold" aria-hidden />
              </span>
              Novo
            </button>
          );
        }
        const ativo = pathname === it.href || pathname.startsWith(`${it.href}/`);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={ativo ? "page" : undefined}
            tabIndex={hidden ? -1 : undefined}
            className={cn("flex flex-col items-center gap-1 text-[11px]", ativo ? "font-semibold text-[#12455f]" : "font-medium text-[#5b7284]")}
          >
            <span className={cn("flex h-[30px] w-14 items-center justify-center rounded-full", ativo && "bg-[#e3eff6]")}>
              <it.Icon size={20} weight={ativo ? "fill" : "regular"} aria-hidden />
            </span>
            {it.rotulo}
          </Link>
        );
      })}
      <button
        type="button"
        onClick={onOpenMenu}
        tabIndex={hidden ? -1 : undefined}
        className="flex flex-col items-center gap-1 text-[11px] font-medium text-[#5b7284]"
      >
        <span className="flex h-[30px] w-14 items-center justify-center">
          <List size={20} aria-hidden />
        </span>
        Mais
      </button>
    </nav>
  );
}

export function MobileNav({ onOpenMenu, hidden = false }: Props) {
  if (perfilAtivo() === "imobiliaria") return <BarraOpa onOpenMenu={onOpenMenu} hidden={hidden} />;
  return <MobileNavBase onOpenMenu={onOpenMenu} hidden={hidden} />;
}

function MobileNavBase({ onOpenMenu, hidden = false }: Props) {
  const pathname = usePathname();
  const { user, activeOrg } = useAuth();

  const destinos = PRIORIDADE_MOBILE.map((href) =>
    NAV_DESTINATIONS.find((d) => d.href === href),
  ).filter(
    (d): d is NonNullable<typeof d> =>
      !!d && canSee(d, user.is_platform_admin, activeOrg?.role ?? null),
  ).slice(0, MAX_NA_BARRA);

  return (
    <nav
      aria-label="Navegação principal"
      aria-hidden={hidden}
      className={cn(
        "m-floating-nav fixed bottom-5 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-full p-1.5 md:hidden",
        "transition-[opacity,transform] duration-200",
        hidden && "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      {destinos.map((d) => {
        // `startsWith` para a rota casar com a conversa aberta
        // (/app/inbox/<id> continua sendo o Inbox), mas nunca deixando
        // /app/contacts acender em /app/contacts-algo-outro.
        const ativo = pathname === d.href || pathname.startsWith(`${d.href}/`);
        const Icon = d.icon;
        return (
          <Link
            key={d.href}
            href={d.href}
            aria-label={d.label}
            aria-current={ativo ? "page" : undefined}
            tabIndex={hidden ? -1 : undefined}
            className={cn(
              "flex h-11 w-12 items-center justify-center rounded-full transition-colors",
              "active:scale-95",
              ativo
                ? "bg-[var(--m-violet)] text-white shadow-[0_6px_16px_-4px_rgba(139,111,255,0.7)]"
                : "text-[var(--m-text-2)]",
            )}
          >
            <Icon size={21} weight={ativo ? "fill" : "regular"} aria-hidden />
          </Link>
        );
      })}

      {/* O resto do app. Sem ele a barra seria uma gaiola de quatro telas. */}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir menu"
        tabIndex={hidden ? -1 : undefined}
        className="flex h-11 w-12 items-center justify-center rounded-full text-[var(--m-text-2)] transition-colors active:scale-95"
      >
        <List size={21} weight="regular" aria-hidden />
      </button>
    </nav>
  );
}
