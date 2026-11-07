"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Trash } from "@/lib/ui/icons";

import { removerMembro } from "./actions";

/**
 * "Remover da equipe": só o administrador vê; a ação confere de novo. Antes de
 * confirmar, mostra o que acontece com os leads abertos, a roleta e o WhatsApp.
 */
export function RemoverMembro({
  userId,
  nome,
  leadsAbertos,
  temWhatsapp,
  destinos,
}: {
  userId: string;
  nome: string;
  leadsAbertos: number;
  temWhatsapp: boolean;
  /** Quem pode receber os leads (equipe ativa, menos quem sai e quem só lê). */
  destinos: Array<{ id: string; nome: string }>;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [destino, setDestino] = useState("");
  const [desconectar, setDesconectar] = useState(true);
  const [pendente, iniciar] = useTransition();
  const primeiro = nome.split(" ")[0];
  const faltaDestino = leadsAbertos > 0 && !destino;

  const remover = () => {
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("destino", destino);
    if (desconectar) fd.set("desconectar", "on");
    iniciar(async () => {
      try {
        const r = await removerMembro(fd);
        if (!r.ok) return void toast.error(r.erro);
        toast.success(`${primeiro} saiu da equipe.`);
        if (r.aviso) toast.warning(r.aviso, { duration: 10_000 });
        setAberto(false);
        router.refresh();
      } catch {
        toast.error("Não deu para remover agora. Tente de novo em instantes.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        title={`Remover ${nome} da equipe`}
        aria-label={`Remover ${nome} da equipe`}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-[#b3261e] hover:bg-[#fdecea]"
      >
        <Trash className="size-4" />
      </button>
      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover {nome} da equipe?</AlertDialogTitle>
            <AlertDialogDescription>
              {primeiro} perde o acesso ao CRM na hora e sai da roleta. O histórico fica. Para voltar, é só convidar de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-4 text-[14px] text-[#0a2d40]">
            {leadsAbertos > 0 ? (
              <label className="flex flex-col gap-1.5">
                <span className="font-semibold">
                  {leadsAbertos} {leadsAbertos === 1 ? "lead aberto vai" : "leads abertos vão"} para:
                </span>
                <select
                  value={destino}
                  onChange={(e) => setDestino(e.target.value)}
                  className="h-11 rounded-full bg-[#f2f6f9] px-4 text-[14px] outline-none focus:ring-2 focus:ring-[#8fc4dd]"
                >
                  <option value="">Escolha quem fica com eles</option>
                  {destinos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.nome}
                    </option>
                  ))}
                </select>
                <span className="text-[12px] text-[#5b7284]">As conversas atribuídas a {primeiro} vão junto.</span>
              </label>
            ) : (
              <p className="text-[#34566b]">{primeiro} não tem lead aberto.</p>
            )}

            {temWhatsapp && (
              <label className="flex items-start gap-2.5">
                <input type="checkbox" checked={desconectar} onChange={(e) => setDesconectar(e.target.checked)} className="mt-1 size-4 accent-[#0a2d40]" />
                <span>
                  Desconectar o WhatsApp de {primeiro} do CRM
                  <span className="block text-[12px] text-[#5b7284]">
                    Recomendado: o número é pessoal e o CRM para de ler as conversas. As que já estão no CRM ficam.
                  </span>
                </span>
              </label>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={pendente || faltaDestino} onClick={remover}>
              {pendente ? "Removendo..." : "Remover da equipe"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
