import { describe, expect, it } from "vitest";

import {
  agruparPorTela,
  buscarTutoriais,
  CHAVE_TUTORIAL,
  deveAbrirSozinho,
  DUVIDAS,
  duvidasPermitidas,
  lerDeepLink,
  lerVisto,
  linkDoPasso,
  marcarVisto,
  PASSOS,
  passoDaTela,
  TELAS,
  telaDaRota,
  topicosPermitidos,
  versaoDoPapel,
  versoesPermitidas,
} from "./tutorial";

describe("busca em Tutoriais", () => {
  it("acha sem acento e sem diferenciar maiúscula", () => {
    const r = buscarTutoriais("ROLETA", ["corretor"]);
    expect(r.topicos.map((t) => t.passo.id)).toContain("fila");
    expect(r.duvidas.map((d) => d.id)).toEqual(expect.arrayContaining(["o-que-e-roleta", "lead-foi-para-outro"]));
    expect(buscarTutoriais("imoveis", ["corretor"]).topicos.map((t) => t.passo.id)).toContain("imoveis");
    expect(buscarTutoriais("seleção", ["corretor"]).topicos.map((t) => t.passo.id)).toContain("imoveis");
  });

  it("todas as palavras precisam aparecer, em qualquer ordem", () => {
    const ids = buscarTutoriais("whatsapp codigo", ["corretor"]).duvidas.map((d) => d.id);
    expect(ids).toContain("whatsapp-caiu");
    expect(buscarTutoriais("roleta xyzqw", ["corretor"]).topicos).toEqual([]);
  });

  it("termo vazio devolve tudo o que a pessoa pode ver", () => {
    const r = buscarTutoriais("   ", ["corretor"]);
    expect(r.topicos).toHaveLength(PASSOS.corretor.length);
    expect(r.duvidas).toHaveLength(duvidasPermitidas(["corretor"]).length);
  });

  it("corretor não vê tópico nem dúvida de gestor", () => {
    const r = buscarTutoriais("", ["corretor"]);
    expect(r.topicos.every((t) => t.versao === "corretor")).toBe(true);
    expect(r.duvidas.some((d) => d.soGestor)).toBe(false);
    expect(duvidasPermitidas(["corretor", "gestor"]).some((d) => d.soGestor)).toBe(true);
  });
});

describe("tópicos agrupados por tela", () => {
  it("segue a ordem das telas e junta corretor e gestor da mesma tela", () => {
    const grupos = agruparPorTela(topicosPermitidos(["corretor", "gestor"]));
    const ordem = TELAS.map((t) => t.id);
    const ids = grupos.map((g) => g.tela.id);
    expect(ids).toEqual([...ids].sort((a, b) => ordem.indexOf(a) - ordem.indexOf(b)));
    const fila = grupos.find((g) => g.tela.id === "fila")!;
    expect(fila.topicos.map((t) => t.passo.id)).toEqual(["fila", "fila-equipe"]);
  });

  it("todo passo pertence a uma tela conhecida", () => {
    const telas = new Set(TELAS.map((t) => t.id));
    for (const p of Object.values(PASSOS).flat()) expect(telas.has(p.tela)).toBe(true);
    for (const d of DUVIDAS) expect(telas.has(d.tela)).toBe(true);
  });
});

