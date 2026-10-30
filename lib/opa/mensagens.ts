/**
 * Próxima mensagem sugerida ao corretor, no tom do Kit de Atendimento OPA:
 * uma linha por toque, sem exclamação, cada mensagem com um motivo.
 * O corretor copia, ajusta se quiser e manda pelo WhatsApp dele.
 */

import type { CamposOpa } from "./dados";
import { precoPrincipal, SITE_BASE, type Imovel } from "./imoveis";

export interface MensagemSugerida {
  motivo: string;
  texto: string;
}

const PERGUNTAS: Record<"finalidade" | "regiao" | "momento" | "inegociavel", string> = {
  finalidade: "a casa é para morar, para as temporadas ou para investir?",
  regiao: "tem algum lado da ilha que vocês preferem, sul, norte ou perto da Vila?",
  momento: "vocês pensam em resolver isso para quando?",
  inegociavel: "o que não pode faltar de jeito nenhum na casa de vocês?",
};

function link(i: Imovel): string {
  return i.url_site ?? `${SITE_BASE}/imovel/${i.slug ?? i.codigo}/`;
}

export function proximaMensagem(args: {
  nome: string;
  corretor: string;
  etapa: string;
  campos: CamposOpa;
  imovelEntrada?: Imovel | null;
  combinam: Imovel[];
  leadEsperando: boolean;
  /** Comprador off market: nada de link aberto, só link reservado. */
  offMarket?: "comprador" | "proprietario" | null;
  /** Imóvel pelo qual o lead que já tinha dono acabou de voltar. */
  voltouCom?: Imovel | null;
}): MensagemSugerida {
  const primeiro = args.nome.split(" ")[0] ?? args.nome;
  const reservado = args.offMarket === "comprador";

  if (args.voltouCom && args.leadEsperando) {
    const im = args.voltouCom;
    return {
      motivo: "Voltou por outro formulário: responder pelo imóvel novo, sem recomeçar a conversa.",
      texto: `${primeiro}, vi que você também pediu informação ${im.bairro ? `da casa ${im.bairro.startsWith("Praia") ? "na" : "no"} ${im.bairro}` : "de outra casa"}. ${
        reservado || im.off_market
          ? "Ela não está nos portais: te mando os detalhes por um link reservado, só para você."
          : `Te mando os detalhes dela:\n${link(im)}`
      }\nQuer ver as duas de perto no mesmo dia?`,
    };
  }
  const faltando = (Object.keys(PERGUNTAS) as Array<keyof typeof PERGUNTAS>).filter((k) => !args.campos[k]);

  if (args.etapa === "lead-recebido") {
    const im = args.imovelEntrada;
    return {
      motivo: "Primeiro contato: apresentar e abrir o diagnóstico com uma pergunta só.",
      texto: `Oi ${primeiro}, tudo bem? Aqui é ${args.corretor}, da OPA. ${
        im ? "A casa do anúncio está disponível. " : ""
      }Para eu te ajudar melhor: ${PERGUNTAS[faltando[0] ?? "finalidade"]}`,
    };
  }

  if (faltando.length > 0) {
    return {
      motivo: `Falta ${faltando.length === 1 ? "um ponto" : `${faltando.length} pontos`} para fechar o diagnóstico.`,
      texto: `${primeiro}, ${PERGUNTAS[faltando[0]!]}`,
    };
  }

  if (args.etapa === "diagnostico" || args.etapa === "primeiro-contato") {
    const sel = args.combinam.slice(0, 2);
    if (sel.length > 0) {
      return {
        motivo: "Diagnóstico completo: mandar a seleção com o que combina.",
        texto: reservado
          ? `${primeiro}, separei ${sel.length === 1 ? "uma casa que combina" : "duas casas que combinam"} com o que você me contou${
              args.campos.inegociavel ? ` (${args.campos.inegociavel.toLowerCase()})` : ""
            }. Elas não estão anunciadas: te mando por um link reservado, só para você. Posso mandar?`
          : `${primeiro}, separei ${sel.length === 1 ? "uma casa que combina" : "duas casas que combinam"} com o que você me contou${
              args.campos.inegociavel ? ` (${args.campos.inegociavel.toLowerCase()})` : ""
            }:\n${sel.map((i) => `${i.titulo}, ${precoPrincipal(i)}\n${link(i)}`).join("\n")}\nQual delas você quer ver de perto?`,
      };
    }
  }

  if (args.etapa === "selecao") {
    return {
      motivo: "Seleção enviada: transformar interesse em visita.",
      texto: `${primeiro}, alguma das casas te chamou atenção? Consigo te mostrar no sábado de manhã ou num dia de semana, o que for melhor.`,
    };
  }

  if (args.etapa === "visita-agendada") {
    return {
      motivo: "Véspera da visita: confirmar e reduzir falta.",
      texto: `${primeiro}, confirmado nosso encontro. Te mando a localização certinha antes. Se mudar alguma coisa, me avisa.`,
    };
  }

  if (args.etapa === "visita-realizada") {
    return {
      motivo: "Depois da visita: registrar o que gostou e o que não gostou.",
      texto: `${primeiro}, obrigado pela visita. Do que você viu, o que mais pesou a favor e o que ficou faltando?`,
    };
  }

  if (args.etapa === "sem-momento") {
    const novo = args.combinam[0];
    return {
      motivo: "Relacionamento: só voltar com motivo real.",
      texto: novo
        ? `${primeiro}, entrou uma casa com ${args.campos.inegociavel?.toLowerCase() ?? "o que vocês procuravam"}. Quer saber mais?\n${link(novo)}`
        : `${primeiro}, a busca pela casa na ilha segue ou ficou para outro momento?`,
    };
  }

  return {
    motivo: args.leadEsperando ? "O lead mandou a última mensagem." : "Manter a conversa andando.",
    texto: `${primeiro}, fiquei de te retornar. Tem alguma dúvida que eu possa resolver agora?`,
  };
}

export interface ItemSelecao {
  codigo: string;
  titulo: string;
  bairro: string | null;
  preco: string;
  url: string | null;
  offMarket: boolean;
}

const QUANTAS = ["", "uma opção", "duas opções", "três opções"];

/**
 * Seleção de imóveis numa mensagem só (até 3), no tom do Kit: sem exclamação,
 * uma pergunta no fim. Off market não leva link nem valor por escrito
 * (regra do kit: valor por voz, link reservado no nome do cliente).
 */
export function mensagemSelecao(args: { nome: string; inegociavel?: string | null; itens: ItemSelecao[] }): string {
  const itens = args.itens.slice(0, 3);
  if (itens.length === 0) return "";
  const primeiro = args.nome.split(" ")[0] ?? args.nome;
  const linhas = itens.map((i) =>
    i.offMarket
      ? `${i.bairro ? `No ${i.bairro}` : "Uma casa"} fora dos portais: te mando por um link reservado, só para você, e o valor te passo por ligação.`
      : `${i.titulo}, ${i.preco}\n${i.url ?? ""}`.trim(),
  );
  const motivo = args.inegociavel ? ` (${args.inegociavel.toLowerCase()})` : "";
  return `${primeiro}, separei ${QUANTAS[itens.length]} que combinam com o que você me contou${motivo}.\n\n${linhas.join("\n\n")}\n\n${
    itens.length === 1 ? "Quer ver de perto?" : "Qual delas você quer ver de perto?"
  }`;
}
