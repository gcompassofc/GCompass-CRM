// @vitest-environment node
import { describe, expect, it } from "vitest";

import { mesclarConfig, type RegraLembrete } from "./config";
import {
  aguardaPrimeiraResposta,
  avisoLigado,
  avisosDevidos,
  avisosLigados,
  decidirRepasse,
  destinoDoLembrete,
  limitesDeParado,
  minutosDaRegra,
  prazosDaTrilha,
  repasseLiberado,
  repasseLigado,
  roletaDaEquipe,
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

  it("quem saiu da equipe some da roleta e nunca recebe repasse (C1)", () => {
    const equipe = new Set(["a", "b"]);
    const roleta = roletaDaEquipe(["a", "b", "c"], equipe);
    expect(roleta).toEqual(["a", "b"]);
    // "c" saiu: o lead de "b" vai para "a", não para "c".
    expect(decidirRepasse({ ...base, roleta })).toEqual({ tipo: "passar", para: "a" });
    // só sobrou o dono: a gestão decide.
    expect(decidirRepasse({ ...base, roleta: roletaDaEquipe(["b", "c"], equipe) })).toEqual({ tipo: "escalar" });
  });
});

describe("primeira resposta (A2)", () => {
  const criado = "2026-11-01T12:00:00.000Z";

  it("lead que nunca teve resposta aguarda o primeiro atendimento", () => {
    expect(aguardaPrimeiraResposta({ criadoEm: criado })).toBe(true);
  });

  it("mensagem do corretor depois que o lead entrou: já foi atendido", () => {
    expect(aguardaPrimeiraResposta({ criadoEm: criado, ultimaSaidaEm: "2026-11-01T12:30:00.000Z" })).toBe(false);
  });

  it("mensagem do corretor de antes do lead existir (conversa antiga) não conta", () => {
    expect(aguardaPrimeiraResposta({ criadoEm: criado, ultimaSaidaEm: "2026-10-20T09:00:00.000Z" })).toBe(true);
  });

  it("'Respondi' ou ligação: já foi atendido, mesmo que o cliente escreva de novo", () => {
    expect(aguardaPrimeiraResposta({ criadoEm: criado, respondidoEm: "2026-11-01T12:10:00.000Z" })).toBe(false);
  });
});

describe("repasse só depois de aviso entregue (C4)", () => {
  it("sem aviso entregue, não passa adiante", () => {
    expect(repasseLiberado({ avisoSaiu: false, avisosDaTrilha: 2 })).toBe(false);
  });

  it("com algum aviso entregue, passa", () => {
    expect(repasseLiberado({ avisoSaiu: true, avisosDaTrilha: 2 })).toBe(true);
  });

  it("trilha sem aviso ligado não depende de aviso", () => {
    expect(repasseLiberado({ avisoSaiu: false, avisosDaTrilha: 0 })).toBe(true);
  });

  it("conta só os avisos ligados da trilha", () => {
    expect(avisosLigados(config, "pago")).toEqual(avisosDevidos(config, "pago", 10_000));
  });
});

describe("lembrete agendado depois da tentativa (C3)", () => {
  it("enviado confirma", () => {
    expect(destinoDoLembrete("enviado", 1, true, 3)).toBe("enviado");
  });

  it("erro do WhatsApp é ambíguo: não reenvia", () => {
    expect(destinoDoLembrete("erro", 1, true, 3)).toBe("falhou");
  });

  it("sem sessão ou sem número volta para a fila até o limite", () => {
    expect(destinoDoLembrete("sem_sessao", 1, true, 3)).toBe("pendente");
    expect(destinoDoLembrete("sem_numero", 2, true, 3)).toBe("pendente");
    expect(destinoDoLembrete("sem_numero", 3, true, 3)).toBe("falhou");
  });

  it("sem destinatário, desiste", () => {
    expect(destinoDoLembrete("sem_numero", 1, false, 3)).toBe("falhou");
  });
});
