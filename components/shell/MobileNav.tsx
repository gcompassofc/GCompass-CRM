"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { List } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { canSee, NAV_DESTINATIONS } from "@/lib/navigation/registry";

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
const PRIORIDADE_MOBILE = ["/app/inbox", "/app/radar", "/app/kanban", "/app/contacts"];

interface Props {
  onOpenMenu: () => void;
  /** Some quando a conversa está aberta — lá o polegar é do composer. */
  hidden?: boolean;
}

export function MobileNav({ onOpenMenu, hidden = false }: Props) {
  const pathname = usePathname();
  const { user, activeOrg } = useAuth();

  const destinos = PRIORIDADE_MOBILE.map((href) =>
    NAV_DESTINATIONS.find((d) => d.href === href),
  ).filter(
    (d): d is NonNullable<typeof d> =>
      !!d && canSee(d, user.is_platform_admin, activeOrg?.role ?? null),
  );

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
