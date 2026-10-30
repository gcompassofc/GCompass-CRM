// @vitest-environment node
import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cifrar,
  decifrar,
  esquecerChaves,
  estaCifrado,
  indiceEmail,
  indiceTelefone,
  precisaRecifrar,
  recifrar,
} from "./dados-pessoais";

const k = () => randomBytes(32).toString("base64");
const v1 = k();
const v2 = k();
const indice = k();
const ORG = "2027f993-4fec-4c23-8b8c-a4f24bbed1ed";
const OUTRA = "a5d2b4f5-43f2-4f76-a3f8-a6ca8b76169a";

function usarChaves(lista: string, atual: string) {
  process.env.PII_CHAVES = lista;
  process.env.PII_CHAVE_ATUAL = atual;
  process.env.PII_CHAVE_INDICE = indice;
  esquecerChaves();
}

describe("cifra de dados pessoais", () => {
  beforeEach(() => usarChaves(`v1:${v1}`, "v1"));
  afterEach(() => esquecerChaves());

  it("quando cifra e decifra no mesmo contexto, devolve o texto original", () => {
    const c = cifrar("Renata Fontes", { org: ORG, campo: "nome" });
    expect(estaCifrado(c)).toBe(true);
    expect(c).not.toContain("Renata");
    expect(decifrar(c, { org: ORG, campo: "nome" })).toBe("Renata Fontes");
  });

  it("quando o mesmo nome é cifrado duas vezes, os valores gravados são diferentes", () => {
    const ctx = { org: ORG, campo: "nome" } as const;
    expect(cifrar("Renata", ctx)).not.toBe(cifrar("Renata", ctx));
  });

  it("quando o cifrado é copiado para outra org ou outro campo, não abre", () => {
    const c = cifrar("11999990000", { org: ORG, campo: "telefone" });
    expect(() => decifrar(c, { org: OUTRA, campo: "telefone" })).toThrow();
    expect(() => decifrar(c, { org: ORG, campo: "nome" })).toThrow();
  });

  it("quando alguém altera um byte do cifrado, a leitura falha em vez de devolver lixo", () => {
    const c = cifrar("marco@opa.com", { org: ORG, campo: "email" });
    const adulterado = c.slice(0, -3) + (c.at(-3) === "A" ? "B" : "A") + c.slice(-2);
    expect(() => decifrar(adulterado, { org: ORG, campo: "email" })).toThrow();
  });

  it("quando o valor ainda é legado em texto puro, decifrar devolve como está", () => {
    expect(decifrar("Nome antigo", { org: ORG, campo: "nome" })).toBe("Nome antigo");
    expect(decifrar(null, { org: ORG, campo: "nome" })).toBeNull();
  });

  it("quando a chave gira, o dado antigo abre e é regravado com a nova", () => {
    const antigo = cifrar("Paulo", { org: ORG, campo: "nome" });
    usarChaves(`v1:${v1},v2:${v2}`, "v2");
    expect(precisaRecifrar(antigo)).toBe(true);
    const novo = recifrar(antigo, { org: ORG, campo: "nome" });
    expect(novo.startsWith("pii1.v2.")).toBe(true);
    expect(precisaRecifrar(novo)).toBe(false);
    expect(decifrar(novo, { org: ORG, campo: "nome" })).toBe("Paulo");
  });

  it("quando a chave antiga sai do chaveiro, o dado dela não abre mais", () => {
    const antigo = cifrar("Paulo", { org: ORG, campo: "nome" });
    usarChaves(`v2:${v2}`, "v2");
    expect(() => decifrar(antigo, { org: ORG, campo: "nome" })).toThrow(/v1/);
  });

  it("quando falta chave no ambiente, recusa cifrar em vez de gravar em texto puro", () => {
    delete process.env.PII_CHAVES;
    esquecerChaves();
    expect(() => cifrar("x", { org: ORG, campo: "nome" })).toThrow(/PII_CHAVES/);
  });

  it("quando a chave do índice é igual a uma de cifra, recusa a configuração", () => {
    process.env.PII_CHAVE_INDICE = v1;
    esquecerChaves();
    expect(() => cifrar("x", { org: ORG, campo: "nome" })).toThrow(/diferente/);
  });
});

describe("índice cego", () => {
  beforeEach(() => usarChaves(`v1:${v1}`, "v1"));

  it("quando o telefone vem em formatos diferentes, o índice é o mesmo", () => {
    expect(indiceTelefone(ORG, "(12) 99777-1234")).toBe(indiceTelefone(ORG, "+55 12 99777-1234"));
    expect(indiceEmail(ORG, " Marco@OPA.com ")).toBe(indiceEmail(ORG, "marco@opa.com"));
  });

  it("quando é outra org, o índice do mesmo telefone é outro", () => {
    expect(indiceTelefone(ORG, "12997771234")).not.toBe(indiceTelefone(OUTRA, "12997771234"));
  });

  it("o índice não contém o número", () => {
    expect(indiceTelefone(ORG, "12997771234")).not.toContain("997771234");
  });
});
