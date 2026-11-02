import { createHmac, randomBytes } from "node:crypto";

import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Prova de privacidade (pedido do Allyson, 01/11/2026): no WhatsApp do corretor,
 * mensagem de contato pessoal ou a classificar NÃO deixa corpo no
 * webhook_events_log, em messages nem evento para a IA. Passa pela rota de
 * verdade (auth HMAC + filtro + ingest), só o banco é de mentira.
 *
 * Desde 02/11/2026 (0124) a mensagem de contato a classificar fica guardada
 * CIFRADA em whatsapp_mensagens_a_classificar, para o corretor ver quem é.
 */

// Chaves de cifra só deste arquivo (o CI não tem .env.local): a cifra está ligada.
process.env.PII_CHAVES = `v1:${randomBytes(32).toString("base64")}`;
process.env.PII_CHAVE_ATUAL = "v1";
process.env.PII_CHAVE_INDICE = randomBytes(32).toString("base64");
const { decifrar, esquecerChaves } = await import("@/lib/crypto/dados-pessoais");
esquecerChaves();
const ORG = "org-1";

const SEGREDO = "segredo-de-teste-com-mais-de-16";
const NUMERO_DO_CORRETOR = {
  id: "sessao-corretor",
  organization_id: "org-1",
  waha_session_name: "org_corretor",
  webhook_secret_encrypted: "\\x00",
  status: "WORKING",
  is_warmup_complete: true,
  warmup_started_at: null,
  owner_user_id: "corretor-1",
  pessoais_import_inicio: "2026-01-01T00:00:00Z",
  pessoais_importados_em: "2026-01-01T00:15:00Z",
  etiqueta_lead_id: "7",
  etiqueta_pessoal_id: "8",
};
const NUMERO_DA_EMPRESA = { ...NUMERO_DO_CORRETOR, id: "sessao-empresa", owner_user_id: null };

interface Op {
  tabela: string;
  op: string;
  valor?: unknown;
}

const estado: {
  sessao: Record<string, unknown>;
  contato: { id: string; situacao: string; mensagens_ignoradas: number; nome_cifrado?: string | null; telefone_cifrado?: string | null } | null;
  leadNoCrm: boolean;
  ops: Op[];
} = { sessao: NUMERO_DO_CORRETOR, contato: null, leadNoCrm: false, ops: [] };

function resposta(tabela: string, op: string, modo: "um" | "varios") {
  if (tabela === "channel_sessions" && op === "select") return { data: estado.sessao, error: null };
  if (tabela === "whatsapp_contatos_numero" && op === "select") return { data: estado.contato, error: null };
  if (tabela === "whatsapp_contatos_numero" && (op === "upsert" || op === "update")) return { data: [{ id: "linha-1" }], error: null };
  if (tabela === "contacts" && op === "select") return { data: estado.leadNoCrm ? [{ id: "c1" }] : [], error: null };
  if (tabela === "crm_leads" && op === "count") return { data: null, count: estado.leadNoCrm ? 1 : 0, error: null };
  if (op === "insert") return { data: { id: "novo-1" }, error: null };
  return { data: modo === "um" ? null : [], error: null };
}

function consulta(tabela: string) {
  let op = "select";
  const q: Record<string, unknown> = {};
  const devolve = () => q;
  Object.assign(q, {
    select: (_c?: string, o?: { head?: boolean }) => {
      if (op === "select" && o?.head) op = "count";
      return q;
    },
    insert: (v: unknown) => {
      op = "insert";
      estado.ops.push({ tabela, op, valor: v });
      return q;
    },
    upsert: (v: unknown) => {
      op = "upsert";
      estado.ops.push({ tabela, op, valor: v });
      return q;
    },
    update: (v: unknown) => {
      op = "update";
      estado.ops.push({ tabela, op, valor: v });
      return q;
    },
    delete: () => {
      op = "delete";
      estado.ops.push({ tabela, op });
      return q;
    },
    eq: devolve,
    neq: devolve,
    in: devolve,
    is: devolve,
    or: devolve,
    limit: devolve,
    order: devolve,
    maybeSingle: async () => resposta(tabela, op, "um"),
    single: async () => resposta(tabela, op, "um"),
    then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
      Promise.resolve(resposta(tabela, op, "varios")).then(ok, erro),
  });
  return q;
}

