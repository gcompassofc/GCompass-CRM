import type { ColunaQuadro } from "./_quadro";

/** Tira o card de uma coluna e põe no topo da outra, levando o valor junto no total da etapa (F7). */
export function moverCartao(colunas: ColunaQuadro[], cartaoId: string, deId: string, paraId: string): ColunaQuadro[] {
  const de = colunas.find((c) => c.id === deId);
  const cartao = de?.cartoes.find((c) => c.id === cartaoId);
  if (!de || !cartao || deId === paraId || !colunas.some((c) => c.id === paraId)) return colunas;
  return colunas.map((c) =>
    c.id === deId
      ? { ...c, cartoes: c.cartoes.filter((x) => x.id !== cartaoId), total: Math.max(0, c.total - cartao.valorCents) }
      : c.id === paraId
        ? { ...c, cartoes: [cartao, ...c.cartoes], total: c.total + cartao.valorCents }
        : c,
  );
}
