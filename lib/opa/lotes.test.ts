// @vitest-environment node
import { describe, expect, it } from "vitest";

import { emLotes, todasAsPaginas } from "./lotes";

describe("emLotes", () => {
  it("divide a lista e junta o resultado na ordem", async () => {
    const chamadas: number[][] = [];
    const r = await emLotes(
      Array.from({ length: 7 }, (_, i) => i),
      async (lote) => {
        chamadas.push(lote);
        return { data: lote.map((n) => n * 10), error: null };
      },
      3,
    );
    expect(chamadas).toEqual([[0, 1, 2], [3, 4, 5], [6]]);
    expect(r).toEqual([0, 10, 20, 30, 40, 50, 60]);
  });

  it("erro de um lote derruba a consulta em vez de virar lista vazia", async () => {
    await expect(emLotes([1, 2], async () => ({ data: null, error: { message: "URI too long" } }))).rejects.toThrow("URI too long");
  });

  it("lista vazia não consulta", async () => {
    let chamou = false;
    await emLotes([], async () => ((chamou = true), { data: [], error: null }));
    expect(chamou).toBe(false);
  });
});

describe("todasAsPaginas", () => {
  it("passa do corte de 1.000 linhas", async () => {
    const base = Array.from({ length: 2500 }, (_, i) => i);
    const r = await todasAsPaginas(async (de, ate) => ({ data: base.slice(de, ate + 1), error: null }));
    expect(r).toHaveLength(2500);
  });
});
