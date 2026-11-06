"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PencilSimple } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { mudarNomeDoLead } from "../actions";

/**
 * "Mudar nome": quem chega pelo WhatsApp costuma vir com apelido ou emoji no lugar
 * do nome. A ficha mostra o botão escrito; conversa e painel lateral, só o lápis ao
 * lado do nome. Pela conversa vai o `contatoId`, porque o contato pode não ter lead.
 */
export function MudarNome({
  leadId,
  contatoId,
  atual,
  lapis = false,
  className,
  onSalvo,
}: {
  leadId?: string;
  contatoId?: string;
  atual: string;
  lapis?: boolean;
  className?: string;
  onSalvo?: (nome: string) => void;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(atual);
  const [pendente, iniciar] = useTransition();

  const abrir = () => {
    setNome(atual);
    setAberto(true);
  };

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    if (contatoId) fd.set("contatoId", contatoId);
    if (leadId) fd.set("leadId", leadId);
    fd.set("nome", nome);
    iniciar(async () => {
      try {
        const r = await mudarNomeDoLead(fd);
        if (!r.ok) return void toast.error(r.erro);
        toast.success("Nome alterado.");
        setAberto(false);
        onSalvo?.(nome.trim());
        router.refresh();
      } catch {
        toast.error("Não deu para mudar agora. Tente de novo em instantes.");
      }
    });
  };

  return (
    <>
      {lapis ? (
        <button
          type="button"
          onClick={abrir}
          aria-label="Mudar nome"
          title="Mudar nome"
          className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-full opacity-70 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10", className)}
        >
          <PencilSimple className="size-4" aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          onClick={abrir}
          className={cn(
            "inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0a2d40] shadow-[0_1px_2px_rgba(9,44,62,0.06)] hover:bg-[#e7f0f5]",
            className,
          )}
        >
          <PencilSimple className="size-4" /> Mudar nome
        </button>
      )}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mudar nome</DialogTitle>
            <DialogDescription>O novo nome aparece na ficha, no funil e nas conversas.</DialogDescription>
          </DialogHeader>
          <form onSubmit={salvar} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome-do-lead">Nome</Label>
              <Input id="nome-do-lead" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} autoFocus />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAberto(false)} disabled={pendente}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendente || nome.trim().length < 2 || nome.trim() === atual}>
                {pendente ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
