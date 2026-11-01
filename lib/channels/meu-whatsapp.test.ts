import { describe, expect, it } from "vitest";

import { estadoDaSessao, mascararTelefone } from "./meu-whatsapp";

describe("estado do WhatsApp do corretor", () => {
  it("traduz o status do WAHA", () => {
    expect(estadoDaSessao("SCAN_QR_CODE")).toBe("qr");
    expect(estadoDaSessao("WORKING")).toBe("conectado");
    expect(estadoDaSessao("FAILED")).toBe("caiu");
    expect(estadoDaSessao("STOPPED")).toBe("caiu");
    expect(estadoDaSessao("STARTING")).toBe("preparando");
    expect(estadoDaSessao(null)).toBe("preparando");
  });

  it("mostra só DDD e final do número", () => {
    expect(mascararTelefone("5512991231170")).toBe("(12) 9••••-1170");
    expect(mascararTelefone("12991231170")).toBe("(12) 9••••-1170");
    expect(mascararTelefone("123")).toBeNull();
    expect(mascararTelefone(null)).toBeNull();
  });
});
