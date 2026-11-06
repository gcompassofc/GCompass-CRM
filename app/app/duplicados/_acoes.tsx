"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

const BOTAO = "inline-flex h-9 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold disabled:opacity-50";
const NEUTRO = `${BOTAO} bg-[#eef3f6] text-[#0a2d40] hover:bg-[#e1eaf0]`;
const PERIGO = `${BOTAO} bg-[#fdecea] text-[#b3261e] hover:bg-[#fbdcd8]`;

function useEnvio() {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const enviar = (url: string, corpo: unknown, feito: string) =>
    iniciar(async () => {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => null);
      if (!r?.ok) return void toast.error("Não deu para fazer agora. Tente de novo.");
      toast.success(feito);
      router.refresh();
    });
  return { pendente, enviar };
}

export function PassarAoPrincipal({ leadId, corretorId, nome }: { leadId: string; corretorId: string; nome: string }) {
  const { pendente, enviar } = useEnvio();
  return (
    <button type="button" disabled={pendente} className={NEUTRO} onClick={() => enviar("/api/v1/leads/bulk", { action: "assign", lead_ids: [leadId], params: { owner_user_id: corretorId } }, `Lead passado para ${nome}.`)}>
      Passar para {nome.split(" ")[0]}
    </button>
  );
}

export function ExcluirLeadDuplicado({ leadId }: { leadId: string }) {
  const { pendente, enviar } = useEnvio();
  return (
    <button
      type="button"
      disabled={pendente}
      className={PERIGO}
      onClick={() => {
        if (confirm("Excluir este lead? Não dá para desfazer. O histórico dele vai junto.")) enviar("/api/v1/leads/bulk", { action: "delete", lead_ids: [leadId] }, "Lead excluído.");
      }}
    >
      Excluir
    </button>
  );
}

export function ExcluirConversa({ id }: { id: string }) {
  const { pendente, enviar } = useEnvio();
  return (
    <button
      type="button"
      disabled={pendente}
      className={PERIGO}
      onClick={() => {
        if (confirm("Excluir esta conversa do CRM? Não dá para desfazer. No WhatsApp do corretor ela continua.")) enviar("/api/v1/conversations/excluir", { ids: [id] }, "Conversa excluída do CRM.");
      }}
    >
      Excluir
    </button>
  );
}
