// @vitest-environment node
import { describe, expect, it } from "vitest";

import { noIntervalo, resolverPeriodo, rotuloIntervalo } from "./periodo";

// 30/10/2026 15h em São Paulo
const AGORA = Date.parse("2026-10-30T15:00:00-03:00");

describe("período dos números", () => {
  it("sem nada na URL, são os últimos 7 dias contando hoje", () => {
    const p = resolverPeriodo({}, AGORA);
    expect([p.chave, p.deDia, p.ateDia, p.dias, p.rotulo]).toEqual(["7d", "2026-10-24", "2026-10-30", 7, "7 dias"]);
  });

  it("aceita o link antigo ?periodo=30", () => {
    expect(resolverPeriodo({ periodo: "30" }, AGORA).deDia).toBe("2026-10-01");
  });

  it("este mês vai do dia 1 até hoje; mês passado é o mês inteiro", () => {
    expect(resolverPeriodo({ periodo: "mes" }, AGORA).deDia).toBe("2026-10-01");
    const p = resolverPeriodo({ periodo: "mes-passado" }, AGORA);
    expect([p.deDia, p.ateDia, p.dias]).toEqual(["2026-09-01", "2026-09-30", 30]);
  });

  it("mês passado em janeiro é dezembro do ano anterior", () => {
    const p = resolverPeriodo({ periodo: "mes-passado" }, Date.parse("2027-01-10T10:00:00-03:00"));
    expect([p.deDia, p.ateDia]).toEqual(["2026-12-01", "2026-12-31"]);
  });

  it("personalizado usa as datas e mostra o intervalo no botão", () => {
    const p = resolverPeriodo({ periodo: "personalizado", de: "2026-10-01", ate: "2026-10-15" }, AGORA);
    expect([p.chave, p.dias, p.rotulo]).toEqual(["personalizado", 15, "1 a 15 out"]);
    expect(p.anterior.ate).toBe(p.de);
    expect(p.de - p.anterior.de).toBe(p.ate - p.de);
  });

  it("personalizado com data trocada, no futuro ou inválida cai em 7 dias", () => {
    expect(resolverPeriodo({ periodo: "personalizado", de: "2026-10-15", ate: "2026-10-01" }, AGORA).chave).toBe("7d");
    expect(resolverPeriodo({ periodo: "personalizado", de: "2026-10-01", ate: "2026-12-01" }, AGORA).chave).toBe("7d");
    expect(resolverPeriodo({ periodo: "personalizado", de: "x", ate: "2026-10-01" }, AGORA).chave).toBe("7d");
  });

  it("o último dia entra inteiro, até 23h59 de São Paulo", () => {
    const p = resolverPeriodo({ periodo: "hoje" }, AGORA);
    expect(noIntervalo("2026-10-30T23:59:00-03:00", p)).toBe(true);
    expect(noIntervalo("2026-10-31T00:00:00-03:00", p)).toBe(false);
    expect(noIntervalo("2026-10-29T23:59:00-03:00", p)).toBe(false);
  });

  it("rótulos de intervalo entre meses e anos", () => {
    expect(rotuloIntervalo("2026-09-28", "2026-10-03")).toBe("28 set a 3 out");
    expect(rotuloIntervalo("2025-12-20", "2026-01-05")).toBe("20 dez 2025 a 5 jan 2026");
  });
});
