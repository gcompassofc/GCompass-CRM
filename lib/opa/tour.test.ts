import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  LARGURA_CELULAR,
  linkDoTour,
  passosAtivos,
  posicaoDoBalao,
  recorte,
  TOURS,
  tourDaRota,
  tourDaTela,
  toursPermitidos,
} from "./tour";
import { CHAVE_TUTORIAL, marcarTourFeito, marcarVisto, TELAS, toursFeitos } from "./tutorial";

const todos = () => true;

describe("ordem e versão dos passos", () => {
  it("segue a ordem declarada e tira os passos de gestor para o corretor", () => {
    const corretor = passosAtivos(TOURS.hoje, "corretor", todos).map((p) => p.alvo);
    expect(corretor).toEqual(["hoje-fila", "hoje-ia", "hoje-visitas", "cab-novo-lead", "cab-ajuda"]);
    const gestor = passosAtivos(TOURS.hoje, "gestor", todos).map((p) => p.alvo);
    expect(gestor).toEqual(["hoje-fila", "hoje-ia", "hoje-visitas", "hoje-numeros", "cab-equipe", "cab-novo-lead", "cab-ajuda"]);
  });

  it("cada tour tem de 3 a 7 passos e títulos curtos", () => {
    for (const t of Object.values(TOURS)) {
      expect(t.passos.length).toBeGreaterThanOrEqual(3);
      expect(t.passos.length).toBeLessThanOrEqual(7);
      for (const p of t.passos) {
        expect(p.titulo.split(" ").length).toBeLessThanOrEqual(5);
        expect(p.texto.length).toBeLessThanOrEqual(160);
      }
    }
  });
});

describe("elemento ausente", () => {
  it("pula o passo cujo elemento não está na tela", () => {
    const sem = new Set(["fila-acoes", "cab-equipe"]);
    const alvos = passosAtivos(TOURS.fila, "gestor", (a) => !sem.has(a)).map((p) => p.alvo);
    expect(alvos).toEqual(["fila-proximo", "fila-prazo", "fila-item"]);
  });

  it("passo com explicação vira passo no centro em vez de sumir", () => {
    const passos = passosAtivos(TOURS.ficha, "corretor", (a) => a !== "ficha-selecao" && a !== "ficha-sugestoes");
    const selecao = passos.find((p) => p.titulo === "Seleção de imóveis")!;
    expect(selecao.alvo).toBeNull();
    expect(selecao.texto).toMatch(/aba Imóveis/);
    expect(passos.filter((p) => p.alvo === null)).toHaveLength(2);
  });

  it("tela vazia mostra um passo só, no centro", () => {
    const passos = passosAtivos(TOURS.fila, "corretor", () => false);
    expect(passos).toEqual([{ alvo: null, ...TOURS.fila.vazio }]);
    expect(passosAtivos(TOURS.ficha, "corretor", () => false)).toEqual([{ alvo: null, ...TOURS.ficha.vazio }]);
  });
});

describe("rotas e permissões", () => {
  it("acha o tour da rota, com a ficha separada da lista", () => {
    expect(tourDaRota("/app/leads")).toBe("leads");
    expect(tourDaRota("/app/leads/")).toBe("leads");
    expect(tourDaRota("/app/leads/1b2c")).toBe("ficha");
    expect(tourDaRota("/app/leads/exportar")).toBeNull();
    expect(tourDaRota("/app/imoveis/AB12")).toBeNull();
    expect(tourDaRota("/app/pipeline")).toBe("funil");
    expect(tourDaRota("/app/tutoriais")).toBeNull();
  });

  it("corretor não faz tour de Roleta nem de Equipe", () => {
    const ids = toursPermitidos("corretor").map((t) => t.id);
    expect(ids).not.toContain("roleta");
    expect(ids).not.toContain("equipe");
    expect(toursPermitidos("gestor").map((t) => t.id)).toEqual(expect.arrayContaining(["roleta", "equipe"]));
  });

  it("o link do tour leva à tela com a versão pedida", () => {
    expect(linkDoTour("fila", "corretor")).toBe("/app/fila?tour=fila&como=corretor");
    expect(linkDoTour("ficha", "gestor")).toBe("/app/leads?tour=ficha&como=gestor");
  });

  it("toda tela de Tutoriais, menos a de primeiros passos, tem um tour", () => {
    for (const t of TELAS) {
      if (t.id === "comeco") expect(tourDaTela(t.id)).toBeNull();
      else expect(tourDaTela(t.id)?.tela).toBe(t.id);
    }
  });
});

