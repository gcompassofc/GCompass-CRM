import { beforeEach, describe, expect, it, vi } from "vitest";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import type { Role } from "@/lib/auth/types";
import { limparNomeDoLead, tituloComNovoNome } from "@/lib/opa/nome-lead";
import { createClient } from "@/lib/supabase/server";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ requireAuth: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn(() => ({})) }));
vi.mock("@/lib/opa/analisar", () => ({ analisarLead: vi.fn() }));
vi.mock("@/lib/opa/eventos-lead", () => ({ avisarMudancaDeEtapa: vi.fn(), avisarTagsNovas: vi.fn(), etapaAtual: vi.fn() }));

import { mudarNomeDoLead } from "./actions";

const ORG = "22222222-2222-4222-8222-222222222222";
const LEAD = "33333333-3333-4333-8333-333333333333";

interface Cenario {
  lead?: { id: string; title: string; contact_id: string | null } | null;
  contato?: { name: string | null; display_name: string | null; is_anonymized: boolean } | null;
  outrosLeads?: Array<{ id: string; title: string }>;
  contatoSemPermissao?: boolean;
}

function banco({ lead, contato, outrosLeads = [], contatoSemPermissao }: Cenario) {
  const atual = lead === undefined ? { id: LEAD, title: "Mari 🌸 · CA007", contact_id: "c1" } : lead;
  const pessoa = contato === undefined ? { name: null, display_name: "Mari 🌸", is_anonymized: false } : contato;
  const gravado = {
    contato: undefined as Record<string, unknown> | undefined,
    titulos: new Map<unknown, unknown>(),
    atividades: [] as Array<Record<string, unknown>>,
  };
  const leitura = (umResultado: unknown, lista: unknown = []) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq"]) c[m] = () => c;
    c.maybeSingle = async () => ({ data: umResultado, error: null });
    c.then = (ok: (v: unknown) => unknown) => ok({ data: lista, error: null });
    return c;
  };
  const cliente = {
    from: (tabela: string) => ({
      select: (colunas: string) => {
        if (tabela === "contacts") return leitura(pessoa);
        // A primeira leitura busca o lead; a segunda lista os negócios do contato.
        if (colunas.includes("contact_id")) return leitura(atual);
        return leitura(null, [...(atual ? [{ id: atual.id, title: atual.title }] : []), ...outrosLeads]);
      },
      update: (v: Record<string, unknown>) => {
        if (tabela === "contacts") gravado.contato = v;
        const c = {
          eq: (col: string, val: unknown) => {
            if (tabela === "crm_leads" && col === "id") gravado.titulos.set(val, v.title);
            return c;
          },
          select: async () => ({ data: contatoSemPermissao ? [] : [{ id: "c1" }], error: null }),
          then: (ok: (r: unknown) => unknown) => ok({ data: null, error: null }),
        };
        return c;
      },
      insert: async (v: Record<string, unknown>) => {
        gravado.atividades.push(v);
        return { error: null };
      },
    }),
  };
  vi.mocked(createClient).mockResolvedValue(cliente as never);
  return gravado;
}

const comoPapel = (role: Role) => {
  vi.mocked(requireAuth).mockResolvedValue({ id: "u1" } as never);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: ORG, role } as never);
};

const form = (nome = "Mariana Souza") => {
  const fd = new FormData();
  fd.set("leadId", LEAD);
  fd.set("nome", nome);
  return fd;
};

beforeEach(() => vi.clearAllMocks());

describe("limparNomeDoLead", () => {
  it("tira espaços sobrando e o separador do título", () => {
    expect(limparNomeDoLead("  Ana   Maria · Souza ")).toBe("Ana Maria Souza");
  });
  it.each([
    ["vazio", ""],
    ["um caractere", "A"],
    ["só separador", " · "],
    ["longo demais", "a".repeat(201)],
    ["não texto", null],
  ])("recusa %s", (_, valor) => {
    expect(limparNomeDoLead(valor)).toBeNull();
  });
});

