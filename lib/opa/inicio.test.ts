// @vitest-environment node
import { describe, expect, it } from "vitest";

import { PADRAO } from "./config";
import { resumirPrazo, type RespostaDoLead } from "./inicio";

const sp = (s: string) => Date.parse(`${s}-03:00`);
const cfg = { prazos: PADRAO.prazos, horario: PADRAO.horario }; // pago 60 min, orgânico 180 min
const AGORA = sp("2026-11-03T15:00"); // terça

const lead = (id: string, pago: boolean, criado: string) => ({ id, pago, criadoEm: sp(criado) });
const resp = (inicio: string, resposta: string | null): RespostaDoLead => ({ inicio: sp(inicio), resposta: resposta ? sp(resposta) : null });

describe("respondidos no prazo (Início)", () => {
  it("respondeu dentro do prazo conta como no prazo; fora, só como avaliado", () => {
    const leads = [lead("a", true, "2026-11-03T09:00"), lead("b", true, "2026-11-03T09:00")];
    const r = new Map([
      ["a", resp("2026-11-03T09:00", "2026-11-03T09:40")],
      ["b", resp("2026-11-03T09:00", "2026-11-03T11:00")],
    ]);
    expect(resumirPrazo(leads, r, cfg, AGORA)).toEqual({ avaliados: 2, noPrazo: 1, pendentes: 0 });
  });

  it("lead sem conversa e sem resposta, com o prazo vencido, conta como não respondido", () => {
    const r = resumirPrazo([lead("a", true, "2026-11-03T09:00")], new Map(), cfg, AGORA);
    expect(r).toEqual({ avaliados: 1, noPrazo: 0, pendentes: 0 });
  });

  it("lead novo ainda dentro do prazo não entra na conta (nem como acerto, nem como erro)", () => {
    const r = resumirPrazo([lead("a", true, "2026-11-03T14:30")], new Map(), cfg, AGORA);
    expect(r).toEqual({ avaliados: 0, noPrazo: 0, pendentes: 1 });
  });

  it("ligação conta como resposta (vem da conta do banco, junto com mensagem e 'Respondi')", () => {
    const r = new Map([["a", resp("2026-11-03T10:00", "2026-11-03T10:20")]]);
    expect(resumirPrazo([lead("a", false, "2026-11-03T10:00")], r, cfg, AGORA)).toEqual({ avaliados: 1, noPrazo: 1, pendentes: 0 });
  });

  it("o prazo vem de Configurações: pago e orgânico", () => {
    const leads = [lead("p", true, "2026-11-03T09:00"), lead("o", false, "2026-11-03T09:00")];
    const r = new Map([
      ["p", resp("2026-11-03T09:00", "2026-11-03T10:30")],
      ["o", resp("2026-11-03T09:00", "2026-11-03T10:30")],
    ]);
    expect(resumirPrazo(leads, r, cfg, AGORA).noPrazo).toBe(1);
    const folgado = { ...cfg, prazos: { ...cfg.prazos, pago_min: 120 } };
    expect(resumirPrazo(leads, r, folgado, AGORA).noPrazo).toBe(2);
  });

  it("fora do horário de atendimento o prazo não corre", () => {
    // entrou às 22h, o corretor respondeu às 8h40: 40 min de atendimento, no prazo de 1 h
    const r = new Map([["a", resp("2026-11-02T22:00", "2026-11-03T08:40")]]);
    expect(resumirPrazo([lead("a", true, "2026-11-02T22:00")], r, cfg, AGORA)).toEqual({ avaliados: 1, noPrazo: 1, pendentes: 0 });
  });
});
