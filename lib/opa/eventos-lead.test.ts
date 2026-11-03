/**
 * Avisos ao motor de automações pelos caminhos da OPA (03/11/2026).
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { avisarLeadCriado, avisarMudancaDeEtapa, avisarTagsNovas, etapaAtual } from "./eventos-lead";

function falso(lead: Record<string, unknown> | null) {
  const rpc = vi.fn().mockResolvedValue({ error: null });
  const consulta = {
    select: () => consulta,
    eq: () => consulta,
    maybeSingle: async () => ({ data: lead }),
  };
  return { cliente: { rpc, from: () => consulta } as unknown as SupabaseClient, rpc };
}

describe("eventos de lead da OPA", () => {
  it("lead novo sai no mesmo formato da API", async () => {
    const { cliente, rpc } = falso(null);
    await avisarLeadCriado(cliente, "org", { id: "l1", pipeline_id: "p", stage_id: "s", title: "Ana" }, "opa.site");
    expect(rpc).toHaveBeenCalledWith("emit_event", expect.objectContaining({
      p_event_type: "lead.created",
      p_entity_kind: "crm_lead",
      p_entity_id: "l1",
      p_organization_id: "org",
      p_payload: { pipeline_id: "p", stage_id: "s", title: "Ana" },
    }));
  });

  it("mudança de etapa leva de onde e para onde; sem mudança, não avisa", async () => {
    const { cliente, rpc } = falso({ pipeline_id: "p", stage_id: "s2", status: "open", position_in_stage: 1 });
    await avisarMudancaDeEtapa(cliente, "org", "l1", "s1", "opa.ficha");
    expect(rpc.mock.calls[0]![1]).toMatchObject({
      p_event_type: "lead.stage_changed",
      p_payload: { from_stage_id: "s1", to_stage_id: "s2", pipeline_id: "p", status: "open" },
    });
    rpc.mockClear();
    await avisarMudancaDeEtapa(cliente, "org", "l1", "s2", "opa.ficha");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("etiqueta só avisa quando entra", async () => {
    const { cliente, rpc } = falso(null);
    await avisarTagsNovas(cliente, "org", "l1", [], ["a"], "opa.etiqueta");
    expect(rpc).not.toHaveBeenCalled();
    await avisarTagsNovas(cliente, "org", "l1", ["a"], ["a"], "opa.etiqueta");
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_event_type: "lead.tag_added", p_payload: { added_tags: ["a"], tags: ["a"] } });
  });

  it("falha no banco nunca derruba a ação do corretor", async () => {
    const quebrado = { rpc: () => { throw new Error("x"); }, from: () => { throw new Error("x"); } } as unknown as SupabaseClient;
    await expect(etapaAtual(quebrado, "org", "l1")).resolves.toBeNull();
    await expect(avisarMudancaDeEtapa(quebrado, "org", "l1", "s1", "t")).resolves.toBeUndefined();
    await expect(avisarLeadCriado(quebrado, "org", { id: "l1", pipeline_id: "p", stage_id: "s", title: "t" }, "t")).resolves.toBeUndefined();
  });
});
