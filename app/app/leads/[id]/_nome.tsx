"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PencilSimple } from "@/lib/ui/icons";

import { mudarNomeDoLead } from "../actions";

/** "Mudar nome" no topo da ficha: quem chega pelo WhatsApp costuma vir com apelido ou emoji no lugar do nome. */
export function MudarNome({ leadId, atual }: { leadId: string; atual: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [nome, setNome] = useState(atual);
  const [pendente, iniciar] = useTransition();

  const salvar = (e: React.FormEvent) => {
    e.preventDefault();
    const fd = new FormData();
    fd.set("leadId", leadId);
    fd.set("nome", nome);
    iniciar(async () => {
      try {
        const r = await mudarNomeDoLead(fd);
        if (!r.ok) return void toast.error(r.erro);
        toast.success("Nome alterado.");
        setAberto(false);
        router.refresh();
      } catch {
        toast.error("Não deu para mudar agora. Tente de novo em instantes.");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNome(atual);
          setAberto(true);
        }}
        className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-[14px] font-semibold text-[#0a2d40] shadow-[0_1px_2px_rgba(9,44,62,0.06)] hover:bg-[#e7f0f5]"
      >
        <PencilSimple className="size-4" /> Mudar nome
      </button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mudar nome do lead</DialogTitle>
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
