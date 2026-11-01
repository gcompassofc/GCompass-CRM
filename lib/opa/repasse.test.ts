// @vitest-environment node
import { describe, expect, it } from "vitest";

import { mesclarConfig, type RegraLembrete } from "./config";
import {
  avisoLigado,
  avisosDevidos,
  decidirRepasse,
  limitesDeParado,
  minutosDaRegra,
  prazosDaTrilha,
  repasseLigado,
  type EntradaRepasse,
} from "./repasse";

const config = mesclarConfig({});

describe("regras de lembrete", () => {
  it("lê o prazo do texto da regra", () => {
    expect(minutosDaRegra("20 min sem resposta")).toBe(20);
    expect(minutosDaRegra("1 h sem resposta")).toBe(60);
    expect(minutosDaRegra("Parado 7 dias")).toBeNull();
  });

  it("avisos e prazo vêm de Configurações", () => {
    expect(prazosDaTrilha(config, "pago")).toEqual({ prazoMin: 60, avisos: [20, 40] });
    expect(prazosDaTrilha(config, "organico")).toEqual({ prazoMin: 180, avisos: [20, 60, 120] });
    const curto = mesclarConfig({ prazos: { ...config.prazos, pago_min: 30 } });
    expect(prazosDaTrilha(curto, "pago").avisos).toEqual([20]);
  });

  it("devolve os avisos já vencidos da espera", () => {
    expect(avisosDevidos(config, "pago", 10)).toEqual([]);
    expect(avisosDevidos(config, "pago", 25)).toEqual([20]);
    expect(avisosDevidos(config, "pago", 45)).toEqual([20, 40]);
    expect(avisosDevidos(config, "organico", 130)).toEqual([20, 60, 120]);
  });

  it("desligar a regra na tela Lembretes desliga o aviso", () => {
    const lembretes: RegraLembrete[] = config.lembretes.map((r) => (r.id === "pago-3" ? { ...r, ativa: false } : r));
    const off = mesclarConfig({ lembretes });
    expect(avisoLigado(off, "pago", 40)).toBe(false);
    expect(avisoLigado(off, "pago", 20)).toBe(true);
    expect(avisosDevidos(off, "pago", 45)).toEqual([20]);
  });

  it("desligar 'passa para o próximo' desliga o repasse, só da trilha", () => {
    expect(repasseLigado(config, "pago")).toBe(true);
    const lembretes = config.lembretes.map((r) => (r.id === "pago-4" ? { ...r, ativa: false } : r));
    const off = mesclarConfig({ lembretes });
    expect(repasseLigado(off, "pago")).toBe(false);
    expect(repasseLigado(off, "organico")).toBe(true);
  });

  it("negócio parado vem das regras de cadência ativas", () => {
    expect(limitesDeParado(config)).toEqual([
      { etapa: "proposta", dias: 7 },
      { etapa: "negociacao", dias: 14 },
      { etapa: "fechamento", dias: 30 },
    ]);
    const alvo = config.lembretes.find((r) => r.trilha === "cadencia" && r.quando === "Parado 14 dias")!;
    const lembretes = config.lembretes.map((r) => (r.id === alvo.id ? { ...r, ativa: false } : r));
    expect(limitesDeParado(mesclarConfig({ lembretes })).map((l) => l.etapa)).toEqual(["proposta", "fechamento"]);
  });
});

describe("repasse da roleta", () => {
  const base: EntradaRepasse = {
    esperaMin: 61,
    prazoMin: 60,
    proprio: false,
    repasseLigado: true,
    donoId: "b",
    roleta: ["a", "b", "c"],
    pausados: [],
    jaTentaram: [],
  };

  it("antes do prazo não faz nada", () => {
    expect(decidirRepasse({ ...base, esperaMin: 59 })).toEqual({ tipo: "nada", motivo: "no_prazo" });
  });

  it("passa para o próximo depois do dono, na ordem da roleta", () => {
    expect(decidirRepasse(base)).toEqual({ tipo: "passar", para: "c" });
    expect(decidirRepasse({ ...base, donoId: "c" })).toEqual({ tipo: "passar", para: "a" });
  });

  it("pula quem está pausado", () => {
    expect(decidirRepasse({ ...base, pausados: ["c"] })).toEqual({ tipo: "passar", para: "a" });
  });

  it("pula quem já tentou este lead", () => {
    expect(decidirRepasse({ ...base, jaTentaram: ["c"] })).toEqual({ tipo: "passar", para: "a" });
  });

  it("lead próprio do corretor não troca", () => {
    expect(decidirRepasse({ ...base, proprio: true })).toEqual({ tipo: "nada", motivo: "proprio" });
  });

  it("repasse desligado não troca", () => {
    expect(decidirRepasse({ ...base, repasseLigado: false })).toEqual({ tipo: "nada", motivo: "desligado" });
  });

  it("quando todos já tentaram, escala para a gestão", () => {
    expect(decidirRepasse({ ...base, jaTentaram: ["a", "c"] })).toEqual({ tipo: "escalar" });
    expect(decidirRepasse({ ...base, pausados: ["a", "c"] })).toEqual({ tipo: "escalar" });
    expect(decidirRepasse({ ...base, roleta: [] })).toEqual({ tipo: "escalar" });
  });

  it("dono fora da roleta: começa do primeiro disponível", () => {
    expect(decidirRepasse({ ...base, donoId: "gerente" })).toEqual({ tipo: "passar", para: "a" });
  });
});
