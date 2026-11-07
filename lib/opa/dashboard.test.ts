import { describe, expect, it } from "vitest";

import type { DiaAtendimento } from "./config";
import { montarDashboard, ordenarCorretores, type EntradaDash, type LeadDash } from "./dashboard";

const H = 3_600_000;
const D = 24 * H;
// Segunda, 02/11/2026, 12h em São Paulo.
const AGORA = Date.parse("2026-11-02T15:00:00.000Z");
const SEMPRE: DiaAtendimento[] = [
  { dias: "Segunda a sexta", abre: "00:00", fecha: "23:59", aberto: true },
  { dias: "Sábado", abre: "00:00", fecha: "23:59", aberto: true },
  { dias: "Domingo e feriado", abre: "00:00", fecha: "23:59", aberto: true },
];

const etapas = [
  { id: "e1", nome: "Lead recebido", slug: "lead-recebido", posicao: 1000, ganho: false, perdido: false },
  { id: "e2", nome: "Primeiro contato", slug: "primeiro-contato", posicao: 2000, ganho: false, perdido: false },
  { id: "e7", nome: "Proposta feita", slug: "proposta", posicao: 7000, ganho: false, perdido: false },
  { id: "sm", nome: "Sem momento", slug: "sem-momento", posicao: 10000, ganho: false, perdido: false },
  { id: "v", nome: "Vendido", slug: "vendido", posicao: 11000, ganho: true, perdido: false },
  { id: "p", nome: "Perdido", slug: "perdido", posicao: 12000, ganho: false, perdido: true },
];

function lead(id: string, x: Partial<LeadDash>): LeadDash {
  return {
    id,
    nome: id,
    donoId: "marco",
    etapaId: "e1",
    status: "open",
    pago: true,
    origem: "meta",
    anuncio: null,
    imovel: null,
    interesse: [],
    criadoEm: AGORA - 2 * D,
    fechadoEm: null,
    etapaDesde: AGORA - 2 * D,
    valorCents: 100_000_00,
    vgvCents: null,
    comissaoOpaCents: null,
    motivoPerda: null,
    perdidoNaEtapa: null,
    voltouEm: null,
    ...x,
  };
}

function entrada(leads: LeadDash[], x: Partial<EntradaDash> = {}): EntradaDash {
  return {
    periodo: { de: AGORA - 7 * D, ate: AGORA + H, anterior: { de: AGORA - 14 * D, ate: AGORA - 7 * D } },
    agora: AGORA,
    leads,
    etapas,
    respostas: new Map(),
    prazos: { pago_min: 60, organico_min: 180 },
    horario: SEMPRE,
    visitas: [],
    repasses: [],
    imoveisAtivos: [],
    ...x,
  };
}

describe("dashboard da operação", () => {
  it("leads, prazo, ganhos e comissão em duas linhas, com o período anterior", () => {
    const leads = [
      lead("a", { anuncio: "AD04", imovel: "CA006944" }),
      lead("b", { donoId: "luana" }),
      lead("c", { criadoEm: AGORA - 10 * D }),
      lead("g", { status: "won", etapaId: "v", fechadoEm: AGORA - D, vgvCents: 5_000_000_00, comissaoOpaCents: 150_000_00 }),
    ];
    const respostas = new Map([
      ["a", { inicio: AGORA - 2 * D, resposta: AGORA - 2 * D + 30 * 60_000 }],
      ["b", { inicio: AGORA - 2 * D, resposta: AGORA - 2 * D + 5 * H }],
    ]);
    const d = montarDashboard(entrada(leads, { respostas }));
    expect(d.grandes.leads).toEqual({ atual: 3, antes: 1 });
    // a no prazo; b respondeu tarde; g sem resposta e prazo vencido.
    expect(d.grandes.pctPrazo.atual).toBeCloseTo(1 / 3);
    expect(d.listas.get("fora-prazo")).toEqual(["b", "g"]);
    expect(d.grandes.ganhos.vgvCents).toBe(5_000_000_00);
    expect(d.grandes.ganhos.comissaoBrutaCents).toBe(300_000_00);
    expect(d.grandes.ganhos.comissaoOpaCents).toBe(150_000_00);
    expect(d.porAnuncio).toEqual([{ anuncio: "AD04", n: 1 }]);
  });

  it("funil: ganho passa por tudo, perdido conta até a etapa gravada, sem momento só na entrada", () => {
    const leads = [
      lead("a", { etapaId: "e2" }),
      lead("b", { etapaId: "e7" }),
      lead("g", { status: "won", etapaId: "v", fechadoEm: AGORA - D }),
      lead("p", { status: "lost", etapaId: "p", fechadoEm: AGORA - D, perdidoNaEtapa: "e2", motivoPerda: "Contato inválido" }),
      lead("s", { etapaId: "sm" }),
    ];
    const d = montarDashboard(entrada(leads));
    expect(d.funil.map((f) => [f.nome, f.alcancaram])).toEqual([
      ["Lead recebido", 5],
      ["Primeiro contato", 4],
      ["Proposta feita", 2],
      ["Ganho", 1],
    ]);
    expect(d.funil[1]!.passagem).toBeCloseTo(0.8);
    expect(d.semMomento).toBe(1);
    expect(d.perdidos.porMotivo).toEqual([{ motivo: "Contato inválido", n: 1, destaque: true }]);
    expect(d.perdidos.porEtapa).toEqual([{ etapa: "Primeiro contato", n: 1 }]);
    expect(d.grandes.vgvProposta.leads).toBe(1);
  });

  it("corretor: recebidos, prazo, repasses e ordenação com vazio no fim", () => {
    const d = montarDashboard(
      entrada([lead("a", {}), lead("b", { donoId: "luana" })], {
        respostas: new Map([["b", { inicio: AGORA - 2 * D, resposta: AGORA - 2 * D + 10 * 60_000 }]]),
        repasses: [{ leadId: "a", de: "luana", para: "marco", em: AGORA - D }],
      }),
    );
    const marco = d.corretores.find((c) => c.id === "marco")!;
    const luana = d.corretores.find((c) => c.id === "luana")!;
    expect(marco.pctPrazo).toBe(0);
    expect(luana.pctPrazo).toBe(1);
    expect(marco.repassesRecebidos).toBe(1);
    expect(luana.repassesPerdidos).toBe(1);
    expect(ordenarCorretores(d.corretores, "tempoMedioMin", "asc").map((c) => c.id)).toEqual(["luana", "marco"]);
  });

  it("parados por etapa e imóvel publicado sem lead em 30 dias", () => {
    const d = montarDashboard(
      entrada([lead("velho", { criadoEm: AGORA - 40 * D, etapaDesde: AGORA - 35 * D, imovel: "CA1" }), lead("novo", { imovel: "CA2" })], {
        imoveisAtivos: [
          { codigo: "CA1", titulo: "Casa 1" },
          { codigo: "CA2", titulo: "Casa 2" },
        ],
      }),
    );
    expect(d.parados[0]).toMatchObject({ etapa: "Lead recebido", d7: 1, d14: 1, d30: 1 });
    expect(d.imoveisSemLead.map((i) => i.codigo)).toEqual(["CA1"]);
  });
});
