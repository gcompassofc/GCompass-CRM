/**
 * Meu WhatsApp segue a mesma regra do QR (podeMexerNoNumero): leitura e operador de
 * IA não têm número próprio (pendência C7 de 01/11/2026). Antes só o viewer era barrado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/auth/types";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { buscarSessaoDoDono } from "@/lib/channels/sessao-do-dono";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/waha/client", () => ({ getWahaClient: () => null, wahaFriendlyError: () => "erro" }));
vi.mock("@/lib/channels/sessao-do-dono", () => ({
  buscarSessaoDoDono: vi.fn(async () => null),
  criarSessaoDoDono: vi.fn(),
  atualizarSessao: vi.fn(),
  apagarSessaoRecemCriada: vi.fn(),
}));

import { estadoMeuWhatsapp } from "./actions";

const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";

function comoPapel(papel: Role) {
  vi.mocked(requireAuth).mockResolvedValue({ id: USER, is_platform_admin: false } as never);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG, name: "OPA", role: papel } as never);
}

beforeEach(() => {
  vi.mocked(createAdminClient).mockClear();
  vi.mocked(buscarSessaoDoDono).mockClear();
});

describe("estadoMeuWhatsapp", () => {
  it.each<Role>(["viewer", "ai_operator"])("%s não tem número próprio e nem chega ao banco", async (papel) => {
    comoPapel(papel);
    const r = await estadoMeuWhatsapp();
    expect(r.erro).toBe("Sem permissão.");
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(buscarSessaoDoDono).not.toHaveBeenCalled();
  });

  it.each<Role>(["agent", "manager", "admin"])("%s consulta o próprio número", async (papel) => {
    comoPapel(papel);
    const r = await estadoMeuWhatsapp();
    expect(r.erro).toBeUndefined();
    expect(r.estado).toBe("sem");
    expect(buscarSessaoDoDono).toHaveBeenCalledWith(expect.anything(), ORG, USER);
  });
});
