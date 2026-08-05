"use client";
import { useState, type ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { MobileNav } from "@/components/shell/MobileNav";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ImmersiveViewProvider, useIsImmersive } from "@/lib/ui/immersive-view";
import { cn } from "@/lib/utils";

interface AppShellProps {
  sidebarCollapsed: boolean;
  children: ReactNode;
}

export function AppShell({ sidebarCollapsed, children }: AppShellProps) {
  return (
    <ImmersiveViewProvider>
      <AppShellInterno sidebarCollapsed={sidebarCollapsed}>{children}</AppShellInterno>
    </ImmersiveViewProvider>
  );
}

function AppShellInterno({ sidebarCollapsed, children }: AppShellProps) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

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
        <Sidebar collapsed={sidebarCollapsed} />
      </div>

      {/* Mobile Drawer */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[260px] p-0 border-r">
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <Sidebar collapsed={false} onNavClick={() => setMobileNavOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* `min-w-0` NÃO é enfeite: um filho de flex tem `min-width: auto` por
          padrão e se recusa a encolher abaixo do próprio conteúdo. Sem ele a
          coluna media 438px numa tela de 380px (medido) e o app inteiro rolava
          para o lado — em TODA tela, não só nesta. `overflow-x-hidden` é o
          cinto de segurança: conteúdo largo (tabela, código) rola dentro do
          seu próprio container, nunca empurrando a página. */}
      <div
        className={cn(
          "flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden transition-[margin] duration-200 ml-0",
          sidebarCollapsed ? "md:ml-16" : "md:ml-60",
        )}
      >
        <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
        {/* A folga no rodapé é do tamanho da barra flutuante, e vale para TODA
            tela — a última linha de qualquer lista nascia por baixo do vidro.
            Some junto com a barra na conversa aberta, onde quem ocupa o rodapé
            é o composer e a folga viraria um vão morto acima do teclado. */}
        <main
          className={cn(
            "flex-1 overflow-auto p-0 md:p-6",
            !emConversa && "max-md:pb-[var(--m-nav-clearance)]",
          )}
        >
          {children}
        </main>
      </div>

      <MobileNav onOpenMenu={() => setMobileNavOpen(true)} hidden={emConversa} />
    </div>
  );
}
