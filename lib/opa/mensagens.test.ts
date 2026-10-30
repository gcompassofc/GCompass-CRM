// @vitest-environment node
import { describe, expect, it } from "vitest";

import { mensagemSelecao, type ItemSelecao } from "./mensagens";

const casa = (n: number, extra: Partial<ItemSelecao> = {}): ItemSelecao => ({
  codigo: `CA00${n}`,
  titulo: `Casa ${n} no Curral`,
  bairro: "Curral",
  preco: `R$ ${n} mi`,
  url: `https://opailhabela.com.br/imovel/casa-${n}/`,
  offMarket: false,
  ...extra,
});

describe("mensagemSelecao", () => {
  it("junta até 3 imóveis com link, no tom do kit", () => {
    const t = mensagemSelecao({ nome: "Helena Prado", inegociavel: "Vista para o mar", itens: [casa(1), casa(2), casa(3), casa(4)] });
    expect(t).toMatch(/^Helena, separei três opções que combinam com o que você me contou \(vista para o mar\)\./);
    expect(t).toContain("https://opailhabela.com.br/imovel/casa-3/");
    expect(t).not.toContain("casa-4");
    expect(t).toMatch(/Qual delas você quer ver de perto\?$/);
    expect(t).not.toMatch(/!|—/);
  });

  it("off market vai sem link e sem valor por escrito", () => {
    const t = mensagemSelecao({ nome: "Otávio", itens: [casa(1, { offMarket: true, bairro: "Siriúba" }), casa(2)] });
    expect(t).toContain("No Siriúba fora dos portais");
    expect(t).not.toContain("casa-1");
    expect(t).not.toContain("R$ 1 mi");
    expect(t).toContain("R$ 2 mi");
  });

  it("uma opção só pergunta se quer ver", () => {
    expect(mensagemSelecao({ nome: "Bruno", itens: [casa(1)] })).toMatch(/uma opção.*Quer ver de perto\?$/s);
  });
});
