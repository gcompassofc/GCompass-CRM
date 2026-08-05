"use client";
import { useEffect, useState } from "react";
import { MagnifyingGlass } from "@/lib/ui/icons";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useChannelSessions } from "@/hooks/channels/useChannelSessions";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useConversationTagVocabulary } from "@/hooks/inbox/useConversationTags";
import { useConversationCounts } from "@/hooks/inbox/useConversationCounts";
import type { Role, VisibilityMode } from "@/lib/auth/types";

export type InboxTab = "unassigned" | "mine" | "all" | "closed" | "ai";

const INBOX_TABS: { value: InboxTab; label: string }[] = [
  { value: "unassigned", label: "Fila" },
  { value: "mine", label: "Minhas" },
  { value: "all", label: "Todas" },
  { value: "closed", label: "Fechadas" },
  { value: "ai", label: "IA" },
];

/**
 * Visões visíveis por papel + escopo (G4-02, acceptance 1). 'Todas' fica oculta
 * para `agent` quando visibility_mode ≠ 'all'; viewer/manager/admin sempre veem.
 * É apenas cosmético — a RLS (G4-01) é quem garante o escopo mesmo via ?filter=all.
 */
export function visibleInboxTabs(role: Role, mode: VisibilityMode | undefined): InboxTab[] {
  const hideAll = role === "agent" && mode !== "all";
  return INBOX_TABS.filter((t) => !(t.value === "all" && hideAll)).map((t) => t.value);
}

export interface InboxFiltersValue {
  tab: InboxTab;
  search: string;
  onlyUnread: boolean;
  channel_session_id?: string;
  tag?: string;
}

interface Props {
  value: InboxFiltersValue;
  onChange: (next: InboxFiltersValue) => void;
}

