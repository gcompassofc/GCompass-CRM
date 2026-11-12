import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/opa/eventos-lead", () => ({ avisarLeadCriado: vi.fn() }));

import { esperaDesde, saidaDoCorretor } from "./atendimento";
import { montarOrigem } from "./entrada";

const criado = "2026-11-06T22:53:00.000Z";
const bv = "2026-11-06T22:53:40.000Z";

describe("boas-vindas entregue: o lead só espera depois de responder (12/11/2026)", () => {
  it("só a boas-vindas saiu e o lead não respondeu: não está esperando, nada de aviso", () => {
    const d = esperaDesde({ status: "open", criadoEm: criado, atribuidoEm: criado, temConversa: true, ultimaMensagemEm: bv, ultimaSaidaEm: "2026-11-06T22:53:39.000Z", boasVindasEm: bv, boasVindasEntregue: true });
    expect(d).toBeNull();
  });

  it("o lead respondeu à boas-vindas: espera desde a resposta dele", () => {
    const d = esperaDesde({
      status: "open",
      criadoEm: criado,
      atribuidoEm: criado,
      temConversa: true,
      ultimaEntradaEm: "2026-11-06T23:10:00.000Z",
      ultimaSaidaEm: "2026-11-06T22:53:39.000Z",
      boasVindasEm: bv,
      boasVindasEntregue: true,
    });
    expect(d).toBe(Date.parse("2026-11-06T23:10:00.000Z"));
  });

  it("o lead preencheu o formulário de novo depois da boas-vindas: volta a esperar desde a volta", () => {
    const voltou = "2026-11-07T10:00:00.000Z";
    const d = esperaDesde({ status: "open", criadoEm: criado, atribuidoEm: criado, temConversa: true, ultimaMensagemEm: bv, ultimaSaidaEm: "2026-11-06T22:53:39.000Z", boasVindasEm: bv, boasVindasEntregue: true, voltouEm: voltou });
    expect(d).toBe(Date.parse(voltou));
  });

  it("o corretor respondeu depois: saiu da fila", () => {
    const d = esperaDesde({ status: "open", criadoEm: criado, atribuidoEm: criado, temConversa: true, ultimaEntradaEm: "2026-11-06T23:10:00.000Z", ultimaSaidaEm: "2026-11-06T23:20:00.000Z", boasVindasEm: bv, boasVindasEntregue: true });
    expect(d).toBeNull();
  });
});

describe("boas-vindas que não chegou (falhou) não é resposta do corretor", () => {
  it("só a boas-vindas saiu: o lead segue esperando desde que entrou", () => {
    const d = esperaDesde({ status: "open", criadoEm: criado, atribuidoEm: criado, temConversa: true, ultimaMensagemEm: bv, ultimaSaidaEm: "2026-11-06T22:53:39.000Z", boasVindasEm: bv });
    expect(d).toBe(Date.parse(criado));
  });

  it("o lead respondeu à boas-vindas: o relógio continua o da chegada", () => {
    const d = esperaDesde({
      status: "open",
      criadoEm: criado,
      atribuidoEm: criado,
      temConversa: true,
      ultimaEntradaEm: "2026-11-06T23:10:00.000Z",
      ultimaSaidaEm: "2026-11-06T22:53:39.000Z",
      boasVindasEm: bv,
    });
    expect(d).toBe(Date.parse(criado));
  });

  it("o corretor escreveu depois: saiu da fila", () => {
    const d = esperaDesde({ status: "open", criadoEm: criado, atribuidoEm: criado, temConversa: true, ultimaSaidaEm: "2026-11-06T23:20:00.000Z", boasVindasEm: bv });
    expect(d).toBeNull();
    expect(saidaDoCorretor("2026-11-06T22:53:39.000Z", bv)).toBeNull();
    expect(saidaDoCorretor("2026-11-06T23:20:00.000Z", bv)).toBe("2026-11-06T23:20:00.000Z");
  });

  it("sem boas-vindas, nada muda", () => {
    expect(esperaDesde({ status: "open", criadoEm: criado, temConversa: true, ultimaSaidaEm: "2026-11-06T22:54:00.000Z" })).toBeNull();
  });
});

describe("origem do lead do formulário", () => {
  it("guarda nomes para o corretor e ids para o painel (corpo do painel de 06/11)", () => {
    expect(
      montarOrigem({
        nome: "Aristides",
        telefone: "11999999999",
        origem: "meta",
        campanha: "[CADASTRO ENGENHO CA006944]",
        conjunto: "CJ01 | Ilhabela",
        anuncio: "AD04 | EST | ca006944-f4-julho-tambem | v1",
        campanhaId: "120230000000000001",
        conjuntoId: "120230000000000002",
        anuncioId: "120230000000000003",
      }),
    ).toEqual({
      canal: "meta",
      campanha: "[CADASTRO ENGENHO CA006944]",
      conjunto: "CJ01 | Ilhabela",
      anuncio: "AD04 | EST | ca006944-f4-julho-tambem | v1",
      campanha_id: "120230000000000001",
      conjunto_id: "120230000000000002",
      anuncio_id: "120230000000000003",
    });
  });

  it("id sem nome não aparece como nome; UTM de texto do site vale como nome", () => {
    const o = montarOrigem({ nome: "x", telefone: "1", origem: "site", campanhaId: "bio-perfil", anuncioId: "120230000000000003" });
    expect(o.campanha).toBe("bio-perfil");
    expect(o.anuncio).toBeNull();
    expect(o.anuncio_id).toBe("120230000000000003");
  });

  it("lead do WhatsApp do corretor leva via whatsapp", () => {
    expect(montarOrigem({ nome: "x", telefone: "", origem: "meta", via: "whatsapp" }).via).toBe("whatsapp");
  });
});
