"use client";
import { AlertsBell } from "./AlertsBell";
import { TenantSwitcher } from "./TenantSwitcher";
import { UserMenu } from "./UserMenu";
import { SearchTrigger } from "./SearchTrigger";
import { Button } from "@/components/ui/button";
import { List } from "@/lib/ui/icons";

interface TopBarProps {
  onOpenMobileNav?: () => void;
}

export function TopBar({ onOpenMobileNav }: TopBarProps) {
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-2 border-b border-border/60 bg-background/80 px-3 md:px-6 backdrop-blur-xl shadow-xs">
      <div className="flex items-center gap-2">
        {onOpenMobileNav && (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-9 w-9 shrink-0"
            onClick={onOpenMobileNav}
            aria-label="Abrir menu"
          >
            <List size={20} weight="bold" />
          </Button>
        )}
        <TenantSwitcher />
      </div>
      <div className="flex flex-1 justify-center max-w-[200px] md:max-w-md">
        <SearchTrigger />
      </div>
      <div className="flex items-center gap-1.5 md:gap-2">
        <AlertsBell />
        <UserMenu />
      </div>
    </header>
  );
}
