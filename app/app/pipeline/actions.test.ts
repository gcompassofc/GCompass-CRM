// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * "Mandar para todos": o corretor só recebe os leads dele, mesmo que o banco
 * devolva mais (conta com visibilidade "todos") e mesmo pedindo outro corretor.
 * O Supabase é falso: devolve sempre as mesmas linhas e anota os filtros.
 */

const EU = "11111111-1111-4111-8111-111111111111";
const OUTRO = "22222222-2222-4222-8222-222222222222";
const ETAPA = "33333333-3333-4333-8333-333333333333";

const estado = vi.hoisted(() => ({
  role: "agent" as string,
  filtros: [] as Array<[string, unknown]>,
}));

vi.mock("@/lib/auth/server", () => ({
  requireAuth: async () => ({ id: "11111111-1111-4111-8111-111111111111", is_platform_admin: false }),
  resolveActiveOrg: async () => ({ orgId: "org-1", name: "OPA", role: estado.role }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const linhas = [
      { id: "meu-1", title: "Helena", owner_user_id: "11111111-1111-4111-8111-111111111111", tags: [], contacts: { name: "Helena Prado", phone_number: "+5512991234567" } },
      { id: "dele-1", title: "Otávio", owner_user_id: "22222222-2222-4222-8222-222222222222", tags: [], contacts: { name: "Otávio Reis", phone_number: "+5512998765432" } },
      { id: "sem-dono", title: "Rita", owner_user_id: null, tags: [], contacts: { name: "Rita", phone_number: "+5512990000000" } },
    ];
    const q = {
      select: () => q,
      eq: (col: string, v: unknown) => {
        estado.filtros.push([col, v]);
        return q;
      },
      order: () => q,
      range: async () => ({ data: linhas, count: linhas.length, error: null }),
    };
    return { from: () => q };
  },
}));

import { leadsDaEtapaParaEnvio } from "./actions";

beforeEach(() => {
  estado.filtros = [];
});

describe("leadsDaEtapaParaEnvio", () => {
  it("corretor recebe só os leads dele, mesmo pedindo os de outro", async () => {
    estado.role = "agent";
    const r = await leadsDaEtapaParaEnvio(ETAPA, OUTRO);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.itens.map((i) => i.id)).toEqual(["meu-1"]);
    expect(estado.filtros).toContainEqual(["owner_user_id", EU]);
    expect(estado.filtros).not.toContainEqual(["owner_user_id", OUTRO]);
    expect(estado.filtros).toContainEqual(["stage_id", ETAPA]);
    expect(estado.filtros).toContainEqual(["status", "open"]);
  });

  it("gestor filtrando um corretor recebe os daquele corretor", async () => {
    estado.role = "manager";
    const r = await leadsDaEtapaParaEnvio(ETAPA, OUTRO);
    expect(r.ok && r.itens.map((i) => i.id)).toEqual(["dele-1"]);
  });

  it("gestor sem filtro recebe a etapa inteira", async () => {
    estado.role = "admin";
    const r = await leadsDaEtapaParaEnvio(ETAPA, null);
    expect(r.ok && r.itens.map((i) => i.id)).toEqual(["meu-1", "dele-1", "sem-dono"]);
    expect(estado.filtros.some(([c]) => c === "owner_user_id")).toBe(false);
  });

  it("leitura não envia e etapa inválida não consulta", async () => {
    estado.role = "viewer";
    expect(await leadsDaEtapaParaEnvio(ETAPA)).toEqual({ ok: false, erro: "Seu acesso é só de leitura." });
    estado.role = "agent";
    expect((await leadsDaEtapaParaEnvio("1 or 1=1")).ok).toBe(false);
    expect(estado.filtros).toEqual([]);
  });
});
