"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import type { Role } from "@/lib/schemas/team";
import { CircleNotch } from "@/lib/ui/icons";

/**
 * Troca do papel de alguém da equipe, só para o administrador (pedido de 02/11/2026).
 * Usa a rota que a base já tem (PATCH /api/v1/team/[user_id]): ela confere que quem
 * chama é administrador, não deixa rebaixar o último administrador e registra a troca
 * na auditoria. Aqui fica só a tela e o aviso em palavras.
 */

export const PAPEIS_DA_EQUIPE: Array<{ valor: Role; rotulo: string }> = [
  { valor: "agent", rotulo: "Corretor" },
  { valor: "manager", rotulo: "Gestor" },
  { valor: "admin", rotulo: "Administrador" },
  { valor: "viewer", rotulo: "Leitura" },
];

const DICA: Partial<Record<Role, string>> = {
  admin: "Vê e muda tudo. No próximo acesso, cadastra o código do celular.",
  manager: "Vê a equipe toda e convida corretores.",
  agent: "Vê só os próprios leads.",
  viewer: "Vê tudo e não muda nada. Se atendia leads, tire da roleta.",
};

export function mensagemDoErro(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === "state_conflict" && /admin/i.test(err.message)) {
      return "A equipe precisa de pelo menos um administrador.";
    }
    if (err.code === "state_conflict") return "Essa pessoa não está mais na equipe.";
    if (err.status === 403) return "Só o administrador troca o papel de alguém.";
    if (err.status === 404) return "Essa pessoa não está mais na equipe.";
  }
  return "Não deu para trocar o papel. Tente de novo.";
}

export function TrocarPapel({ userId, nome, papel }: { userId: string; nome: string; papel: string }) {
  const router = useRouter();
  const [escolhido, setEscolhido] = useState(papel);
  const [enviando, iniciar] = useTransition();
  const mudou = escolhido !== papel;
  const rotulo = PAPEIS_DA_EQUIPE.find((p) => p.valor === escolhido)?.rotulo ?? escolhido;

  function salvar() {
    iniciar(async () => {
      try {
        await apiClient.patch(`/api/v1/team/${userId}`, { role: escolhido });
        toast.success(`${nome.split(" ")[0]} agora é ${rotulo}.`);
        router.refresh();
      } catch (err) {
        toast.error(mensagemDoErro(err));
        setEscolhido(papel);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`papel-${userId}`}>
        Papel de {nome}
      </label>
      <select
        id={`papel-${userId}`}
        value={escolhido}
        disabled={enviando}
        onChange={(e) => setEscolhido(e.target.value)}
        className="min-h-[44px] rounded-full border border-[#c6d3db] bg-white px-4 text-[13px] font-medium text-[#12455f] focus:outline-none focus:ring-2 focus:ring-[#2a7ca8]"
      >
        {PAPEIS_DA_EQUIPE.map((p) => (
          <option key={p.valor} value={p.valor}>
            {p.rotulo}
          </option>
        ))}
      </select>
      {mudou ? (
        <>
          <button
            type="button"
            onClick={salvar}
            disabled={enviando}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-[#156187] px-4 text-[13px] font-semibold text-white disabled:opacity-60"
          >
            {enviando ? <CircleNotch className="size-4 animate-spin" aria-hidden /> : null}
            {enviando ? "Salvando" : "Salvar"}
          </button>
          <p className="w-full text-[12px] text-[#5b7284]">{DICA[escolhido as Role]}</p>
        </>
      ) : null}
    </div>
  );
}