describe("recorte e balão", () => {
  const tela = { w: 1280, h: 800 };
  const balao = { w: 360, h: 200 };

  it("o recorte ganha folga e não sai da tela", () => {
    expect(recorte({ top: 100, left: 100, width: 200, height: 50 }, tela)).toEqual({ top: 92, left: 92, width: 216, height: 66 });
    const grande = recorte({ top: -300, left: -10, width: 2000, height: 3000 }, tela);
    expect(grande.top).toBeGreaterThanOrEqual(0);
    expect(grande.left).toBeGreaterThanOrEqual(0);
    expect(grande.top + grande.height).toBeLessThanOrEqual(tela.h);
    expect(grande.left + grande.width).toBeLessThanOrEqual(tela.w);
  });

  it("embaixo quando cabe, centralizado no alvo e dentro da tela", () => {
    const p = posicaoDoBalao({ top: 100, left: 40, width: 100, height: 40 }, balao, tela);
    expect(p).toEqual({ modo: "flutuante", top: 154, left: 16, lado: "baixo" });
  });

  it("em cima quando não cabe embaixo", () => {
    const p = posicaoDoBalao({ top: 600, left: 500, width: 200, height: 100 }, balao, tela);
    expect(p).toMatchObject({ modo: "flutuante", lado: "cima", top: 600 - 14 - 200 });
  });

  it("ao lado quando não cabe em cima nem embaixo", () => {
    const alto = { top: 150, left: 100, width: 300, height: 500 };
    expect(posicaoDoBalao(alto, balao, tela)).toMatchObject({ lado: "direita", left: 414 });
    const aDireita = { top: 150, left: 800, width: 300, height: 500 };
    expect(posicaoDoBalao(aDireita, balao, tela)).toMatchObject({ lado: "esquerda", left: 800 - 14 - 360 });
  });

  it("alvo maior que a tela: balão por cima, embaixo e dentro", () => {
    const p = posicaoDoBalao({ top: 4, left: 4, width: 1272, height: 792 }, balao, tela);
    expect(p).toMatchObject({ modo: "flutuante", lado: "dentro", top: 800 - 200 - 16 });
  });

  it("no celular vira faixa; sem alvo, centro", () => {
    expect(posicaoDoBalao({ top: 10, left: 10, width: 10, height: 10 }, balao, { w: LARGURA_CELULAR - 1, h: 800 })).toEqual({ modo: "faixa" });
    expect(posicaoDoBalao(null, balao, tela)).toEqual({ modo: "centro" });
  });
});

describe("tours já feitos", () => {
  it("guarda o tour sem apagar as versões do tutorial", () => {
    const meta = { [CHAVE_TUTORIAL]: { corretor: "2026-11-01T10:00:00.000Z" } };
    const novo = marcarTourFeito(meta, "fila", new Date("2026-11-01T12:00:00Z"));
    expect(novo).toEqual({ corretor: "2026-11-01T10:00:00.000Z", tours: { fila: "2026-11-01T12:00:00.000Z" } });
    expect(toursFeitos({ [CHAVE_TUTORIAL]: novo })).toEqual(["fila"]);
  });

  it("marcar o tutorial visto não apaga os tours", () => {
    const meta = { [CHAVE_TUTORIAL]: { tours: { hoje: "2026-11-01T09:00:00.000Z" } } };
    expect(marcarVisto(meta, "gestor", new Date("2026-11-01T12:00:00Z")).tours).toEqual({ hoje: "2026-11-01T09:00:00.000Z" });
  });

  it("lixo no metadata não quebra", () => {
    expect(toursFeitos({ [CHAVE_TUTORIAL]: { tours: "x" } })).toEqual([]);
    expect(toursFeitos({ [CHAVE_TUTORIAL]: { tours: { fila: 1, hoje: "" } } })).toEqual([]);
  });
});

describe("as âncoras existem nas telas", () => {
  // Todo `alvo` dos tours precisa estar em algum arquivo do app como data-tour="x" ou tour="x".
  // Sem isto, renomear um atributo numa tela faria o passo sumir em silêncio.
  const raiz = process.cwd();
  const fontes: string[] = [];
  const varrer = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) varrer(p);
      else if (/\.tsx$/.test(e.name) && !/\.test\./.test(e.name)) fontes.push(fs.readFileSync(p, "utf8"));
    }
  };
  varrer(path.join(raiz, "app", "app"));
  const tudo = fontes.join("\n");

  it.each(Object.values(TOURS).flatMap((t) => t.passos.map((p) => [t.id, p.alvo] as const)))("%s: %s", (_tour, alvo) => {
    expect(tudo.includes(`data-tour="${alvo}"`) || tudo.includes(`tour="${alvo}"`)).toBe(true);
  });
});
