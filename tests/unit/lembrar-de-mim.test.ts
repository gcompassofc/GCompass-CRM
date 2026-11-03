import { describe, expect, it } from "vitest";

import { LEMBRAR_DIAS, novoLembrar, opcoesDeSessao, restanteDoLembrar } from "@/lib/auth/lembrar";

const DIA = 24 * 60 * 60;
const agora = Date.UTC(2026, 10, 3, 12, 0, 0);

describe("lembrar de mim", () => {
  it("vale 30 dias a partir do login", () => {
    const { valor, maxAge } = novoLembrar(agora);
    expect(maxAge).toBe(LEMBRAR_DIAS * DIA);
    expect(restanteDoLembrar(valor, agora)).toBe(30 * DIA);
    expect(restanteDoLembrar(valor, agora + 10 * DIA * 1000)).toBe(20 * DIA);
  });

  it("vencido, ausente ou adulterado não lembra", () => {
    const { valor } = novoLembrar(agora);
    expect(restanteDoLembrar(valor, agora + 31 * DIA * 1000)).toBeNull();
    expect(restanteDoLembrar(undefined, agora)).toBeNull();
    expect(restanteDoLembrar("abc", agora)).toBeNull();
    // Data adulterada para anos à frente: nunca passa de 30 dias.
    expect(restanteDoLembrar(String(Math.floor(agora / 1000) + 900 * DIA), agora)).toBe(30 * DIA);
  });

  it("troca os 400 dias do supabase pela lembrança, ou vira cookie de sessão", () => {
    const base = { path: "/", httpOnly: true, maxAge: 400 * DIA };
    expect(opcoesDeSessao(base, 5 * DIA)).toEqual({ path: "/", httpOnly: true, maxAge: 5 * DIA });
    expect(opcoesDeSessao(base, null)).toEqual({ path: "/", httpOnly: true });
    // Remoção de cookie passa intacta.
    expect(opcoesDeSessao({ path: "/", maxAge: 0 }, null)).toEqual({ path: "/", maxAge: 0 });
  });
});
