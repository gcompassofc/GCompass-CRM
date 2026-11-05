import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Etiquetas no motor GOWS (05/11/2026): o evento vem sem o nome da etiqueta, o WAHA
 * não avisa as que já existiam ao conectar, e criar etiqueta com a lista ainda vazia
 * sobrescreveria a etiqueta 1 do corretor.
 */
const waha = {
  listLabels: vi.fn(),
  chatsDaEtiqueta: vi.fn(),
  createLabel: vi.fn(),
  setChatLabels: vi.fn(),
  getChatMessages: vi.fn(async () => []),
  telefoneDoLid: vi.fn(async () => null),
};
vi.mock("@/lib/waha/client", () => ({ getWahaClient: () => waha }));

const registrarLeadDoContato = vi.fn(async () => ({ leadId: "lead-1", novo: true }));
vi.mock("@/lib/opa/entrada", () => ({ registrarLeadDoContato }));
vi.mock("@/lib/opa/conversa-do-lead", () => ({ entregarConversaAoDono: vi.fn() }));
vi.mock("@/lib/opa/eventos-lead", () => ({ avisarMudancaDeEtapa: vi.fn() }));

interface Op {
  tabela: string;
  op: string;
  valor?: unknown;
}

const estado: { contato: Record<string, unknown> | null; leadAberto: boolean; ops: Op[] } = { contato: null, leadAberto: false, ops: [] };

function resposta(tabela: string, op: string, um: boolean) {
  if (tabela === "whatsapp_contatos_numero" && op === "select") return { data: estado.contato, error: null };
  if (tabela === "whatsapp_contatos_numero") return { data: [{ id: "linha-1" }], error: null };
  if (tabela === "contacts") return { data: um ? { display_name: "Marina", name: null } : estado.leadAberto ? [{ id: "c1" }] : [], error: null };
  if (tabela === "crm_leads" && op === "count") return { data: null, count: estado.leadAberto ? 1 : 0, error: null };
  return { data: um ? null : [], error: null };
}

function consulta(tabela: string) {
  let op = "select";
  const q: Record<string, unknown> = {};
  const devolve = () => q;
  const grava = (nome: string) => (v?: unknown) => {
    op = nome;
    estado.ops.push({ tabela, op, valor: v });
    return q;
  };
  Object.assign(q, {
    select: (_c?: string, o?: { head?: boolean }) => {
      if (op === "select" && o?.head) op = "count";
      return q;
    },
    insert: grava("insert"),
    upsert: grava("upsert"),
    update: grava("update"),
    delete: grava("delete"),
    eq: devolve,
    gte: devolve,
    in: devolve,
    is: devolve,
    not: devolve,
    or: devolve,
    lt: devolve,
    limit: devolve,
    order: devolve,
    maybeSingle: async () => resposta(tabela, op, true),
    single: async () => resposta(tabela, op, true),
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resposta(tabela, op, false)).then(ok, erro),
  });
  return q;
}

const admin = {
  from: (t: string): Record<string, unknown> => consulta(t),
  rpc: async (fn: string) => {
    if (fn === "fn_upsert_wa_contact") return { data: "contato-1", error: null };
    if (fn === "fn_upsert_wa_conversation") return { data: "conversa-1", error: null };
    return { data: null, error: null };
  },
};

const { conciliarEtiquetas, filtrarEventoDoCorretor } = await import("@/lib/waha/contatos-pessoais");

function sessao(extra: Record<string, unknown> = {}) {
  return {
    id: "sessao-1",
    organization_id: "org-1",
    owner_user_id: "corretor-1",
    waha_session_name: "org_corretor",
    status: "WORKING",
    is_warmup_complete: true,
    warmup_started_at: null,
    etiqueta_lead_id: null,
    etiqueta_pessoal_id: null,
    ...extra,
  };
}

const ETIQUETAS_DO_APARELHO = [
  { id: "1", name: "Novo cliente", type: 4 },
  { id: "9", name: "Leads", type: 16 },
  { id: "11", name: "Lead OPA", type: 5 },
  { id: "12", name: "Pessoal", type: 5 },
];

const decisoes = () =>
  estado.ops
    .filter((o) => o.tabela === "whatsapp_contatos_numero" && (o.op === "upsert" || o.op === "update"))
    .map((o) => (o.valor as { situacao?: string }).situacao);

beforeEach(() => {
  vi.clearAllMocks();
  estado.contato = null;
  estado.leadAberto = false;
  estado.ops = [];
  waha.listLabels.mockResolvedValue(ETIQUETAS_DO_APARELHO);
  waha.chatsDaEtiqueta.mockResolvedValue([]);
  waha.createLabel.mockResolvedValue({ id: "20", name: "x" });
});

