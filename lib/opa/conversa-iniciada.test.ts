/**
 * Etiqueta "conversou" na primeira mensagem (13/11/2026).
 *
 * @vitest-environment node
 */
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { ETIQUETA_CONVERSOU, marcarConversou } from "./conversa-iniciada";

function cliente(resposta: { data: unknown; error: unknown } | Error) {
  const rpc = vi.fn(async (nome: string) => {
    if (nome === "emit_event") return { error: null };
    if (resposta instanceof Error) throw resposta;
    return resposta;
  });
  return { admin: { rpc } as unknown as SupabaseClient, rpc };
}

describe("marcarConversou", () => {
  it("pede ao banco e avisa lead.tag_added para cada card marcado", async () => {
    const { admin, rpc } = cliente({ data: [{ lead_id: "l1", tags: ["site", "conversou"] }], error: null });
    const n = await marcarConversou(admin, "org", "c1", "waha.inbound");
    expect(n).toBe(1);
    expect(rpc).toHaveBeenNthCalledWith(1, "fn_opa_marcar_conversou", { p_org: "org", p_contact: "c1" });
    expect(rpc).toHaveBeenNthCalledWith(2, "emit_event", expect.objectContaining({
      p_event_type: "lead.tag_added",
      p_entity_id: "l1",
      p_organization_id: "org",
      p_payload: { added_tags: [ETIQUETA_CONVERSOU], tags: ["site", "conversou"] },
      p_metadata: { origem: "waha.inbound" },
    }));
  });

  it("nenhum card marcado (já tinha a etiqueta ou não veio do site): não avisa nada", async () => {
    const { admin, rpc } = cliente({ data: [], error: null });
    expect(await marcarConversou(admin, "org", "c1", "waha.inbound")).toBe(0);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("erro do banco ou exceção não quebra a mensagem", async () => {
    const comErro = cliente({ data: null, error: { code: "42883", message: "função não existe" } });
    expect(await marcarConversou(comErro.admin, "org", "c1", "waha.inbound")).toBe(0);
    const comExcecao = cliente(new Error("rede"));
    expect(await marcarConversou(comExcecao.admin, "org", "c1", "waha.inbound")).toBe(0);
  });
});
