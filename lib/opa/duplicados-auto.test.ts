import { describe, expect, it } from "vitest";

import { tipoDoTexto } from "./enviados";
import { agruparContatos, montarPessoa, type ContatoLinha, type ConversaLinha, type LeadLinha } from "./donos-da-conversa";
import { planoDoDuplicado, textoDuplicadoCorrigido, textoDuplicadoParaDecidir } from "./duplicados-auto";

const nomes: Record<string, string> = { cris: "Cristian Spengler", marco: "Marco Ilhabela", paulo: "Paulo Martin" };
const nome = (id: string) => nomes[id] ?? id;
const numeros = new Map<string, string | null>([
  ["s-cris", "cris"],
  ["s-marco", "marco"],
  ["s-paulo", "paulo"],
]);

const contato = (id: string, phone: string): ContatoLinha => ({ id, display_name: "Wandalcy Lopes", phone_number: phone, telefone_indice: null });
const conversa = (id: string, contato: string, sessao: string, em: string): ConversaLinha => ({
  id,
  contact_id: contato,
  channel_session_id: sessao,
  assigned_to_user_id: null,
  created_at: em,
});
const formulario = (id: string, contato: string, dono: string, em: string): LeadLinha => ({
  id,
  title: "Wandalcy Lopes · CA007099",
  contact_id: contato,
  owner_user_id: dono,
  created_at: em,
  source: "meta",
  origem: { canal: "meta" },
});
const doWhatsApp = (id: string, contato: string, dono: string, em: string): LeadLinha => ({
  id,
  title: "Wandalcy Lopes",
  contact_id: contato,
  owner_user_id: dono,
  created_at: em,
  source: "whatsapp",
  origem: { canal: "whatsapp", via: "whatsapp" },
});

// Caso real de 12/11/2026: formulário com o 9 (cadastro A, sem conversa), WhatsApp sem o 9 (cadastro B).
const A = contato("A", "+5531995021625");
const B = contato("B", "+553195021625");

describe("mesma pessoa com e sem o nono dígito", () => {
  it("os dois cadastros viram uma pessoa", () => {
    expect(agruparContatos([A, B, contato("C", "+5511988887777")])).toHaveLength(2);
  });
});

describe("corretor principal (13/11/2026)", () => {
  it("lead de formulário: o principal é quem a roleta escolheu, mesmo que outro tenha falado antes", () => {
    const p = montarPessoa(
      [A, B],
      [conversa("m", "B", "s-marco", "2026-11-12T10:02:00Z"), conversa("c", "B", "s-cris", "2026-11-12T14:47:00Z")],
      [formulario("f", "A", "cris", "2026-11-12T09:41:00Z")],
      numeros,
      new Map(),
      nome,
    );
    expect(p.principal).toMatchObject({ id: "cris", criterio: "roleta" });
    expect(p.corretores.find((c) => c.principal)?.id).toBe("cris");
    // Lead único e com o dono certo: outro corretor conversando não é mais "caso para olhar".
    expect(p.motivos).not.toContain("corretores_diferentes");
    expect(p.motivos).not.toContain("lead_com_outro");
  });

  it("sem lead de formulário continua valendo quem falou primeiro", () => {
    const p = montarPessoa([B], [conversa("m", "B", "s-marco", "2026-11-12T10:02:00Z"), conversa("c", "B", "s-cris", "2026-11-12T14:47:00Z")], [], numeros, new Map(), nome);
    expect(p.principal).toMatchObject({ id: "marco", criterio: "primeira_conversa" });
    expect(p.motivos).toContain("corretores_diferentes");
  });
});

