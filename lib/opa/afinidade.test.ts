// @vitest-environment node
import { describe, expect, it } from "vitest";

import { afinidade, PESOS_PADRAO, type Imovel } from "./imoveis";

const imovel = {
  codigo: "OPA-1",
  bairro: "Curral",
  regiao: "Sul",
  preco_venda_cents: 150_000_000,
  suites: 4,
  caracteristicas: ["piscina", "frente mar"],
  descricao: null,
  status: "ativo",
} as unknown as Imovel;

const perfil = { regiao: "Curral", faixa: "R$ 1 a 2 mi", suites: "3 suítes", estilo_vida: "piscina praia" };

describe("afinidade lead x imóvel", () => {
  it("com os pesos padrão chega a 100", () => {
    expect(afinidade(imovel, perfil).pontos).toBe(100);
    expect(afinidade(imovel, perfil, PESOS_PADRAO).pontos).toBe(100);
  });

  it("os pesos da empresa mudam a conta: bairro vale mais, o resto menos", () => {
    const pesos = { bairro: 50, preco: 10, suites: 10, atributos: 10, demanda: 10 };
    expect(afinidade(imovel, perfil, pesos).pontos).toBe(90);
    // bairro errado perde o peso inteiro do bairro
    expect(afinidade(imovel, { ...perfil, regiao: "Armação" }, pesos).pontos).toBe(40);
  });

  it("peso zero apaga o critério", () => {
    expect(afinidade(imovel, perfil, { ...PESOS_PADRAO, demanda: 0 }).pontos).toBe(90);
  });
});
