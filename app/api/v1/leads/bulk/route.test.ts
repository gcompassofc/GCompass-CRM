/**
 * Excluir lead em lote é só do administrador (OPA, 01/11/2026). A tela esconde o botão
 * de quem não é; aqui se prova que a rota recusa antes de encostar no banco.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { ROLE_RANK, type Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

import { POST } from "./route";

const ORG = "22222222-2222-4222-8222-222222222222";
const USER = "11111111-1111-4111-8111-111111111111";
const LEAD = "44444444-4444-4444-8444-444444444444";

const tabelasTocadas: string[] = [];
const eventosLidos: string[] = [];

function comoPapel(papel: Role) {
  vi.mocked(requireRole).mockImplementation((async (min: Role) =>
    ROLE_RANK[papel] >= ROLE_RANK[min]
      ? { ok: true, user: { id: USER }, org: { orgId: ORG, name: "OPA", role: papel } }
      : { ok: false, response: fail("forbidden_role", "negado", 403) }) as never);
}

beforeEach(() => {
  tabelasTocadas.length = 0;
  eventosLidos.length = 0;
  // Qualquer acesso ao banco é registrado; a consulta devolve vazio.
  const consulta: Record<string, unknown> = {};
  const encadear = new Proxy(consulta, {
    get: (_t, prop) => {
      if (prop === "then") return (ok: (v: unknown) => void) => ok({ data: [], error: null });
      return () => encadear;
    },
  });
  vi.mocked(createClient).mockResolvedValue({
    from: (tabela: string) => {
      tabelasTocadas.push(tabela);
      return encadear;
    },
    rpc: (nome: string) => {
      eventosLidos.push(nome);
      return encadear;
    },
  } as never);
});

function pedir(corpo: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/v1/leads/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );
}

describe("POST /api/v1/leads/bulk, action delete", () => {
  it.each<Role>(["agent", "manager"])("%s leva 403 e o banco nem é consultado", async (papel) => {
    comoPapel(papel);
    const res = await pedir({ action: "delete", lead_ids: [LEAD], params: {} });
    expect(res.status).toBe(403);
    expect(tabelasTocadas).toEqual([]);
  });

  it("administrador passa pelo portão e chega ao banco", async () => {
    comoPapel("admin");
    await pedir({ action: "delete", lead_ids: [LEAD], params: {} });
    expect(tabelasTocadas).toContain("crm_leads");
  });

  it("mover e etiquetar continuam abertos ao corretor (só excluir foi fechado)", async () => {
    comoPapel("agent");
    const res = await pedir({ action: "tag", lead_ids: [LEAD], params: { add: ["quente"] } });
    expect(res.status).not.toBe(403);
  });
});
