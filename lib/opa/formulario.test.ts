import { describe, expect, it } from "vitest";

import { montarBoasVindas, tipoDoImovel } from "./boas-vindas-texto";
import { camposDoCorretorDasRespostas, diagnosticoDasRespostas, lerRespostas, soOQueFalta } from "./formulario";

describe("respostas do formulário", () => {
  const corpo = {
    finalidade: "ainda_nao_sei",
    relacao_ilhabela: "tem_imovel",
    historia_ilhabela: "Lazer e descanso em família",
    meta_campanha_nome: "[CADASTRO ENGENHO CA006944]",
    meta_lead_id: "1866117097707323",
  };

  it("vira pergunta por extenso e resposta legível, sem as chaves técnicas", () => {
    expect(lerRespostas(corpo)).toEqual([
      { chave: "finalidade", pergunta: "Qual a finalidade da busca?", resposta: "Ainda não sei" },
      { chave: "relacao_ilhabela", pergunta: "Qual é a sua relação com Ilhabela hoje?", resposta: "Tenho ou minha família tem imóvel na ilha" },
      {
        chave: "historia_ilhabela",
        pergunta: "Conta um pouco: como é Ilhabela na sua vida hoje e o que você espera viver aqui com a sua família?",
        resposta: "Lazer e descanso em família",
      },
    ]);
  });

  it("lê também dentro de qualificacao (site) e não perde pergunta desconhecida", () => {
    const r = lerRespostas({ qualificacao: { finalidade: "investimento", quartos_minimos: "tres_ou_mais" } });
    expect(r.map((x) => x.resposta)).toEqual(["Investimento", "Tres ou mais"]);
    expect(r[1]!.pergunta).toBe("Quartos minimos");
  });

  it("vazio ou nulo não quebra", () => {
    expect(lerRespostas(null)).toEqual([]);
    expect(lerRespostas({ finalidade: "" })).toEqual([]);
  });

  it("pré-preenche o diagnóstico, com 'Ainda não sei' como resposta", () => {
    expect(diagnosticoDasRespostas(lerRespostas(corpo))).toEqual({ finalidade: "Ainda não sei", estilo_vida: "Lazer e descanso em família" });
    expect(camposDoCorretorDasRespostas({ relacao_ilhabela: "nunca_vim" })).toEqual({ conhece: "Nunca veio" });
    expect(camposDoCorretorDasRespostas(corpo)).toEqual({});
  });

  it("nunca troca o que o corretor anotou", () => {
    expect(soOQueFalta({ finalidade: "Moradia" }, { finalidade: "Ainda não sei", regiao: "Norte" })).toEqual({ regiao: "Norte" });
  });
});

describe("boas-vindas", () => {
  it("monta o texto aprovado pelo Kallyl em 06/11", () => {
    expect(montarBoasVindas({ nomeLead: "aristides silva", corretor: "Marco Henrique", imovelCodigo: "CA006944", canal: "meta", publicado: true })).toBe(
      "Oi Aristides, tudo bem? Aqui é Marco, da OPA. A casa do anúncio está disponível. Para eu te ajudar melhor: a casa é para morar, para as temporadas ou para investir?",
    );
  });

  it("site, apartamento, sem nome e imóvel fora do ar", () => {
    expect(montarBoasVindas({ nomeLead: "", corretor: "Luana", imovelCodigo: "AP001", canal: "site", publicado: false })).toBe(
      "Oi, tudo bem? Aqui é Luana, da OPA. O apartamento que você viu no site saiu do site, mas tenho opções parecidas. Para eu te ajudar melhor: o apartamento é para morar, para as temporadas ou para investir?",
    );
  });

  it("tipo pelo prefixo do código", () => {
    expect(tipoDoImovel("TE0001")).toBe("O terreno");
    expect(tipoDoImovel(null)).toBe("O imóvel");
  });

  it("modelo do gestor, em uma linha", () => {
    expect(montarBoasVindas({ modelo: "Olá {primeiro_nome}!\nSou {corretor}.", nomeLead: "Ana", corretor: "paulo martin", imovelCodigo: null, canal: "meta", publicado: true })).toBe(
      "Olá Ana! Sou Paulo.",
    );
  });
});
