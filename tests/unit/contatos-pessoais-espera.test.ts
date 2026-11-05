import { randomBytes } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Conversa em espera do contato a classificar (0124, decisão do Allyson de
 * 02/11/2026): "É lead" leva as mensagens guardadas para a conversa normal
 * (messages, mesmo caminho do histórico) e limpa a espera; duas promoções não
 * duplicam; "Pessoal" apaga; sem decisão, some em 7 dias. Banco em memória, só
 * com o que estes caminhos usam.
 */

process.env.PII_CHAVES = `v1:${randomBytes(32).toString("base64")}`;
process.env.PII_CHAVE_ATUAL = "v1";
process.env.PII_CHAVE_INDICE = randomBytes(32).toString("base64");
const { cifrar, decifrar, esquecerChaves, indiceTelefone } = await import("@/lib/crypto/dados-pessoais");
esquecerChaves();

const ORG = "org-1";
const SESSAO = {
  id: "sessao-corretor",
  organization_id: ORG,
  owner_user_id: "corretor-1",
  waha_session_name: "org_corretor",
  is_warmup_complete: true,
  warmup_started_at: null,
  pessoais_import_inicio: "2026-01-01T00:00:00Z",
  pessoais_importados_em: "2026-01-01T00:15:00Z",
};
const ESPERA = "whatsapp_mensagens_a_classificar";

type Linha = Record<string, unknown>;
let db: Record<string, Linha[]> = {};
let seq = 0;

const tabela = (t: string) => (db[t] ??= []);

/** Chaves únicas que o banco de verdade impõe e que estes caminhos dependem. */
const UNICAS: Record<string, string[][]> = {
  messages: [["organization_id", "external_id"]],
  [ESPERA]: [["channel_session_id", "mensagem_wa_id"]],
  whatsapp_contatos_numero: [["channel_session_id", "chave"]],
};

function conflita(t: string, nova: Linha): boolean {
  return (UNICAS[t] ?? []).some((cols) => tabela(t).some((l) => cols.every((c) => l[c] === nova[c])));
}

function consulta(t: string) {
  let op: "select" | "insert" | "upsert" | "update" | "delete" = "select";
  let valor: Linha | Linha[] = {};
  let opcoes: { ignoreDuplicates?: boolean } = {};
  let devolve = false;
  let ordem: [string, boolean] | null = null;
  let limite: number | null = null;
  const filtros: Array<(l: Linha) => boolean> = [];

  const executar = () => {
    const casa = (l: Linha) => filtros.every((f) => f(l));
    if (op === "select") {
      let r = tabela(t).filter(casa);
      if (ordem) {
        const [c, asc] = ordem;
        r = [...r].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : String(a[c]) > String(b[c]) ? 1 : 0) * (asc ? 1 : -1));
      }
      if (limite != null) r = r.slice(0, limite);
      return { data: r, count: r.length, error: null };
    }
    if (op === "insert" || op === "upsert") {
      const criadas: Linha[] = [];
      for (const v of [valor].flat()) {
        const nova = { id: `${t}-${++seq}`, created_at: new Date().toISOString(), ...v };
        if (conflita(t, nova)) {
          if (op === "upsert" && opcoes.ignoreDuplicates) continue;
          return { data: null, error: { code: "23505", message: "duplicate key" } };
        }
        tabela(t).push(nova);
        criadas.push(nova);
      }
      return { data: devolve ? criadas : null, error: null };
    }
    if (op === "update") {
      const r = tabela(t).filter(casa);
      for (const l of r) Object.assign(l, valor);
      return { data: devolve ? r : null, error: null };
    }
    const fora = tabela(t).filter(casa);
    db[t] = tabela(t).filter((l) => !casa(l));
    return { data: null, count: fora.length, error: null };
  };

  const q = {
    select: () => {
      if (op !== "select") devolve = true;
      return q;
    },
    insert: (v: Linha) => ((op = "insert"), (valor = v), q),
    upsert: (v: Linha, o?: { ignoreDuplicates?: boolean }) => ((op = "upsert"), (valor = v), (opcoes = o ?? {}), q),
    update: (v: Linha) => ((op = "update"), (valor = v), q),
    delete: () => ((op = "delete"), q),
    eq: (c: string, v: unknown) => (filtros.push((l) => l[c] === v), q),
    neq: (c: string, v: unknown) => (filtros.push((l) => l[c] !== v), q),
    is: (c: string, v: unknown) => (filtros.push((l) => (l[c] ?? null) === v), q),
    in: (c: string, vs: unknown[]) => (filtros.push((l) => vs.includes(l[c])), q),
    lt: (c: string, v: string) => (filtros.push((l) => String(l[c]) < v), q),
    or: () => q,
    order: (c: string, o?: { ascending?: boolean }) => ((ordem = [c, o?.ascending !== false]), q),
    limit: (n: number) => ((limite = n), q),
    maybeSingle: async () => {
      const r = executar();
      return { ...r, data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data };
    },
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(executar()).then(ok, erro),
  };
  return q;
}