describe("link direto para um passo", () => {
  it("monta e lê o mesmo passo", () => {
    const url = new URL(linkDoPasso("corretor", "fila"), "https://crm.exemplo");
    expect(url.pathname).toBe("/app/tutoriais");
    const r = lerDeepLink({ passo: url.searchParams.get("passo"), versao: url.searchParams.get("versao") }, ["corretor"], "corretor");
    expect(r).toEqual({ versao: "corretor", indice: PASSOS.corretor.findIndex((p) => p.id === "fila") });
  });

  it("sem versão no link, procura primeiro na versão da pessoa", () => {
    expect(lerDeepLink({ passo: "funis" }, ["corretor", "gestor"], "gestor")?.versao).toBe("gestor");
    expect(lerDeepLink({ passo: "whatsapp" }, ["corretor", "gestor"], "gestor")?.versao).toBe("corretor");
  });

  it("corretor não abre passo de gestor nem com o link na mão", () => {
    expect(lerDeepLink({ passo: "funis", versao: "gestor" }, ["corretor"], "corretor")).toBeNull();
    expect(lerDeepLink({ passo: "funis" }, ["corretor"], "corretor")).toBeNull();
  });

  it("passo ou versão desconhecidos não abrem nada", () => {
    expect(lerDeepLink({ passo: "nao-existe" }, ["corretor"], "corretor")).toBeNull();
    expect(lerDeepLink({ passo: "fila", versao: "admin" }, ["corretor", "gestor"], "gestor")).toBeNull();
    expect(lerDeepLink({ passo: "" }, ["corretor"], "corretor")).toBeNull();
    expect(lerDeepLink({}, ["corretor"], "corretor")).toBeNull();
  });
});

describe("o ? de cada tela", () => {
  it("acha a tela pela rota, com a ficha antes da lista de leads", () => {
    expect(telaDaRota("/app/leads")).toBe("leads");
    expect(telaDaRota("/app/leads/9f1c")).toBe("ficha");
    expect(telaDaRota("/app/fila")).toBe("fila");
    expect(telaDaRota("/app/imoveis/AB12")).toBe("imoveis");
    expect(telaDaRota("/app/kit")).toBe("ficha");
    expect(telaDaRota("/app/tutoriais")).toBeNull();
    expect(telaDaRota("/app/filas")).toBeNull();
  });

  it("abre o passo da tela na versão da pessoa", () => {
    expect(passoDaTela("fila", ["corretor"], "corretor")).toEqual({ versao: "corretor", passoId: "fila" });
    expect(passoDaTela("fila", ["corretor", "gestor"], "gestor")).toEqual({ versao: "gestor", passoId: "fila-equipe" });
    expect(passoDaTela("funis", ["corretor"], "corretor")).toBeNull();
  });
});

describe("quem vê qual versão", () => {
  it("corretor (e quem só lê) recebe a do corretor", () => {
    expect(versaoDoPapel("agent")).toBe("corretor");
    expect(versaoDoPapel("viewer")).toBe("corretor");
  });

  it("gestor, administrador e dono da plataforma recebem a do gestor", () => {
    expect(versaoDoPapel("manager")).toBe("gestor");
    expect(versaoDoPapel("admin")).toBe("gestor");
    expect(versaoDoPapel(null, true)).toBe("gestor");
  });

  it("operador de IA e quem não tem papel não recebem tutorial", () => {
    expect(versaoDoPapel("ai_operator")).toBeNull();
    expect(versaoDoPapel(null)).toBeNull();
    expect(versoesPermitidas("ai_operator")).toEqual([]);
  });

  it("em Como usar o gestor confere as duas; o corretor vê só a dele", () => {
    expect(versoesPermitidas("admin")).toEqual(["corretor", "gestor"]);
    expect(versoesPermitidas("manager")).toEqual(["corretor", "gestor"]);
    expect(versoesPermitidas("agent")).toEqual(["corretor"]);
  });
});

