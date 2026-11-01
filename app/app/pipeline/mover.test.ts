import { describe, expect, it } from "vitest";

import type { CartaoQuadro, ColunaQuadro } from "./_quadro";
import { moverCartao } from "./mover";

const cartao = (id: string, valorCents: number) => ({ id, valorCents }) as CartaoQuadro;
const coluna = (id: string, cartoes: CartaoQuadro[], total: number, ocultos = 0) =>
  ({ id, nome: id, cartoes, total, ocultos }) as ColunaQuadro;

describe("moverCartao (F7)", () => {
  const inicial = [coluna("a", [cartao("1", 500_000_00), cartao("2", 0)], 500_000_00, 3), coluna("b", [], 0)];

  it("leva o card e o valor para a outra etapa", () => {
    const [a, b] = moverCartao(inicial, "1", "a", "b");
    expect(a!.cartoes.map((c) => c.id)).toEqual(["2"]);
    expect(a!.total).toBe(0);
    expect(b!.cartoes.map((c) => c.id)).toEqual(["1"]);
    expect(b!.total).toBe(500_000_00);
  });

  it("mantém os ocultos da etapa de origem (o total de leads da coluna conta cartoes + ocultos)", () => {
    const [a] = moverCartao(inicial, "2", "a", "b");
    expect(a!.ocultos).toBe(3);
    expect(a!.cartoes.length + a!.ocultos).toBe(4);
  });

  it("não muda nada para a mesma etapa, card ou etapa inexistente", () => {
    expect(moverCartao(inicial, "1", "a", "a")).toBe(inicial);
    expect(moverCartao(inicial, "x", "a", "b")).toBe(inicial);
    expect(moverCartao(inicial, "1", "a", "z")).toBe(inicial);
  });

  it("o total nunca fica negativo", () => {
    const torto = [coluna("a", [cartao("1", 10)], 5), coluna("b", [], 0)];
    expect(moverCartao(torto, "1", "a", "b")[0]!.total).toBe(0);
  });
});
