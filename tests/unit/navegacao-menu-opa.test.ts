/**
 * Menu do CRM da OPA por papel (menuImobiliaria).
 *
 * @vitest-environment node
 *
 * Ambiente node: o perfil da instalação vem de process.env.APP_PROFILE (no
 * jsdom viria de window.__PUBLIC_ENV__).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gruposImobiliaria, menuImobiliaria } from "@/lib/navigation/registry";

beforeEach(() => {
  vi.stubEnv("APP_PROFILE", "imobiliaria");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const principal = (role: "agent" | "manager" | "admin" | "viewer", plataforma = false) =>
  menuImobiliaria(plataforma, role).principal.map((d) => ({ href: d.href, label: d.label }));

describe("menu do corretor", () => {
  it("Funis para o corretor (02/11/2026) e Meus leads logo depois (voltou ao menu em 10/11/2026)", () => {
    const hrefs = principal("agent").map((d) => d.href);
    expect(hrefs).toContain("/app/pipeline");
    expect(hrefs.indexOf("/app/leads")).toBe(hrefs.indexOf("/app/pipeline") + 1);
    expect(principal("agent").find((d) => d.href === "/app/pipeline")?.label).toBe("Funis");
    expect(principal("agent").find((d) => d.href === "/app/leads")?.label).toBe("Meus leads");
  });

  it("Leads aparece no grupo Atendimento, para corretor e gestor", () => {
    for (const role of ["agent", "manager", "admin"] as const) {
      const atendimento = gruposImobiliaria(false, role).find((g) => g.id === "atendimento");
      expect(atendimento?.itens.map((d) => d.href), role).toEqual(["/app/pipeline", "/app/leads", "/app/inbox", "/app/fila", "/app/lembretes"]);
    }
    expect(gruposImobiliaria(false, "manager").find((g) => g.id === "atendimento")?.itens[1]?.label).toBe("Leads");
  });

  it("o corretor segue sem as telas de configuração", () => {
    expect(menuImobiliaria(false, "agent").configuracao).toEqual([]);
  });
});

describe("menu do gestor", () => {
  it("gestor, administrador e dono da plataforma continuam com Funis", () => {
    for (const [role, plataforma] of [["manager", false], ["admin", false], ["agent", true]] as const) {
      expect(principal(role, plataforma).find((d) => d.href === "/app/pipeline")?.label, role).toBe("Funis");
    }
  });
});

describe("Conversas (03/11/2026)", () => {
  it("aparece para corretor e gestor, com a Fila logo abaixo (ordem de 09/11/2026)", () => {
    for (const role of ["agent", "manager", "admin"] as const) {
      const itens = principal(role);
      const i = itens.findIndex((d) => d.href === "/app/inbox");
      expect(itens[i]?.label, role).toBe("Conversas");
      expect(itens[i + 1]?.href, role).toBe("/app/fila");
    }
  });
});