describe("abre sozinho só no primeiro acesso", () => {
  it("sem nada no metadata, abre a versão do papel", () => {
    expect(deveAbrirSozinho("agent", false, {})).toBe("corretor");
    expect(deveAbrirSozinho("manager", false, undefined)).toBe("gestor");
  });

  it("depois de visto, não abre de novo", () => {
    const meta = { [CHAVE_TUTORIAL]: marcarVisto({}, "corretor", new Date("2026-11-01T12:00:00Z")) };
    expect(deveAbrirSozinho("agent", false, meta)).toBeNull();
  });

  it("corretor promovido a gestor recebe a versão do gestor", () => {
    const meta = { [CHAVE_TUTORIAL]: { corretor: "2026-11-01T12:00:00.000Z" } };
    expect(deveAbrirSozinho("manager", false, meta)).toBe("gestor");
  });

  it("metadata estranho não quebra e conta como não visto", () => {
    expect(lerVisto(null)).toEqual({});
    expect(lerVisto({ [CHAVE_TUTORIAL]: "sim" })).toEqual({});
    expect(lerVisto({ [CHAVE_TUTORIAL]: { corretor: 1, gestor: "" } })).toEqual({});
    expect(deveAbrirSozinho("agent", false, { [CHAVE_TUTORIAL]: 42 })).toBe("corretor");
  });
});

describe("marcar como visto", () => {
  it("preserva a data da outra versão", () => {
    const antes = { full_name: "Luana", [CHAVE_TUTORIAL]: { corretor: "2026-10-31T10:00:00.000Z" } };
    const novo = marcarVisto(antes, "gestor", new Date("2026-11-01T12:00:00Z"));
    expect(novo).toEqual({ corretor: "2026-10-31T10:00:00.000Z", gestor: "2026-11-01T12:00:00.000Z" });
  });
});

describe("conteúdo", () => {
  it("cada versão tem de 5 a 8 passos, com ids únicos e frase curta", () => {
    for (const passos of Object.values(PASSOS)) {
      expect(passos.length).toBeGreaterThanOrEqual(5);
      expect(passos.length).toBeLessThanOrEqual(8);
      expect(new Set(passos.map((p) => p.id)).size).toBe(passos.length);
      for (const p of passos) expect(p.texto.length).toBeLessThanOrEqual(170);
    }
  });

  it("a versão do corretor cobre o dia a dia", () => {
    const ids = PASSOS.corretor.map((p) => p.id);
    for (const id of ["hoje", "fila", "leads", "ficha", "imoveis", "agenda", "whatsapp"]) expect(ids).toContain(id);
  });

  it("sem travessão e com Corretor e Gestor, nunca atendente ou gerente", () => {
    const textos = [
      ...Object.values(PASSOS)
        .flat()
        .flatMap((p) => [p.titulo, p.texto, ...(p.detalhes ?? []), p.rotuloLink ?? ""]),
      ...DUVIDAS.flatMap((d) => [d.pergunta, d.resposta, d.rotuloLink ?? ""]),
    ].join("\n");
    expect(textos).not.toMatch(/[—–]/);
    expect(textos).not.toMatch(/atendente|gerente/i);
  });

  it("todo link aponta para uma tela do app", () => {
    for (const p of Object.values(PASSOS).flat()) if (p.href) expect(p.href).toMatch(/^\/app\//);
    for (const d of DUVIDAS) if (d.href) expect(d.href).toMatch(/^\/app\//);
  });

  // 13: a dúvida "O CRM lê minhas conversas pessoais?" entrou com a separação pessoal x lead (01/11/2026).
  // 14: "Como mudo o papel de alguém da equipe?" entrou com a troca de papel em Membros (02/11/2026).
  // 15: "Como mando uma mensagem para todos de uma etapa?" entrou com os Funis do corretor (02/11/2026).
  it("dúvidas frequentes: de 8 a 15, resposta de 1 a 3 frases, ids únicos", () => {
    expect(DUVIDAS.length).toBeGreaterThanOrEqual(8);
    expect(DUVIDAS.length).toBeLessThanOrEqual(15);
    expect(new Set(DUVIDAS.map((d) => d.id)).size).toBe(DUVIDAS.length);
    for (const d of DUVIDAS) {
      const frases = d.resposta.split(/[.!?](?:\s|$)/).filter((f) => f.trim()).length;
      expect(frases).toBeGreaterThanOrEqual(1);
      expect(frases).toBeLessThanOrEqual(3);
    }
  });
});
