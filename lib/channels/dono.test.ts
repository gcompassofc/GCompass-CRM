import { describe, expect, it } from "vitest";

import { podeMexerNoNumero } from "./dono";

const EU = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";

describe("quem mexe no número de WhatsApp", () => {
  it("o corretor mexe só no próprio número", () => {
    expect(podeMexerNoNumero({ papel: "agent", userId: EU, donoDaSessao: EU })).toBe(true);
    expect(podeMexerNoNumero({ papel: "agent", userId: EU, donoDaSessao: OUTRO })).toBe(false);
  });

  it("gerente também só no próprio", () => {
    expect(podeMexerNoNumero({ papel: "manager", userId: EU, donoDaSessao: EU })).toBe(true);
    expect(podeMexerNoNumero({ papel: "manager", userId: EU, donoDaSessao: OUTRO })).toBe(false);
  });

  it("sessão sem dono (criada antes) só o administrador abre", () => {
    expect(podeMexerNoNumero({ papel: "agent", userId: EU, donoDaSessao: null })).toBe(false);
    expect(podeMexerNoNumero({ papel: "manager", userId: EU, donoDaSessao: undefined })).toBe(false);
    expect(podeMexerNoNumero({ papel: "admin", userId: EU, donoDaSessao: null })).toBe(true);
  });

  it("administrador e administrador da plataforma abrem qualquer um", () => {
    expect(podeMexerNoNumero({ papel: "admin", userId: EU, donoDaSessao: OUTRO })).toBe(true);
    expect(podeMexerNoNumero({ papel: "viewer", souPlatformAdmin: true, userId: EU, donoDaSessao: OUTRO })).toBe(true);
  });

  it("leitura e agente de IA nunca, nem no próprio número", () => {
    expect(podeMexerNoNumero({ papel: "viewer", userId: EU, donoDaSessao: EU })).toBe(false);
    expect(podeMexerNoNumero({ papel: "ai_operator", userId: EU, donoDaSessao: EU })).toBe(false);
  });
});
