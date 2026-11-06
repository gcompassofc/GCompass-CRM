"use client";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { useExcluirConversas } from "@/hooks/inbox/useExcluirConversas";
import { Skeleton } from "@/components/ui/skeleton";
import { ConversationListItem } from "./ConversationListItem";
import { EmptyInbox } from "@/components/empty";
import {
  useConversationsRealtime,
  type ConversationsFilters,
  type ConversationWithContact,
} from "@/hooks/inbox/useConversationsRealtime";

interface Props {
  filters: ConversationsFilters;
  orgId: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Optional client-side filter (e.g. only-unread). */
  clientFilter?: (c: ConversationWithContact) => boolean;
  /** Notifies parent when the visible list changes (used by keyboard nav). */
  onVisibleChange?: (ids: string[]) => void;
}

export function ConversationList({
  filters,
  orgId,
  selectedId,
  onSelect,
  clientFilter,
  onVisibleChange,
}: Props) {
  const q = useConversationsRealtime(filters, orgId);
  const podeExcluir = usePermission("conversation.delete");
  const excluir = useExcluirConversas();
  const [marcando, setMarcando] = useState(false);
  const [marcadas, setMarcadas] = useState<string[]>([]);

  // Fila (G5-03): a lista já vem ordenada por tempo de espera (server), então a
  // posição é o índice na lista visível. Só mostramos posição/espera nessa visão.
  const isQueue = filters.assigned_to === "unassigned";

  const items = useMemo(() => {
    const all: ConversationWithContact[] = q.data?.pages.flatMap((p) => p.data) ?? [];
    return clientFilter ? all.filter(clientFilter) : all;
  }, [q.data, clientFilter]);

  // Notify parent of currently-visible IDs (for j/k nav). Must use effect
  // (not render-time call) — invoking onVisibleChange during render triggers
  // setState in InboxLayout from inside ConversationList's render phase,
  // which React 19 forbids.
  useEffect(() => {
    if (onVisibleChange) onVisibleChange(items.map((i) => i.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  if (q.isLoading) {
    return (
      <div className="space-y-3 p-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        <p>Erro ao carregar conversas.</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => q.refetch()}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyInbox />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {podeExcluir && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 text-[13px]">
          {marcando ? (
            <>
              <strong className="font-semibold">{marcadas.length} marcadas</strong>
              <button type="button" className="font-medium text-[#1f6a93]" onClick={() => setMarcadas(items.map((i) => i.id))}>Marcar todas</button>
              <button
                type="button"
                disabled={marcadas.length === 0 || excluir.isPending}
                className="ml-auto rounded-full bg-[#fdecea] px-3 py-1 font-semibold text-[#b3261e] disabled:opacity-50"
                onClick={() => {
                  const n = marcadas.length;
                  if (!confirm(`Excluir ${n} ${n === 1 ? "conversa" : "conversas"} do CRM? Não dá para desfazer. No WhatsApp dos corretores elas continuam, e se a pessoa escrever de novo a conversa volta.`)) return;
                  excluir.mutate(marcadas, {
                    onSuccess: () => {
                      setMarcadas([]);
                      setMarcando(false);
                    },
                  });
                }}
              >
                {excluir.isPending ? "Excluindo…" : "Excluir"}
              </button>
              <button type="button" className="font-medium text-muted-foreground" onClick={() => { setMarcando(false); setMarcadas([]); }}>Cancelar</button>
            </>
          ) : (
            <button type="button" className="font-medium text-muted-foreground hover:text-foreground" onClick={() => setMarcando(true)}>Selecionar várias</button>
          )}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {items.map((c, i) => (
          <ConversationListItem
            key={c.id}
            conversation={c}
            isSelected={c.id === selectedId}
            onSelect={marcando ? (id) => setMarcadas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id])) : onSelect}
            queuePosition={isQueue ? i + 1 : undefined}
            marcando={marcando}
            marcada={marcadas.includes(c.id)}
          />
        ))}
        {q.hasNextPage && (
          <div className="flex justify-center p-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
            >
              {q.isFetchingNextPage ? "Carregando…" : "Carregar mais"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