const admin = {
  from: (t: string) => consulta(t),
  rpc: async (fn: string) => {
    estado.ops.push({ tabela: `rpc:${fn}`, op: "rpc" });
    if (fn === "fn_decrypt_oauth") return { data: SEGREDO, error: null };
    if (fn === "fn_upsert_wa_contact") return { data: "contato-1", error: null };
    if (fn === "fn_upsert_wa_conversation") return { data: "conversa-1", error: null };
    return { data: null, error: null };
  },
};

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
const depois = vi.fn();
vi.mock("next/server", async (orig) => ({ ...(await orig<Record<string, unknown>>()), after: (f: unknown) => depois(f) }));

const { POST } = await import("@/app/api/v1/webhooks/waha/route");

function pedido(envelope: Record<string, unknown>): NextRequest {
  const corpo = JSON.stringify(envelope);
  const assinatura = createHmac("sha512", SEGREDO).update(corpo, "utf8").digest("hex");
  return new NextRequest("http://localhost/api/v1/webhooks/waha", {
    method: "POST",
    body: corpo,
    headers: { "content-type": "application/json", "x-webhook-hmac": assinatura },
  });
}

const mensagem = (body: string, extra: Record<string, unknown> = {}) => ({
  event: "message",
  session: "org_corretor",
  payload: { id: "false_5512999990000@c.us_3EB0AAA", from: "5512999990000@c.us", fromMe: false, body, timestamp: 1_790_000_000, ...extra },
});

const gravouConteudo = () =>
  estado.ops.some(
    (o) =>
      (o.tabela === "messages" && o.op === "insert") ||
      o.tabela === "webhook_events_log" ||
      o.tabela === "rpc:emit_event" ||
      o.tabela === "rpc:fn_upsert_wa_contact",
  );

/** O que foi para whatsapp_mensagens_a_classificar (0124). */
const espera = () =>
  estado.ops.filter((o) => o.tabela === "whatsapp_mensagens_a_classificar" && o.op === "upsert").map((o) => o.valor as Record<string, unknown>);

beforeEach(() => {
  estado.sessao = NUMERO_DO_CORRETOR;
  estado.contato = null;
  estado.leadNoCrm = false;
  estado.ops = [];
  depois.mockReset();
});

describe("WhatsApp do corretor: conversa pessoal não é guardada", () => {
  it("contato pessoal: nada no log, nada em messages, nada para a IA", async () => {
    estado.contato = { id: "linha-1", situacao: "pessoal", mensagens_ignoradas: 3 };
    const r = await POST(pedido(mensagem("Bora no churrasco sábado? Leva a cerveja")));
    expect(r.status).toBe(200);
    expect(gravouConteudo()).toBe(false);
    // Só a contagem da linha do contato é atualizada (sem dado nenhum).
    const atualizacoes = estado.ops.filter((o) => o.tabela === "whatsapp_contatos_numero");
    expect(atualizacoes).toHaveLength(1);
    expect(JSON.stringify(atualizacoes[0]?.valor)).not.toMatch(/churrasco|5512999990000/);
  });

  it("contato nunca visto (fora da janela): vira a classificar, sem corpo no log, em messages nem na IA", async () => {
    const r = await POST(pedido(mensagem("Oi, tudo bem?")));
    expect(r.status).toBe(200);
    expect(gravouConteudo()).toBe(false);
    const nova = estado.ops.find((o) => o.tabela === "whatsapp_contatos_numero" && o.op === "upsert");
    expect(nova?.valor).toMatchObject({ situacao: "a_classificar", origem: "novo", mensagens_ignoradas: 1 });
    expect(JSON.stringify(nova?.valor)).not.toMatch(/Oi, tudo bem/);
  });

  it("logo depois de ligar o número, o que aparece é pessoal e não guarda nem o telefone", async () => {
    estado.sessao = { ...NUMERO_DO_CORRETOR, pessoais_import_inicio: new Date().toISOString(), pessoais_importados_em: null };
    await POST(pedido(mensagem("Mãe, chego às 8")));
    expect(gravouConteudo()).toBe(false);
    const nova = estado.ops.find((o) => o.tabela === "whatsapp_contatos_numero" && o.op === "upsert");
    expect(nova?.valor).toMatchObject({ situacao: "pessoal", origem: "importacao", telefone_cifrado: null, nome_cifrado: null, chat_cifrado: null });
    // Janela de 15 min depois do QR: nada vai para a espera.
    expect(espera()).toEqual([]);
  });

  it("contato pessoal não vai para a espera", async () => {
    estado.contato = { id: "linha-1", situacao: "pessoal", mensagens_ignoradas: 3 };
    await POST(pedido(mensagem("Bora no churrasco sábado?")));
    expect(espera()).toEqual([]);
  });

  it("grupo do corretor é descartado antes de qualquer gravação", async () => {
    await POST(
      pedido({ event: "message", session: "org_corretor", payload: { id: "x", from: "120363@g.us", fromMe: false, body: "família" } }),
    );
    expect(estado.ops.filter((o) => !o.tabela.startsWith("rpc:fn_decrypt") && o.tabela !== "channel_sessions")).toEqual([]);
  });

  it("etiqueta trazida pelo WhatsApp não deixa o telefone no log", async () => {
    await POST(pedido({ event: "label.chat.added", session: "org_corretor", payload: { labelId: "8", chatId: "5512999990000@c.us", label: null } }));
    expect(estado.ops.some((o) => o.tabela === "webhook_events_log")).toBe(false);
    // Etiqueta "Pessoal" (id guardado): grava a decisão sem dado.
    const decisao = estado.ops.find((o) => o.tabela === "whatsapp_contatos_numero");
    expect(decisao?.valor).toMatchObject({ situacao: "pessoal", telefone_cifrado: null });
  });
});

