import { describe, expect, it } from "vitest";

import { pedidoInicial, pedidoParaRadar, pedidoRadarSchema, resumoDoPedidoRadar } from "@/lib/opa/pedido-radar";

describe("pedido ao OPA Radar", () => {
  it("monta o pedido inicial com o que a ficha sabe", () => {
    const p = pedidoInicial("Ana", { finalidade: "comprar para morar", regiao: "Norte da ilha", faixa: "de 3 a 5 milhões", suites: "4 suítes" });
    expect(p).toMatchObject({ finalidade: "venda", regioes: ["Norte"], preco_min: 3_000_000, preco_max: 5_000_000, suites_min: 4 });
    expect(pedidoRadarSchema.safeParse(p).success).toBe(true);
  });

  it("Perequê e Vila caem em Centro e Vila; faixa sem milhão não vira preço", () => {
    const p = pedidoInicial("Bia", { regiao: "Perequê", faixa: "uns 800" });
    expect(p.regioes).toEqual(["Centro e Vila"]);
    expect(p.preco_max).toBeNull();
  });

  it("sai no formato que o pedido.mjs do Radar lê", () => {
    const p = pedidoInicial("Ana", { faixa: "até 4 mi" });
    const r = pedidoParaRadar({ ...p, obrigatorio: ["vista_mar"], desejavel: ["piscina"] });
    expect(r).toMatchObject({ titulo: "Pedido de Ana", finalidade: "venda", tipos: ["casa"], preco_max: 4_000_000, obrigatorio: [["vista_mar"]], desejavel: ["piscina"], nao_quero: [] });
    expect(r).not.toHaveProperty("preco_min");
    expect(resumoDoPedidoRadar({ ...p, obrigatorio: ["vista_mar"], desejavel: [] })).toContain("precisa: vista para o mar");
  });

  it("recusa ponto ou região fora do catálogo do Radar", () => {
    const p = pedidoInicial("Ana", {});
    expect(pedidoRadarSchema.safeParse({ ...p, obrigatorio: ["inventado"] }).success).toBe(false);
    expect(pedidoRadarSchema.safeParse({ ...p, regioes: ["Leste"] }).success).toBe(false);
  });
});
