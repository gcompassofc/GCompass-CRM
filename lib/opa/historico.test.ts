import { describe, expect, it } from "vitest";

import { montarHistorico, tempoGasto, type AtividadeDoLead } from "./historico";

const NOMES: Record<string, string> = { cristian: "Cristian", luana: "Luana", martin: "Martin" };
const nomeDe = (id: string | null | undefined) => NOMES[id ?? ""] ?? "alguém que saiu da equipe";
const atv = (type: string, em: string, payload: Record<string, unknown> = {}, reason: string | null = null): AtividadeDoLead => ({ type, payload, performed_at: em, reason });
const base = {
  criadoEm: "2026-11-09T17:40:26.000Z",
  entrada: "Formulário do Meta",
  imovelCodigo: "CA006779",
  aberto: true,
  nomeDe,
  agora: Date.parse("2026-11-10T19:00:00.000Z"),
};

describe("histórico do lead", () => {
  it("entrada com o corretor pelo nome e a primeira resposta com o tempo (caso da Neide)", () => {
    const { itens, resumo } = montarHistorico({
      ...base,
      donoAtualId: "cristian",
      atividades: [
        atv("boas_vindas_enviada", "2026-11-09T17:40:28.000Z", { corretor: "Cristian" }, "Boas-vindas enviada pelo WhatsApp de Cristian."),
        atv("etapa_automatica", "2026-11-09T17:48:01.000Z", { de: "Lead recebido", para: "Primeiro contato", motivo: "primeira_resposta", como: "mensagem" }, "Etapa mudou sozinha para Primeiro contato: o corretor respondeu o lead."),
      ],
    });
    expect(itens[0]).toEqual({ em: base.criadoEm, tipo: "entrada", texto: "Entrou por Formulário do Meta, imóvel CA006779", detalhe: "Ficou com Cristian." });
    expect(itens.find((i) => i.tipo === "resposta")).toMatchObject({ texto: "Cristian respondeu em 8 min", detalhe: "Primeira resposta, por mensagem no WhatsApp." });
    expect(itens.find((i) => i.tipo === "boas_vindas")?.texto).toBe("Boas-vindas enviada pelo WhatsApp de Cristian");
    expect(itens.find((i) => i.tipo === "etapa")).toMatchObject({ texto: "Foi para Primeiro contato", detalhe: "Sozinho, porque o corretor respondeu." });
    expect(resumo).toMatchObject({ primeiroCorretor: "Cristian", corretorAtual: "Cristian", semRespostaMin: null, repasses: [] });
    expect(resumo.resposta).toMatchObject({ quem: "Cristian", minutos: 8 });
  });

  it("sem resposta e passou adiante: de quem para quem, e o tempo do novo corretor conta do repasse", () => {
    const { itens, resumo } = montarHistorico({
      ...base,
      donoAtualId: "martin",
      atividades: [
        atv("lead_repassado", "2026-11-09T18:40:30.000Z", { de: "luana", para: "martin", esperaMin: 60, prazoMin: 60, trilha: "pago" }),
        atv("respondido", "2026-11-09T18:52:30.000Z"),
      ],
    });
    expect(itens[0]?.detalhe).toBe("Ficou com Luana.");
    expect(itens.find((i) => i.tipo === "repasse")).toEqual({
      em: "2026-11-09T18:40:30.000Z",
      tipo: "repasse",
      texto: "Passou de Luana para Martin",
      detalhe: "Sem resposta em 1 h: foi para o próximo da roleta.",
    });
    expect(itens.find((i) => i.tipo === "resposta")?.texto).toBe("Martin respondeu em 12 min");
    expect(resumo).toMatchObject({ primeiroCorretor: "Luana", corretorAtual: "Martin", repasses: [{ de: "Luana", para: "Martin" }] });
  });

  it("lead aberto sem resposta: fica dito, com o tempo de espera", () => {
    const { itens, resumo } = montarHistorico({ ...base, donoAtualId: "cristian", atividades: [] });
    const sem = itens.find((i) => i.tipo === "sem_resposta");
    expect(sem).toMatchObject({ texto: "Ainda sem resposta de Cristian", detalhe: "Espera há 1 dia." });
    expect(resumo.semRespostaMin).toBe(1520);
    expect(resumo.resposta).toBeNull();
  });

  it("nada em inglês: medição interna some e registro da base ganha rótulo", () => {
    const { itens } = montarHistorico({
      ...base,
      donoAtualId: "cristian",
      atividades: [
        atv("lead_cooled", "2026-11-10T12:00:00.000Z", {}, "Sem resposta além do prazo deste estágio"),
        atv("reactivation_expired", "2026-11-10T13:15:00.000Z", {}, "A sugestão de retomar contato venceu sem decisão"),
        atv("lead_reactivated", "2026-11-10T11:00:00.000Z", {}, "Voltou a ter movimento"),
        atv("stage_changed", "2026-11-10T14:00:00.000Z", {}, "De Primeiro contato para Visita agendada — combinado por telefone"),
        atv("tipo_que_ninguem_conhece", "2026-11-10T15:00:00.000Z"),
        atv("lead_voltou", "2026-11-10T10:59:48.000Z", { vez: 2 }),
        atv("lead_escalado", "2026-11-10T16:00:00.000Z", { motivo: "sem_aviso" }, "O aviso de prazo não chegou ao corretor, então o lead não trocou de corretor."),
        atv("conversa_apagada", "2026-11-10T18:05:59.000Z", { por: "Allyson", mensagens: 3 }),
      ],
    });
    const textos = itens.map((i) => `${i.texto} ${i.detalhe ?? ""}`).join(" | ");
    expect(textos).not.toMatch(/cooled|reactivat|stage_changed|tipo_que|expired|[–—]/);
    expect(itens.find((i) => i.texto === "Mudou de etapa")?.detalhe).toBe("De Primeiro contato para Visita agendada: combinado por telefone");
    expect(textos).toContain("Atividade registrada");
    expect(itens.find((i) => i.tipo === "voltou")).toMatchObject({ texto: "Voltou por outro formulário (2ª vez)", detalhe: "Continuou com Cristian, sem roleta." });
    expect(itens.find((i) => i.tipo === "escalada")?.texto).toBe("Passou do prazo sem resposta e foi para a gestão decidir");
    expect(itens.find((i) => i.tipo === "conversa_apagada")).toMatchObject({ texto: "Conversa apagada do CRM por Allyson", detalhe: "3 mensagens saíram do CRM. No celular do corretor nada muda." });
  });

  it("quem saiu da equipe não vira id na tela; negócio fechado não mostra espera", () => {
    const { itens, resumo } = montarHistorico({ ...base, aberto: false, donoAtualId: "alguem-que-saiu", atividades: [] });
    expect(itens[0]?.detalhe).toBe("Ficou com alguém que saiu da equipe.");
    expect(itens.some((i) => i.tipo === "sem_resposta")).toBe(false);
    expect(resumo.semRespostaMin).toBeNull();
  });

  it("tempo por extenso", () => {
    expect(tempoGasto(0.2)).toBe("1 min");
    expect(tempoGasto(65)).toBe("1 h 5 min");
    expect(tempoGasto(120)).toBe("2 h");
    expect(tempoGasto(3000)).toBe("2 dias");
  });
});
