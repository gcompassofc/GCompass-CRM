"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";

const POR_VEZ = 200;

/** Apaga conversas do CRM (não do WhatsApp). A rota e a RLS só deixam o administrador. */
export function useExcluirConversas() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      let apagadas = 0;
      for (let i = 0; i < ids.length; i += POR_VEZ) {
        const r = await apiClient.post<{ data: { apagadas: number } }>("/api/v1/conversations/excluir", { ids: ids.slice(i, i + POR_VEZ) });
        apagadas += r.data.apagadas;
      }
      return apagadas;
    },
    onError: showApiError,
    onSuccess: (apagadas) => {
      toast.success(apagadas === 1 ? "Conversa excluída do CRM." : `${apagadas} conversas excluídas do CRM.`);
      qc.invalidateQueries({ queryKey: ["conversations"] });
      qc.invalidateQueries({ queryKey: ["conversation"] });
      qc.invalidateQueries({ queryKey: ["conversation-counts"] });
    },
  });
}
