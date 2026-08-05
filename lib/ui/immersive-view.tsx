"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * "Estou numa tela imersiva" — a que ocupa o celular inteiro e reivindica o
 * rodapé para si (hoje: a conversa aberta do inbox).
 *
 * Por que um contexto e não um teste de rota: a conversa selecionada é ESTADO
 * do `InboxLayout`, não caminho na URL. Abrir a Ana Silva mantém o endereço em
 * `/app/inbox`, então `pathname` nunca muda — a primeira versão disto testava
 * `/app/inbox/<id>` e a barra flutuante seguia por cima do campo de escrever,
 * tapando justamente o botão de enviar.
 *
 * Quem está imerso ANUNCIA (`useImmersiveView`); o shell ESCUTA. Assim a peça
 * que sabe do estado é a que fala, e o shell não precisa adivinhar por URL o
 * que só o componente sabe.
 */

interface ImmersiveCtx {
  immersive: boolean;
  setImmersive: (v: boolean) => void;
}

const Ctx = createContext<ImmersiveCtx | null>(null);

export function ImmersiveViewProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  // Contador, não booleano: se duas peças anunciarem imersão, a saída de uma
  // não pode devolver o rodapé enquanto a outra ainda o ocupa.
  const setImmersive = useCallback((v: boolean) => {
    setCount((n) => Math.max(0, n + (v ? 1 : -1)));
  }, []);

  const value = useMemo(
    () => ({ immersive: count > 0, setImmersive }),
    [count, setImmersive],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Declara que esta tela está imersa enquanto `active` for verdadeiro.
 *
 * Fora do provider vira no-op de propósito: o inbox é montado em testes e
 * stories sem o shell do app, e lá "sem rodapé para disputar" é a verdade —
 * não um erro.
 */
export function useImmersiveView(active: boolean): void {
  const ctx = useContext(Ctx);
  const setImmersive = ctx?.setImmersive;

  useEffect(() => {
    if (!setImmersive || !active) return;
    setImmersive(true);
    return () => setImmersive(false);
  }, [active, setImmersive]);
}

/** Lido pelo shell para decidir se a barra flutuante aparece. */
export function useIsImmersive(): boolean {
  return useContext(Ctx)?.immersive ?? false;
}
