/**
 * O QR religa um número de WhatsApp. Só o dono da sessão e o administrador o recebem:
 * um corretor que conheça o id da sessão do colega leva 403 e o WAHA nem é consultado.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import type { Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { GET } from "./route";

const ORG = "22222222-2222-4222-8222-222222222222";
const EU = "11111111-1111-4111-8111-111111111111";
const COLEGA = "33333333-3333-4333-8333-333333333333";
const SESSAO = "44444444-4444-4444-8444-444444444444";

const fetchMock = vi.fn();

function cenario(papel: Role, dono: string | null, platformAdmin = false) {
  vi.mocked(loadAuthUser).mockResolvedValue({ id: EU, is_platform_admin: platformAdmin } as never);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG, name: "OPA", role: papel });
  const linha = { waha_session_name: "org_2222_abc", owner_user_id: dono, archived_at: null };
  const consulta: Record<string, unknown> = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: async () => ({ data: linha, error: null }),
    then: (ok: (v: unknown) => void) => ok({ data: linha, error: null }),
  };
  vi.mocked(createClient).mockResolvedValue({ from: () => consulta } as never);
}

function pedir() {
  return GET(new Request("http://localhost/api/v1/channel-sessions/x/qr"), { params: Promise.resolve({ id: SESSAO }) });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/png" } }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("WAHA_API_BASE_URL", "http://waha.test");
  vi.stubEnv("WAHA_API_KEY", "chave-de-teste");
});

describe("GET /api/v1/channel-sessions/[id]/qr", () => {
  it("o dono recebe o QR do próprio número", async () => {
    cenario("agent", EU);
    expect((await pedir()).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each<Role>(["agent", "manager"])("%s não recebe o QR do número de outra pessoa", async (papel) => {
    cenario(papel, COLEGA);
    const res = await pedir();
    expect(res.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sessão sem dono só abre para o administrador", async () => {
    cenario("manager", null);
    expect((await pedir()).status).toBe(403);
    cenario("admin", null);
    expect((await pedir()).status).toBe(200);
  });

  it("administrador abre o QR de qualquer corretor", async () => {
    cenario("admin", COLEGA);
    expect((await pedir()).status).toBe(200);
  });
});