const admin = {
  from: (t: string) => consulta(t),
  rpc: async (fn: string, a: Record<string, unknown>) => {
    if (fn === "fn_upsert_wa_contact") {
      const identidade = a.p_kind === "phone" ? `phone:${a.p_phone}` : `lid:${a.p_lid}`;
      let c = tabela("contacts").find((x) => x.wa_identity === identidade);
      if (!c) {
        c = {
          id: `contato-${++seq}`,
          organization_id: a.p_org,
          wa_identity: identidade,
          phone_number: a.p_kind === "phone" ? a.p_phone : null,
          telefone_cifrado: null,
          display_name: a.p_notify ?? null,
        };
        tabela("contacts").push(c);
      }
      return { data: c.id, error: null };
    }
    if (fn === "fn_upsert_wa_conversation") {
      let c = tabela("conversations").find((x) => x.contact_id === a.p_contact && x.channel_session_id === a.p_session);
      if (!c) {
        c = { id: `conversa-${++seq}`, organization_id: a.p_org, contact_id: a.p_contact, channel_session_id: a.p_session, last_message_at: null };
        tabela("conversations").push(c);
      }
      return { data: c.id, error: null };
    }
    if (fn === "fn_mark_conversation_message") {
      const c = tabela("conversations").find((x) => x.id === a.p_conv);
      if (c) Object.assign(c, { last_message_at: a.p_at, last_message_preview: a.p_preview });
      return { data: null, error: null };
    }
    return { data: null, error: null };
  },
};