describe("tituloComNovoNome", () => {
  it("guarda o que vem depois do nome", () => {
    expect(tituloComNovoNome("Mari · CA007", "Mariana")).toBe("Mariana · CA007");
    expect(tituloComNovoNome("Mari · CA007 · extra", "Mariana")).toBe("Mariana · CA007 · extra");
  });
  it("título sem imóvel ou vazio vira só o nome", () => {
    expect(tituloComNovoNome("Mari", "Mariana")).toBe("Mariana");
    expect(tituloComNovoNome(null, "Mariana")).toBe("Mariana");
  });
});

describe("mudarNomeDoLead", () => {
  it.each<Role>(["agent", "manager", "admin"])("%s troca o nome nos dois campos do contato e no título", async (papel) => {
    comoPapel(papel);
    const g = banco({});
    expect(await mudarNomeDoLead(form())).toEqual({ ok: true });
    expect(g.contato).toEqual({ name: "Mariana Souza", display_name: "Mariana Souza" });
    expect(g.titulos.get(LEAD)).toBe("Mariana Souza · CA007");
    expect(g.atividades).toHaveLength(1);
    expect(g.atividades[0]).toMatchObject({ lead_id: LEAD, type: "nome_alterado", performed_by_user_id: "u1", payload: {} });
  });

  it("vale para os outros negócios do mesmo contato", async () => {
    comoPapel("agent");
    const g = banco({ outrosLeads: [{ id: "antigo", title: "Mari · CA001" }] });
    await mudarNomeDoLead(form());
    expect(g.titulos.get("antigo")).toBe("Mariana Souza · CA001");
  });

  it("lead sem contato muda só o título", async () => {
    comoPapel("agent");
    const g = banco({ lead: { id: LEAD, title: "Mari · CA007", contact_id: null } });
    expect(await mudarNomeDoLead(form())).toEqual({ ok: true });
    expect(g.contato).toBeUndefined();
    expect(g.titulos.get(LEAD)).toBe("Mariana Souza · CA007");
  });

  it("quem só lê não muda", async () => {
    comoPapel("viewer");
    const g = banco({});
    expect((await mudarNomeDoLead(form())).ok).toBe(false);
    expect(g.contato).toBeUndefined();
    expect(g.titulos.size).toBe(0);
  });

  it("contato anonimizado (LGPD) não recebe nome de volta", async () => {
    comoPapel("manager");
    const g = banco({ contato: { name: null, display_name: null, is_anonymized: true } });
    expect((await mudarNomeDoLead(form())).ok).toBe(false);
    expect(g.contato).toBeUndefined();
    expect(g.titulos.size).toBe(0);
  });

  it("nome inválido não grava nada", async () => {
    comoPapel("agent");
    const g = banco({});
    expect((await mudarNomeDoLead(form("A"))).ok).toBe(false);
    expect(g.contato).toBeUndefined();
  });

  it("lead que a pessoa não enxerga não muda", async () => {
    comoPapel("agent");
    const g = banco({ lead: null });
    expect(await mudarNomeDoLead(form())).toEqual({ ok: false, erro: "Lead não encontrado." });
    expect(g.contato).toBeUndefined();
  });

  it("sem permissão no contato, avisa e não mexe no título nem no histórico", async () => {
    comoPapel("agent");
    const g = banco({ contatoSemPermissao: true });
    expect((await mudarNomeDoLead(form())).ok).toBe(false);
    expect(g.titulos.size).toBe(0);
    expect(g.atividades).toHaveLength(0);
  });

  it("mesmo nome não suja o histórico", async () => {
    comoPapel("agent");
    const g = banco({
      lead: { id: LEAD, title: "Mariana Souza · CA007", contact_id: "c1" },
      contato: { name: "Mariana Souza", display_name: "Mariana Souza", is_anonymized: false },
    });
    expect(await mudarNomeDoLead(form())).toEqual({ ok: true });
    expect(g.contato).toBeUndefined();
    expect(g.atividades).toHaveLength(0);
  });
});
