"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { LARGURA_MENU, SUAVE_MENU, SidebarOpa } from "@/components/shell/SidebarOpa";
import { perfilAtivo } from "@/lib/navigation/registry";
import { TopBar } from "@/components/shell/TopBar";
import { MobileNav } from "@/components/shell/MobileNav";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ImmersiveViewProvider, useIsImmersive } from "@/lib/ui/immersive-view";
import { cn } from "@/lib/utils";
import { PainelLead } from "../_opa/painel-lead";
import { BoasVindasOpa } from "../_opa/tutorial";
import { PaletaOpa } from "@/components/shell/PaletaOpa";

interface AppShellProps {
  sidebarCollapsed: boolean;
  /** Perfil imobiliária: leads esperando resposta, o número ao lado de "Fila de atendimento". */
  filaCount?: number;
  /** Menu da OPA lido do cookie no servidor (sem piscar); null = primeiro acesso. */
  menuOpa?: "aberto" | "recolhido" | null;
  children: ReactNode;
}

/** Guarda a escolha do menu da OPA por um ano (preferência de tela, não credencial). */
function guardarMenu(estado: "aberto" | "recolhido") {
  document.cookie = `opa_menu=${estado}; path=/; max-age=31536000; SameSite=Lax`;
}

/**
 * Menu da OPA que recolhe e expande (pedido do Allyson, 03/11/2026). Nasce aberto,
 * com os nomes à vista (05/11/2026); depois, vale a última escolha da pessoa.
 * Ctrl + B alterna.
 */
function useMenuOpa(ativo: boolean, inicial: "aberto" | "recolhido" | null) {
  const [recolhido, setRecolhido] = useState(inicial === "recolhido");

  const alternar = useCallback(() => {
    setRecolhido((r) => {
      guardarMenu(r ? "aberto" : "recolhido");
      return !r;
    });
  }, []);

  useEffect(() => {
    if (!ativo) return;
    const tecla = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        alternar();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [ativo, alternar]);

  return { recolhido, alternar };
}

export function AppShell({ sidebarCollapsed, filaCount, menuOpa = null, children }: AppShellProps) {
  return (
    <ImmersiveViewProvider>
      <AppShellInterno sidebarCollapsed={sidebarCollapsed} filaCount={filaCount} menuOpa={menuOpa}>
        {children}
      </AppShellInterno>
    </ImmersiveViewProvider>
  );
}

function AppShellInterno({ sidebarCollapsed, filaCount, menuOpa = null, children }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Imobiliária: menu escuro do protótipo da OPA, sempre aberto, e cada tela
  // traz o próprio cabeçalho (sem a barra de cima no computador).
  const imobiliaria = perfilAtivo() === "imobiliaria";
  const recolhido = imobiliaria ? false : sidebarCollapsed;
  const menu = useMenuOpa(imobiliaria, menuOpa);

  /**
   * Na conversa aberta, o rodapé é do composer.
   *
   * A barra flutuante e o campo de escrever disputam o mesmo canto do polegar;
   * com os dois na tela, acertar "enviar" vira sorte. Quem avisa que está
   * imerso é o próprio `InboxLayout` — a conversa selecionada é estado dele e
   * NÃO aparece na URL, então testar `pathname` aqui não funcionaria.
   */
  const emConversa = useIsImmersive();

  return (
    <div className="mobile-shell flex min-h-screen w-full bg-background md:bg-background">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        {imobiliaria ? (
          <SidebarOpa filaCount={filaCount} recolhido={menu.recolhido} onAlternar={menu.alternar} />
        ) : (
          <Sidebar collapsed={sidebarCollapsed} />
        )}
      </div>

      {/* Mobile Drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[288px] p-0 border-r">
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          {imobiliaria ? (
            <SidebarOpa filaCount={filaCount} onNavClick={() => setMobileNavOpen(false)} />
          ) : (
            <Sidebar collapsed={false} onNavClick={() => setMobileNavOpen(false)} />
          )}
        </SheetContent>
      </Sheet>

      {/* `min-w-0` é o que permite a coluna de conteúdo ENCOLHER. Um flex item
          nasce com `min-width: auto`, ou seja, nunca fica menor que o conteúdo —
          então qualquer bloco largo (uma fila de abas, uma tabela) empurrava a
          PÁGINA INTEIRA para o lado em vez de rolar dentro da própria caixa, e
          o conteúdo sumia sem nada indicando que existia.

          Medido duas vezes, por caminhos independentes: no detalhe do agente
          (seis abas) a página estourava 476px na horizontal, e no inbox a
          coluna media 438px numa tela de 380px. Isolado ancestral por
          ancestral: é este o que decide.

          `overflow-x-hidden` é o cinto de segurança: conteúdo largo rola dentro
          do seu próprio container, nunca empurrando a página. */}
      <div
        className={cn(
          "flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden transition-[margin] ml-0",
          imobiliaria ? cn("md:ml-[var(--menu-opa)]", SUAVE_MENU) : cn("duration-200", recolhido ? "md:ml-16" : "md:ml-60"),
        )}
        style={
          imobiliaria
            ? ({ "--menu-opa": `${menu.recolhido ? LARGURA_MENU.recolhido : LARGURA_MENU.aberto}px` } as React.CSSProperties)
            : undefined
        }
      >
        <div className={cn(imobiliaria && "md:hidden")}>
          <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
        </div>
        {/* A folga no rodapé é do tamanho da barra flutuante, e vale para TODA
            tela — a última linha de qualquer lista nascia por baixo do vidro.
            Some junto com a barra na conversa aberta, onde quem ocupa o rodapé
            é o composer e a folga viraria um vão morto acima do teclado. */}
        <main
          className={cn(
            "flex-1 overflow-auto p-0",
            !imobiliaria && "md:p-6",
            !emConversa && "max-md:pb-[var(--m-nav-clearance)]",
          )}
        >
          {children}
        </main>
      </div>

      <MobileNav onOpenMenu={() => setMobileNavOpen(true)} hidden={emConversa} />
      {/* Tutorial de boas-vindas: abre sozinho no primeiro acesso (perfil imobiliária). */}
      {imobiliaria && <BoasVindasOpa />}
      {imobiliaria && <PaletaOpa />}
      {imobiliaria && <PainelLead />}
    </div>
  );
}
