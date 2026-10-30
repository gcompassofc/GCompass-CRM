// @vitest-environment node
import { describe, expect, it } from "vitest";

import { fotoDaPessoa, fotosDoSite } from "./fotos-equipe";

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
