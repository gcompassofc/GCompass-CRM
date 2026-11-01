/**
 * Reabrir negócio perdido (F9, 01/11/2026): só gestor ou administrador, e só
 * lead que está perdido. O lead volta para a primeira etapa aberta do funil.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Role } from "@/lib/auth/types";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/opa/analisar", () => ({ analisarLead: vi.fn() }));

import { reabrirNegocio } from "./actions";

const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const LEAD = "33333333-3333-4333-8333-333333333333";

/** Cliente falso: devolve o lead e a etapa pedidos e guarda o que foi gravado. */
function banco(lead: { status: string } | null) {
  const gravado: { update?: Record<string, unknown>; insert?: Record<string, unknown> } = {};
  const cadeia = (resultado: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit"]) c[m] = () => c;
    c.maybeSingle = async () => ({ data: resultado, error: null });
    return c;
  };
  const cliente = {
    from: (tabela: string) => ({
      select: () =>
        tabela === "crm_leads"
          ? cadeia(lead ? { pipeline_id: "p1", contact_id: "c1", lost_reason: "Comprou com outro", ...lead } : null)
          : cadeia({ id: "etapa-1" }),
      update: (v: Record<string, unknown>) => {
        gravado.update = v;
        const c = { eq: () => c, then: (ok: (r: { error: null }) => void) => ok({ error: null }) };
        return c;
      },
      insert: async (v: Record<string, unknown>) => {
        gravado.insert = v;
        return { error: null };
      },
    }),
  };
  vi.mocked(createClient).mockResolvedValue(cliente as never);
  return gravado;
}

function comoPapel(papel: Role) {
  vi.mocked(requireAuth).mockResolvedValue({ id: USER, is_platform_admin: false } as never);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG, name: "OPA", role: papel } as never);
}

const form = () => {
  const fd = new FormData();
  fd.set("leadId", LEAD);
  return fd;
};

beforeEach(() => vi.clearAllMocks());

describe("reabrirNegocio (F9)", () => {
  it.each<Role>(["agent", "viewer"])("%s não reabre e nada é gravado", async (papel) => {
    comoPapel(papel);
    const gravado = banco({ status: "lost" });
    const r = await reabrirNegocio(form());
    expect(r).toEqual({ ok: false, erro: "Só o gestor ou o administrador reabre um negócio perdido." });
    expect(gravado.update).toBeUndefined();
  });

  it.each<Role>(["manager", "admin"])("%s reabre para a primeira etapa e o histórico guarda o motivo", async (papel) => {
    comoPapel(papel);
    const gravado = banco({ status: "lost" });
    const r = await reabrirNegocio(form());
    expect(r).toEqual({ ok: true });
    expect(gravado.update).toMatchObject({ status: "open", lost_reason: null, closed_at: null, stage_id: "etapa-1" });
    expect(gravado.insert).toMatchObject({ type: "reaberto", payload: { motivo_da_perda: "Comprou com outro" }, performed_by_user_id: USER });
  });

  it("não reabre lead que não está perdido", async () => {
    comoPapel("manager");
    const gravado = banco({ status: "open" });
    expect(await reabrirNegocio(form())).toEqual({ ok: false, erro: "Este negócio não está perdido." });
    expect(gravado.update).toBeUndefined();
  });

  it("lead que a pessoa não vê é 'não encontrado'", async () => {
    comoPapel("manager");
    banco(null);
    expect(await reabrirNegocio(form())).toEqual({ ok: false, erro: "Lead não encontrado." });
  });
});
