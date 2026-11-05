import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import type { Role } from "@/lib/auth/types";
import { tipoDoFunil } from "@/lib/opa/tipo-lead";
import { createClient } from "@/lib/supabase/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/opa/analisar", () => ({ analisarLead: vi.fn() }));
const avisar = vi.fn();
vi.mock("@/lib/opa/eventos-lead", () => ({
  avisarMudancaDeEtapa: (...a: unknown[]) => avisar(...a),
  avisarTagsNovas: vi.fn(),
  etapaAtual: vi.fn(),
}));

import { mudarTipoDoLead } from "./actions";

const USER = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const LEAD = "33333333-3333-4333-8333-333333333333";

interface Cenario {
  lead?: Record<string, unknown> | null;
  semEtapa?: boolean;
  erroUpdate?: { code: string; message: string };
  linhasDoUpdate?: number;
}

function banco({ lead, semEtapa, erroUpdate, linhasDoUpdate = 1 }: Cenario) {
  const gravado: { update?: Record<string, unknown>; insert?: Record<string, unknown>; filtrosUpdate: Array<[string, unknown]> } = { filtrosUpdate: [] };
  const atual = lead === null ? null : { id: LEAD, pipeline_id: "p-compradores", stage_id: "e-recebido", contact_id: "c1", status: "open", ...lead };
  const leitura = (resultado: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "limit"]) c[m] = () => c;
    c.maybeSingle = async () => ({ data: resultado, error: null });
    return c;
  };
  const cliente = {
    from: (tabela: string) => ({
      select: () => {
        if (tabela === "crm_leads") return leitura(atual);
        if (tabela === "crm_pipelines") return leitura({ id: "p-captacao", name: "Captação de imóvel", slug: "captacao" });
        return leitura(semEtapa ? null : { id: "e-contato", name: "Contato / candidatura" });
      },
      update: (v: Record<string, unknown>) => {
        gravado.update = v;
        const resposta = { data: Array.from({ length: linhasDoUpdate }, () => ({ id: LEAD })), error: erroUpdate ?? null };
        const c = {
          eq: (col: string, val: unknown) => (gravado.filtrosUpdate.push([col, val]), c),
          select: async () => resposta,
        };
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

const comoPapel = (role: Role) => {
  vi.mocked(requireAuth).mockResolvedValue({ id: USER } as never);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG, role } as never);
};

const form = (tipo = "vendedor") => {
  const fd = new FormData();
  fd.set("leadId", LEAD);
  fd.set("tipo", tipo);
  return fd;
};

beforeEach(() => vi.clearAllMocks());

describe("tipoDoFunil", () => {
  it("só Compradores é comprador; Captação e Relacionamento são vendedor", () => {
    expect(tipoDoFunil("compradores")).toBe("comprador");
    expect(tipoDoFunil("captacao")).toBe("vendedor");
    expect(tipoDoFunil("relacionamento")).toBe("vendedor");
  });
});

describe("mudarTipoDoLead", () => {
  it.each<Role>(["agent", "manager", "admin"])("%s passa o mesmo lead para a Captação e o histórico registra", async (papel) => {
    comoPapel(papel);
    const g = banco({});
    expect(await mudarTipoDoLead(form())).toEqual({ ok: true });
    expect(g.update).toMatchObject({ pipeline_id: "p-captacao", stage_id: "e-contato" });
    expect(g.update).not.toHaveProperty("status");
    expect(g.update).not.toHaveProperty("owner_user_id");
    expect(g.insert).toMatchObject({ lead_id: LEAD, type: "mudou_de_funil", performed_by_user_id: USER, payload: { para: "Captação de imóvel" } });
    expect(avisar).toHaveBeenCalledOnce();
  });

  it("a gravação confere o funil lido, para dois toques não se atropelarem", async () => {
    comoPapel("agent");
    const g = banco({});
    await mudarTipoDoLead(form());
    expect(g.filtrosUpdate).toContainEqual(["pipeline_id", "p-compradores"]);
    expect(g.filtrosUpdate).toContainEqual(["organization_id", ORG]);
  });

  it("leitura não muda e nada é gravado", async () => {
    comoPapel("viewer");
    const g = banco({});
    expect(await mudarTipoDoLead(form())).toEqual({ ok: false, erro: "Seu acesso é só de leitura." });
    expect(g.update).toBeUndefined();
  });

  it("lead que a pessoa não vê é 'não encontrado'", async () => {
    comoPapel("agent");
    const g = banco({ lead: null });
    expect(await mudarTipoDoLead(form())).toEqual({ ok: false, erro: "Lead não encontrado." });
    expect(g.update).toBeUndefined();
  });

  it("negócio ganho ou perdido não muda de funil", async () => {
    comoPapel("manager");
    const g = banco({ lead: { status: "lost" } });
    expect(await mudarTipoDoLead(form())).toEqual({ ok: false, erro: "Este negócio já foi encerrado." });
    expect(g.update).toBeUndefined();
  });

  it("tipo inválido é recusado", async () => {
    comoPapel("manager");
    const g = banco({});
    expect(await mudarTipoDoLead(form("corretor"))).toEqual({ ok: false, erro: "Escolha Comprador ou Vendedor." });
    expect(g.update).toBeUndefined();
  });

  it("sem a etapa de destino, avisa e não grava", async () => {
    comoPapel("manager");
    const g = banco({ semEtapa: true });
    expect(await mudarTipoDoLead(form())).toEqual({ ok: false, erro: "O funil de destino não tem etapa aberta." });
    expect(g.update).toBeUndefined();
  });

  it("se nenhuma linha mudou (sem permissão ou outro toque), não finge que deu certo", async () => {
    comoPapel("agent");
    const g = banco({ linhasDoUpdate: 0 });
    expect(await mudarTipoDoLead(form())).toEqual({ ok: false, erro: "Não deu para mudar. Atualize a página e tente de novo." });
    expect(g.insert).toBeUndefined();
    expect(avisar).not.toHaveBeenCalled();
  });
});