const waha = { getChatMessages: vi.fn(), createLabel: vi.fn() };
vi.mock("@/lib/waha/client", () => ({ getWahaClient: () => waha }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
// Como o de verdade: o segundo pedido para o mesmo contato acha o lead que já existe.
const leadsCriados = new Set<string>();
const registrarLead = vi.fn(async (_a: unknown, _org: string, contactId: string) => {
  const novo = !leadsCriados.has(contactId);
  leadsCriados.add(contactId);
  return { novo, leadId: "lead-1" };
});
vi.mock("@/lib/opa/entrada", () => ({ registrarLeadDoContato: registrarLead }));

const {
  aplicarDecisao,
  apagarEsperaVencida,
  chaveDoChat,
} = await import(
  "@/lib/waha/contatos-pessoais"
);

type AdminFalso = Parameters<typeof aplicarDecisao>[0];
const A = admin as unknown as AdminFalso;

const cifra = (v: string, campo: "nome" | "telefone" | "mensagem") => cifrar(v, { org: ORG, campo });

/** Um contato a classificar com três mensagens em espera (duas do cliente, uma do corretor, um áudio). */
function semear(chatId: string, o: { telefone?: string | null; nome?: string | null } = {}) {
  db = {};
  seq = 0;
  const telefone = o.telefone === undefined ? null : o.telefone;
  tabela("whatsapp_contatos_numero").push({
    id: "linha-1",
    organization_id: ORG,
    channel_session_id: SESSAO.id,
    chave: chaveDoChat(ORG, chatId),
    situacao: "a_classificar",
    origem: "novo",
    mensagens_ignoradas: 3,
    nome_cifrado: o.nome === null ? null : cifra(o.nome ?? "Marina", "nome"),
    telefone_cifrado: telefone ? cifra(telefone, "telefone") : null,
    chat_cifrado: cifra(chatId, "telefone"),
  });
  semearEspera();
}

function semearEspera() {
  const base = { organization_id: ORG, channel_session_id: SESSAO.id, contato_numero_id: "linha-1" };
  tabela(ESPERA).push(
    { ...base, id: "e1", mensagem_wa_id: "3EB0A1", direcao: "entrada", tipo: "text", corpo_cifrado: cifra("Oi, vi a casa da Siriúba", "mensagem"), mensagem_em: "2026-11-02T12:00:00.000Z", created_at: new Date().toISOString() },
    { ...base, id: "e2", mensagem_wa_id: "3EB0A2", direcao: "saida", tipo: "text", corpo_cifrado: cifra("Oi! Te mando as fotos", "mensagem"), mensagem_em: "2026-11-02T12:05:00.000Z", created_at: new Date().toISOString() },
    { ...base, id: "e3", mensagem_wa_id: "3EB0A3", direcao: "entrada", tipo: "audio", corpo_cifrado: null, mensagem_em: "2026-11-02T12:07:00.000Z", created_at: new Date().toISOString() },
  );
}

const decidir = (chatId: string, d: "lead" | "pessoal") =>
  aplicarDecisao(A, SESSAO, chatId, d, { origem: "corretor", porUserId: "corretor-1", requestId: "req-1", nome: "Marina" });

beforeEach(() => {
  waha.getChatMessages.mockReset();
  // Sem o store do NOWEB, o histórico do WAHA falha (documentação oficial).
  waha.getChatMessages.mockRejectedValue(new Error("store desligado"));
  registrarLead.mockClear();
  leadsCriados.clear();
});

describe("É lead: a conversa em espera vai para a ficha", () => {
  const CHAT = "5512999990000@c.us";

  it("leva as mensagens para messages, na ordem e com o sentido certo, e limpa a espera", async () => {
    semear(CHAT, { telefone: "+5512999990000" });
    await decidir(CHAT, "lead");

    const msgs = tabela("messages");
    expect(msgs.map((m) => [m.direction, m.body, m.type])).toEqual([
      ["inbound", "Oi, vi a casa da Siriúba", "text"],
      ["outbound", "Oi! Te mando as fotos", "text"],
      ["inbound", null, "audio"],
    ]);
    // Mesmo formato de id do webhook do NOWEB: o dedup por external_id pega o resto.
    expect(msgs.map((m) => m.external_id)).toEqual([
      `false_${CHAT}_3EB0A1`,
      `true_${CHAT}_3EB0A2`,
      `false_${CHAT}_3EB0A3`,
    ]);
    expect(msgs.every((m) => m.media_url == null)).toBe(true);
    expect(tabela(ESPERA)).toEqual([]);
    expect(tabela("whatsapp_contatos_numero")[0]?.situacao).toBe("lead");
    expect(registrarLead).toHaveBeenCalledTimes(1);
    // A conversa fica carimbada com a mais recente da espera.
    expect(tabela("conversations")[0]?.last_message_at).toBe("2026-11-02T12:07:00.000Z");
  });

  it("o histórico do WAHA falhar (store desligado) não atrapalha", async () => {
    semear(CHAT);
    await decidir(CHAT, "lead");
    expect(waha.getChatMessages).toHaveBeenCalledTimes(1);
    expect(tabela("messages")).toHaveLength(3);
  });

  it("se o WAHA devolver a mesma mensagem, ela não entra duas vezes", async () => {
    semear(CHAT);
    waha.getChatMessages.mockResolvedValue([
      { id: `false_${CHAT}_3EB0A1`, from: CHAT, fromMe: false, body: "Oi, vi a casa da Siriúba", timestamp: 1_793_000_000 },
    ]);
    await decidir(CHAT, "lead");
    expect(tabela("messages")).toHaveLength(3);
  });

  it("duas promoções seguidas não duplicam nada", async () => {
    semear(CHAT);
    await decidir(CHAT, "lead");
    await decidir(CHAT, "lead");
    expect(tabela("messages")).toHaveLength(3);
    // Uma atividade "virou lead" só.
    expect(tabela("crm_lead_activities").filter((a) => a.type === "lead_do_whatsapp")).toHaveLength(1);
  });

  it("levar de novo a mesma espera (a limpeza falhou no meio) também não duplica", async () => {
    semear(CHAT);
    await decidir(CHAT, "lead");
    semearEspera();
    await decidir(CHAT, "lead"); // contato já é lead: só leva a espera de novo
    expect(tabela("messages")).toHaveLength(3);
    expect(tabela(ESPERA)).toEqual([]);
  });

  it("número oculto (@lid) com telefone descoberto: o contato do lead fica com o telefone, cifrado", async () => {
    const LID = "250302204792918@lid";
    semear(LID, { telefone: "+5512988887777" });
    await decidir(LID, "lead");
    const contato = tabela("contacts")[0]!;
    // phone_number não muda: trocar mudaria a identidade (wa_identity) e a próxima
    // mensagem do mesmo @lid criaria outro contato.
    expect(contato.phone_number).toBeNull();
    expect(contato.wa_identity).toBe("lid:250302204792918");
    expect(decifrar(String(contato.telefone_cifrado), { org: ORG, campo: "telefone" })).toBe("+5512988887777");
    expect(contato.telefone_indice).toBe(indiceTelefone(ORG, "+5512988887777"));
    expect(tabela("messages")).toHaveLength(3);
  });

  it("número oculto sem telefone: vira lead do mesmo jeito, sem telefone", async () => {
    const LID = "250302204792918@lid";
    semear(LID);
    await decidir(LID, "lead");
    expect(tabela("contacts")[0]?.telefone_cifrado).toBeNull();
    expect(tabela("messages")).toHaveLength(3);
  });
});

describe("Pessoal e limpeza de 7 dias", () => {
  const CHAT = "5512999990000@c.us";

  it("pessoal apaga a espera e os dados do contato, sem levar nada para messages", async () => {
    semear(CHAT, { telefone: "+5512999990000" });
    await decidir(CHAT, "pessoal");
    expect(tabela(ESPERA)).toEqual([]);
    expect(tabela("messages")).toEqual([]);
    const linha = tabela("whatsapp_contatos_numero")[0]!;
    expect(linha).toMatchObject({ situacao: "pessoal", telefone_cifrado: null, nome_cifrado: null, chat_cifrado: null });
  });

  it("apaga só o que tem mais de 7 dias", async () => {
    semear(CHAT);
    const agora = Date.parse("2026-11-10T12:00:00Z");
    tabela(ESPERA)[0]!.created_at = "2026-11-03T11:59:00.000Z"; // 7 dias e 1 minuto
    tabela(ESPERA)[1]!.created_at = "2026-11-03T12:01:00.000Z"; // ainda dentro
    tabela(ESPERA)[2]!.created_at = "2026-11-09T12:00:00.000Z";
    expect(await apagarEsperaVencida(A, agora)).toBe(1);
    expect(tabela(ESPERA).map((m) => m.id)).toEqual(["e2", "e3"]);
  });
});
