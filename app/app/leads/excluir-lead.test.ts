import { beforeEach, describe, expect, it, vi } from "vitest";

import { audit } from "@/lib/audit";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import type { Role } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => {}) }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/opa/analisar", () => ({ analisarLead: vi.fn() }));
vi.mock("@/lib/opa/eventos-lead", () => ({ avisarMudancaDeEtapa: vi.fn(), avisarTagsNovas: vi.fn(), etapaAtual: vi.fn() }));

import { excluirLead } from "./actions";

const ORG = "22222222-2222-4222-8222-222222222222";
const LEAD = "33333333-3333-4333-8333-333333333333";

function banco({ linhas = 1, erro }: { linhas?: number; erro?: { code: string; message: string } } = {}) {
  const gravado = { apagou: false, filtros: new Map<string, unknown>() };
  const cliente = {
    from: () => ({
      delete: () => {
        gravado.apagou = true;
        const c = {
          eq: (col: string, val: unknown) => (gravado.filtros.set(col, val), c),
          select: async () => ({ data: Array.from({ length: linhas }, () => ({ id: LEAD })), error: erro ?? null }),
        };
        return c;
      },
    }),
  };
  vi.mocked(createClient).mockResolvedValue(cliente as never);
  return gravado;
}

const comoPapel = (role: Role, is_platform_admin = false) => {
  vi.mocked(requireAuth).mockResolvedValue({ id: "u1", is_platform_admin } as never);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG, role } as never);
};

const form = () => {
  const fd = new FormData();
  fd.set("leadId", LEAD);
  return fd;
};

beforeEach(() => vi.clearAllMocks());

describe("excluirLead", () => {
  it("administrador exclui, só na organização ativa, e fica na auditoria", async () => {
    comoPapel("admin");
    const g = banco();
    expect(await excluirLead(form())).toEqual({ ok: true });
    expect(g.filtros.get("organization_id")).toBe(ORG);
    expect(g.filtros.get("id")).toBe(LEAD);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "lead.deleted", resourceId: LEAD, organizationId: ORG, actorUserId: "u1" }));
  });

  it("administrador da plataforma também exclui", async () => {
    comoPapel("manager", true);
    banco();
    expect(await excluirLead(form())).toEqual({ ok: true });
  });

  it.each<Role>(["manager", "agent", "viewer"])("%s não exclui nem chega ao banco", async (papel) => {
    comoPapel(papel);
    const g = banco();
    expect(await excluirLead(form())).toEqual({ ok: false, erro: "Só o administrador pode excluir lead." });
    expect(g.apagou).toBe(false);
    expect(audit).not.toHaveBeenCalled();
  });

  it("nada apagado (lead sumiu ou o banco negou) vira erro e não audita", async () => {
    comoPapel("admin");
    banco({ linhas: 0 });
    expect((await excluirLead(form())).ok).toBe(false);
    expect(audit).not.toHaveBeenCalled();
  });

  it("erro do banco não vaza detalhe técnico", async () => {
    comoPapel("admin");
    banco({ erro: { code: "XX000", message: "constraint crm_leads_x" } });
    expect(await excluirLead(form())).toEqual({ ok: false, erro: "Não deu para salvar. Tente de novo." });
    expect(audit).not.toHaveBeenCalled();
  });
});
