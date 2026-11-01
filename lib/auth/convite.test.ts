import { describe, expect, it } from "vitest";

import { papeisQueConvida, podeConvidarComo } from "./convite";

describe("papéis que cada um pode convidar", () => {
  it("administrador convida qualquer papel humano", () => {
    for (const p of ["agent", "viewer", "manager", "admin"]) expect(podeConvidarComo("admin", p)).toBe(true);
  });

  it("gerente convida só corretor", () => {
    expect(papeisQueConvida("manager")).toEqual(["agent"]);
    expect(podeConvidarComo("manager", "agent")).toBe(true);
    expect(podeConvidarComo("manager", "manager")).toBe(false);
    expect(podeConvidarComo("manager", "admin")).toBe(false);
    expect(podeConvidarComo("manager", "viewer")).toBe(false);
  });

  it("corretor, leitura e agente de IA não convidam ninguém", () => {
    for (const q of ["agent", "viewer", "ai_operator"] as const) expect(papeisQueConvida(q)).toEqual([]);
  });

  it("papel desconhecido nunca passa", () => {
    expect(podeConvidarComo("admin", "ai_operator")).toBe(false);
    expect(podeConvidarComo("admin", "")).toBe(false);
  });
});