describe("WhatsApp do corretor: lead é guardado", () => {
  it("lead já marcado segue o caminho normal (log, mensagem e IA)", async () => {
    estado.contato = { id: "linha-1", situacao: "lead", mensagens_ignoradas: 0 };
    await POST(pedido(mensagem("Quero visitar a casa no sábado")));
    expect(estado.ops.some((o) => o.tabela === "webhook_events_log")).toBe(true);
    expect(estado.ops.some((o) => o.tabela === "messages" && o.op === "insert")).toBe(true);
  });

  it("mensagem com o texto do botão do site vira lead e agenda criar o lead e trazer o histórico", async () => {
    await POST(pedido(mensagem("Olá! Tenho interesse no imóvel CA006634 (Casa na costeira)")));
    expect(estado.ops.some((o) => o.tabela === "messages" && o.op === "insert")).toBe(true);
    expect(depois).toHaveBeenCalledTimes(1);
  });

  it("número da empresa (sem dono) não passa pelo filtro: tudo como antes", async () => {
    estado.sessao = NUMERO_DA_EMPRESA;
    await POST(pedido(mensagem("Bom dia")));
    expect(estado.ops.some((o) => o.tabela === "whatsapp_contatos_numero")).toBe(false);
    expect(estado.ops.some((o) => o.tabela === "messages" && o.op === "insert")).toBe(true);
    expect(espera()).toEqual([]);
  });
});

