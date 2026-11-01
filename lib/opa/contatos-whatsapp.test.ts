import { describe, expect, it } from "vitest";

import {
  JANELA_IMPORTACAO_MS,
  chatIgnorado,
  decidir,
  decisaoDoCorretor,
  emJanelaDeImportacao,
  etiquetaDe,
  sinalDeEntrada,
  type EntradaDecisao,
} from "./contatos-whatsapp";

const base: EntradaDecisao = { atual: null, temLeadNoCrm: false, sinal: null, direcao: "entrada", emImportacao: false };
const SITE = { origem: "site" as const, imovelCodigo: "CA006634" };

describe("decidir: pessoal, lead ou a classificar", () => {
  it("lead já marcado é sempre guardado", () => {
    expect(decidir({ ...base, atual: "lead" })).toEqual({ situacao: "lead", origem: null, gravar: true, virouLead: false });
  });

  it("lead do CRM ganha de tudo, até de pessoal (o corretor cadastrou no CRM)", () => {
    for (const atual of [null, "pessoal", "a_classificar"] as const) {
      const d = decidir({ ...base, atual, temLeadNoCrm: true });
      expect(d).toMatchObject({ situacao: "lead", origem: "lead_do_crm", gravar: true, virouLead: true });
    }
  });

  it("pessoal fica pessoal e nada é guardado", () => {
    expect(decidir({ ...base, atual: "pessoal" })).toEqual({ situacao: "pessoal", origem: null, gravar: false, virouLead: false });
  });

  it("pessoal com sinal de anúncio ou site só vai para o corretor decidir, sem guardar", () => {
    expect(decidir({ ...base, atual: "pessoal", sinal: SITE })).toEqual({
      situacao: "a_classificar",
      origem: "site",
      gravar: false,
      virouLead: false,
    });
  });

  it("contato novo com sinal de anúncio vira lead na hora", () => {
    const d = decidir({ ...base, sinal: { origem: "campanha", imovelCodigo: null } });
    expect(d).toEqual({ situacao: "lead", origem: "campanha", gravar: true, virouLead: true });
  });

  it("a classificar com sinal vira lead; sem sinal continua esperando, sem guardar", () => {
    expect(decidir({ ...base, atual: "a_classificar", sinal: SITE })).toMatchObject({ situacao: "lead", virouLead: true, gravar: true });
    expect(decidir({ ...base, atual: "a_classificar" })).toEqual({ situacao: "a_classificar", origem: null, gravar: false, virouLead: false });
  });

  it("contato nunca visto: pessoal na janela logo depois de conectar, a classificar depois", () => {
    expect(decidir({ ...base, emImportacao: true })).toEqual({ situacao: "pessoal", origem: "importacao", gravar: false, virouLead: false });
    expect(decidir({ ...base })).toEqual({ situacao: "a_classificar", origem: "novo", gravar: false, virouLead: false });
  });

  it("mensagem que o corretor manda do celular não conta como sinal do cliente", () => {
    // O corretor colou o link do site para um amigo: continua decisão dele.
    expect(decidir({ ...base, direcao: "saida", sinal: SITE })).toMatchObject({ situacao: "a_classificar", gravar: false });
    expect(decidir({ ...base, direcao: "saida", atual: "pessoal", sinal: SITE })).toMatchObject({ situacao: "pessoal", gravar: false });
  });
});

describe("sinais de anúncio e do site", () => {
  it("botão do site: texto pronto com o código do imóvel", () => {
    expect(
      sinalDeEntrada({ body: "Olá! Tenho interesse no imóvel CA006634 (Casa na costeira): https://opailhabela.com.br/imovel/ca006634" }),
    ).toEqual({ origem: "site", imovelCodigo: "CA006634" });
    expect(sinalDeEntrada({ body: "Olá! Quero saber mais sobre o imóvel Casa no Perequê." })).toEqual({ origem: "site", imovelCodigo: null });
  });

  it("anúncio de clique para o WhatsApp: externalAdReply ou ctwaClid no _data, em qualquer profundidade", () => {
    const _data = { message: { extendedTextMessage: { contextInfo: { externalAdReply: { sourceUrl: "https://fb.me/x" } } } } };
    expect(sinalDeEntrada({ body: "oi", _data })).toEqual({ origem: "campanha", imovelCodigo: null });
    expect(sinalDeEntrada({ body: "oi", _data: { ctwaClid: "abc" } })?.origem).toBe("campanha");
  });

  it("conversa comum não tem sinal (nem chave vazia de anúncio)", () => {
    expect(sinalDeEntrada({ body: "Bora no churrasco sábado?" })).toBeNull();
    expect(sinalDeEntrada({ body: "oi", _data: { referral: null, ctwaClid: "" } })).toBeNull();
  });
});

describe("etiquetas e chats ignorados", () => {
  it("reconhece Lead OPA e Pessoal, sem ligar para caixa e acento", () => {
    expect(etiquetaDe("Lead OPA")).toBe("lead");
    expect(etiquetaDe("lead opa")).toBe("lead");
    expect(etiquetaDe("LEAD")).toBe("lead");
    expect(etiquetaDe("Pessoal")).toBe("pessoal");
    expect(etiquetaDe("Novo cliente")).toBeNull();
    expect(etiquetaDe(null)).toBeNull();
  });

  it("grupo, transmissão, status e canal nunca viram contato", () => {
    expect(chatIgnorado("120363000000000000@g.us")).toBe(true);
    expect(chatIgnorado("status@broadcast")).toBe(true);
    expect(chatIgnorado("1234@newsletter")).toBe(true);
    expect(chatIgnorado("")).toBe(true);
    expect(chatIgnorado("5512999990000@c.us")).toBe(false);
    expect(chatIgnorado("250302204792918@lid")).toBe(false);
  });
});

describe("janela logo depois de conectar", () => {
  const agora = Date.parse("2026-11-01T18:00:00Z");
  it("vale 15 minutos a partir do início e some quando os pessoais foram fechados", () => {
    const inicio = new Date(agora - JANELA_IMPORTACAO_MS + 60_000).toISOString();
    expect(emJanelaDeImportacao({ pessoais_import_inicio: inicio, pessoais_importados_em: null }, agora)).toBe(true);
    const velho = new Date(agora - JANELA_IMPORTACAO_MS - 1).toISOString();
    expect(emJanelaDeImportacao({ pessoais_import_inicio: velho, pessoais_importados_em: null }, agora)).toBe(false);
    expect(emJanelaDeImportacao({ pessoais_import_inicio: inicio, pessoais_importados_em: inicio }, agora)).toBe(false);
  });

  it("sem início marcado não há janela (número ligado antes da 0123 não vira tudo pessoal de repente)", () => {
    expect(emJanelaDeImportacao({ pessoais_import_inicio: null, pessoais_importados_em: null }, agora)).toBe(false);
  });
});

describe("decisão do corretor (botão ou etiqueta) e desfazer", () => {
  it("lead cria o lead; pessoal apaga o que estava guardado", () => {
    expect(decisaoDoCorretor("lead")).toEqual({ situacao: "lead", apagarConteudo: false, criarLead: true });
    expect(decisaoDoCorretor("pessoal")).toEqual({ situacao: "pessoal", apagarConteudo: true, criarLead: false });
  });
});
