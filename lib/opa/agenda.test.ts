import { describe, expect, it } from "vitest";

import { agruparAgenda, diaFalado, horaSP, quandoSimples, textoSimples } from "./agenda";

// 01/11/2026 15:00 em São Paulo (18:00 UTC).
const AGORA = Date.parse("2026-11-01T18:00:00Z");

describe("agruparAgenda", () => {
  const itens = [
    { id: "a", quando: "2026-11-01T20:00:00Z", status: "pendente" }, // hoje 17h
    { id: "b", quando: "2026-11-01T12:00:00Z", status: "pendente" }, // hoje 9h, já passou: sai agora
    { id: "c", quando: "2026-11-02T12:00:00Z", status: "pendente" }, // amanhã
    { id: "d", quando: "2026-11-02T02:30:00Z", status: "enviando" }, // 01/11 23h30 em SP: ainda hoje
    { id: "e", quando: "2026-10-30T12:00:00Z", status: "enviado" },
    { id: "f", quando: "2026-10-31T12:00:00Z", status: "falhou" },
    { id: "g", quando: "2026-11-05T12:00:00Z", status: "cancelado" },
  ];

  it("separa hoje (inclui o que já passou), próximos e já saíram", () => {
    const g = agruparAgenda(itens, AGORA);
    expect(g.hoje.map((i) => i.id)).toEqual(["b", "a", "d"]);
    expect(g.proximos.map((i) => i.id)).toEqual(["c"]);
    expect(g.saiu.map((i) => i.id)).toEqual(["f", "e"]);
  });

  it("cancelado não aparece em lugar nenhum", () => {
    const g = agruparAgenda(itens, AGORA);
    expect([...g.hoje, ...g.proximos, ...g.saiu].some((i) => i.id === "g")).toBe(false);
  });

  it("lista vazia dá três grupos vazios", () => {
    expect(agruparAgenda([], AGORA)).toEqual({ hoje: [], proximos: [], saiu: [] });
  });
});

describe("diaFalado e horaSP", () => {
  it("usa o dia de São Paulo", () => {
    expect(diaFalado("2026-11-01T20:00:00Z", AGORA)).toBe("Hoje");
    expect(diaFalado("2026-11-02T02:30:00Z", AGORA)).toBe("Hoje");
    expect(diaFalado("2026-11-02T12:00:00Z", AGORA)).toBe("Amanhã");
    expect(diaFalado("2026-10-31T12:00:00Z", AGORA)).toBe("Ontem");
    expect(diaFalado("2026-11-05T12:00:00Z", AGORA)).toMatch(/^qui, 05\/11$/);
    expect(horaSP("2026-11-02T12:00:00Z")).toBe("09:00");
  });
});

describe("quandoSimples", () => {
  it("troca o código de dia por palavras", () => {
    expect(quandoSimples("D1, 9h")).toBe("Dia 1, às 9h");
    expect(quandoSimples("D3, 17h")).toBe("Dia 3, às 17h");
    expect(quandoSimples("D7, D14, D21, D28")).toBe("Dias 7, 14, 21 e 28");
    expect(quandoSimples("D+2")).toBe("Dia 2");
  });

  it("deixa o resto como está", () => {
    expect(quandoSimples("Véspera, 18h")).toBe("Véspera, 18h");
    expect(quandoSimples("20 min sem resposta")).toBe("20 min sem resposta");
    expect(quandoSimples("Parado 7 dias")).toBe("Parado 7 dias");
  });
});

describe("textoSimples", () => {
  it("tira o código de dia do texto da regra", () => {
    expect(textoSimples("Mandar uma pergunta fácil (modelo D1 do kit)")).toBe("Mandar uma pergunta fácil (modelo do dia 1 do kit)");
    expect(textoSimples("Lembrar no D2")).toBe("Lembrar no dia 2");
    expect(textoSimples("Sem código aqui")).toBe("Sem código aqui");
  });
});
