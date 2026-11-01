// @vitest-environment node
import { describe, expect, it } from "vitest";

import { diasDaSemana, esperaDesde, esperaEmMinutos, minutosUteis, quandoVolta, situacaoDoRelogio } from "./atendimento";
import { PADRAO } from "./config";

const H = PADRAO.horario; // seg a sex 08 às 19, sáb 09 às 14, domingo fechado
const sp = (s: string) => Date.parse(`${s}-03:00`);

describe("dias da semana do horário", () => {
  it("lê faixa, dia solto e 'domingo e feriado'", () => {
    expect([...diasDaSemana("Segunda a sexta")].sort()).toEqual([1, 2, 3, 4, 5]);
    expect([...diasDaSemana("Sábado")]).toEqual([6]);
    expect([...diasDaSemana("Domingo e feriado")]).toEqual([0]);
    expect([...diasDaSemana("Sexta a segunda")].sort()).toEqual([0, 1, 5, 6]);
    expect([...diasDaSemana("terça-feira e quinta-feira")].sort()).toEqual([2, 4]);
  });
});

describe("o relógio está contando agora?", () => {
  it("dentro do expediente conta", () => {
    expect(situacaoDoRelogio(sp("2026-11-02T10:00"), H)).toEqual({ aberto: true });
  });

  it("segunda antes das 8h volta às 8h do mesmo dia", () => {
    expect(situacaoDoRelogio(sp("2026-11-02T06:30"), H)).toEqual({ aberto: false, voltaMs: sp("2026-11-02T08:00") });
  });

  it("segunda às 19h em ponto já está fora e volta terça às 8h", () => {
    expect(situacaoDoRelogio(sp("2026-11-02T19:00"), H)).toEqual({ aberto: false, voltaMs: sp("2026-11-03T08:00") });
  });

  it("sábado depois das 14h e domingo voltam na segunda às 8h", () => {
    expect(situacaoDoRelogio(sp("2026-11-07T15:00"), H)).toEqual({ aberto: false, voltaMs: sp("2026-11-09T08:00") });
    expect(situacaoDoRelogio(sp("2026-11-08T11:00"), H)).toEqual({ aberto: false, voltaMs: sp("2026-11-09T08:00") });
  });

  it("diz quando volta em palavras", () => {
    expect(quandoVolta(sp("2026-11-02T08:00"), sp("2026-11-02T06:30"))).toBe("hoje às 08:00");
    expect(quandoVolta(sp("2026-11-03T08:00"), sp("2026-11-02T19:30"))).toBe("amanhã às 08:00");
    expect(quandoVolta(sp("2026-11-09T08:00"), sp("2026-11-07T15:00"))).toBe("segunda às 08:00");
  });

  it("sem nenhum dia aberto o relógio conta sempre", () => {
    expect(situacaoDoRelogio(sp("2026-11-08T11:00"), H.map((d) => ({ ...d, aberto: false })))).toEqual({ aberto: true });
  });
});

describe("minutos dentro do horário de atendimento", () => {
  it("dentro do expediente conta corrido", () => {
    expect(minutosUteis(sp("2026-11-02T10:00"), sp("2026-11-02T10:45"), H)).toBe(45);
  });

  it("lead das 22h só começa a esperar às 8h do dia seguinte", () => {
    // segunda 22h até terça 8h30: 30 min
    expect(esperaEmMinutos(sp("2026-11-02T22:00"), sp("2026-11-03T08:30"), H)).toBe(30);
  });

  it("de sexta à noite até segunda cedo, o fim de semana não conta", () => {
    // sexta 18h30 a segunda 8h20: 30 min da sexta + sábado 09 às 14 (300) + 20 min de segunda
    expect(esperaEmMinutos(sp("2026-11-06T18:30"), sp("2026-11-09T08:20"), H)).toBe(30 + 300 + 20);
  });

  it("domingo inteiro e dia fechado não contam", () => {
    expect(minutosUteis(sp("2026-11-08T08:00"), sp("2026-11-08T19:00"), H)).toBe(0);
  });

  it("usa o horário que a empresa configurou", () => {
    const so = [{ dias: "Segunda a sexta", abre: "09:00", fecha: "12:00", aberto: true }];
    expect(esperaEmMinutos(sp("2026-11-02T08:00"), sp("2026-11-02T18:00"), so)).toBe(180);
  });

  it("sem nenhum dia aberto, volta aos minutos corridos para a fila não congelar", () => {
    const fechado = [{ dias: "Segunda a sexta", abre: "", fecha: "", aberto: false }];
    expect(esperaEmMinutos(sp("2026-11-02T10:00"), sp("2026-11-02T11:00"), fechado)).toBe(60);
  });

  it("intervalo invertido ou vazio dá zero", () => {
    expect(minutosUteis(sp("2026-11-02T11:00"), sp("2026-11-02T10:00"), H)).toBe(0);
  });
});

describe("desde quando o lead espera", () => {
  const base = { status: "open" as const, criadoEm: "2026-11-02T09:00:00-03:00", temConversa: true };

  it("mensagem do lead sem resposta depois dela", () => {
    expect(esperaDesde({ ...base, ultimaEntradaEm: "2026-11-02T10:00:00-03:00", ultimaSaidaEm: "2026-11-02T09:30:00-03:00" })).toBe(sp("2026-11-02T10:00"));
  });

  it("corretor respondeu depois: não espera", () => {
    expect(esperaDesde({ ...base, ultimaEntradaEm: "2026-11-02T10:00:00-03:00", ultimaSaidaEm: "2026-11-02T10:05:00-03:00" })).toBeNull();
  });

  it("'Respondi' ou ligação depois da mensagem tira da fila", () => {
    expect(esperaDesde({ ...base, ultimaEntradaEm: "2026-11-02T10:00:00-03:00", respondidoEm: "2026-11-02T10:10:00-03:00" })).toBeNull();
  });

  it("lead novo sem conversa espera desde a criação", () => {
    expect(esperaDesde({ ...base, temConversa: false })).toBe(sp("2026-11-02T09:00"));
  });

  it("lead novo sem conversa e já respondido não espera", () => {
    expect(esperaDesde({ ...base, temConversa: false, respondidoEm: "2026-11-02T09:20:00-03:00" })).toBeNull();
  });

  it("lead ganho ou perdido sem conversa não espera", () => {
    expect(esperaDesde({ ...base, status: "won", temConversa: false })).toBeNull();
  });

  it("voltou por formulário: espera desde a volta mesmo com o corretor tendo falado por último", () => {
    expect(
      esperaDesde({
        ...base,
        voltouEm: "2026-11-02T11:00:00-03:00",
        ultimaMensagemEm: "2026-11-02T10:00:00-03:00",
        ultimaSaidaEm: "2026-11-02T10:00:00-03:00",
      }),
    ).toBe(sp("2026-11-02T11:00"));
  });

  it("repasse recomeça o relógio na atribuição, a entrega inicial não", () => {
    const parado = { ...base, ultimaEntradaEm: "2026-11-02T10:00:00-03:00" };
    expect(esperaDesde({ ...parado, atribuidoEm: "2026-11-02T09:00:20-03:00" })).toBe(sp("2026-11-02T10:00"));
    expect(esperaDesde({ ...parado, atribuidoEm: "2026-11-02T11:00:00-03:00" })).toBe(sp("2026-11-02T11:00"));
  });
});
