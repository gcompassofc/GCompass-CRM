import { describe, expect, it } from "vitest";

import {
  abaDoCard,
  acharCorretor,
  avisoDevidoRadar,
  bairroLegivel,
  lerRegistroRadar,
  precoCurto,
  situacaoRadar,
  textoAvisoRadar,
  tipoLegivel,
  tipoSemBairro,
} from "./radar-captacoes";

const DIA = 86_400_000;
const AGORA = Date.parse("2026-11-09T15:00:00Z");

function registro() {
  return {
    versao: 1,
    corretores: [
      { id: "luana", nome: "Luana" },
      { id: "martin", nome: "Martin" },
    ],
    distribuicoes: [
      {
        id: 21,
        corretor: "luana",
        origem: "rodada de 2026-11-07",
        imovel: {
          sigla: "MOMENTO",
          codigo: "CA1494",
          tipo: "Casa",
          bairro: "Praia Grande",
          regiao: "Sul",
          preco_anunciado: 3180000,
          quartos: 4,
          suites: 4,
          area_construida: null,
          fonte: "Momento Terra",
          link: "https://www.momentoterra.com.br/imovel/x/CA1494",
          motivo: "novo que a OPA não tem",
          primeira_vez: "2026-11-07",
          precos: [{ data: "2026-11-07", preco: 3180000 }],
          outros: [{ fonte: "Vila Bela Imóveis", url: "https://vilabela.example/1", preco_anunciado: 3180000 }],
        },
      },
      {
        id: 29,
        corretor: "martin",
        imovel: {
          sigla: "CAPEL",
          codigo: "CA00530",
          tipo: "Casa - Santa Tereza",
          bairro: "Santa Tereza",
          regiao: "Centro e Vila",
          preco_anunciado: 4000000,
          fonte: "Capela Imobiliária",
          link: "https://www.capelailhabela.com.br/x/11982530",
        },
      },
      {
        // Preparada e nunca enviada: fica de fora.
        id: 31,
        corretor: "luana",
        imovel: { sigla: "X", codigo: "1", fonte: "X", link: "https://x.example/1" },
      },
    ],
    eventos: [
      { distribuicao: 21, tipo: "preparada", em: "2026-11-09T12:09:06Z" },
      { distribuicao: 21, tipo: "enviada", em: "2026-11-09T12:33:25Z" },
      { distribuicao: 29, tipo: "enviada", em: "2026-11-09T12:33:25Z" },
      { distribuicao: 31, tipo: "preparada", em: "2026-11-09T12:09:06Z" },
    ],
  };
}

describe("lerRegistroRadar", () => {
  it("traz só as distribuições enviadas, com o anúncio e a data do envio", () => {
    const d = lerRegistroRadar(registro());
    expect(d.map((x) => x.radar.dist)).toEqual(["D21", "D29"]);
    expect(d[0]!).toMatchObject({ corretor: "Luana", titulo: "Casa · Praia Grande" });
    expect(d[0]!.radar).toMatchObject({ imobiliaria: "Momento Terra", codigo: "CA1494", preco_anunciado: 3180000, enviado_em: "2026-11-09T12:33:25Z", avisar_chegada: false });
    expect(d[0]!.radar.outros).toEqual([{ fonte: "Vila Bela Imóveis", link: "https://vilabela.example/1", preco: 3180000 }]);
  });

  it("tira o bairro repetido do tipo", () => {
    expect(lerRegistroRadar(registro())[1]!.titulo).toBe("Casa · Santa Tereza");
  });

  it("liga o aviso de chegada só quando pedido", () => {
    expect(lerRegistroRadar(registro(), { avisarChegada: true })[0]!.radar.avisar_chegada).toBe(true);
  });

  it("recusa o que não é o registro do Radar", () => {
    expect(() => lerRegistroRadar({ qualquer: 1 })).toThrow(/registro do Radar/);
  });
});

describe("nomes", () => {
  it("bairro na grafia da OPA", () => {
    expect(bairroLegivel("Engenho D Agua")).toBe("Engenho d'Água");
    expect(bairroLegivel("Armacao")).toBe("Armação");
    expect(bairroLegivel("Feiticeira (Cambaquara)")).toBe("Feiticeira");
    expect(bairroLegivel("Ilha das Cabras")).toBe("Ilha das Cabras");
  });

  it("tipo legível e sem o bairro", () => {
    expect(tipoLegivel("Casa Em Condominio")).toBe("Casa em condomínio");
    expect(tipoSemBairro("Casa no Curral", "Curral")).toBe("Casa");
    expect(tipoSemBairro("Casa com vista para o mar", "Siriúba")).toBe("Casa com vista para o mar");
  });

  it("acha o corretor pelo primeiro nome ou por um nome único", () => {
    const equipe = [
      { id: "1", nome: "Luana Machado" },
      { id: "2", nome: "Paulo Martin" },
      { id: "3", nome: "Marco Henrique" },
    ];
    expect(acharCorretor("Luana", equipe)).toBe("1");
    expect(acharCorretor("Martin", equipe)).toBe("2");
    expect(acharCorretor("Rodrigo", equipe)).toBeNull();
  });

  it("preço curto", () => {
    expect(precoCurto(3180000)).toBe("R$ 3,18 mi");
    expect(precoCurto(720000)).toBe("R$ 720 mil");
    expect(precoCurto(null)).toBe("Sem preço");
  });
});

