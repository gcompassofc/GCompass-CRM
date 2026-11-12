import { describe, expect, it } from "vitest";

import { contagemDeWhatsApp, papelDoNumero, precisaDeWhatsApp } from "./whatsapp-da-equipe";

describe("quem precisa de WhatsApp conectado (12/11/2026)", () => {
  it("corretor sempre; gestão só quando conectou", () => {
    expect(precisaDeWhatsApp("agent", false)).toBe(true);
    expect(precisaDeWhatsApp("manager", false)).toBe(false);
    expect(precisaDeWhatsApp("admin", false)).toBe(false);
    expect(precisaDeWhatsApp("manager", true)).toBe(true);
    expect(precisaDeWhatsApp(null, false)).toBe(true);
  });

  it("cinco corretores conectados e um administrador sem número dão 5 de 5", () => {
    const equipe = [
      { papel: "manager", ok: true },
      { papel: "agent", ok: true },
      { papel: "agent", ok: true },
      { papel: "agent", ok: true },
      { papel: "agent", ok: true },
      { papel: "admin", ok: false },
    ];
    expect(contagemDeWhatsApp(equipe, (m) => m.papel, (m) => m.ok)).toEqual({ conectados: 5, total: 5 });
  });

  it("papel do número: pelo dono; sem dono, pelo nome igual ao de alguém da equipe", () => {
    const equipe = [
      { id: "u1", nome: "Luana Machado", papel: "agent" },
      { id: "u9", nome: "growthcompassofc", papel: "admin" },
    ];
    expect(papelDoNumero({ owner_user_id: "u1", display_name: "Luana" }, equipe)).toBe("agent");
    expect(papelDoNumero({ owner_user_id: null, display_name: "growthcompassofc" }, equipe)).toBe("admin");
    expect(papelDoNumero({ owner_user_id: null, display_name: "Número antigo" }, equipe)).toBeNull();
  });

  it("corretor sem número continua faltando", () => {
    expect(contagemDeWhatsApp([{ papel: "agent", ok: false }, { papel: "agent", ok: true }], (m) => m.papel, (m) => m.ok)).toEqual({ conectados: 1, total: 2 });
  });
});
