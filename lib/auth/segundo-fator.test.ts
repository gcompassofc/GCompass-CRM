/**
 * Segundo fator por código (0125): as partes puras e o cookie que libera a sessão.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";

import { destinoSeguro, mascararDestino, metodoDoUsuario, normalizarWhatsapp } from "./segundo-fator";
import { assinarSegundoFator, exigeCodigo, segundoFatorConfere } from "./segundo-fator-cookie";

describe("número do WhatsApp", () => {
  it("aceita com e sem 55, com máscara", () => {
    expect(normalizarWhatsapp("(12) 99999-4321")).toBe("5512999994321");
    expect(normalizarWhatsapp("+55 12 99999-4321")).toBe("5512999994321");
    expect(normalizarWhatsapp("12 3896-1234")).toBe("551238961234");
  });
  it("recusa o que não é celular ou fixo do Brasil", () => {
    expect(normalizarWhatsapp("999")).toBeNull();
    expect(normalizarWhatsapp("+44 20 7946 0958")).toBeNull();
  });
});

describe("destino mascarado", () => {
  it("mostra só o começo do e-mail e o fim do número", () => {
    expect(mascararDestino("email", "allyson@gcompass.com.br")).toBe("a***@gcompass.com.br");
    expect(mascararDestino("whatsapp", "5512999994321")).toBe("+55 12 *****-4321");
  });
});

describe("para onde volta depois do código", () => {
  it("só caminho interno", () => {
    expect(destinoSeguro("/app/inbox?id=1")).toBe("/app/inbox?id=1");
    expect(destinoSeguro("//evil.com")).toBe("/app");
    expect(destinoSeguro("https://evil.com")).toBe("/app");
    expect(destinoSeguro("/\\evil.com")).toBe("/app");
    expect(destinoSeguro(undefined)).toBe("/app");
  });
});

describe("método da conta", () => {
  it("aplicativo vence; senão o app_metadata; senão desligado", () => {
    expect(metodoDoUsuario({ app_metadata: { segundo_fator: "email" } }, true)).toBe("app");
    expect(metodoDoUsuario({ app_metadata: { segundo_fator: "whatsapp" } }, false)).toBe("whatsapp");
    expect(metodoDoUsuario({ app_metadata: {} }, false)).toBe("nenhum");
    expect(metodoDoUsuario({ app_metadata: { segundo_fator: "outro" } }, false)).toBe("nenhum");
  });
  it("só e-mail e WhatsApp pedem o cookie (o aplicativo é cobrado pelo aal2)", () => {
    expect(exigeCodigo({ segundo_fator: "email" })).toBe(true);
    expect(exigeCodigo({ segundo_fator: "whatsapp" })).toBe(true);
    expect(exigeCodigo({ segundo_fator: null })).toBe(false);
    expect(exigeCodigo(undefined)).toBe(false);
  });
});

describe("cookie que libera a sessão", () => {
  const segredo = "segredo-de-teste-com-tamanho-bom";
  it("vale para a mesma pessoa e a mesma sessão", async () => {
    const v = await assinarSegundoFator(segredo, "u1", "s1");
    expect(await segundoFatorConfere(segredo, "u1", "s1", v)).toBe(true);
  });
  it("não vale em outra sessão, outra pessoa, outro segredo ou adulterado", async () => {
    const v = await assinarSegundoFator(segredo, "u1", "s1");
    expect(await segundoFatorConfere(segredo, "u1", "s2", v)).toBe(false);
    expect(await segundoFatorConfere(segredo, "u2", "s1", v)).toBe(false);
    expect(await segundoFatorConfere("outro-segredo-qualquer-aqui", "u1", "s1", v)).toBe(false);
    expect(await segundoFatorConfere(segredo, "u1", "s1", v.slice(0, -1) + "A")).toBe(false);
    expect(await segundoFatorConfere(segredo, "u1", null, v)).toBe(false);
    expect(await segundoFatorConfere(segredo, "u1", "s1", undefined)).toBe(false);
  });
});
