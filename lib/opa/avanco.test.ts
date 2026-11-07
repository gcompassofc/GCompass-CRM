import { describe, expect, it } from "vitest";

import { decidirAvanco, diagnosticoFeito, type EtapaSimples } from "./avanco";

const e = (slug: string, posicao: number, x: Partial<EtapaSimples> = {}): EtapaSimples => ({ id: slug, slug, nome: slug, posicao, ganho: false, perdido: false, ...x });
const etapas = [
  e("lead-recebido", 1000),
  e("primeiro-contato", 2000),
  e("diagnostico", 3000),
  e("selecao", 4000),
  e("visita-agendada", 5000),
  e("sem-momento", 10000),
  e("vendido", 11000, { ganho: true }),
  e("perdido", 12000, { perdido: true }),
];
const decidir = (atualId: string, destinoSlug: string, diagnosticoCompleto = false, status = "open") =>
  decidirAvanco({ etapas, atualId, destinoSlug, status, diagnosticoCompleto })?.slug ?? null;

describe("etapa que anda sozinha", () => {
  it("primeira resposta tira de Lead recebido", () => {
    expect(decidir("lead-recebido", "primeiro-contato")).toBe("primeiro-contato");
  });

  it("nunca volta o card", () => {
    expect(decidir("selecao", "primeiro-contato", true)).toBeNull();
    expect(decidir("diagnostico", "diagnostico", true)).toBeNull();
  });

  it("não passa de Diagnóstico feito sem os 4 campos", () => {
    expect(decidir("primeiro-contato", "diagnostico", false)).toBeNull();
    expect(decidir("primeiro-contato", "selecao", false)).toBeNull();
    expect(decidir("lead-recebido", "diagnostico", true)).toBe("diagnostico");
    expect(decidir("primeiro-contato", "selecao", true)).toBe("selecao");
  });

  it("não mexe em Sem momento, ganho, perdido ou lead encerrado", () => {
    expect(decidir("sem-momento", "selecao", true)).toBeNull();
    expect(decidir("vendido", "selecao", true)).toBeNull();
    expect(decidir("perdido", "primeiro-contato")).toBeNull();
    expect(decidir("lead-recebido", "primeiro-contato", false, "lost")).toBeNull();
  });

  it("diagnóstico completo só com os 4 preenchidos", () => {
    expect(diagnosticoFeito({ finalidade: "Ainda não sei", regiao: "Norte", momento: "1 ano", inegociavel: "Vista" })).toBe(true);
    expect(diagnosticoFeito({ finalidade: "Ainda não sei", regiao: " ", momento: "1 ano", inegociavel: "Vista" })).toBe(false);
  });
});
