"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { sinalDeLeads } from "./contatos-novos-actions";

/** De quanto em quanto a tela aberta confere se algo mudou (pedido do Allyson, 05/11/2026). */
export const INTERVALO_MS = 5_000;

/**
 * Repete a tarefa enquanto a aba está à vista: aba escondida não consulta nada, e
 * ao voltar confere na hora. Uma rodada nunca começa antes da anterior terminar, e
 * erro de rede passageiro só espera a próxima.
 */
export function useRepetir(tarefa: () => Promise<void>, intervaloMs = INTERVALO_MS): void {
  const atual = useRef(tarefa);
  useEffect(() => {
    atual.current = tarefa;
  });

  useEffect(() => {
    let rodando = false;
    const rodar = async () => {
      if (rodando || document.visibilityState !== "visible") return;
      rodando = true;
      try {
        await atual.current();
      } catch {
        // a próxima rodada tenta de novo
      } finally {
        rodando = false;
      }
    };
    void rodar();
    const iv = setInterval(rodar, intervaloMs);
    document.addEventListener("visibilitychange", rodar);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", rodar);
    };
  }, [intervaloMs]);
}

/**
 * Atualiza a tela quando entra ou sai um lead (etiqueta no WhatsApp, anúncio, site,
 * colega): recarrega os dados só quando o sinal muda, sem piscar e sem perder o que
 * está na tela. A primeira leitura só marca o ponto de partida.
 */
export function AtualizaSozinho() {
  const router = useRouter();
  const ultimo = useRef<string | null>(null);
  useRepetir(async () => {
    const sinal = await sinalDeLeads();
    if (ultimo.current !== null && sinal !== ultimo.current) router.refresh();
    ultimo.current = sinal;
  });
  return null;
}
