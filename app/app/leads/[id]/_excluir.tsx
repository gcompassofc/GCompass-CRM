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

import { excluirLead } from "../actions";

/** "Excluir lead": só o administrador vê; a ação e o banco conferem de novo. */
export function ExcluirLead({ leadId, nome }: { leadId: string; nome: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();

  const excluir = () => {
    const fd = new FormData();
    fd.set("leadId", leadId);
    iniciar(async () => {
      try {
        const r = await excluirLead(fd);
        if (!r.ok) return void toast.error(r.erro);
        toast.success("Lead excluído.");
        setAberto(false);
        router.replace("/app/leads");
        router.refresh();
      } catch {
        toast.error("Não deu para excluir agora. Tente de novo em instantes.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#b3261e] shadow-[0_1px_2px_rgba(9,44,62,0.06)] hover:bg-[#fdecea]"
      >
        <Trash className="size-4" /> Excluir lead
      </button>
      <AlertDialog open={aberto} onOpenChange={setAberto}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {nome}?</AlertDialogTitle>
            <AlertDialogDescription>
              O lead some do CRM para todos, com o histórico, as visitas e os lembretes dele. Não dá para desfazer. O contato e a conversa
              continuam no Atendimento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pendente}>Cancelar</AlertDialogCancel>
            <Button variant="destructive" disabled={pendente} onClick={excluir}>
              {pendente ? "Excluindo..." : "Excluir de vez"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
