import { describe, expect, it } from "vitest";

import {
  JANELA_IMPORTACAO_MS,
  chatIgnorado,
  decidir,
  ehLeadDaOpa,
  decisaoDoCorretor,
  emJanelaDeImportacao,
  etiquetaDe,
  sinalDeEntrada,
  telefoneAlternativo,
  tipoEmEspera,
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

  it("sinal do site ganha de pessoal: marcar o número antes não segura o lead da OPA", () => {
    expect(decidir({ ...base, atual: "pessoal", sinal: SITE })).toMatchObject({ situacao: "lead", origem: "site", gravar: true, virouLead: true });
  });

  it("anúncio de WhatsApp não vira lead sozinho: pode ser campanha do próprio corretor (09/11/2026)", () => {
    const anuncio = { origem: "campanha" as const, imovelCodigo: null };
    expect(decidir({ ...base, sinal: anuncio })).toEqual({ situacao: "a_classificar", origem: "novo", gravar: false, virouLead: false });
    expect(decidir({ ...base, atual: "pessoal", sinal: anuncio })).toMatchObject({ situacao: "pessoal", gravar: false });
    expect(decidir({ ...base, atual: "a_classificar", sinal: anuncio })).toMatchObject({ situacao: "a_classificar", gravar: false });
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

  it("aviso do OPA Lembretes leva o link do CRM, e isso não é mensagem do site (10/11/2026)", () => {
    const aviso = "Luana, João Silva espera sua resposta há 20 min.\n\nFicha: https://crm.opailhabela.com.br/app/leads/6caadaf7";
    expect(sinalDeEntrada({ body: aviso })).toBeNull();
    // O site continua valendo, com ou sem www.
    expect(sinalDeEntrada({ body: "vi em www.opailhabela.com.br/imovel/ca006634" })?.origem).toBe("site");
  });

  it("anúncio de clique para o WhatsApp, nas grafias dos dois motores", () => {
    const noweb = { message: { extendedTextMessage: { contextInfo: { conversionSource: "FB_Ads", externalAdReply: { sourceType: "ad", ctwaClid: "abc" } } } } };
    expect(sinalDeEntrada({ body: "oi", _data: noweb })).toEqual({ origem: "campanha", imovelCodigo: null });
    expect(sinalDeEntrada({ body: "oi", _data: { Message: { extendedTextMessage: { contextInfo: { CtwaClid: "abc" } } } } })?.origem).toBe("campanha");
    expect(sinalDeEntrada({ body: "oi", _data: { externalAdReply: { sourceType: "AD" } } })?.origem).toBe("campanha");
    expect(sinalDeEntrada({ body: "oi", _data: { entryPointConversionSource: "ctwa_ad" } })?.origem).toBe("campanha");
  });

  it("marca que aparece em conversa comum não é anúncio", () => {
    for (const _data of [
      { entryPointConversionSource: "global_search_new_chat" },
      { conversionSource: "contact_card" },
      { entryPointConversionSource: "click_to_chat_link" },
      { externalAdReply: { sourceType: "link", sourceUrl: "https://exemplo.com" } },
      { referral: { source: "x" } },
    ]) {
      expect(sinalDeEntrada({ body: "oi", _data })).toBeNull();
    }
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

describe("conversa em espera (0124)", () => {
  it("reação e tipo desconhecido não entram na espera", () => {
    expect(tipoEmEspera("text")).toBe(true);
    expect(tipoEmEspera("audio")).toBe(true);
    expect(tipoEmEspera("reaction")).toBe(false);
    expect(tipoEmEspera("poll")).toBe(false);
  });
});

describe("telefone de contato com número oculto (@lid), sem o store do WAHA", () => {
  // Fixtures montadas com os nomes de campo do Baileys: NÃO conferidas com payload real.
  it("lê remoteJidAlt ou senderPn da chave e devolve em E.164", () => {
    expect(telefoneAlternativo({ _data: { key: { remoteJid: "250302204792918@lid", remoteJidAlt: "5512988887777@s.whatsapp.net" } } }, "entrada")).toBe(
      "+5512988887777",
    );
    expect(telefoneAlternativo({ _data: { key: { senderPn: "5512988887777@s.whatsapp.net" } } }, "entrada")).toBe("+5512988887777");
    expect(telefoneAlternativo({ _data: { senderPn: "5512988887777@c.us" } }, "entrada")).toBe("+5512988887777");
    // GOWS: o telefone vem em Info.SenderAlt (entrada) e Info.RecipientAlt (saída).
    expect(telefoneAlternativo({ _data: { Info: { Chat: "250302204792918@lid", SenderAlt: "5512988887777@s.whatsapp.net" } } }, "entrada")).toBe("+5512988887777");
    expect(telefoneAlternativo({ _data: { Info: { Chat: "250302204792918@lid", RecipientAlt: "5512988887777@s.whatsapp.net" } } }, "saida")).toBe("+5512988887777");
    expect(telefoneAlternativo({ _data: { Info: { SenderAlt: "5512988887777@s.whatsapp.net" } } }, "saida")).toBeNull();
    // Sufixo de aparelho (":12") do Baileys não atrapalha.
    expect(telefoneAlternativo({ _data: { key: { participantPn: "5512988887777:12@s.whatsapp.net" } } }, "entrada")).toBe("+5512988887777");
  });

  it("só aceita JID de telefone; lid, grupo ou lixo não viram número", () => {
    expect(telefoneAlternativo({ _data: { key: { remoteJidAlt: "250302204792918@lid" } } }, "entrada")).toBeNull();
    expect(telefoneAlternativo({ _data: { key: { senderPn: "120363@g.us" } } }, "entrada")).toBeNull();
    expect(telefoneAlternativo({ _data: { senderPn: 5512988887777 } }, "entrada")).toBeNull();
    expect(telefoneAlternativo({ _data: { key: { senderPn: "abc@s.whatsapp.net" } } }, "entrada")).toBeNull();
  });

  it("tolera payload sem nada (o caso mais provável sem o store)", () => {
    expect(telefoneAlternativo({}, "entrada")).toBeNull();
    expect(telefoneAlternativo({ _data: undefined }, "saida")).toBeNull();
    expect(telefoneAlternativo({ _data: { key: null } }, "entrada")).toBeNull();
  });

  it("na saída não usa senderPn: seria o telefone do próprio corretor", () => {
    expect(telefoneAlternativo({ _data: { key: { senderPn: "5512911112222@s.whatsapp.net" } } }, "saida")).toBeNull();
    expect(telefoneAlternativo({ _data: { key: { remoteJidAlt: "5512988887777@s.whatsapp.net" } } }, "saida")).toBe("+5512988887777");
  });
});

describe("lead da OPA", () => {
  it("é tudo o que não tem a etiqueta proprio", () => {
    expect(ehLeadDaOpa(["pago"])).toBe(true);
    expect(ehLeadDaOpa(["organico"])).toBe(true);
    expect(ehLeadDaOpa(null)).toBe(true);
    expect(ehLeadDaOpa(["organico", "proprio"])).toBe(false);
  });
});
