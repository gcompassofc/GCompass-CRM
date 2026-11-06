import { describe, expect, it } from "vitest";

import { agruparContatos, corretorDaConversa, montarPessoa, type ContatoLinha, type ConversaLinha, type LeadLinha } from "./donos-da-conversa";

const contato = (id: string, indice: string | null = null, tel: string | null = null): ContatoLinha => ({ id, phone_number: tel, telefone_indice: indice });
const conversa = (id: string, sessao: string | null, em: string, atende: string | null = null, contactId = "c1"): ConversaLinha => ({
  id,
  contact_id: contactId,
  channel_session_id: sessao,
  assigned_to_user_id: atende,
  created_at: em,
});
const lead = (id: string, dono: string | null, em = "2026-11-01T00:00:00Z"): LeadLinha => ({ id, title: "x", contact_id: "c1", owner_user_id: dono, created_at: em });
const numeros = new Map<string, string | null>([["s-ana", "ana"], ["s-beto", "beto"], ["s-empresa", null]]);
const nome = (id: string) => ({ ana: "Ana", beto: "Beto", caio: "Caio" })[id] ?? id;

describe("corretorDaConversa", () => {
  it("é o dono do número; no número da empresa, quem atende", () => {
    expect(corretorDaConversa(conversa("1", "s-ana", "x", "beto"), numeros)).toBe("ana");
    expect(corretorDaConversa(conversa("1", "s-empresa", "x", "caio"), numeros)).toBe("caio");
    expect(corretorDaConversa(conversa("1", "s-empresa", "x"), numeros)).toBeNull();
  });
});

describe("agruparContatos", () => {
  it("telefone e @lid do mesmo número viram uma pessoa", () => {
    const g = agruparContatos([contato("a", "h1", "+5512"), contato("b", "h1"), contato("c", "h2")]);
    expect(g.map((x) => x.map((c) => c.id))).toEqual([["a", "b"], ["c"]]);
  });
  it("sem telefone conhecido, cada contato é uma pessoa", () => {
    expect(agruparContatos([contato("a"), contato("b")])).toHaveLength(2);
  });
});

describe("montarPessoa", () => {
  it("principal é quem falou primeiro, pela primeira mensagem e não pela criação", () => {
    const p = montarPessoa(
      [contato("c1")],
      [conversa("nova", "s-ana", "2026-11-01T00:00:00Z"), conversa("velha", "s-beto", "2026-11-05T00:00:00Z")],
      [],
      numeros,
      new Map([["velha", "2026-10-20T00:00:00Z"], ["nova", "2026-11-01T00:00:00Z"]]),
      nome,
    );
    expect(p.principal?.nome).toBe("Beto");
    expect(p.corretores.map((c) => [c.nome, c.principal])).toEqual([["Beto", true], ["Ana", false]]);
    expect(p.motivos).toContain("corretores_diferentes");
  });

  it("responsável é o dono do lead, mesmo quando o principal é outro", () => {
    const p = montarPessoa([contato("c1")], [conversa("1", "s-ana", "2026-10-01T00:00:00Z")], [lead("l", "beto")], numeros, new Map(), nome);
    expect(p.responsavel?.nome).toBe("Beto");
    expect(p.principal?.nome).toBe("Ana");
    expect(p.motivos).toContain("lead_com_outro");
  });

  it("sem lead, o responsável é o corretor da conversa", () => {
    const p = montarPessoa([contato("c1")], [conversa("1", "s-ana", "2026-10-01T00:00:00Z")], [], numeros, new Map(), nome);
    expect(p.responsavel?.nome).toBe("Ana");
    expect(p.motivos).toEqual([]);
  });

  it("duas conversas do mesmo corretor não viram duplicado", () => {
    const p = montarPessoa([contato("c1")], [conversa("1", "s-ana", "2026-10-01T00:00:00Z"), conversa("2", "s-empresa", "2026-10-02T00:00:00Z", "ana")], [], numeros, new Map(), nome);
    expect(p.corretores).toHaveLength(1);
    expect(p.motivos).toEqual([]);
  });

  it("aponta dois leads abertos e contato repetido", () => {
    const p = montarPessoa([contato("c1", "h"), contato("c2", "h")], [], [lead("a", "ana"), lead("b", "ana", "2026-11-02T00:00:00Z")], numeros, new Map(), nome);
    expect(p.motivos).toEqual(expect.arrayContaining(["dois_leads", "contato_repetido"]));
    expect(p.leadsAbertos).toBe(2);
  });

  it("conversa sem corretor não vira principal", () => {
    const p = montarPessoa([contato("c1")], [conversa("1", "s-empresa", "2026-10-01T00:00:00Z"), conversa("2", "s-ana", "2026-10-05T00:00:00Z")], [], numeros, new Map(), nome);
    expect(p.principal?.nome).toBe("Ana");
  });
});