describe("conciliar etiquetas", () => {
  it("lista vazia não cria etiqueta: criaria por cima da etiqueta 1", async () => {
    waha.listLabels.mockResolvedValue([]);
    await conciliarEtiquetas(admin as never, sessao() as never, "req");
    expect(waha.createLabel).not.toHaveBeenCalled();
  });

  it("acha pelo nome, sem criar repetida e sem confundir com a lista interna de leads", async () => {
    const s = sessao();
    await conciliarEtiquetas(admin as never, s as never, "req");
    expect(waha.createLabel).not.toHaveBeenCalled();
    expect(s.etiqueta_lead_id).toBe("11");
    expect(s.etiqueta_pessoal_id).toBe("12");
  });

  it("cria só a que falta", async () => {
    waha.listLabels.mockResolvedValue(ETIQUETAS_DO_APARELHO.filter((l) => l.name !== "Pessoal"));
    await conciliarEtiquetas(admin as never, sessao() as never, "req");
    expect(waha.createLabel).toHaveBeenCalledTimes(1);
    expect(waha.createLabel).toHaveBeenCalledWith("org_corretor", "Pessoal", 9);
  });

  it("conversa etiquetada antes de conectar vira lead, sem etiquetar de novo", async () => {
    waha.chatsDaEtiqueta.mockImplementation(async (_s: string, id: string) => (id === "11" ? [{ id: "5512999990000@c.us" }] : []));
    const feitas = await conciliarEtiquetas(admin as never, sessao() as never, "req");
    expect(feitas).toBe(1);
    expect(decisoes()).toContain("lead");
    expect(registrarLeadDoContato).toHaveBeenCalledTimes(1);
  });

  it("quem já é lead não é refeito", async () => {
    estado.contato = { id: "linha-1", situacao: "lead", mensagens_ignoradas: 0 };
    waha.chatsDaEtiqueta.mockImplementation(async (_s: string, id: string) => (id === "11" ? [{ id: "5512999990000@c.us" }] : []));
    expect(await conciliarEtiquetas(admin as never, sessao() as never, "req")).toBe(0);
  });

  it("decisão tomada no CRM não é desfeita pela etiqueta que ficou no aparelho", async () => {
    estado.contato = { id: "linha-1", situacao: "pessoal", mensagens_ignoradas: 0, decidido_em: "2026-11-05T10:00:00Z" };
    waha.chatsDaEtiqueta.mockImplementation(async (_s: string, id: string) => (id === "11" ? [{ id: "5512999990000@c.us" }] : []));
    expect(await conciliarEtiquetas(admin as never, sessao() as never, "req")).toBe(0);
  });

  it("etiqueta Pessoal antiga não encerra lead aberto", async () => {
    estado.leadAberto = true;
    waha.chatsDaEtiqueta.mockImplementation(async (_s: string, id: string) => (id === "12" ? [{ id: "5512999990000@c.us" }] : []));
    expect(await conciliarEtiquetas(admin as never, sessao() as never, "req")).toBe(0);
    expect(decisoes()).toEqual([]);
  });

  it("no NOWEB sem store a lista falha e nada quebra", async () => {
    waha.listLabels.mockRejectedValue(new Error("waha_400: Enable NOWEB store"));
    expect(await conciliarEtiquetas(admin as never, sessao() as never, "req")).toBe(0);
  });
});

describe("evento de etiqueta no GOWS (sem o nome)", () => {
  const evento = (labelId: string) => ({
    event: "label.chat.added",
    session: "org_corretor",
    payload: { labelId, chatId: "5512999990000@c.us", label: null },
  });

  it("id desconhecido confere na lista e vira lead", async () => {
    await filtrarEventoDoCorretor(admin as never, sessao() as never, evento("11") as never, "req");
    expect(waha.listLabels).toHaveBeenCalled();
    expect(decisoes()).toContain("lead");
  });

  it("etiqueta de outro assunto não faz nada", async () => {
    await filtrarEventoDoCorretor(admin as never, sessao() as never, evento("1") as never, "req");
    expect(decisoes()).toEqual([]);
    expect(registrarLeadDoContato).not.toHaveBeenCalled();
  });
});

describe("lead da OPA não vira pessoal pela etiqueta", () => {
  const evento = { event: "label.chat.added", session: "s", payload: { labelId: "12", chatId: "5512999990000@c.us", label: null } };
  const leadsDoContato = (tags: string[]) => {
    const original = admin.from;
    admin.from = (t: string) => {
      const q = original(t);
      if (t === "crm_leads") q.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: "lead-opa", tags, lost_reason: null }], error: null }).then(ok);
      return q;
    };
    return () => {
      admin.from = original;
    };
  };

  it("a etiqueta Pessoal num lead de anúncio é recusada, com registro, e nada se apaga", async () => {
    const volta = leadsDoContato(["pago"]);
    estado.leadAberto = true;
    await filtrarEventoDoCorretor(admin as never, sessao() as never, evento as never, "req");
    volta();
    expect(decisoes()).toEqual([]);
    expect(estado.ops.some((o) => o.tabela === "messages" && o.op === "delete")).toBe(false);
    expect(estado.ops.find((o) => o.tabela === "crm_lead_activities")?.valor).toMatchObject({ type: "pessoal_recusado", lead_id: "lead-opa" });
  });

  it("em lead próprio a etiqueta Pessoal vale", async () => {
    const volta = leadsDoContato(["organico", "proprio"]);
    estado.leadAberto = true;
    await filtrarEventoDoCorretor(admin as never, sessao() as never, evento as never, "req");
    volta();
    expect(decisoes()).toContain("pessoal");
  });
});

describe("mensagem por @lid com o telefone no payload", () => {
  it("segue pelo telefone, para o contato do lead não se partir em dois", async () => {
    const envelope = {
      event: "message",
      session: "org_corretor",
      payload: {
        id: "false_250302204792918@lid_3EB0AAA",
        from: "250302204792918@lid",
        fromMe: false,
        body: "Oi",
        _data: { Info: { Chat: "250302204792918@lid", SenderAlt: "5512999990000@s.whatsapp.net", PushName: "Marina" } },
      },
    };
    await filtrarEventoDoCorretor(admin as never, sessao() as never, envelope as never, "req");
    expect(envelope.payload.from).toBe("5512999990000@c.us");
  });
});
