"use client";
import { useQueryClient } from "@tanstack/react-query";

import { MudarNome } from "@/app/app/leads/[id]/_nome";
import { useAuth } from "@/hooks/auth/AuthProvider";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/**
 * Lápis ao lado do nome no Multi-atendimento. A conversa lê o nome do cache do
 * React Query, que o `router.refresh()` não renova: sem invalidar, o nome antigo
 * ficaria na tela até trocar de conversa.
 */
export function MudarNomeNaConversa({ contato, className }: { contato: ConversationWithContact["contacts"] | null; className?: string }) {
  const qc = useQueryClient();
  const { activeOrg } = useAuth();
  if (!contato || contato.is_anonymized || !activeOrg || activeOrg.role === "viewer") return null;

  return (
    <MudarNome
      lapis
      contatoId={contato.id}
      atual={contato.display_name?.trim() || contato.name?.trim() || ""}
      className={className}
      onSalvo={() => {
        qc.invalidateQueries({ queryKey: ["conversations"] });
        qc.invalidateQueries({ queryKey: ["conversation"] });
        qc.invalidateQueries({ queryKey: ["contato-resumo", contato.id] });
      }}
    />
  );
}
