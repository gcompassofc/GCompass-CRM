// @vitest-environment node
import { describe, expect, it } from "vitest";

import { existsSync } from "node:fs";
import { join } from "node:path";

import { FOTOS_DA_EQUIPE, fotoDaEquipe, fotoDaPessoa, fotosDoSite } from "./fotos-equipe";

describe("fotoDaEquipe (fotos guardadas no CRM, 12/11/2026)", () => {
  it("a foto do perfil sempre ganha", () => {
    expect(fotoDaEquipe({ avatarUrl: "https://x/eu.webp", nome: "Luana Machado" })).toBe("https://x/eu.webp");
  });

  it("acha cada corretor e a June pelo nome, completo ou só o primeiro", () => {
    expect(fotoDaEquipe({ nome: "Marco Henrique da Silva" })).toBe("/opa/equipe/marco-henrique.webp");
    expect(fotoDaEquipe({ nome: "Luana" })).toBe("/opa/equipe/luana-machado.webp");
    expect(fotoDaEquipe({ nome: "Paulo Martin" })).toBe("/opa/equipe/paulo-martin.webp");
    expect(fotoDaEquipe({ nome: "Rodrigo Festúccia" })).toBe("/opa/equipe/rodrigo-festuccia.webp");
    expect(fotoDaEquipe({ nome: "Cristian" })).toBe("/opa/equipe/cristian-spengler.webp");
    expect(fotoDaEquipe({ nome: "June Rocha" })).toBe("/opa/equipe/june-rocha.webp");
  });

  it("sem nome, procura pelo começo do e-mail", () => {
    expect(fotoDaEquipe({ email: "luana.machado@exemplo.com" })).toBe("/opa/equipe/luana-machado.webp");
  });

  it("o acesso da G-Compass leva a logo; quem não está na lista fica nas iniciais", () => {
    expect(fotoDaEquipe({ nome: "Growth Compass" })).toBe("/opa/equipe/gcompass.png");
    expect(fotoDaEquipe({ nome: "G-Compass" })).toBe("/opa/equipe/gcompass.png");
    expect(fotoDaEquipe({ nome: "", email: "growthcompass@exemplo.com" })).toBe("/opa/equipe/gcompass.png");
    expect(fotoDaEquipe({ nome: "Fulano de Tal" })).toBeNull();
  });

  it("todo arquivo da lista existe em public/", () => {
    for (const f of [...FOTOS_DA_EQUIPE.map((x) => x.foto), "/opa/equipe/gcompass.png"]) {
      expect(existsSync(join(process.cwd(), "public", f))).toBe(true);
    }
  });
});

const json = {
  perfis: {
    "luana-machado": { nome: "Luana Machado", foto: "/assets/img/corretores/luana-machado.webp", email: "luana@opailhabela.com.br" },
    "marco-henrique": { nome: "Marco Henrique", foto: "/assets/img/corretores/marco-henrique.webp", email: "marco@opailhabela.com.br" },
    "sem-foto": { nome: "Sem Foto" },
  },
};

describe("fotosDoSite", () => {
  it("monta o endereço completo e ignora perfil sem foto", () => {
    const f = fotosDoSite(json);
    expect(f).toHaveLength(2);
    expect(f[0]!.foto).toBe("https://opailhabela.com.br/assets/img/corretores/luana-machado.webp");
  });
});

describe("fotoDaPessoa", () => {
  const f = fotosDoSite(json);

  it("casa pelo e-mail", () => {
    expect(fotoDaPessoa(f, { email: "LUANA@opailhabela.com.br", nome: "Outra" })).toMatch(/luana-machado/);
  });

  it("sem e-mail igual, casa pelo nome, sem acento e sem diferença de caixa", () => {
    expect(fotoDaPessoa(f, { email: "luana@opa.local", nome: "luana machado" })).toMatch(/luana-machado/);
  });

  it("nome completo no CRM casa com o nome curto do site", () => {
    expect(fotoDaPessoa(f, { nome: "Marco Henrique da Silva" })).toMatch(/marco-henrique/);
  });

  it("quem não está no site fica sem foto", () => {
    expect(fotoDaPessoa(f, { email: "allyson@gcompass.local", nome: "Allyson" })).toBeNull();
  });
});
