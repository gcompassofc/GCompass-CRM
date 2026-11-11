// @vitest-environment node
import { describe, expect, it } from "vitest";

import { chaveDoCaptcha, codigoDoCaptcha, recusaDeCaptcha } from "./captcha";

describe("chaveDoCaptcha", () => {
  it("sem chave, o CAPTCHA fica desligado", () => {
    expect(chaveDoCaptcha(undefined)).toBeNull();
    expect(chaveDoCaptcha("")).toBeNull();
    expect(chaveDoCaptcha("   ")).toBeNull();
  });

  it("aceita chave no formato do Turnstile, com espaço sobrando", () => {
    expect(chaveDoCaptcha(" 0x4AAAAAAABBBBcccc_dd-EE ")).toBe("0x4AAAAAAABBBBcccc_dd-EE");
    expect(chaveDoCaptcha("1x00000000000000000000AA")).toBe("1x00000000000000000000AA");
  });

  it("chave torta não liga nada (não vira atributo nem CSP)", () => {
    expect(chaveDoCaptcha('abc"><script>')).toBeNull();
    expect(chaveDoCaptcha("curta")).toBeNull();
    expect(chaveDoCaptcha("a".repeat(65))).toBeNull();
  });
});

describe("codigoDoCaptcha", () => {
  it("só texto de tamanho plausível segue adiante", () => {
    expect(codigoDoCaptcha(" abc.def ")).toBe("abc.def");
    expect(codigoDoCaptcha("")).toBeUndefined();
    expect(codigoDoCaptcha(null)).toBeUndefined();
    expect(codigoDoCaptcha(123)).toBeUndefined();
    expect(codigoDoCaptcha("x".repeat(4097))).toBeUndefined();
  });
});

describe("recusaDeCaptcha", () => {
  it("reconhece a recusa do Supabase pelo código ou pela mensagem", () => {
    expect(recusaDeCaptcha({ code: "captcha_failed", message: "x" })).toBe(true);
    expect(recusaDeCaptcha({ message: "captcha verification process failed" })).toBe(true);
    expect(recusaDeCaptcha({ message: "captcha protection: request disallowed (no captcha_token)" })).toBe(true);
  });

  it("senha errada não é recusa de CAPTCHA", () => {
    expect(recusaDeCaptcha({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe(false);
    expect(recusaDeCaptcha(null)).toBe(false);
  });
});
