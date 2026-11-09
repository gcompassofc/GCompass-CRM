import { describe, expect, it } from "vitest";

import { MODELO_ANTERIOR, montarBoasVindas, tipoDoImovel } from "./boas-vindas-texto";
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
  it("texto de 09/11: imóvel com bairro e código, o que o formulário disse e a pergunta da visita", () => {
    expect(
      montarBoasVindas({
        nomeLead: "marlene souza",
        corretor: "Cristian Spengler",
        imovelCodigo: "CA006779",
        bairro: "Siriúba",
        canal: "meta",
        publicado: true,
        respostas: { relacao: "ja_vim_algumas", finalidade: "moradia_veraneio" },
      }),
    ).toBe(
      "Oi Marlene, tudo bem? Aqui é Cristian, da OPA. A casa do Siriúba, código CA006779, está disponível. Vi no formulário que você já veio algumas vezes a Ilhabela e busca casa para morar ou passar temporadas. Para eu te ajudar melhor: você já tem uma data em mente para vir conhecer?",
    );
  });

  it("sem resposta do formulário, a frase some; aceita o texto que a ficha mostra", () => {
    expect(montarBoasVindas({ nomeLead: "Aristides", corretor: "Marco", imovelCodigo: "CA006944", bairro: "Barra Velha", canal: "meta", publicado: true })).toBe(
      "Oi Aristides, tudo bem? Aqui é Marco, da OPA. A casa da Barra Velha, código CA006944, está disponível. Para eu te ajudar melhor: você já tem uma data em mente para vir conhecer?",
    );
    expect(
      montarBoasVindas({ nomeLead: "Ana", corretor: "Luana", imovelCodigo: "AP001", bairro: "Perequê", canal: "site", publicado: true, respostas: { finalidade: "Investimento" } }),
    ).toContain("Vi no formulário que você busca apartamento para investir.");
    expect(
      montarBoasVindas({ nomeLead: "Ana", corretor: "Luana", imovelCodigo: "AP001", canal: "site", publicado: true, respostas: { finalidade: "ainda_nao_sei", relacao: "Nunca vim" } }),
    ).toContain("Vi no formulário que você ainda não conhece Ilhabela. Para");
    expect(montarBoasVindas({ nomeLead: "Ana", corretor: "Luana", imovelCodigo: "CA1", bairro: "Água Branca", canal: "meta", publicado: true })).toContain("A casa da Água Branca");
  });

  it("sem bairro e imóvel fora do ar; sem nome", () => {
    expect(montarBoasVindas({ nomeLead: "", corretor: "Luana", imovelCodigo: "AP001", canal: "site", publicado: false })).toBe(
      "Oi, tudo bem? Aqui é Luana, da OPA. O apartamento que você viu no site, código AP001, saiu do site, mas tenho opções parecidas. Para eu te ajudar melhor: você já tem uma data em mente para vir conhecer?",
    );
  });

  it("sem código, o trecho do código some", () => {
    expect(montarBoasVindas({ nomeLead: "Ana", corretor: "Luana", imovelCodigo: null, canal: "meta", publicado: true })).toBe(
      "Oi Ana, tudo bem? Aqui é Luana, da OPA. O imóvel do anúncio está disponível. Para eu te ajudar melhor: você já tem uma data em mente para vir conhecer?",
    );
  });

  it("conta salva com o modelo antigo passa a usar o novo", () => {
    expect(
      montarBoasVindas({ modelo: MODELO_ANTERIOR, nomeLead: "Ana", corretor: "Luana", imovelCodigo: "CA1", bairro: "Curral", canal: "meta", publicado: true }),
    ).toContain("A casa do Curral, código CA1, está disponível.");
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