describe("planoDoDuplicado", () => {
  it("Wandalcy: fica o lead do formulário, o do WhatsApp é encerrado e o lead passa para o cadastro que conversa", () => {
    const p = montarPessoa(
      [A, B],
      [conversa("c", "B", "s-cris", "2026-11-12T14:47:00Z"), conversa("m", "B", "s-marco", "2026-11-12T10:02:00Z")],
      [formulario("f", "A", "cris", "2026-11-12T09:41:00Z"), doWhatsApp("w", "B", "marco", "2026-11-12T10:02:00Z")],
      numeros,
      new Map(),
      nome,
    );
    const plano = planoDoDuplicado(p);
    expect(plano.acao).toBe("corrigir");
    if (plano.acao !== "corrigir") return;
    expect(plano.manter.id).toBe("f");
    expect(plano.encerrar.map((l) => l.id)).toEqual(["w"]);
    expect(plano.religarPara).toBe("B");
  });

  it("lead do formulário já no cadastro que conversa: só encerra o outro", () => {
    const p = montarPessoa([B], [conversa("c", "B", "s-cris", "2026-11-12T14:47:00Z")], [formulario("f", "B", "cris", "2026-11-12T09:41:00Z"), doWhatsApp("w", "B", "marco", "2026-11-12T10:02:00Z")], numeros, new Map(), nome);
    const plano = planoDoDuplicado(p);
    expect(plano).toMatchObject({ acao: "corrigir", religarPara: null });
  });

  it("um lead só, do formulário, num cadastro sem conversa: passa para o cadastro que conversa", () => {
    const p = montarPessoa([A, B], [conversa("c", "B", "s-cris", "2026-11-12T14:47:00Z")], [formulario("f", "A", "cris", "2026-11-12T09:41:00Z")], numeros, new Map(), nome);
    expect(planoDoDuplicado(p)).toMatchObject({ acao: "corrigir", encerrar: [], religarPara: "B" });
  });

  it("dois leads de WhatsApp, nenhum de formulário: não mexe, pede decisão da gestão", () => {
    const p = montarPessoa([B], [], [doWhatsApp("w1", "B", "marco", "2026-11-12T10:00:00Z"), doWhatsApp("w2", "B", "paulo", "2026-11-12T11:00:00Z")], numeros, new Map(), nome);
    expect(planoDoDuplicado(p).acao).toBe("avisar");
  });

  it("dois leads de formulário com corretores diferentes: não mexe, pede decisão da gestão", () => {
    const p = montarPessoa([A, B], [], [formulario("f1", "A", "cris", "2026-11-12T09:00:00Z"), formulario("f2", "B", "paulo", "2026-11-12T11:00:00Z")], numeros, new Map(), nome);
    expect(planoDoDuplicado(p).acao).toBe("avisar");
  });

  it("um lead de WhatsApp sozinho: nada a fazer", () => {
    const p = montarPessoa([B], [conversa("m", "B", "s-marco", "2026-11-12T10:00:00Z")], [doWhatsApp("w", "B", "marco", "2026-11-12T10:00:00Z")], numeros, new Map(), nome);
    expect(planoDoDuplicado(p).acao).toBe("nada");
  });

  it("lead do formulário no cadastro certo e sem outro lead: nada a fazer", () => {
    const p = montarPessoa([A, B], [conversa("c", "B", "s-cris", "2026-11-12T14:47:00Z")], [formulario("f", "B", "cris", "2026-11-12T09:41:00Z")], numeros, new Map(), nome);
    expect(planoDoDuplicado(p).acao).toBe("nada");
  });
});

describe("avisos à gestão", () => {
  it("texto do que foi resolvido, sem travessão, e a aba Enviados reconhece como gestão", () => {
    const t = textoDuplicadoCorrigido({ pessoa: "Wandalcy Lopes", dono: "Cristian Spengler", outros: ["Marco Ilhabela"], religou: true, link: "https://crm/x" });
    expect(t).toContain("Ficou com Cristian, que recebeu pela roleta.");
    expect(t).toContain('O outro lead (Marco) foi encerrado como "Lead duplicado".');
    expect(t).not.toMatch(/[—–]/);
    expect(tipoDoTexto(t)).toBe("gestao");
  });

  it("texto do caso para decidir", () => {
    const t = textoDuplicadoParaDecidir({ pessoa: "Fulana", donos: ["Marco Ilhabela", "Paulo Martin"], link: "https://crm/app/duplicados" });
    expect(t).toContain("tem 2 leads abertos (Marco, Paulo)");
    expect(tipoDoTexto(t)).toBe("gestao");
  });
});