export function InboxFilters({ value, onChange }: Props) {
  const [searchInput, setSearchInput] = useState(value.search);
  const { data: channels } = useChannelSessions({ refetchInterval: 30_000 });
  const { activeOrg } = useAuth();
  const { data: tagVocabulary } = useConversationTagVocabulary(activeOrg?.orgId ?? null);
  const { data: counts } = useConversationCounts(activeOrg?.orgId ?? null);

  const tabs = activeOrg
    ? visibleInboxTabs(activeOrg.role, activeOrg.visibility_mode)
    : INBOX_TABS.map((t) => t.value);
  const countFor: Partial<Record<InboxTab, number>> = {
    unassigned: counts?.unassigned,
    mine: counts?.mine,
    all: counts?.all,
  };
  // Alternador só aparece com 2+ números — com um só não há o que alternar.
  const showChannelSwitch = (channels?.length ?? 0) >= 2;

  // Debounce search input → propagate to parent.
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== value.search) {
        onChange({ ...value, search: searchInput });
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  return (
    <div className="space-y-3 border-b border-border bg-background px-3 py-3 max-md:space-y-0 max-md:border-b-0 max-md:bg-transparent max-md:px-0 max-md:pb-0 max-md:pt-2">
      {/* Título da tela — só no celular. No desktop o sidebar já diz onde
          você está; aqui não há sidebar, e uma lista sem título deixa a tela
          sem âncora quando se volta da conversa. */}
      <h1 className="hidden px-5 pb-3 text-[22px] font-bold tracking-tight text-[var(--m-text-1)] max-md:block">
        Conversas
      </h1>

      <div className="relative max-md:px-5">
        <MagnifyingGlass
          size={14}
          weight="regular"
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground max-md:left-8 max-md:text-[var(--m-text-3)]"
          aria-hidden
        />
        <Input
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Buscar mensagens…"
          className="h-8 pl-8 text-sm max-md:h-11 max-md:rounded-xl max-md:border-[var(--m-border-soft)] max-md:bg-[var(--m-elevated)] max-md:pl-10 max-md:text-[14px] max-md:text-[var(--m-text-1)] max-md:placeholder:text-[var(--m-text-3)]"
          aria-label="Buscar conversas"
        />
      </div>

      {showChannelSwitch && (
        <Select
          value={value.channel_session_id ?? "all"}
          onValueChange={(v) =>
            onChange({ ...value, channel_session_id: v === "all" ? undefined : v })
          }
        >
          <SelectTrigger className="h-8 text-sm max-md:hidden" aria-label="Filtrar por número de WhatsApp">
            <SelectValue placeholder="Todos os números" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os números</SelectItem>
            {channels?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.display_name || c.phone_number || c.waha_session_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {(tagVocabulary?.length ?? 0) > 0 && (
        <Select
          value={value.tag ?? "all"}
          onValueChange={(v) => onChange({ ...value, tag: v === "all" ? undefined : v })}
        >
          <SelectTrigger className="h-8 text-sm max-md:hidden" aria-label="Filtrar por tag">
            <SelectValue placeholder="Todas as tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as tags</SelectItem>
            {tagVocabulary?.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {/* Desktop: abas de largura igual. */}
      <Tabs
        value={value.tab}
        onValueChange={(v) => onChange({ ...value, tab: v as InboxTab })}
        className="max-md:hidden"
      >
        <TabsList
          className="grid h-8 w-full"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((tab) => {
            const meta = INBOX_TABS.find((t) => t.value === tab)!;
            const count = countFor[tab];
            return (
              <TabsTrigger key={tab} value={tab} className="gap-1 text-[11px]">
                {meta.label}
                {typeof count === "number" && count > 0 && (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Celular: fileira de chips que rola.
          Abas de largura igual não cabem em 390px — com cinco visões cada uma
          fica com ~70px e o rótulo trunca. O chip tem a largura do seu próprio
          texto e sai da tela pela direita, que é o gesto esperado no celular.
          `radiogroup` e não `tablist`: aqui não há painéis irmãos trocando,
          é uma escolha única que refiltra a MESMA lista. */}
      <div
        role="radiogroup"
        aria-label="Filtrar conversas"
        className="m-scroll-x hidden gap-[7px] px-5 pb-1 pt-3 max-md:flex"
      >
        {tabs.map((tab) => {
          const meta = INBOX_TABS.find((t) => t.value === tab)!;
          const count = countFor[tab];
          const on = value.tab === tab;
          return (
            <button
              key={tab}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange({ ...value, tab })}
              className={cn(
                "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 py-[7px] text-[12.5px] font-semibold transition-colors",
                on
                  ? "border-[var(--m-violet-line)] bg-[var(--m-violet-dim)] text-[var(--m-text-1)]"
                  : "border-[var(--m-border-soft)] bg-[var(--m-elevated)] text-[var(--m-text-2)]",
              )}
            >
              {meta.label}
              {typeof count === "number" && count > 0 && (
                <span
                  className={cn(
                    "text-[10.5px] tabular-nums",
                    on ? "text-[var(--m-violet)]" : "text-[var(--m-text-3)]",
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}

        {/* "Apenas não lidos" vira o último chip: no celular ele é mais uma
            visão da lista, e um switch com rótulo comeria uma linha inteira. */}
        <button
          type="button"
          role="radio"
          aria-checked={value.onlyUnread}
          onClick={() => onChange({ ...value, onlyUnread: !value.onlyUnread })}
          className={cn(
            "shrink-0 whitespace-nowrap rounded-full border px-3.5 py-[7px] text-[12.5px] font-semibold transition-colors",
            value.onlyUnread
              ? "border-[var(--m-violet-line)] bg-[var(--m-violet-dim)] text-[var(--m-text-1)]"
              : "border-[var(--m-border-soft)] bg-[var(--m-elevated)] text-[var(--m-text-2)]",
          )}
        >
          Não lidos
        </button>
      </div>

      <div className="flex items-center justify-between max-md:hidden">
        <Label htmlFor="only-unread" className="text-xs text-muted-foreground">
          Apenas não lidos
        </Label>
        <Switch
          id="only-unread"
          checked={value.onlyUnread}
          onCheckedChange={(v) => onChange({ ...value, onlyUnread: v })}
        />
      </div>
    </div>
  );
}
