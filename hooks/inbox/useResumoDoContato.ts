"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface ResumoLead {
  id: string;
  title: string;
  status: string;
  value_cents: number | null;
  currency: string | null;
  updated_at: string;
  /** Resposta do "Lead ou pessoal?" ({ como: "lead" }); null = ninguém respondeu. */
  classificado?: { como?: string } | null;
}

export interface ResumoAtividade {
  id: string;
  type: string;
  source_module: string;
  performed_at: string;
  payload: Record<string, unknown> | null;
  reason: string | null;
  actor_kind: string | null;
}

interface Resumo {
  leads: ResumoLead[];
  activities: ResumoAtividade[];
}

/**
 * Leads e atividade do contato da conversa, pela rota do servidor (o cookie de
 * sessão é httpOnly; ver o cabeçalho de /api/v1/contacts/[id]/crm-summary).
 *
 * Uma chave só para o cabeçalho da conversa (o nome leva à ficha do lead) e
 * para o painel "Dados do contato": abrir os dois não pede a rota duas vezes.
 * A rota já devolve os leads do mais recente para o mais antigo e respeita a
 * RLS: o corretor só recebe os leads que pode ver.
 */
export function useResumoDoContato(contactId: string | null) {
  return useQuery({
    queryKey: ["contato-resumo", contactId],
    enabled: !!contactId,
    staleTime: 30_000,
    queryFn: async () => {
      const r = await apiClient.get<{ data: Resumo }>(`/api/v1/contacts/${contactId}/crm-summary`);
      return r.data;
    },
  });
}

/** O lead que a conversa representa: o aberto mais recente, senão o mais recente. */
export function leadPrincipal(leads: ResumoLead[] | undefined): ResumoLead | null {
  if (!leads || leads.length === 0) return null;
  return leads.find((l) => l.status === "open") ?? leads[0] ?? null;
}
