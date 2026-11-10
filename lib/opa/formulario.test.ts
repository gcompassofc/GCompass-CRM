import { describe, expect, it } from "vitest";

import { MODELO_09_11, MODELO_ANTERIOR, MODELO_LUANA, modeloDoCorretor, montarBoasVindas, textoProprioNaTela, tipoDoImovel } from "./boas-vindas-texto";
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
  const CASA = (nome: string, corretor: string, onde: string) =>
    `Oi, ${nome}, tudo bem?\n\nAqui é o ${corretor}, da OPA Imóveis, em Ilhabela.\n\nRecebi a mensagem sobre seu interesse ${onde} e resolvi entrar em contato diretamente.\n\nQuando seria um bom momento para conversarmos por telefone? Podemos falar por uns 10 minutinhos para eu entender melhor o que você está buscando.\n\nUm abraço\n${corretor}`;

  it("texto da casa de 10/11: parágrafos, imóvel com bairro, assinatura no fim", () => {
    expect(
      montarBoasVindas({ nomeLead: "marlene souza", corretor: "Cristian Spengler", imovelCodigo: "CA006779", bairro: "Siriúba", canal: "meta", publicado: true }),
    ).toBe(CASA("Marlene", "Cristian", "na casa do Siriúba"));
    expect(montarBoasVindas({ nomeLead: "Ana", corretor: "Marco", imovelCodigo: "CA1", bairro: "Barra Velha", canal: "meta", publicado: true })).toContain(
      "interesse na casa da Barra Velha e",
    );
  });

  it("apartamento, sem bairro, sem nome", () => {
    expect(montarBoasVindas({ nomeLead: "", corretor: "Paulo", imovelCodigo: "AP001", canal: "site", publicado: false })).toBe(
      CASA("", "Paulo", "no apartamento que você viu no site").replace("Oi, , tudo bem?", "Oi, tudo bem?"),
    );
    expect(montarBoasVindas({ nomeLead: "Ana", corretor: "Paulo", imovelCodigo: null, canal: "meta", publicado: true })).toContain("interesse no imóvel do anúncio e");
  });

  it("conta salva com um texto antigo passa a usar o novo", () => {
    for (const modelo of [MODELO_ANTERIOR, MODELO_09_11]) {
      expect(montarBoasVindas({ modelo, nomeLead: "Ana", corretor: "Paulo", imovelCodigo: "CA1", bairro: "Curral", canal: "meta", publicado: true })).toBe(
        CASA("Ana", "Paulo", "na casa do Curral"),
      );
    }
  });

  it("a Luana tem o texto dela; texto próprio salvo manda; vazio salvo volta ao da casa", () => {
    const bv = { modelo: "", modelos: {} as Record<string, string> };
    expect(modeloDoCorretor(bv, "l1", ["Luana Machado", undefined])).toBe(MODELO_LUANA);
    expect(montarBoasVindas({ modelo: MODELO_LUANA, nomeLead: "Ana", corretor: "Luana", imovelCodigo: "CA1", canal: "meta", publicado: true })).toBe(MODELO_LUANA);
    expect(modeloDoCorretor(bv, "c1", ["Cristian Spengler", ""])).toBe("");
    expect(modeloDoCorretor({ modelo: "", modelos: { c1: "Olá {primeiro_nome}" } }, "c1", ["Cristian"])).toBe("Olá {primeiro_nome}");
    expect(modeloDoCorretor({ modelo: "", modelos: { l1: "" } }, "l1", ["Luana Machado"])).toBe("");
    expect(textoProprioNaTela(bv, "l1", ["Luana Machado"])).toBe(MODELO_LUANA);
    expect(textoProprioNaTela(bv, "c1", ["Cristian"])).toBe("");
  });

  it("comercial e bairro com parêntese soam naturais", () => {
    expect(montarBoasVindas({ nomeLead: "Ana", corretor: "Paulo", imovelCodigo: "CO001", bairro: "Centro (Vila)", canal: "meta", publicado: true })).toContain(
      "interesse no imóvel comercial do Centro e",
    );
    expect(montarBoasVindas({ nomeLead: "Ana", corretor: "Paulo", imovelCodigo: "CA1", bairro: "Centro (Vila)", canal: "meta", publicado: true })).toContain(
      "interesse na casa do Centro e",
    );
  });

  it("tipo pelo prefixo do código", () => {
    expect(tipoDoImovel("TE0001")).toBe("O terreno");
    expect(tipoDoImovel(null)).toBe("O imóvel");
  });

  it("modelo do gestor guarda as quebras de linha", () => {
    expect(montarBoasVindas({ modelo: "Olá {primeiro_nome}!\nSou {corretor}.", nomeLead: "Ana", corretor: "paulo martin", imovelCodigo: null, canal: "meta", publicado: true })).toBe(
      "Olá Ana!\nSou Paulo.",
    );
  });
});