describe("situação e aba", () => {
  const card = (dias: number, extra: Partial<Parameters<typeof situacaoRadar>[0]> = {}) => ({
    status: "open" as const,
    etapaSlug: "radar",
    enviadoEm: new Date(AGORA - dias * DIA).toISOString(),
    ultimoMovimento: new Date(AGORA - dias * DIA).toISOString(),
    ...extra,
  });

  it("recém-enviado é novo; 3 dias pede lembrete; o prazo vence no dia configurado", () => {
    expect(situacaoRadar(card(0), AGORA, 7)).toBe("nova");
    expect(situacaoRadar(card(3), AGORA, 7)).toBe("lembrar");
    expect(situacaoRadar(card(7), AGORA, 7)).toBe("prazo");
    expect(situacaoRadar(card(7), AGORA, 10)).toBe("lembrar");
  });

  it("anotação recente deixa em dia; publicado é captado; perdido encerra", () => {
    const anotado = card(10, { etapaSlug: "contato", ultimoMovimento: new Date(AGORA - DIA).toISOString() });
    expect(situacaoRadar(anotado, AGORA, 7)).toBe("em_dia");
    expect(abaDoCard("em_dia", "contato")).toBe("andando");
    expect(situacaoRadar(card(20, { etapaSlug: "publicado" }), AGORA, 7)).toBe("captado");
    expect(situacaoRadar(card(20, { status: "lost" }), AGORA, 7)).toBe("perdido");
    expect(abaDoCard("perdido", "radar")).toBe("encerrados");
  });

  it("parado na Oportunidade do Radar fica em Para agir", () => {
    expect(abaDoCard("em_dia", "radar")).toBe("agir");
  });
});

describe("avisos", () => {
  const base = (dias: number, avisarChegada = false) => ({
    status: "open" as const,
    etapaSlug: "radar",
    enviadoEm: new Date(AGORA - dias * DIA).toISOString(),
    ultimoMovimento: new Date(AGORA - dias * DIA).toISOString(),
    avisarChegada,
  });

  it("chegada só quando pedida e antes de alguém mexer", () => {
    expect(avisoDevidoRadar(base(0, true), AGORA, 7)?.tipo).toBe("radar_chegada");
    expect(avisoDevidoRadar(base(0, false), AGORA, 7)).toBeNull();
  });

  it("lembrete e prazo com a marca do último movimento (não repete)", () => {
    expect(avisoDevidoRadar(base(3), AGORA, 7)).toEqual({ tipo: "radar_lembrete", marca: new Date(AGORA - 3 * DIA).toISOString().slice(0, 10) });
    expect(avisoDevidoRadar(base(8), AGORA, 7)?.tipo).toBe("radar_prazo");
    expect(avisoDevidoRadar({ ...base(8), status: "lost" }, AGORA, 7)).toBeNull();
  });

  it("junta tudo numa mensagem por pessoa", () => {
    const t = textoAvisoRadar(
      "Marco Henrique",
      [
        { tipo: "radar_chegada", paraGestor: false, titulo: "Casa · Curral", dist: "D23", preco: 1200000, imobiliaria: "Capela", dias: 0, corretor: "Marco" },
        { tipo: "radar_prazo", paraGestor: false, titulo: "Casa · Reino", dist: "D8", preco: 770000, imobiliaria: "Ilhabela4you", dias: 14, corretor: "Marco" },
        { tipo: "radar_prazo", paraGestor: true, titulo: "Casa · Água Branca", dist: "D4", preco: 1600000, imobiliaria: "Magda", dias: 14, corretor: "Paulo Martin" },
      ],
      "https://crm.example/app/captacoes",
    );
    expect(t).toContain("Oi, Marco.");
    expect(t).toContain("1. Casa · Curral, R$ 1.200.000 (Capela)");
    expect(t).toContain("Casa · Reino (D8), 14 dias, chegou o prazo");
    expect(t).toContain("Paulo: Casa · Água Branca (D4), 14 dias");
    expect(t).not.toMatch(/—/);
  });
});
