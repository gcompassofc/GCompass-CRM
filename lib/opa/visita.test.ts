// @vitest-environment node
import { describe, expect, it } from "vitest";

import { PADRAO } from "./config";
import { faltaNaFicha } from "./visita";

const form = (v: Record<string, string>) => (k: string) => v[k] ?? "";
const completa = { quando: "2026-11-02T10:00", imovel: "OPA-1", interesse: "4", gostou: "vista", nao_gostou: "preço", proximo: "Segunda visita" };

describe("ficha de visita: obrigatórios de Configurações", () => {
  it("ficha completa passa", () => {
    expect(faltaNaFicha(PADRAO.ficha_visita, form(completa), "feita")).toBeNull();
  });

  it("lista o que falta pelo rótulo da configuração", () => {
    expect(faltaNaFicha(PADRAO.ficha_visita, form({ ...completa, gostou: " ", interesse: "" }), "feita")).toBe(
      "Falta preencher: Interesse depois da visita (1 a 5), O que gostou.",
    );
  });

  it("campo que a empresa tornou opcional deixa de ser cobrado", () => {
    const campos = PADRAO.ficha_visita.map((c) => (c.chave === "naogostou" ? { ...c, obrigatorio: false } : c));
    expect(faltaNaFicha(campos, form({ ...completa, nao_gostou: "" }), "feita")).toBeNull();
  });

  it("campo que a empresa tornou obrigatório passa a ser cobrado", () => {
    const campos = PADRAO.ficha_visita.map((c) => (c.chave === "quem" ? { ...c, obrigatorio: true } : c));
    expect(faltaNaFicha(campos, form(completa), "feita")).toBe("Falta preencher: Quem foi.");
  });

  it("visita só agendada cobra apenas data e imóvel", () => {
    expect(faltaNaFicha(PADRAO.ficha_visita, form({ quando: "2026-11-05T10:00", imovel: "OPA-1" }), "agendada")).toBeNull();
    expect(faltaNaFicha(PADRAO.ficha_visita, form({ quando: "2026-11-05T10:00" }), "agendada")).toBe("Falta preencher: Imóvel visitado.");
  });

  it("campo extra criado pela empresa, sem coluna, não trava", () => {
    const campos = [...PADRAO.ficha_visita, { chave: "campo_11", rotulo: "Extra", obrigatorio: true }];
    expect(faltaNaFicha(campos, form(completa), "feita")).toBeNull();
  });
});
