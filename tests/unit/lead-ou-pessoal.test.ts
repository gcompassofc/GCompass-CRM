import { describe, expect, it } from "vitest";

import { perguntarLeadOuPessoal } from "@/lib/opa/dados";

const conversa = { id: "c1", ultimaEm: null, previa: null, esperandoMin: null };

describe("Lead ou pessoal?", () => {
  it("pergunta no lead aberto com conversa que ninguém respondeu", () => {
    expect(perguntarLeadOuPessoal({ status: "open", classificado: null, conversa })).toBe(true);
  });
  it("some depois de confirmado como lead", () => {
    expect(perguntarLeadOuPessoal({ status: "open", classificado: "lead", conversa })).toBe(false);
  });
  it("não pergunta em lead encerrado nem em lead sem conversa no CRM", () => {
    expect(perguntarLeadOuPessoal({ status: "lost", classificado: null, conversa })).toBe(false);
    expect(perguntarLeadOuPessoal({ status: "open", classificado: null, conversa: null })).toBe(false);
    // Lead de formulário: a conversa "fantasma" tem id vazio.
    expect(perguntarLeadOuPessoal({ status: "open", classificado: null, conversa: { ...conversa, id: "" } })).toBe(false);
  });
});
