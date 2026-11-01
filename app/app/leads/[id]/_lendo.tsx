"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Selo "Lendo a conversa" do copiloto (V1). A ficha abre com a leitura anterior;
 * enquanto a IA lê em segundo plano, a tela se atualiza sozinha a cada 4 segundos
 * por até 40 segundos. Se a leitura não chegar, o selo some e o botão "Ler de
 * novo" continua ali.
 */
const INTERVALO_MS = 4_000;
const TENTATIVAS = 10;

export function SeloLendo() {
  const router = useRouter();
  const [desistiu, setDesistiu] = useState(false);

  useEffect(() => {
    let n = 0;
    const t = setInterval(() => {
      n += 1;
      if (n > TENTATIVAS) {
        clearInterval(t);
        setDesistiu(true);
        return;
      }
      router.refresh();
    }, INTERVALO_MS);
    return () => clearInterval(t);
  }, [router]);

  if (desistiu) return null;
  return (
    <span role="status" className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[12px] font-medium text-white/85">
      <span className="size-1.5 animate-pulse rounded-full bg-[#8fc4dd]" aria-hidden />
      Lendo a conversa
    </span>
  );
}
