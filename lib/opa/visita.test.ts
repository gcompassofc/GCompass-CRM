// @vitest-environment node
import { describe, expect, it } from "vitest";

import { PADRAO } from "./config";
import { conferirDataETexto, faltaNaFicha } from "./visita";

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

describe("conferirDataETexto (F5)", () => {
  const agora = Date.parse("2026-11-01T15:00:00-03:00");
  const campos = (v: Record<string, string>) => (k: string) => v[k] ?? "";

  it("aceita visita feita agora, no fuso de Ilhabela", () => {
    const r = conferirDataETexto(campos({ quando: "2026-11-01T14:30" }), "feita", agora);
    expect(r).toEqual({ ok: true, quandoMs: Date.parse("2026-11-01T14:30:00-03:00") });
  });

  it("recusa sem data, data inválida, feita no futuro e mais de 90 dias atrás", () => {
    expect(conferirDataETexto(campos({}), "feita", agora)).toMatchObject({ ok: false, erro: "Informe a data e a hora." });
    expect(conferirDataETexto(campos({ quando: "amanhã" }), "feita", agora)).toMatchObject({ ok: false, erro: "Data inválida." });
    expect(conferirDataETexto(campos({ quando: "2026-11-02T10:00" }), "feita", agora)).toMatchObject({ ok: false });
    expect(conferirDataETexto(campos({ quando: "2026-07-01T10:00" }), "feita", agora)).toMatchObject({ ok: false });
  });

  it("agendada pode ficar no futuro", () => {
    expect(conferirDataETexto(campos({ quando: "2026-11-05T10:00" }), "agendada", agora).ok).toBe(true);
  });

  it("recusa telefone escrito no texto da ficha", () => {
    const r = conferirDataETexto(campos({ quando: "2026-11-01T14:30", obs: "ligar no (12) 99123-4567" }), "feita", agora);
    expect(r).toMatchObject({ ok: false });
  });
});

describe("conferirDataETexto não confunde preço ou data com telefone", () => {
  const agora = Date.parse("2026-11-01T15:00:00-03:00");
  it("aceita valor e data no texto", () => {
    const r = conferirDataETexto(
      (k) => ({ quando: "2026-11-01T14:30", obs: "Pediu R$ 1.200.000,00 e volta em 15/11/2026 às 10h" })[k] ?? "",
      "feita",
      agora,
    );
    expect(r.ok).toBe(true);
  });
});