describe("WhatsApp do corretor: a classificar guarda a conversa cifrada (0124)", () => {
  const linhaGravada = () =>
    estado.ops.find((o) => o.tabela === "whatsapp_contatos_numero" && o.op === "upsert")?.valor as Record<string, string | null>;

  it("mensagem do cliente vai cifrada para a espera, sem o texto nem o telefone em claro", async () => {
    await POST(pedido(mensagem("Oi, vi a casa da Siriúba no Instagram", { _data: { notifyName: "Marina" } })));
    expect(gravouConteudo()).toBe(false);
    const [m] = espera();
    expect(m).toMatchObject({ contato_numero_id: "linha-1", direcao: "entrada", tipo: "text", mensagem_wa_id: "3EB0AAA" });
    expect(String(m?.corpo_cifrado)).toMatch(/^pii1\./);
    expect(JSON.stringify(m)).not.toMatch(/Siriúba|5512999990000/);
    expect(decifrar(String(m?.corpo_cifrado), { org: ORG, campo: "mensagem" })).toBe("Oi, vi a casa da Siriúba no Instagram");
    // Nome e telefone do contato, cifrados, para a tela "Contatos novos".
    const linha = linhaGravada();
    expect(decifrar(linha.nome_cifrado!, { org: ORG, campo: "nome" })).toBe("Marina");
    expect(decifrar(linha.telefone_cifrado!, { org: ORG, campo: "telefone" })).toBe("+5512999990000");
  });

  it("resposta do corretor pelo celular também entra, como saída", async () => {
    estado.contato = { id: "linha-1", situacao: "a_classificar", mensagens_ignoradas: 1 };
    await POST(
      pedido({
        event: "message.any",
        session: "org_corretor",
        payload: {
          id: "true_5512999990000@c.us_3EB0BBB",
          from: "5512999990000@c.us",
          fromMe: true,
          body: "Oi Marina, te mando as fotos",
          timestamp: 1_790_000_100,
        },
      }),
    );
    expect(gravouConteudo()).toBe(false);
    expect(espera()).toHaveLength(1);
    expect(espera()[0]).toMatchObject({ direcao: "saida", mensagem_wa_id: "3EB0BBB" });
  });

  it("áudio sem legenda entra só como tipo, sem baixar arquivo", async () => {
    estado.contato = { id: "linha-1", situacao: "a_classificar", mensagens_ignoradas: 1 };
    await POST(
      pedido({
        event: "message",
        session: "org_corretor",
        payload: {
          id: "false_5512999990000@c.us_3EB0CCC",
          from: "5512999990000@c.us",
          fromMe: false,
          hasMedia: true,
          media: { url: "http://waha/arquivo.ogg", mimetype: "audio/ogg" },
          _data: { message: { audioMessage: {} } },
          timestamp: 1_790_000_200,
        },
      }),
    );
    expect(espera()[0]).toMatchObject({ tipo: "audio", corpo_cifrado: null });
    expect(JSON.stringify(espera()[0])).not.toMatch(/arquivo\.ogg/);
    expect(estado.ops.some((o) => o.tabela === "rpc:emit_event")).toBe(false);
  });

  it("número oculto (@lid): o telefone do campo alternativo vai cifrado para o contato", async () => {
    // Fixture com o campo do Baileys (key.remoteJidAlt): não conferida com payload real.
    await POST(
      pedido({
        event: "message",
        session: "org_corretor",
        payload: {
          id: "false_250302204792918@lid_3EB0DDD",
          from: "250302204792918@lid",
          fromMe: false,
          body: "Boa tarde",
          _data: { notifyName: "Carlos", key: { remoteJid: "250302204792918@lid", remoteJidAlt: "5512988887777@s.whatsapp.net" } },
        },
      }),
    );
    const linha = linhaGravada();
    expect(decifrar(linha.telefone_cifrado!, { org: ORG, campo: "telefone" })).toBe("+5512988887777");
    expect(JSON.stringify(linha)).not.toMatch(/5512988887777|250302204792918/);
    expect(espera()).toHaveLength(1);
  });

  it("número oculto sem campo alternativo: segue sem telefone, sem quebrar", async () => {
    await POST(
      pedido({
        event: "message",
        session: "org_corretor",
        payload: { id: "false_250302204792918@lid_3EB0EEE", from: "250302204792918@lid", fromMe: false, body: "Oi" },
      }),
    );
    expect(linhaGravada().telefone_cifrado).toBeNull();
    expect(espera()).toHaveLength(1);
  });

  it("contato já a classificar ganha o nome que faltava (e não troca o telefone que já tem)", async () => {
    estado.contato = { id: "linha-1", situacao: "a_classificar", mensagens_ignoradas: 1, nome_cifrado: null, telefone_cifrado: "pii1.v1.x" };
    await POST(pedido(mensagem("Ainda tem a casa?", { _data: { pushName: "Marina" } })));
    const upd = estado.ops.find((o) => o.tabela === "whatsapp_contatos_numero" && o.op === "update")?.valor as Record<string, string>;
    expect(decifrar(upd.nome_cifrado!, { org: ORG, campo: "nome" })).toBe("Marina");
    expect(upd.telefone_cifrado).toBeUndefined();
  });
});
