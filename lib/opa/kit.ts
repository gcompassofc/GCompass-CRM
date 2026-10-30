/**
 * Kit de Atendimento OPA, como dados do CRM.
 *
 * GERADO a partir de 02 - Clientes/opa/corretores/kit-atendimento-opa/src
 * (a mesma fonte do montar-kit.py do protótipo). Não editar à mão: mudou o
 * kit, rode "node scripts/gerar-kit-opa.mjs" e confira o diff.
 *
 * Campos de cada mensagem: t título, q quando usar, o o que o cliente diz
 * (objeções), m a mensagem, p por que funciona, a roteiro de áudio,
 * perfis restringe a alguns perfis. Na mensagem, {lead} {corretor} {imovel}
 * {bairro} {link} vêm do CRM e [texto] é o que o corretor completa.
 */

export type PerfilKit = "medio" | "alto" | "off";

export const PERFIS_KIT: Array<{ id: PerfilKit; nome: string }> = [
  { id: "medio", nome: "Médio padrão" },
  { id: "alto", nome: "Alto padrão" },
  { id: "off", nome: "Off market" },
];

export interface ItemKit {
  t: string;
  q?: string;
  o?: string;
  m: string;
  p?: string;
  a?: boolean;
  perfis?: PerfilKit[];
}

export interface EtapaKit {
  nome: string;
  desc?: string;
  regras?: string[];
  perfis?: PerfilKit[];
  itens: ItemKit[];
}

export interface ModuloKit {
  id: "atendimento" | "resgate" | "audio" | "objecoes";
  nome: string;
  titulo: string;
  desc: string | Partial<Record<PerfilKit | "todos", string>>;
  busca?: boolean;
  guia?: Array<{ b: string; s: string }>;
  etapas: EtapaKit[] | Partial<Record<PerfilKit, EtapaKit[]>>;
}

export const KIT: ModuloKit[] = [
  {
    "id": "atendimento",
    "nome": "Atendimento",
    "titulo": "Atendimento, etapa por etapa",
    "desc": {
      "medio": "Seis momentos, do primeiro contato à proposta. No médio padrão a família compara muito, pergunta de financiamento e ainda não sabe como a ilha funciona fora da temporada. Dê conta completa, documentação clara e a ilha real.",
      "alto": "Seis momentos, do primeiro contato à proposta. No alto padrão a pessoa tem pouco tempo, muita oferta e precisa de método de verificação, não de mais desejo. Menos mensagem, mais precisão, documento antes de adjetivo.",
      "off": "Seis momentos para a casa que não está no site. O proprietário pediu discrição, o cliente já passou pelo diagnóstico e tudo circula por link reservado, com nome e validade. Nada de foto solta no WhatsApp."
    },
    "etapas": {
      "medio": [
        {
          "nome": "Primeiro contato",
          "desc": "A boas-vindas automática já saiu do seu número com o link da ficha. Agora é você: ligação primeiro, mensagem como plano B.",
          "regras": [
            "Ligue em até 15 minutos. A mensagem automática prometeu isso no seu nome.",
            "Nunca pergunte quanto a pessoa pode pagar. O valor aparece sozinho na conversa.",
            "Depois das 18h é quando quem trabalha responde. Conte com isso."
          ],
          "itens": [
            {
              "t": "Retorno depois da boas-vindas",
              "q": "Não atendeu a ligação",
              "m": "{lead}, tentei te ligar agora e não consegui, sem pressa nenhuma.\n\nMe diz por aqui mesmo: a ideia com {imovel} é morar na ilha, vir nas temporadas com a família, ou os dois?",
              "p": "A primeira pergunta do diagnóstico já separa dois atendimentos diferentes, e ela se responde em uma palavra."
            },
            {
              "t": "Chegou perguntando o valor",
              "q": "Primeira mensagem é o preço",
              "m": "O valor pedido de {imovel} é [valor]. Já te adianto o que costuma entrar junto na conta: [condomínio e IPTU, ou custo de manutenção].\n\nSó que preço é a parte fácil daqui. O que decide é acesso, sol na casa e como vocês pretendem usar. Posso te ligar cinco minutos pra entender isso antes de mandar mais opções?",
              "p": "Responde sem fugir da pergunta e mostra que o número sozinho não decide nada na ilha."
            },
            {
              "t": "Sem resposta no mesmo dia",
              "q": "Fim do dia, sem retorno",
              "m": "{lead}, deixei separadas duas opções parecidas com {imovel}, uma no {bairro} e outra em [bairro], já com condomínio, IPTU e a situação da documentação na conta.\n\nTe mando por aqui amanhã cedo, ou prefere que eu ligue hoje depois das 18h?",
              "p": "Oferece o comparativo que ele faria sozinho e duas saídas fáceis, uma delas no horário em que ele responde."
            }
          ]
        },
        {
          "nome": "Diagnóstico",
          "desc": "As três perguntas da OPA, de preferência por telefone. Depois, um minuto no CRM: relação com a ilha, momento de vida, inegociável e as tags de interesse.",
          "regras": [
            "Uma pergunta por mensagem.",
            "A ilha real entra na conversa: balsa, chuva, temporada cheia e inverno vazio.",
            "Anote o que não é imóvel: barco, filhos, cachorro, home office. É isso que dá assunto daqui a oito meses."
          ],
          "itens": [
            {
              "t": "Relação com Ilhabela",
              "q": "Logo depois do primeiro sim",
              "m": "Vocês já conhecem Ilhabela fora da temporada? Pergunto porque a ilha de julho é outra cidade, e isso muda o que faz sentido comprar.",
              "p": "Quem compra sabendo como a ilha funciona fica. Quem compra pela foto do verão desiste e devolve o imóvel ao mercado."
            },
            {
              "t": "Momento de vida",
              "q": "Na mesma conversa",
              "m": "O que fez vocês começarem a procurar agora? Mudança de rotina, trabalho remoto, filhos crescendo, ou uma vontade antiga que achou a hora?",
              "p": "O motivo da compra é o argumento que você vai usar na apresentação. Sem ele, você mostra casa; com ele, mostra a casa certa."
            },
            {
              "t": "O inegociável",
              "q": "Fechando o diagnóstico",
              "m": "Se só pudesse garantir uma coisa, qual seria: ficar perto da praia, ter espaço pra família toda ou acesso fácil pela avenida, sem estrada de terra?",
              "p": "Ordem de prioridade diz o que é negociável. Lista de desejos não diz."
            }
          ]
        },
        {
          "nome": "Apresentação",
          "desc": "Dados lado a lado, com a documentação explicada antes de virar susto.",
          "regras": [
            "No máximo três opções, nunca a carteira inteira.",
            "Custo do mês completo: parcela ou aplicação, condomínio, IPTU, manutenção.",
            "Escritura ou posse dita logo. Boa parte dos imóveis da ilha é posse, e isso muda o pagamento."
          ],
          "itens": [
            {
              "t": "Comparativo em uma imagem",
              "q": "Depois do diagnóstico",
              "m": "Montei um comparativo das três que batem com o que vocês me contaram: valor, área, condomínio, IPTU, distância da balsa e documentação (escritura ou posse).\n\nTe mando em uma imagem só, fica mais fácil de ver lado a lado.",
              "p": "Ele ia montar essa tabela sozinho. Quem entrega pronta vira referência, e a coluna da documentação evita a surpresa lá na frente."
            },
            {
              "t": "Documentação explicada cedo",
              "q": "Antes de falar em forma de pagamento",
              "m": "Um ponto que decide muita coisa na ilha: boa parte dos imóveis é posse, sem matrícula, e isso impede financiamento pelo banco. {imovel} está [com matrícula / com escritura / em posse].\n\nTe explico em dois minutos o que isso muda na forma de pagar?",
              "p": "Antecipa a objeção que mais derruba negócio em Ilhabela. A June revisa a documentação; você só precisa saber o status."
            },
            {
              "t": "O que a foto não mostra",
              "q": "Ao enviar fotos ou a ficha",
              "m": "Uma coisa de {imovel} que não aparece na foto: [de manhã o sol entra na varanda e à tarde a casa fica na sombra do morro, o que em janeiro é um alívio]. Vale ver no horário certo.",
              "p": "Detalhe de quem esteve lá. É o tipo de informação que nenhum portal dá e que mostra curadoria em vez de catálogo."
            }
          ]
        },
        {
          "nome": "Visita",
          "desc": "Visita no horário em que a casa mostra o que é, com a logística da ilha resolvida por você.",
          "regras": [
            "Escolha o horário pela luz e pela fila da balsa, e diga o motivo.",
            "Duas visitas na mesma vinda, se fizer sentido.",
            "Casal junto. Visita separada vira segunda visita."
          ],
          "itens": [
            {
              "t": "Convite com a balsa na conta",
              "q": "Quando uma opção agradou",
              "m": "Posso te mostrar {imovel} no sábado às 10h ou no domingo no fim da tarde, que é quando a luz da casa é outra.\n\nSe vierem de carro, te mando o horário em que a balsa costuma ter menos fila.",
              "p": "Dois horários com motivo e um cuidado que só quem mora aqui tem. A visita já começa bem antes de chegar."
            },
            {
              "t": "Duas numa ida",
              "q": "Quando há duas finalistas",
              "m": "Pra aproveitar a vinda, encaixo {imovel} às 10h e a outra opção no [bairro] às 11h30. São uns [minutos] de uma pra outra pela avenida.\n\nFica bom pra vocês?",
              "p": "Economiza o sábado da família e deixa a comparação fresca na memória."
            },
            {
              "t": "Véspera",
              "q": "Um dia antes",
              "m": "{lead}, amanhã às [hora] em {imovel}. Traz água e um calçado fechado, o acesso tem um trecho de terra.\n\nTe mando a localização certa agora, o mapa às vezes erra o acesso por ali.",
              "p": "Confirma e resolve a chegada, que é onde muita visita se perde na ilha."
            }
          ]
        },
        {
          "nome": "Pós-visita",
          "desc": "No dia seguinte, pergunta direta. Dúvida técnica volta com documento. Antes de qualquer mensagem, o registro no CRM.",
          "regras": [
            "Nunca pergunte só \"e aí, o que achou?\".",
            "Toda dúvida técnica volta com documento, não com opinião.",
            "Registre no card o que agradou e o que incomodou antes de responder."
          ],
          "itens": [
            {
              "t": "D+1 da visita",
              "q": "Manhã seguinte",
              "m": "{lead}, obrigado por terem vindo ontem. Me diz na lata: o que agradou e o que incomodou em {imovel}?\n\nSe teve alguma coisa que não deu pra falar na frente do proprietário, pode falar aqui.",
              "p": "Pergunta direta rende resposta direta. A segunda frase abre o que a pessoa segurou na visita."
            },
            {
              "t": "Dúvida técnica resolvida",
              "q": "Quando tiver a resposta",
              "m": "Confirmei com o proprietário e com a June, que cuida da parte jurídica aqui na OPA: [a escritura está em nome dele / a área construída está averbada / a reforma não precisa de aprovação].\n\nTe mando o documento. Isso muda a avaliação de vocês?",
              "p": "Documento encerra a dúvida. Citar quem conferiu mostra que a OPA tem processo, não só corretor."
            },
            {
              "t": "Não serviu",
              "q": "Quando a resposta for não",
              "m": "Entendi. Pelo que você me contou, o que não serviu foi [o acesso / o tamanho / a distância da praia].\n\nEm vez de te mandar mais três parecidas: isso é eliminatório, ou dá pra compensar com outra coisa?",
              "p": "Transforma o não em critério. Saber o que elimina evita três fins de semana perdidos."
            }
          ]
        },
        {
          "nome": "Proposta",
          "desc": "Proposta por escrito, negociação com troca, e nada prometido em nome do proprietário.",
          "regras": [
            "Resuma o que ele aprovou antes de pedir a proposta.",
            "Desconto só com contrapartida: entrada maior, prazo, forma de pagamento.",
            "Depois do sim, a documentação segue com a June. Avise isso no mesmo dia."
          ],
          "itens": [
            {
              "t": "Pedir a proposta",
              "q": "Quando os critérios fecharem",
              "m": "Pelo que vimos, {imovel} atende o que vocês puseram no topo da lista: [critérios].\n\nQuerem que eu leve uma proposta ao proprietário? Antes te explico como ele pensa valor e prazo, pra proposta ter força.",
              "p": "Ele ouve a própria lista. Explicar o proprietário tira o medo de errar o número."
            },
            {
              "t": "Negociação com troca",
              "q": "Quando pedirem desconto",
              "m": "Falei com o proprietário. Ele conversa sobre valor se [a entrada for maior / o prazo for mais curto / o pagamento for à vista].\n\nAlguma dessas condições funciona pra vocês?",
              "p": "Desconto sem troca desvaloriza o imóvel. Com troca, os dois lados cedem e a proposta anda."
            },
            {
              "t": "Proposta aceita",
              "q": "No mesmo dia do sim",
              "m": "Proposta aceita. A partir de agora a June cuida da documentação e eu te aviso cada etapa.\n\nTe mando hoje a lista do que precisamos de vocês, com o prazo de cada coisa.",
              "p": "Ritmo depois do sim evita o esfriamento entre a proposta e a escritura. E diz quem faz o quê."
            }
          ]
        }
      ],
      "alto": [
        {
          "nome": "Primeiro contato",
          "desc": "A boas-vindas já saiu do seu número. Agora, pouco texto, nenhum catálogo e respeito pelo tempo dele.",
          "regras": [
            "Ligue em até 15 minutos. Se não atender, uma mensagem curta, sem exclamação.",
            "Nunca mande a carteira inteira. Você filtra antes.",
            "Ofereça falar com quem organiza a agenda, se for o caso."
          ],
          "itens": [
            {
              "t": "Retorno depois da boas-vindas",
              "q": "Não atendeu a ligação",
              "m": "{lead}, {corretor}, da OPA Ilhabela. Tentei te ligar sobre {imovel}.\n\nPrefere a ficha completa ou cinco minutos de conversa antes, pra eu entender o que faz sentido te mostrar?",
              "p": "Dá a escolha a ele e já sinaliza que você filtra antes de mandar."
            },
            {
              "t": "Chegou perguntando o valor",
              "q": "Primeira mensagem é o preço",
              "m": "O valor pedido é [valor], com [o que está incluso: mobília, caseiro, embarcação].\n\nAntes de te mandar mais opções, uma pergunta só: a casa seria pra morar, pra fins de semana ou pra família toda nas temporadas?",
              "p": "Responde direto, sem rodeio, e troca o próximo passo por uma pergunta que cabe em uma palavra."
            },
            {
              "t": "Sem resposta",
              "q": "Dia seguinte",
              "m": "{lead}, a ficha de {imovel} está separada: matrícula, área construída e custo de manutenção informado pelo proprietário. Te mando quando for conveniente.",
              "p": "Uma linha, sem cobrança, e já diz que a documentação está em ordem. É o que ele vai pedir de qualquer jeito."
            }
          ]
        },
        {
          "nome": "Diagnóstico",
          "desc": "Poucas perguntas, bem escolhidas, de preferência por voz. Depois, um minuto no CRM com as tags: vela, barco, mergulho, família.",
          "regras": [
            "No máximo uma pergunta por mensagem e poucas no total.",
            "Descubra o uso: moradia, segunda residência ou patrimônio.",
            "Discrição sobre valores. Ele fala de orçamento quando quiser, e costuma falar."
          ],
          "itens": [
            {
              "t": "Uso da casa",
              "q": "Logo depois do primeiro sim",
              "m": "Essa casa seria pra morar, pra fins de semana ou pra família toda nas temporadas?",
              "p": "Cada uso pede uma casa diferente. A resposta poupa visitas inúteis e define o bairro."
            },
            {
              "t": "O que falta hoje",
              "q": "Na mesma conversa",
              "m": "O que a casa que vocês usam hoje não tem e faz falta? [Vista, privacidade, sair de casa direto na praia, espaço pra receber.]",
              "p": "A falta concreta é mais útil que a lista de desejos. E costuma vir com a história da família junto."
            },
            {
              "t": "Uma prioridade só",
              "q": "Fechando o diagnóstico",
              "m": "Privacidade, vista ou sair de casa direto na areia. Se só pudesse escolher um, qual seria?",
              "p": "Força uma escolha e mostra o critério que vai decidir a compra. Anote no CRM como inegociável."
            }
          ]
        },
        {
          "nome": "Apresentação",
          "desc": "Uma ou duas opções, com o detalhe que só quem esteve na casa sabe, e a ficha pronta para o advogado dele.",
          "regras": [
            "Uma ou duas opções, nunca uma lista.",
            "Vídeo de um minuto gravado na casa, no lugar de quarenta fotos.",
            "Ficha técnica com matrícula e custo de manter, organizada para o advogado ou o contador."
          ],
          "itens": [
            {
              "t": "A opção certa",
              "q": "Depois do diagnóstico",
              "m": "Tenho uma casa que atende o que você disse sobre [critério dele]: [característica concreta]. Ainda não está no site.\n\nPosso te mandar um vídeo de um minuto, gravado lá, antes das fotos?",
              "p": "Exclusividade real e um formato que ele consome em qualquer intervalo. Só diga que não está no site se for verdade."
            },
            {
              "t": "O detalhe que não aparece",
              "q": "Ao enviar o vídeo ou a ficha",
              "m": "Um detalhe de {imovel} que a foto não mostra: [o deck fica protegido do vento sul, então dá pra usar mesmo em dia de frente fria / da suíte se vê o canal inteiro até São Sebastião].",
              "p": "Prova que você esteve lá. É a frase que nenhum portal escreve e que o olhar de arquiteto da OPA entrega."
            },
            {
              "t": "Ficha técnica",
              "q": "Quando o interesse for sério",
              "m": "Te mando a ficha com matrícula, área construída, IPTU e o custo mensal de manutenção informado pelo proprietário (caseiro, jardim, piscina).\n\nSe o seu advogado quiser olhar, já está organizada.",
              "p": "Antecipa a diligência que ele vai fazer de qualquer jeito. Método de verificação vende mais que adjetivo neste perfil."
            }
          ]
        },
        {
          "nome": "Visita",
          "desc": "Visita privativa, no horário em que a casa mostra o melhor dela, com a chegada resolvida por você.",
          "regras": [
            "Reserve o horário só para ele. Ninguém mais na casa.",
            "Escolha o horário pela luz ou pela vista, e diga por quê.",
            "Cuide da chegada: balsa, transfer, encontro na saída da balsa."
          ],
          "itens": [
            {
              "t": "Visita privativa",
              "q": "Quando houver interesse",
              "m": "Posso reservar {imovel} só pra vocês no sábado de manhã ou no fim da tarde, quando a luz da casa é outra.\n\nQual horário funciona?",
              "p": "Dois horários, cada um com um motivo, e ninguém mais na casa naquele momento."
            },
            {
              "t": "Chegada resolvida",
              "q": "Lead que vem de fora",
              "m": "Se vierem de carro, eu encontro vocês na saída da balsa e seguimos juntos. Se preferirem, organizo o transfer desde [São Sebastião / o aeroporto].\n\nÉ só me dizer de onde saem.",
              "p": "Tira o atrito da visita para quem não conhece o caminho. A ilha é parte do que ele está comprando."
            },
            {
              "t": "Véspera",
              "q": "Um dia antes",
              "m": "{lead}, amanhã às [hora] está confirmado. O caseiro estará lá pra parte técnica [e o Marco, que é arquiteto, vai junto pra responder sobre a construção].",
              "p": "Confirma com um detalhe útil, sem lembrete insistente. O arquiteto na visita é diferencial da OPA; use quando fizer sentido."
            }
          ]
        },
        {
          "nome": "Pós-visita",
          "desc": "Curto, técnico, sem cobrança. O registro no CRM vem antes da mensagem.",
          "regras": [
            "Mensagem curta no mesmo dia.",
            "Dúvida técnica volta com documento.",
            "Ofereça uma segunda visita com o arquiteto ou com a família."
          ],
          "itens": [
            {
              "t": "Agradecimento curto",
              "q": "No mesmo dia",
              "m": "Obrigado por virem hoje. Qualquer ponto técnico que tenha ficado, levanto direto com o proprietário.",
              "p": "Sem pedir opinião. A porta fica aberta e a pressão fica de fora."
            },
            {
              "t": "Resposta técnica",
              "q": "Quando tiver a resposta",
              "m": "A resposta sobre [dúvida]: [resposta]. Segue o documento.\n\nMais algum ponto que você queira ver antes de pensar em valor?",
              "p": "Resolve e já pergunta o que falta, sem falar em compra."
            },
            {
              "t": "Segunda visita",
              "q": "Interesse sem decisão",
              "m": "Se quiserem voltar com o arquiteto de vocês ou com alguém da família, organizo outra visita no horário que preferirem.",
              "p": "No alto padrão, a segunda visita com quem opina costuma vir antes da proposta. Facilite."
            }
          ]
        },
        {
          "nome": "Proposta",
          "desc": "Negociação discreta e por escrito. Você conduz, sem ansiedade aparente.",
          "regras": [
            "Peça valor e condições por escrito.",
            "Você conduz a conversa com o proprietário.",
            "Nenhuma pressa aparente. Ansiedade custa caro neste perfil."
          ],
          "itens": [
            {
              "t": "Levar a proposta",
              "q": "Quando ele sinalizar interesse",
              "m": "Se fizer sentido pra vocês, levo uma proposta ao proprietário. Me diz o valor e as condições, e eu conduzo a conversa.",
              "p": "Coloca você no papel de quem representa, não de quem vende."
            },
            {
              "t": "Resposta do proprietário",
              "q": "Depois da contraproposta",
              "m": "O proprietário respondeu: [resposta]. A meu ver, existe espaço em [ponto].\n\nQuer que eu siga por esse caminho?",
              "p": "Dá a sua leitura, e a decisão continua com ele."
            },
            {
              "t": "Proposta aceita",
              "q": "No mesmo dia do sim",
              "m": "Proposta aceita. A June assume a documentação e te mando hoje o cronograma, com quem é responsável por cada etapa.",
              "p": "Organização depois do sim é o que este cliente vai lembrar e indicar."
            }
          ]
        }
      ],
      "off": [
        {
          "nome": "Primeiro contato",
          "desc": "Off market só abre para quem já passou pelo diagnóstico. A casa não está no site porque o proprietário pediu, e o material é da OPA.",
          "regras": [
            "Nunca mande foto solta. Tudo vai pelo link reservado, com nome e validade.",
            "Explique por que a casa não está no site: o proprietário prefere não anunciar.",
            "Quem chega pelo destaque do Instagram pedindo acesso passa primeiro por uma conversa."
          ],
          "itens": [
            {
              "t": "Abrindo para um cliente conhecido",
              "q": "Entrou casa que bate com o que ele pediu",
              "m": "{lead}, lembrei de você por causa de [o que ele pediu: praia mais reservada, terreno grande, casa que não circula].\n\nEntrou uma casa no {bairro} que não está no site: o proprietário prefere não anunciar. Te mando um link reservado, no seu nome, válido por [7 dias]. Posso?",
              "p": "Começa pelo critério dele, não pela casa. Pedir permissão para mandar o link já diz que aquilo não circula."
            },
            {
              "t": "Perguntou como funciona",
              "q": "Lead curioso com o off market",
              "m": "Funciona assim: são casas que o proprietário não quer ver anunciadas. A gente apresenta só pra quem já conversou com a OPA e tem o perfil, por um link com nome, validade e que abre num aparelho só.\n\nÉ a forma de proteger quem vende e quem compra.",
              "p": "Explica o sigilo como cuidado, não como mistério. Quem entende a regra respeita o link."
            },
            {
              "t": "Pediu acesso sem conversar",
              "q": "Veio do destaque ou de indicação",
              "m": "{lead}, antes de abrir o off market pra você, preciso de uma conversa de dez minutos pra entender o que vocês procuram. Não é burocracia: é o combinado com os proprietários.\n\nPosso te ligar hoje depois das 18h?",
              "p": "Filtra sem ofender. O combinado com os proprietários é a razão, e ela é verdadeira."
            }
          ]
        },
        {
          "nome": "Diagnóstico",
          "desc": "Confirmar o perfil antes de abrir o link. Três perguntas, de preferência por voz, e o registro no CRM com a tag off market.",
          "regras": [
            "Descubra o que ele não achou no que está anunciado.",
            "Pergunte sobre quem compra (pessoa física ou empresa) só para organizar a documentação.",
            "Prazo de decisão importa: algumas casas aceitam visita em dias certos."
          ],
          "itens": [
            {
              "t": "O que não encontrou",
              "q": "Abrindo a conversa",
              "m": "O que vocês procuram que não encontraram no que está anunciado? Pergunto porque o off market costuma resolver algo específico: terreno maior, praia mais reservada, casa que não circula.",
              "p": "O off market existe para o que o site não resolve. A pergunta descobre qual é o caso dele."
            },
            {
              "t": "Quem compra",
              "q": "Na mesma conversa",
              "m": "A compra seria em nome de pessoa física ou pela empresa? Pergunto só pra já organizar a documentação do jeito certo com a June.",
              "p": "Pergunta de patrimônio feita com naturalidade e com motivo prático. Não é sobre quanto ele tem."
            },
            {
              "t": "Prazo",
              "q": "Fechando o diagnóstico",
              "m": "Tem prazo pra decidir, ou vocês estão escolhendo com calma? Algumas dessas casas só recebem visita em dias certos, e eu preciso encaixar.",
              "p": "Mostra que a visita é combinada com o proprietário e descobre a urgência real sem criar urgência falsa."
            }
          ]
        },
        {
          "nome": "Apresentação",
          "desc": "O link reservado é a apresentação. Valor por voz, documento na aba do link, e nenhuma foto avulsa no WhatsApp.",
          "regras": [
            "Link com nome do cliente e validade: 24 horas, 3 dias ou 7 dias. Ele abre num aparelho só.",
            "Peça que não repasse. Se alguém da família precisa ver, gere outro link no nome da pessoa.",
            "Valor por voz, nunca em print."
          ],
          "itens": [
            {
              "t": "Enviando o link reservado",
              "q": "Depois do diagnóstico",
              "m": "{lead}, segue o link reservado de {imovel}: {link}\n\nEstá no seu nome e vale até [data]. Abre num aparelho só, então use o celular ou o computador que você for usar mesmo. Peço que não repasse: é o combinado com o proprietário.",
              "p": "Explica as regras do link antes de ele tropeçar nelas. O pedido de não repassar protege o proprietário e valoriza o acesso."
            },
            {
              "t": "Falando de valor",
              "q": "Quando ele perguntar o preço",
              "m": "O valor pedido eu prefiro te falar por voz, como faço com todos os off market. Posso te ligar às [hora]? Em dois minutos te passo o valor e o que está incluso.",
              "p": "Valor por voz não vira print. E a ligação abre a conversa que o texto não abre."
            },
            {
              "t": "Link vencido ou pedido de outro",
              "q": "Ele voltou depois do prazo",
              "m": "O link de {imovel} venceu [ontem]. Gero outro agora, com mais [3 dias].\n\nSe quiser mostrar pra alguém da família, me diz o nome que eu crio um link pra pessoa também, em vez de encaminhar.",
              "p": "Resolve sem cobrar e oferece o caminho certo para a família ver, dentro da regra."
            }
          ]
        },
        {
          "nome": "Visita",
          "desc": "Combinada com o proprietário com antecedência, acompanhada o tempo todo e sem fotos do cliente.",
          "regras": [
            "Combine com o proprietário com dois dias de antecedência, no mínimo.",
            "Você acompanha a visita inteira. É a condição do proprietário.",
            "Fotos só pelo link reservado, nunca pelo celular do cliente."
          ],
          "itens": [
            {
              "t": "Marcando com antecedência",
              "q": "Quando ele quiser conhecer",
              "m": "Pra visitar {imovel}, combino com o proprietário com [dois dias] de antecedência. Vocês conseguem [sábado de manhã] ou [terça à tarde]?\n\nVou junto o tempo inteiro, é a condição dele.",
              "p": "Dois horários e a regra dita antes, para a visita não ter surpresa."
            },
            {
              "t": "Sobre fotos na visita",
              "q": "Ao confirmar",
              "m": "Um combinado sobre a visita: o proprietário pede que não se fotografe a casa. O que vocês precisarem rever, eu mando pelo link reservado depois.",
              "p": "Dita a regra com motivo e oferece a alternativa. Ninguém se sente vigiado."
            },
            {
              "t": "Véspera",
              "q": "Um dia antes",
              "m": "{lead}, amanhã às [hora] em {imovel}. Encontro vocês em [ponto de referência] e seguimos juntos; o acesso não aparece bem no mapa.",
              "p": "Encontro em ponto neutro protege o endereço e resolve a chegada."
            }
          ]
        },
        {
          "nome": "Pós-visita",
          "desc": "Perguntar o que a visita mudou na busca. Documento pelo link, não pelo WhatsApp.",
          "regras": [
            "No mesmo dia, mensagem curta.",
            "Dúvida técnica volta pelo link reservado, na aba de documentação.",
            "Se não é essa, diga que o off market anda devagar e mantenha o cliente na lista."
          ],
          "itens": [
            {
              "t": "No mesmo dia",
              "q": "Depois da visita",
              "m": "Obrigado pela visita de hoje. O que vocês sentiram ali bate com o que estavam procurando, ou mudou alguma coisa na busca?",
              "p": "Pergunta aberta, mas com direção. A resposta atualiza o diagnóstico no CRM."
            },
            {
              "t": "Dúvida técnica",
              "q": "Quando tiver a resposta",
              "m": "Levantei com o proprietário: [resposta]. O documento vai pelo link reservado, na aba de documentação, não por aqui.",
              "p": "Mantém o material no lugar certo. Documento de casa off market não circula por WhatsApp."
            },
            {
              "t": "Não é essa",
              "q": "Quando a resposta for não",
              "m": "Entendido. O off market anda devagar por natureza: entram poucas casas e cada uma é diferente.\n\nQuando aparecer outra com [critério], você é o primeiro que eu chamo.",
              "p": "Explica o ritmo e deixa a pessoa na lista certa. A tag no CRM é o que faz essa promessa ser cumprida."
            }
          ]
        },
        {
          "nome": "Proposta",
          "desc": "Por escrito, com discrição até o fim. A venda não aparece em lugar nenhum.",
          "regras": [
            "Proposta por escrito, com prazo e forma de pagamento. Nesses casos pesam mais que o valor em si.",
            "Diga com sinceridade quantas pessoas estão olhando. Nunca invente concorrência.",
            "Depois do sim, a documentação segue com a June e a discrição continua."
          ],
          "itens": [
            {
              "t": "Levar a proposta",
              "q": "Quando ele sinalizar interesse",
              "m": "Se fizer sentido, levo uma proposta ao proprietário por escrito. Nesses casos ele costuma olhar prazo e forma de pagamento com mais peso do que o valor em si.\n\nMe diz como vocês pensaram.",
              "p": "Orienta a proposta pelo que o proprietário valoriza. Proposta bem montada anda; proposta solta volta."
            },
            {
              "t": "Resposta do proprietário",
              "q": "Depois da contraproposta",
              "m": "O proprietário respondeu: [resposta]. Pra você decidir com calma: [quantas pessoas, de verdade, estão olhando a casa agora].\n\nQuer que eu siga por [ponto]?",
              "p": "Transparência sobre a concorrência real. No off market a confiança é o produto."
            },
            {
              "t": "Proposta aceita",
              "q": "No mesmo dia do sim",
              "m": "Proposta aceita. A documentação segue com a June, e a venda não vai aparecer em lugar nenhum, como combinado. Te mando o cronograma hoje.",
              "p": "Fecha reafirmando a discrição, que foi o motivo de a casa estar no off market."
            }
          ]
        }
      ]
    }
  },
  {
    "id": "resgate",
    "nome": "Resgate de leads",
    "titulo": "Resgate de quem parou de responder",
    "desc": {
      "medio": "Dez toques em 30 dias para a família que queria uma casa na ilha e sumiu. Cada toque traz algo útil: casa nova de verdade, vídeo fora da temporada, documentação, locação. Dias sugeridos: 1, 3, 5, 7, 10, 14, 18, 22, 26 e 30, contados do último contato. Ajuste ao ritmo da pessoa.",
      "alto": "Dez toques em 30 dias, curtos e espaçados. No alto padrão, insistência afasta e precisão traz de volta. Uma linha por toque. Dias sugeridos: 1, 3, 5, 7, 10, 14, 18, 22, 26 e 30, contados do último contato. Ajuste ao ritmo da pessoa.",
      "off": "Seis toques, mais espaçados. No off market a casa é rara e o cliente sabe disso. Você chama quando há motivo, e o motivo é sempre uma casa ou um link."
    },
    "etapas": {
      "medio": [
        {
          "nome": "Cadência de 10 toques",
          "desc": "Mensagens com dado, material ou pergunta que ajuda a pensar. O médio padrão responde a quem ajuda a decidir.",
          "regras": [
            "Comece no terceiro dia sem resposta. Se a pessoa voltar, pare e retome o atendimento normal.",
            "Mensagem com casa nova só se a casa for nova de verdade. Dado do bairro só com fonte.",
            "Nada de prazo inventado, concorrência inventada ou número sem fonte.",
            "No último toque, mova o card para Sem momento. O lead continua seu e segue recebendo o relacionamento mensal."
          ],
          "itens": [
            {
              "t": "Toque 1 · A casa segue nos planos?",
              "q": "Reabrir",
              "m": "Oi {lead}, {corretor} aqui, da OPA Ilhabela.\n\nA ideia da casa na ilha segue pra este ano ou ficou mais pra frente?",
              "p": "Pergunta fácil, com espaço para o \"mais pra frente\". Qualquer resposta reposiciona o card."
            },
            {
              "t": "Toque 2 · Entrou algo com o que você pediu",
              "q": "Só se for verdade",
              "m": "Entrou uma casa no {bairro} com [o que ele pediu]. Ainda não está no site.\n\nQuer ver antes?",
              "p": "Acesso antes do site tem valor real para quem compara muito. Nunca diga isso se a casa já estiver anunciada."
            },
            {
              "t": "Toque 3 · A rua fora da temporada",
              "q": "Entrega sem cobrança",
              "m": "{lead}, o {bairro} em [mês] é bem diferente do {bairro} de janeiro. Esse vídeo mostra a rua e a praia fora da temporada, que é a parte que quase ninguém mostra: [link]",
              "p": "A ilha real, sem pedir nada. É o conteúdo que faz a pessoa confiar que você não vende só a foto do verão."
            },
            {
              "t": "Toque 4 · Planilha de comparação",
              "q": "Material útil",
              "m": "Montei uma planilha simples pra comparar casas na ilha: custo do mês completo, distância da balsa, documentação (escritura ou posse) e o que fica no imóvel.\n\nServe até pras que você viu com outras imobiliárias. Te mando?",
              "p": "Ferramenta que ele usaria de qualquer jeito, com a coluna que só quem conhece a ilha coloca."
            },
            {
              "t": "Toque 5 · Um dado do bairro",
              "q": "Só com fonte",
              "m": "{lead}, um número do {bairro} que costuma surpreender quem está olhando a região: [dado do relatório mensal de demanda, com o período].\n\nSe quiser, te explico o que isso muda na hora de escolher.",
              "p": "O dado sai do relatório de demanda, nunca da cabeça. Sem o número na mão, pule este toque e repita o formato do toque 2."
            },
            {
              "t": "Toque 6 · O que faltou",
              "q": "Descobrir a trava",
              "m": "{lead}, me ajuda numa coisa: o que faltou em {imovel} pra você? Se foi o preço, a localização ou o tamanho.\n\nSaber isso me evita te mandar mais três parecidas.",
              "p": "Três respostas de uma palavra. Qualquer uma corrige o rumo da busca."
            },
            {
              "t": "Toque 7 · Se foi a documentação",
              "q": "Quando posse e financiamento travaram",
              "m": "Se o que segurou foi a questão de posse e financiamento, tenho opções com matrícula em dia, que o banco aceita. Quer que eu filtre só essas?",
              "p": "Ataca o freio mais comum da ilha com uma solução concreta, e mostra que você entendeu o problema."
            },
            {
              "t": "Toque 8 · Alugar antes de comprar",
              "q": "Quando a dúvida é a ilha, não a casa",
              "m": "Se a dúvida for como é viver aqui fora da temporada, dá pra alugar por uma temporada como morador, não como turista. Depois disso a escolha da casa fica muito mais fácil.\n\nQuer que eu mande opções de locação?",
              "p": "Resolve a dúvida de fundo e mantém a família com a OPA, mesmo que a compra demore um ano."
            },
            {
              "t": "Toque 9 · Convite sem compromisso",
              "q": "Pedido pequeno",
              "m": "{lead}, se vocês vierem pra ilha em algum fim de semana, me avisa. Te mostro duas ou três casas e te levo pra conhecer os bairros, mesmo que ainda não seja hora de comprar. Ver de perto muda tudo.",
              "p": "Convite que não pede decisão. Conhecer os bairros com alguém da ilha é o que ele não consegue sozinho."
            },
            {
              "t": "Toque 10 · Pausa combinada",
              "q": "Encerrar sem descartar",
              "m": "{lead}, faz um tempo que te mando coisa daqui e você não responde, então acho justo eu parar. Não vou mais te procurar.\n\nSe um dia você resolver olhar Ilhabela de novo, é só me chamar que eu retomo de onde a gente parou.",
              "p": "Sair com educação costuma trazer a resposta que faltava. Quem responde volta para Diagnóstico feito; quem não responde vai para Sem momento e segue no relacionamento mensal."
            }
          ]
        },
        {
          "nome": "Mensagens criativas",
          "desc": "Para quem já conversou com você, gostou de alguma coisa e sumiu. O objetivo é só a próxima resposta. Quando a pessoa voltar, pare a brincadeira e volte ao atendimento.",
          "regras": [
            "Use depois que as mensagens normais não funcionaram.",
            "Só com lead que já teve conversa real com você.",
            "No alto padrão e no off market, só se a pessoa já mostrou bom humor na conversa.",
            "Uma por semana, no máximo. Sem emoji."
          ],
          "itens": [
            {
              "t": "Previsão do tempo",
              "q": "Leve e com cara de ilha",
              "perfis": [
                "medio",
                "alto"
              ],
              "m": "Previsão para Ilhabela e para a nossa conversa, {lead}:\n\nOntem: sol e muita conversa sobre {imovel}.\nHoje: tempo fechado, sem sinal de resposta.\nAmanhã: depende de você.\n\nBrincadeira à parte: ainda faz sentido eu seguir separando coisas no {bairro}, ou prefere que eu pare por aqui?",
              "p": "O formato é reconhecível em um segundo e faz da cobrança uma piada leve, com o cenário da ilha."
            },
            {
              "t": "Enquete de um clique",
              "q": "Usar a função Enquete do WhatsApp",
              "m": "{lead}, pra eu não te encher de mensagem, responde só com um clique:\n\n( ) Ainda procuro, me manda opções\n( ) Procuro, mas mais pra frente\n( ) Já resolvi\n( ) Pode encerrar",
              "p": "Responder custa um toque. Qualquer opção marcada já te diz o que fazer com o card."
            },
            {
              "t": "Lista de tarefas",
              "q": "Para quem é organizado",
              "perfis": [
                "medio"
              ],
              "m": "Minha lista de hoje:\n\nFeito: separar as opções que {lead} pediu no {bairro}\nFeito: conferir documentação e custo do mês de cada uma\nFeito: mandar tudo por aqui\nPendente: receber uma resposta de {lead}\n\nMe ajuda a fechar a lista?",
              "p": "Mostra o trabalho feito sem reclamar dele, e deixa só um item na mão do lead."
            },
            {
              "t": "Cardápio do dia",
              "q": "Divertido e direto",
              "perfis": [
                "medio",
                "alto"
              ],
              "m": "Cardápio do dia, {lead}, em homenagem ao Festival do Camarão:\n\nEntrada: \"ainda tenho interesse\"\nPrato principal: \"me liga amanhã\"\nSobremesa: \"agora não, me procura em [mês]\"\n\nQualquer pedido serve. Até o \"pode encerrar\" está no menu.",
              "p": "Dá permissão explícita para o não, e é isso que faz a pessoa responder. O festival é da ilha, não invenção."
            },
            {
              "t": "Carta da casa",
              "q": "Quando ele gostou de uma casa específica",
              "m": "Oi, {lead}. Aqui quem escreve é {imovel}.\n\nAinda lembro da sua visita. [Detalhe real da visita: você ficou um tempo olhando o mar da varanda.]\n\n[Tem gente vindo me ver esta semana], mas eu queria saber de você primeiro: ainda faz sentido?\n\n(Mensagem enviada por {corretor}, que me ajuda com o celular.)",
              "p": "Puxa a lembrança da visita. A frase sobre outras visitas só entra se for verdade."
            },
            {
              "t": "Tábua da maré",
              "q": "Só em Ilhabela isso funciona",
              "perfis": [
                "medio",
                "alto"
              ],
              "m": "Tábua da maré da nossa conversa, {lead}:\n\nMaré alta em [mês], quando a gente falou de {imovel}.\nMaré baixa desde então.\n\nA próxima enchente depende de uma resposta sua: seguimos, ou paramos por aqui?",
              "p": "Imagem que só faz sentido aqui. Leve, curta e termina numa escolha de uma palavra."
            },
            {
              "t": "Próxima temporada",
              "q": "Para encerrar com humor",
              "m": "Fim da primeira temporada de \"{lead} procura casa em Ilhabela\".\n\nA segunda temporada ainda não tem data de estreia. E aqui na ilha, temporada é coisa séria.\n\nRenova ou cancela?",
              "p": "Encerramento leve, com a palavra que define a ilha. A pessoa responde para dizer qual final quer, e os dois servem."
            }
          ]
        }
      ],
      "alto": [
        {
          "nome": "Cadência de 10 toques",
          "desc": "Uma linha por toque, sem exclamação. Cada mensagem tem um motivo.",
          "regras": [
            "Comece no terceiro dia sem resposta. Se a pessoa voltar, pare e retome o atendimento normal.",
            "Mensagem com casa nova só se a casa for nova de verdade. Dado do bairro só com fonte.",
            "Nada de prazo inventado, concorrência inventada ou número sem fonte.",
            "No último toque, mova o card para Sem momento. O lead continua seu e segue recebendo o relacionamento mensal."
          ],
          "itens": [
            {
              "t": "Toque 1 · Ainda faz sentido?",
              "q": "Reabrir",
              "m": "{lead}, a busca pela casa na ilha segue ou ficou pra outro momento?",
              "p": "Curta e sem cobrança. Respeita o tempo dele."
            },
            {
              "t": "Toque 2 · Fora do site",
              "q": "Só se for verdade",
              "m": "Entrou uma casa fora do site com [o que ele valoriza]. Quer saber mais?",
              "p": "Exclusividade real é o motivo mais forte para responder. Nunca invente."
            },
            {
              "t": "Toque 3 · O que mudou",
              "q": "Abrir espaço",
              "m": "Mudou alguma coisa no que vocês procuram desde a nossa última conversa?",
              "p": "Planos mudam. A pergunta reconhece isso sem insistir."
            },
            {
              "t": "Toque 4 · Quem organiza a agenda",
              "q": "Lead muito ocupado",
              "m": "Se preferir, sigo a conversa com quem organiza a sua agenda.",
              "p": "Tira o peso de responder pessoalmente."
            },
            {
              "t": "Toque 5 · A prioridade continua?",
              "q": "Recalibrar",
              "m": "Privacidade, vista ou sair de casa direto na areia: a prioridade continua a mesma?",
              "p": "Mostra que você lembra do critério e convida a atualizar."
            },
            {
              "t": "Toque 6 · Ficha de duas casas",
              "q": "Material sob demanda",
              "m": "Tenho a ficha de duas casas com matrícula em dia que podem interessar. Mando só se fizer sentido.",
              "p": "Oferece sem empurrar, e já diz que a documentação está em ordem."
            },
            {
              "t": "Toque 7 · Uso ou patrimônio",
              "q": "Quando o momento mudou",
              "m": "Se agora a ideia for patrimônio e não uso, tenho outro tipo de opção. Vale conversar?",
              "p": "Abre uma segunda porta caso a primeira tenha fechado."
            },
            {
              "t": "Toque 8 · A ilha chama",
              "q": "Pela tag de interesse",
              "m": "{lead}, [a Semana de Vela / o Festival do Camarão / a temporada de baleias] começa dia [data]. Se vocês vierem, me chama que eu digo onde vale estar.",
              "p": "Sai da tag de interesse do CRM, não do mês. É a mensagem que abre conversa sem pedir nada."
            },
            {
              "t": "Toque 9 · O que pesa",
              "q": "Descobrir a trava",
              "m": "O que pesa mais hoje: a casa certa, o momento ou o valor?",
              "p": "Nomeia as três travas possíveis sem sugerir nenhuma."
            },
            {
              "t": "Toque 10 · Saída elegante",
              "q": "Encerrar",
              "m": "Vou parar de te escrever por aqui pra não ser invasivo. Quando quiser retomar, é só me chamar.",
              "p": "Sair bem mantém a porta aberta para uma compra que, neste perfil, costuma vir meses depois."
            }
          ]
        },
        {
          "nome": "Mensagens criativas",
          "desc": "Para quem já conversou com você, gostou de alguma coisa e sumiu. O objetivo é só a próxima resposta. Quando a pessoa voltar, pare a brincadeira e volte ao atendimento.",
          "regras": [
            "Use depois que as mensagens normais não funcionaram.",
            "Só com lead que já teve conversa real com você.",
            "No alto padrão e no off market, só se a pessoa já mostrou bom humor na conversa.",
            "Uma por semana, no máximo. Sem emoji."
          ],
          "itens": [
            {
              "t": "Previsão do tempo",
              "q": "Leve e com cara de ilha",
              "perfis": [
                "medio",
                "alto"
              ],
              "m": "Previsão para Ilhabela e para a nossa conversa, {lead}:\n\nOntem: sol e muita conversa sobre {imovel}.\nHoje: tempo fechado, sem sinal de resposta.\nAmanhã: depende de você.\n\nBrincadeira à parte: ainda faz sentido eu seguir separando coisas no {bairro}, ou prefere que eu pare por aqui?",
              "p": "O formato é reconhecível em um segundo e faz da cobrança uma piada leve, com o cenário da ilha."
            },
            {
              "t": "Enquete de um clique",
              "q": "Usar a função Enquete do WhatsApp",
              "m": "{lead}, pra eu não te encher de mensagem, responde só com um clique:\n\n( ) Ainda procuro, me manda opções\n( ) Procuro, mas mais pra frente\n( ) Já resolvi\n( ) Pode encerrar",
              "p": "Responder custa um toque. Qualquer opção marcada já te diz o que fazer com o card."
            },
            {
              "t": "Lista de tarefas",
              "q": "Para quem é organizado",
              "perfis": [
                "medio"
              ],
              "m": "Minha lista de hoje:\n\nFeito: separar as opções que {lead} pediu no {bairro}\nFeito: conferir documentação e custo do mês de cada uma\nFeito: mandar tudo por aqui\nPendente: receber uma resposta de {lead}\n\nMe ajuda a fechar a lista?",
              "p": "Mostra o trabalho feito sem reclamar dele, e deixa só um item na mão do lead."
            },
            {
              "t": "Cardápio do dia",
              "q": "Divertido e direto",
              "perfis": [
                "medio",
                "alto"
              ],
              "m": "Cardápio do dia, {lead}, em homenagem ao Festival do Camarão:\n\nEntrada: \"ainda tenho interesse\"\nPrato principal: \"me liga amanhã\"\nSobremesa: \"agora não, me procura em [mês]\"\n\nQualquer pedido serve. Até o \"pode encerrar\" está no menu.",
              "p": "Dá permissão explícita para o não, e é isso que faz a pessoa responder. O festival é da ilha, não invenção."
            },
            {
              "t": "Carta da casa",
              "q": "Quando ele gostou de uma casa específica",
              "m": "Oi, {lead}. Aqui quem escreve é {imovel}.\n\nAinda lembro da sua visita. [Detalhe real da visita: você ficou um tempo olhando o mar da varanda.]\n\n[Tem gente vindo me ver esta semana], mas eu queria saber de você primeiro: ainda faz sentido?\n\n(Mensagem enviada por {corretor}, que me ajuda com o celular.)",
              "p": "Puxa a lembrança da visita. A frase sobre outras visitas só entra se for verdade."
            },
            {
              "t": "Tábua da maré",
              "q": "Só em Ilhabela isso funciona",
              "perfis": [
                "medio",
                "alto"
              ],
              "m": "Tábua da maré da nossa conversa, {lead}:\n\nMaré alta em [mês], quando a gente falou de {imovel}.\nMaré baixa desde então.\n\nA próxima enchente depende de uma resposta sua: seguimos, ou paramos por aqui?",
              "p": "Imagem que só faz sentido aqui. Leve, curta e termina numa escolha de uma palavra."
            },
            {
              "t": "Próxima temporada",
              "q": "Para encerrar com humor",
              "m": "Fim da primeira temporada de \"{lead} procura casa em Ilhabela\".\n\nA segunda temporada ainda não tem data de estreia. E aqui na ilha, temporada é coisa séria.\n\nRenova ou cancela?",
              "p": "Encerramento leve, com a palavra que define a ilha. A pessoa responde para dizer qual final quer, e os dois servem."
            }
          ]
        }
      ],
      "off": [
        {
          "nome": "Cadência de 6 toques",
          "desc": "Espaçados, com motivo concreto. No off market quem chama demais perde o acesso ao proprietário.",
          "regras": [
            "Comece no terceiro dia sem resposta. Se a pessoa voltar, pare e retome o atendimento normal.",
            "Mensagem com casa nova só se a casa for nova de verdade. Dado do bairro só com fonte.",
            "Nada de prazo inventado, concorrência inventada ou número sem fonte.",
            "No último toque, mova o card para Sem momento. O lead continua seu e segue recebendo o relacionamento mensal."
          ],
          "itens": [
            {
              "t": "Toque 1 · O link venceu",
              "q": "Reabrir",
              "m": "{lead}, o link de {imovel} venceu sem você abrir. Gero outro, ou a busca ficou pra depois?",
              "p": "Usa o próprio link como motivo. Duas saídas, as duas aceitáveis."
            },
            {
              "t": "Toque 2 · Outra casa fora do site",
              "q": "Só se for verdade",
              "m": "Entrou outra casa fora do site, com [critério dele]. Posso te mandar um link novo, no seu nome?",
              "p": "O único motivo forte para chamar de novo no off market é uma casa nova de verdade."
            },
            {
              "t": "Toque 3 · Mudou algo?",
              "q": "Abrir espaço",
              "m": "Mudou alguma coisa no que vocês procuram? O off market anda devagar, e eu prefiro te chamar só quando for a casa certa.",
              "p": "Explica o silêncio e atualiza o critério. A pessoa entende que ficar na lista tem valor."
            },
            {
              "t": "Toque 4 · Por outro canal",
              "q": "Lead que não responde pessoalmente",
              "m": "Se preferir, falo com [seu advogado / quem organiza a sua agenda] e sigo por lá.",
              "p": "Comum neste perfil: a decisão passa por alguém. Facilite."
            },
            {
              "t": "Toque 5 · Rever a casa",
              "q": "Quando houve visita",
              "m": "Estou organizando as visitas de [mês] com o proprietário de {imovel}. Se quiser rever a casa, me diz um dia.",
              "p": "Convite concreto, com a logística do proprietário como razão."
            },
            {
              "t": "Toque 6 · Sair da lista",
              "q": "Encerrar",
              "m": "Vou tirar você da lista de avisos do off market pra não incomodar. Quando quiser voltar, é só me chamar.",
              "p": "Perder o acesso a algo raro costuma trazer resposta. Se não trouxer, o card vai para Sem momento."
            }
          ]
        },
        {
          "nome": "Mensagens criativas",
          "desc": "Para quem já conversou com você, gostou de alguma coisa e sumiu. O objetivo é só a próxima resposta. Quando a pessoa voltar, pare a brincadeira e volte ao atendimento.",
          "regras": [
            "Use depois que as mensagens normais não funcionaram.",
            "Só com lead que já teve conversa real com você.",
            "No alto padrão e no off market, só se a pessoa já mostrou bom humor na conversa.",
            "Uma por semana, no máximo. Sem emoji."
          ],
          "itens": [
            {
              "t": "Previsão do tempo",
              "q": "Leve e com cara de ilha",
              "perfis": [
                "medio",
                "alto"
              ],
              "m": "Previsão para Ilhabela e para a nossa conversa, {lead}:\n\nOntem: sol e muita conversa sobre {imovel}.\nHoje: tempo fechado, sem sinal de resposta.\nAmanhã: depende de você.\n\nBrincadeira à parte: ainda faz sentido eu seguir separando coisas no {bairro}, ou prefere que eu pare por aqui?",
              "p": "O formato é reconhecível em um segundo e faz da cobrança uma piada leve, com o cenário da ilha."
            },
            {
              "t": "Enquete de um clique",
              "q": "Usar a função Enquete do WhatsApp",
              "m": "{lead}, pra eu não te encher de mensagem, responde só com um clique:\n\n( ) Ainda procuro, me manda opções\n( ) Procuro, mas mais pra frente\n( ) Já resolvi\n( ) Pode encerrar",
              "p": "Responder custa um toque. Qualquer opção marcada já te diz o que fazer com o card."
            },
            {
              "t": "Lista de tarefas",
              "q": "Para quem é organizado",
              "perfis": [
                "medio"
              ],
              "m": "Minha lista de hoje:\n\nFeito: separar as opções que {lead} pediu no {bairro}\nFeito: conferir documentação e custo do mês de cada uma\nFeito: mandar tudo por aqui\nPendente: receber uma resposta de {lead}\n\nMe ajuda a fechar a lista?",
              "p": "Mostra o trabalho feito sem reclamar dele, e deixa só um item na mão do lead."
            },
            {
              "t": "Cardápio do dia",
              "q": "Divertido e direto",
              "perfis": [
                "medio",
                "alto"
              ],
              "m": "Cardápio do dia, {lead}, em homenagem ao Festival do Camarão:\n\nEntrada: \"ainda tenho interesse\"\nPrato principal: \"me liga amanhã\"\nSobremesa: \"agora não, me procura em [mês]\"\n\nQualquer pedido serve. Até o \"pode encerrar\" está no menu.",
              "p": "Dá permissão explícita para o não, e é isso que faz a pessoa responder. O festival é da ilha, não invenção."
            },
            {
              "t": "Carta da casa",
              "q": "Quando ele gostou de uma casa específica",
              "m": "Oi, {lead}. Aqui quem escreve é {imovel}.\n\nAinda lembro da sua visita. [Detalhe real da visita: você ficou um tempo olhando o mar da varanda.]\n\n[Tem gente vindo me ver esta semana], mas eu queria saber de você primeiro: ainda faz sentido?\n\n(Mensagem enviada por {corretor}, que me ajuda com o celular.)",
              "p": "Puxa a lembrança da visita. A frase sobre outras visitas só entra se for verdade."
            },
            {
              "t": "Tábua da maré",
              "q": "Só em Ilhabela isso funciona",
              "perfis": [
                "medio",
                "alto"
              ],
              "m": "Tábua da maré da nossa conversa, {lead}:\n\nMaré alta em [mês], quando a gente falou de {imovel}.\nMaré baixa desde então.\n\nA próxima enchente depende de uma resposta sua: seguimos, ou paramos por aqui?",
              "p": "Imagem que só faz sentido aqui. Leve, curta e termina numa escolha de uma palavra."
            },
            {
              "t": "Próxima temporada",
              "q": "Para encerrar com humor",
              "m": "Fim da primeira temporada de \"{lead} procura casa em Ilhabela\".\n\nA segunda temporada ainda não tem data de estreia. E aqui na ilha, temporada é coisa séria.\n\nRenova ou cancela?",
              "p": "Encerramento leve, com a palavra que define a ilha. A pessoa responde para dizer qual final quer, e os dois servem."
            }
          ]
        }
      ]
    }
  },
  {
    "id": "audio",
    "nome": "Áudios",
    "titulo": "Roteiros de áudio para WhatsApp",
    "desc": "Áudio serve para dar tom e confiança. O que é número, endereço ou documento vai por escrito. Regra do Marco: quem escreve recebe texto, quem manda áudio recebe áudio.",
    "guia": [
      {
        "b": "Quem manda áudio recebe áudio",
        "s": "Regra da casa. Quem escreve recebe texto. Você responde no formato em que a pessoa falou com você."
      },
      {
        "b": "Entre 20 e 40 segundos",
        "s": "Passou de um minuto, grave de novo. Ninguém ouve palestra de quem ainda não conhece."
      },
      {
        "b": "Texto antes do áudio",
        "s": "Uma linha dizendo do que se trata. Áudio sem aviso fica sem play."
      },
      {
        "b": "Nome da pessoa nos primeiros segundos",
        "s": "É o que faz ela perceber que o áudio foi gravado para ela, não para a lista."
      },
      {
        "b": "Uma pergunta, no final",
        "s": "Termine com algo que se responde com uma palavra. Nunca com \"qualquer dúvida, estou à disposição\"."
      },
      {
        "b": "Fale, não leia",
        "s": "Lido palavra por palavra, soa como central de atendimento. Use o roteiro como mapa."
      },
      {
        "b": "Longe do vento",
        "s": "Vento da praia, barco e carro andando tiram a atenção do que você diz. Dentro do carro parado funciona bem."
      },
      {
        "b": "Quando não usar",
        "s": "No primeiro contato de quem ainda não respondeu nada por texto, no alto padrão e no off market. Ali, áudio soa invasivo."
      }
    ],
    "etapas": {
      "medio": [
        {
          "nome": "Roteiros médio padrão",
          "desc": "Tom de quem mora na ilha e explica como funciona. Lógica, comparação e a ilha real.",
          "regras": [
            "Mande a linha de texto, depois o áudio.",
            "Use o roteiro como mapa. Fale com as suas palavras.",
            "Valor, endereço, documento e lista de imóveis vão por escrito, logo depois."
          ],
          "itens": [
            {
              "t": "Primeiro áudio",
              "q": "Ele mandou áudio, ou não respondeu dois textos",
              "a": true,
              "m": "Texto antes: Te mandei um áudio curto sobre {imovel}.\n\nÁudio: Oi, {lead}, aqui é {corretor}, da OPA Ilhabela. Vi seu interesse em {imovel}. Antes de te mandar mais fotos, queria entender uma coisa: a ideia é morar aqui ou vir nas temporadas com a família? Com isso eu te mando só o que faz sentido, em vez de encher você de opção.",
              "p": "A pergunta do diagnóstico em voz. Mostra método e uma pessoa real do outro lado."
            },
            {
              "t": "Posse e matrícula",
              "q": "Antes de falar de forma de pagamento",
              "a": true,
              "m": "Texto antes: Um áudio de 40 segundos sobre a documentação, que é o que mais pega aqui.\n\nÁudio: {lead}, deixa eu te explicar uma coisa da ilha que pouca gente conta no começo. Boa parte dos imóveis aqui é posse, sem matrícula. Isso não quer dizer problema, mas quer dizer que o banco não financia. Com matrícula, financia. {imovel} está com [situação]. A June, que cuida do jurídico aqui na OPA, confere tudo antes de qualquer proposta. Faz sentido eu te mandar por escrito o que isso muda no pagamento?",
              "p": "Explica em voz o que em texto parece ameaça. Cita quem confere, e termina em pergunta."
            },
            {
              "t": "Balsa e acesso",
              "q": "Quando ele perguntar da logística",
              "a": true,
              "m": "Texto antes: Um áudio sobre como é chegar aqui de verdade.\n\nÁudio: {lead}, sobre a balsa: fora da temporada você atravessa em uns quinze minutos de travessia e quase sem fila. Em janeiro e feriado é outra história, e quem mora aqui aprende os horários. O que muda mesmo é de que lado da ilha fica a casa. {imovel} fica a [tempo] da balsa, pela avenida, sem estrada de terra. Quer que eu te mande os horários que costumam andar melhor?",
              "p": "A ilha real, dita por quem vive nela. Dado de tempo e um cuidado prático no fim."
            },
            {
              "t": "Depois da visita",
              "q": "No mesmo dia",
              "a": true,
              "m": "Texto antes: Um áudio sobre a visita de hoje.\n\nÁudio: {lead}, obrigado pela visita. Fiquei com a impressão de que a varanda agradou e [ponto fraco] ficou devendo. Se eu estiver certo, consigo olhar [solução possível]. Se for outra coisa, me fala que eu ajusto a busca.",
              "p": "Leitura própria da visita, aberta à correção. Mais fácil corrigir do que formular do zero."
            },
            {
              "t": "Custo do mês",
              "q": "Quando o valor entrar na conversa",
              "a": true,
              "m": "Texto antes: Explico a conta em áudio. Os números vão por escrito logo depois.\n\nÁudio: {lead}, sobre o custo de ter {imovel}: além do valor, entra condomínio, IPTU e manutenção, que aqui pesa por causa da maresia. Somando, fica perto de [valor]. Te mando a conta aberta por escrito agora. Com isso na mão, faz sentido pro que vocês tinham pensado?",
              "p": "A voz explica, o texto registra. Maresia é detalhe de quem conhece casa na ilha."
            },
            {
              "t": "Resposta técnica",
              "q": "Dúvida da visita resolvida",
              "a": true,
              "m": "Texto antes: Tenho a resposta sobre [dúvida].\n\nÁudio: {lead}, conferi [dúvida] com o proprietário e com a June. A resposta é [resposta]. O documento vai por escrito. Com isso resolvido, falta mais algum ponto antes de a gente pensar em proposta?",
              "p": "Resolve e testa o próximo passo na mesma mensagem."
            },
            {
              "t": "Resgate",
              "q": "Vários textos sem resposta",
              "a": true,
              "m": "Texto antes: Um recado rápido.\n\nÁudio: {lead}, {corretor} aqui. Sei que casa na ilha é decisão que leva tempo. Só queria entender se o projeto segue neste ano ou ficou pra mais adiante, pra eu não te mandar coisa fora de hora. Qualquer resposta está ótima.",
              "p": "Respeita o ritmo e pede só uma informação. A última frase tira o peso de responder."
            },
            {
              "t": "Convite para duas visitas",
              "q": "Quando há duas finalistas",
              "a": true,
              "m": "Texto antes: Uma ideia pro sábado.\n\nÁudio: {lead}, no sábado consigo te mostrar as duas casas que ficaram na sua lista, uma às dez e outra às onze e meia. Assim vocês comparam com tudo fresco na cabeça e ainda almoçam na ilha. Fica bom?",
              "p": "Convite com lógica de comparação e um pedaço da ilha no fim."
            }
          ]
        }
      ],
      "alto": [
        {
          "nome": "Roteiros alto padrão",
          "desc": "Voz calma, frases curtas, nada de empolgação. Use só depois que a pessoa já respondeu por texto ou mandou áudio.",
          "regras": [
            "Mande a linha de texto, depois o áudio.",
            "Use o roteiro como mapa. Fale com as suas palavras.",
            "Valor, endereço, documento e lista de imóveis vão por escrito, logo depois."
          ],
          "itens": [
            {
              "t": "Primeiro áudio",
              "q": "Só se ele já respondeu ou mandou áudio",
              "a": true,
              "m": "Texto antes: Um áudio de 20 segundos sobre {imovel}.\n\nÁudio: {lead}, {corretor} aqui, da OPA. Pra não te mandar um catálogo, queria entender uma coisa só: a casa seria pra morar ou pra temporadas com a família? Com isso eu já sei o que vale a pena te mostrar.",
              "p": "Curto, uma pergunta, e a promessa de filtrar."
            },
            {
              "t": "O detalhe da casa",
              "q": "Ao apresentar uma opção",
              "a": true,
              "m": "Texto antes: Um detalhe que não aparece nas fotos.\n\nÁudio: {lead}, uma coisa sobre {imovel} que foto não mostra: [detalhe real: no fim da tarde o deck fica na sombra e a vista fica livre até o continente]. Se quiser ver isso ao vivo, o melhor horário é [horário].",
              "p": "Fala como quem esteve lá. É o argumento que portal não tem."
            },
            {
              "t": "Discrição",
              "q": "Lead preocupado com exposição",
              "a": true,
              "m": "Texto antes: Um ponto importante sobre a negociação.\n\nÁudio: {lead}, só pra te deixar tranquilo: essa conversa e qualquer proposta ficam entre você, eu e o proprietário. Nada é divulgado, nem a visita. Se preferir que eu trate com seu advogado ou assessor, é só me dizer.",
              "p": "Discrição é critério de escolha neste perfil, mesmo quando ele não fala."
            },
            {
              "t": "Depois da visita",
              "q": "No mesmo dia",
              "a": true,
              "m": "Texto antes: Um áudio curto sobre hoje.\n\nÁudio: {lead}, obrigado por virem. Qualquer ponto técnico que tenha ficado, eu levanto direto com o proprietário. E se quiserem voltar com o arquiteto de vocês, eu organizo.",
              "p": "Sem pedir opinião, sem pressa."
            },
            {
              "t": "Leitura da negociação",
              "q": "Depois da contraproposta",
              "a": true,
              "m": "Texto antes: Te explico a resposta do proprietário.\n\nÁudio: {lead}, o proprietário respondeu [resposta]. Minha leitura é que existe espaço em [ponto] e menos em [outro ponto]. Se você concordar, sigo por esse caminho.",
              "p": "Dá a leitura de quem negocia e deixa a decisão com ele."
            },
            {
              "t": "Custo de manter",
              "q": "Quando ele perguntar sobre manutenção",
              "a": true,
              "m": "Texto antes: Um áudio sobre o custo de manter a casa.\n\nÁudio: {lead}, segundo o proprietário, {imovel} custa por mês cerca de [valor], somando caseiro, jardim, piscina e IPTU. Aqui a maresia pede manutenção constante, e isso já está nessa conta. Te mando a abertura por escrito. Quer que eu compare com a outra opção?",
              "p": "Número com fonte (o proprietário) e sem adjetivo. A maresia é detalhe de quem conhece."
            },
            {
              "t": "Resgate",
              "q": "Depois de semanas sem resposta",
              "a": true,
              "m": "Texto antes: Só um recado.\n\nÁudio: {lead}, {corretor} aqui. Não quero ser insistente. Se a busca ainda fizer sentido, sigo atento ao que entrar com o seu perfil. Se não, sem problema nenhum.",
              "p": "Mostra disponibilidade sem cobrança."
            },
            {
              "t": "Visita privativa",
              "q": "Convite",
              "a": true,
              "m": "Texto antes: Um convite para ver a casa.\n\nÁudio: {lead}, consigo reservar {imovel} só pra vocês no sábado de manhã ou no fim da tarde, quando a luz da casa muda. Se vierem de carro, encontro vocês na saída da balsa. Qual horário funciona melhor?",
              "p": "Dois horários com motivo, ninguém mais na casa e a chegada resolvida."
            }
          ]
        }
      ],
      "off": [
        {
          "nome": "Roteiros off market",
          "desc": "Voz baixa, explicando o combinado. O áudio aqui serve para dizer o que não deve ficar escrito: valor e regras do proprietário.",
          "regras": [
            "Mande a linha de texto, depois o áudio.",
            "Use o roteiro como mapa. Fale com as suas palavras.",
            "Valor, endereço, documento e lista de imóveis vão por escrito, logo depois."
          ],
          "itens": [
            {
              "t": "Como funciona",
              "q": "Lead que perguntou do off market",
              "a": true,
              "m": "Texto antes: Te explico em 30 segundos como funciona o off market da OPA.\n\nÁudio: {lead}, {corretor} aqui. O off market são casas que o proprietário não quer ver anunciadas. A gente mostra só pra quem já conversou com a OPA e tem o perfil, por um link com o seu nome e com prazo, que abre num aparelho só. É assim que a gente protege quem vende e quem compra. Posso te ligar pra entender o que vocês procuram?",
              "p": "Explica o sigilo como cuidado e termina pedindo a conversa que abre o acesso."
            },
            {
              "t": "Valor por voz",
              "q": "Quando ele perguntar o preço",
              "a": true,
              "m": "Texto antes: Prefiro te falar o valor por áudio, como faço com todos os off market.\n\nÁudio: {lead}, o valor pedido de {imovel} é [valor], e isso inclui [o que está incluso]. Prefiro falar por voz porque o proprietário não quer esse número circulando em print. Se fizer sentido pra vocês, eu já organizo a visita. Faz sentido?",
              "p": "O valor não vira print, e a pergunta final move a conversa para a visita."
            },
            {
              "t": "Antes da visita",
              "q": "Ao confirmar a visita",
              "a": true,
              "m": "Texto antes: Um combinado rápido antes de amanhã.\n\nÁudio: {lead}, antes da visita de amanhã, dois combinados do proprietário: eu acompanho vocês o tempo inteiro, e ele pede que não se fotografe a casa. O que vocês quiserem rever depois, eu mando pelo link reservado. Encontro vocês em [ponto de referência] às [hora]. Tudo certo?",
              "p": "Regras ditas com motivo, em voz, soam como cuidado e não como proibição."
            },
            {
              "t": "Depois da visita",
              "q": "No mesmo dia",
              "a": true,
              "m": "Texto antes: Um áudio curto sobre hoje.\n\nÁudio: {lead}, obrigado pela visita. Me diz com sinceridade: o que vocês sentiram ali bate com o que estavam procurando? Se não for essa, tudo bem, o off market anda devagar e eu te chamo quando entrar outra com [critério].",
              "p": "Pergunta direta e já explica o ritmo, para a pessoa não sumir achando que acabou."
            },
            {
              "t": "Leitura da negociação",
              "q": "Depois da contraproposta",
              "a": true,
              "m": "Texto antes: Te explico a resposta do proprietário.\n\nÁudio: {lead}, o proprietário respondeu [resposta]. Pra você decidir com calma: [quantas pessoas, de verdade, estão olhando a casa agora]. Minha leitura é que existe espaço em [ponto]. Sigo por aí?",
              "p": "Transparência sobre a concorrência real. No off market a confiança é o produto."
            },
            {
              "t": "Link para outra pessoa",
              "q": "Quando ele quer mostrar para alguém",
              "a": true,
              "m": "Texto antes: Sobre mostrar a casa pra [pessoa].\n\nÁudio: {lead}, pra [sua esposa / seu sócio] ver {imovel}, eu crio um link no nome dela, igual ao seu, em vez de você encaminhar o seu. É rápido, só preciso do nome e do WhatsApp. Pode ser?",
              "p": "Oferece o caminho certo antes que o link seja repassado."
            },
            {
              "t": "Resgate",
              "q": "Semanas sem resposta",
              "a": true,
              "m": "Texto antes: Só um recado.\n\nÁudio: {lead}, {corretor} aqui. O link de {imovel} venceu e eu não quis ficar renovando sem saber se ainda faz sentido. Se a busca segue, eu gero outro. Se ficou pra depois, sem problema, só me avisa.",
              "p": "Usa o link como motivo e dá saída fácil."
            },
            {
              "t": "Por que não está no site",
              "q": "Lead desconfiado do sigilo",
              "a": true,
              "m": "Texto antes: Te explico por que essa casa não está no site.\n\nÁudio: {lead}, {imovel} não está no site porque o proprietário pediu. Às vezes é vizinho, às vezes é família, às vezes ele só não quer gente curiosa visitando. A documentação é a mesma de qualquer casa da OPA, conferida pela June, e você vai ver tudo no link reservado. Alguma coisa que eu possa te mandar por escrito pra ficar mais tranquilo?",
              "p": "Responde à desconfiança com motivos comuns e verificáveis, e oferece documento."
            }
          ]
        }
      ]
    }
  },
  {
    "id": "objecoes",
    "nome": "Objeções",
    "busca": true,
    "titulo": "Respostas para o que o cliente diz",
    "desc": "Acolha primeiro, depois pergunte. A primeira objeção quase nunca é o motivo real. Na ilha, metade das objeções é sobre a ilha, não sobre a casa: balsa, chuva, documentação. Responda com a ilha real, nunca com a foto do verão. Use a busca para achar uma objeção pelo que a pessoa disse.",
    "etapas": [
      {
        "nome": "Preço e valor",
        "desc": "Quando o número assusta. Quase sempre falta comparar com a coisa certa ou falta ver o que está incluso.",
        "regras": [
          "Pergunte \"caro comparado a quê?\" antes de defender o preço.",
          "Isole: \"além do valor, tem mais alguma coisa?\"",
          "Desconto só com contrapartida. Nunca prometa valor em nome do proprietário."
        ],
        "itens": [
          {
            "t": "Caro",
            "o": "Está acima do que eu queria pagar.",
            "m": "Faz sentido, {lead}. Acima comparando com o quê? Se for com outra casa que você viu, me manda o link que eu te mostro o que muda de uma pra outra: documentação, acesso, o que fica no imóvel.",
            "p": "Caro é sempre em relação a alguma coisa. Na ilha, a diferença costuma estar na documentação e no acesso, não na metragem."
          },
          {
            "t": "Teto",
            "o": "Meu limite é [valor] e esse passa.",
            "m": "Obrigado por me dizer, isso ajuda muito. Posso fazer duas coisas: procurar até [valor], ou te mostrar o que {imovel} tem que as opções nessa faixa não têm. Qual prefere?",
            "p": "Respeita o limite que ele mesmo trouxe e oferece uma escolha, sem empurrar."
          },
          {
            "t": "Desconto",
            "o": "Se baixar o preço eu fecho.",
            "m": "Posso levar isso ao proprietário. Pra proposta ter força, me diz o valor e a forma de pagamento. À vista ou com prazo curto costuma abrir mais espaço do que só pedir desconto.",
            "p": "Faz do pedido solto uma proposta concreta, com troca."
          },
          {
            "t": "Valor do metro",
            "o": "O metro quadrado aqui está mais caro que em [cidade].",
            "m": "Está mesmo. A maior parte da ilha é parque estadual e não pode ser construída, então o que existe é pouco. Quer que eu monte o comparativo com o que cada lugar entrega, pra decisão ficar justa?",
            "p": "Concorda com o fato e explica a causa real, que é geográfica, não de marketing."
          },
          {
            "t": "Manutenção",
            "o": "Casa de praia custa caro pra manter.",
            "m": "Custa sim, e aqui a maresia acelera. O proprietário informa um custo mensal de [valor], com caseiro, jardim e piscina. Te mando aberto e, se quiser, indico quem cuida disso.",
            "p": "Responde com número com fonte e com solução, sem fingir que o custo não existe."
          },
          {
            "t": "IPTU",
            "o": "O IPTU é alto.",
            "m": "É um custo que pesa todo ano. O valor é [valor da guia]. Se quiser, comparo com o IPTU das outras opções que você está olhando, pra decisão ficar justa.",
            "p": "Número com fonte e comparação honesta."
          },
          {
            "t": "Não vale",
            "o": "Não vale tudo isso.",
            "m": "Entendo. Me ajuda a entender: o que, pra você, faria essa casa valer o preço? Às vezes existe outra que entrega exatamente isso por menos.",
            "p": "Descobre o critério de valor dele em vez de discutir."
          },
          {
            "t": "Outra mais barata",
            "o": "Vi uma parecida mais barata.",
            "m": "Pode ser uma boa opção. Vale comparar matrícula, IPTU, o que fica na casa e de que lado da ilha ela está. Se quiser, levanto isso das duas e você decide com tudo lado a lado.",
            "p": "Você vira quem ajuda a comparar, não quem defende a própria casa. Na ilha, parecida no anúncio raramente é parecida no cartório."
          },
          {
            "t": "Custos extras",
            "o": "Não sabia que tinha ITBI e cartório.",
            "m": "Tem razão em estranhar, pouca gente explica isso no começo. Te mando agora a conta completa: ITBI, registro e [outros custos]. Assim você vê o valor total de uma vez.",
            "p": "Assume a falha de comunicação e resolve com transparência."
          },
          {
            "t": "Pede muito pra posse",
            "o": "Se é posse, por que custa isso?",
            "m": "Boa pergunta. Posse aqui é comum e o preço reflete o terreno, a localização e a casa, não só o papel. O que muda é a forma de pagar: sem financiamento. Te explico o que isso significa na prática?",
            "p": "Responde sem desqualificar o imóvel nem esconder a limitação."
          }
        ]
      },
      {
        "nome": "Tempo e momento",
        "desc": "\"Agora não\" quase sempre quer dizer \"ainda não vi motivo suficiente\". Na ilha, ciclo de compra de um ano é normal.",
        "regras": [
          "Não confronte a demora. Concorde e descubra o motivo.",
          "Peça uma data concreta para retomar.",
          "Nunca invente prazo, urgência ou outro interessado."
        ],
        "itens": [
          {
            "t": "Vou pensar",
            "o": "Vou pensar.",
            "m": "Claro, é uma decisão grande. Pra eu não te mandar mensagem à toa: o que ainda falta você ver ou saber pra decidir?",
            "p": "Troca o \"vou pensar\" por uma lista que você pode resolver."
          },
          {
            "t": "Não é o momento",
            "o": "Agora não é o momento.",
            "m": "Entendo. O que precisa acontecer pra virar o momento? Se for algo que eu consiga adiantar, como documentação ou uma visita fora da temporada, vou fazendo.",
            "p": "Descobre a condição e se oferece para trabalhar nela."
          },
          {
            "t": "Ano que vem",
            "o": "Vou deixar pro ano que vem.",
            "m": "Sem problema. Quer que eu te procure em [mês]? Até lá, se entrar algo muito alinhado com o que você pediu, te aviso. Pode ser?",
            "p": "Data combinada e permissão para avisar. O card vai para Sem momento, com você."
          },
          {
            "t": "Sem pressa",
            "o": "Não estou com pressa.",
            "m": "Ótimo, comprar sem pressa é o melhor cenário pra escolher bem, ainda mais aqui, onde vale conhecer a ilha nas duas estações. Vou te mandar só o que tiver muito a ver com vocês, sem volume. Combinado?",
            "p": "Concorda de verdade e ajusta o ritmo ao dele."
          },
          {
            "t": "Depois eu vejo",
            "o": "Depois eu vejo com calma.",
            "m": "Combinado. Pra eu organizar: quando você diz depois, é mais pra semana que vem ou pro mês que vem?",
            "p": "Pergunta de data com duas opções."
          },
          {
            "t": "Esperar o mercado",
            "o": "Vou esperar o mercado melhorar.",
            "m": "Entendo. Não tenho como dizer pra onde o preço vai, e desconfio de quem diz. O que posso fazer é te avisar se essa casa mudar de valor ou sair. Quer?",
            "p": "Honestidade sobre o que ninguém sabe. É a regra da casa: sem previsão de valorização."
          },
          {
            "t": "Juros vão cair",
            "o": "Vou esperar os juros caírem.",
            "m": "É uma possibilidade. Aqui vale lembrar que só imóvel com matrícula financia. Se for esse o caminho, dá pra comprar agora e trocar o financiamento de banco se a taxa cair. Quer que eu te mostre como funciona?",
            "p": "Mostra um caminho real e já conecta com a realidade da documentação na ilha."
          },
          {
            "t": "Mudança de vida",
            "o": "Minha vida pode mudar em breve.",
            "m": "Faz sentido pensar nisso. O que pode mudar: trabalho, cidade, família? Dependendo, a gente olha uma casa que também funcione pra locação de temporada, se o plano mudar.",
            "p": "Considera o risco e adapta a busca a ele."
          },
          {
            "t": "Estou só olhando",
            "o": "Estou só pesquisando por enquanto.",
            "m": "Tranquilo, quase todo mundo começa assim, e eu também não gosto de ser empurrado. Faço o seguinte: te mando uma casa por semana, sem cobrança. Quando quiser conversar, a gente conversa.",
            "p": "Ajuda a pesquisa dele sem tentar acelerar a compra."
          },
          {
            "t": "Depois da temporada",
            "o": "Vou ver depois que passar a temporada.",
            "m": "Faz sentido, janeiro aqui é confuso pra visitar. Se vocês vierem na temporada, aproveita pra conhecer os bairros com calma, e em março a gente visita as casas com a ilha vazia. Quer que eu já separe o que ver em março?",
            "p": "Usa o calendário da ilha a favor e marca o próximo passo sem pressão."
          }
        ]
      },
      {
        "nome": "A ilha: balsa, chuva e temporada",
        "desc": "A objeção mais comum de quem vem de fora. Reconheça o ponto real, sem defender a ilha, e mostre o que muda o jogo. Quem chega sabendo fica.",
        "regras": [
          "Reconheça a parte verdadeira antes de responder.",
          "Resposta com fato que você vive: lado da ilha, época, tipo de acesso.",
          "Nunca prometa que o problema não existe."
        ],
        "itens": [
          {
            "t": "Balsa",
            "o": "A balsa me desanima.",
            "m": "Você tem razão em parte: em feriado e janeiro a fila existe. Fora disso, a travessia é curta e quem mora aqui aprende os horários. O que muda mesmo é de que lado da ilha fica a casa. {imovel} fica a [tempo] da balsa, pela avenida. Quer que eu te mande os horários que costumam andar melhor?",
            "p": "Reconhece a fila, dá o fato que ele não sabe e termina em algo útil."
          },
          {
            "t": "Chove muito",
            "o": "Ouvi dizer que chove demais.",
            "m": "Chove, principalmente no verão e à tarde. É o que mantém a mata e as cachoeiras. O que faz diferença é a casa: ventilação, telhado, posição em relação ao morro. Em {imovel}, [como a casa lida com chuva e umidade]. Quer ver num dia de chuva? É quando a casa mostra se funciona.",
            "p": "Troca o argumento pela prova: visitar na chuva é o teste que ninguém oferece."
          },
          {
            "t": "Temporada cheia",
            "o": "Em janeiro a ilha vira um caos.",
            "m": "Vira mesmo, em alguns bairros mais que em outros. Por isso a pergunta sobre o lado da ilha importa tanto. {bairro} em janeiro fica [como fica]. E boa parte de quem compra aqui usa a casa justamente fora da temporada, quando a ilha é outra.",
            "p": "Concorda, diferencia por bairro e mostra o uso real do comprador de segunda residência."
          },
          {
            "t": "Inverno vazio",
            "o": "E no inverno, não fica tudo fechado?",
            "m": "Fica mais quieto, e muita gente compra justamente por isso. Restaurante e serviço funcionam o ano inteiro, com menos opção. Se a ideia é sossego, o inverno é o melhor argumento da ilha. Se a ideia é agito o ano todo, vale a gente conversar sobre isso antes da visita.",
            "p": "Honestidade que filtra: a ilha não serve pra todo mundo, e dizer isso gera confiança."
          },
          {
            "t": "Longe de São Paulo",
            "o": "É longe de São Paulo.",
            "m": "É. De carro, [tempo] até a balsa no horário bom, mais a travessia. Quem faz esse caminho toda semana cansa; quem vem por [dias seguidos] compensa. Como vocês pensam em usar a casa?",
            "p": "Dá o tempo real e devolve a pergunta ao uso, que é o que decide."
          },
          {
            "t": "Borrachudo",
            "o": "Me falaram do borrachudo.",
            "m": "Existe, principalmente perto de mata e água corrente, em certas épocas. Depende muito do lugar da casa e da hora do dia. Em {imovel}, [como é]. Quem mora aqui lida com repelente e tela, e isso entra na conversa antes da visita, não depois.",
            "p": "Não esconde um incômodo conhecido da ilha. Dizer antes da visita é o que diferencia a OPA."
          },
          {
            "t": "Saúde e escola",
            "o": "E se precisar de hospital? E escola pros filhos?",
            "m": "Boa pergunta pra fazer antes, não depois. A ilha tem [serviço de saúde e escolas que você conhece], e o continente fica a uma travessia. Pra moradia de família com criança, eu prefiro te mostrar isso ao vivo: a gente passa na frente da escola e do hospital no caminho da visita.",
            "p": "Responde com o que você sabe e oferece a prova no caminho. Nunca invente nome de serviço."
          },
          {
            "t": "Acesso de terra",
            "o": "A rua é de terra.",
            "m": "É, e isso não vai mudar tão cedo em várias partes da ilha. O que importa é como a rua fica na chuva e que carro vocês têm. Em {imovel}, [como é o trecho]. Quer visitar depois de uma chuva? É o teste honesto.",
            "p": "Fato, consequência prática e um teste real."
          },
          {
            "t": "Água e energia",
            "o": "E falta de água, de luz, de internet?",
            "m": "Acontece, mais na temporada. As casas que funcionam bem aqui têm [caixa d'água maior, gerador, internet por fibra ou rádio]. {imovel} tem [o que tem]. É um item que eu confiro em toda casa que apresento.",
            "p": "Mostra que a OPA já olha isso por ele."
          },
          {
            "t": "Não é o Caribe",
            "o": "Pelo preço eu compro no exterior.",
            "m": "Pode comprar, e o dinheiro é seu. O que a ilha tem é outra coisa: a família chega de carro, vem no fim de semana, cria raiz. Casa no exterior se visita; casa aqui se vive. Qual das duas vocês estão procurando?",
            "p": "Não compete em preço. Devolve a decisão ao uso e ao pertencimento."
          }
        ]
      },
      {
        "nome": "Documentação e segurança",
        "desc": "Posse, matrícula, financiamento e preservação. Na ilha isso decide forma de pagamento, prazo e sono tranquilo. A June confere; você explica.",
        "regras": [
          "Explique posse e matrícula na primeira conversa sobre valor, não depois da proposta.",
          "Toda dúvida jurídica volta com documento, conferido pela June.",
          "Nunca prometa regularização, prazo de cartório ou aprovação de banco."
        ],
        "itens": [
          {
            "t": "Só posse",
            "o": "Não tem escritura? Então não quero.",
            "m": "Entendo o receio, e ele é saudável. Posse aqui é comum e tem casa boa nessa condição, com contrato, histórico e cadeia de posse conferidos. O que muda é que o banco não financia e o preço costuma refletir isso. Se a regra de vocês é só matrícula, eu filtro só essas. Quer?",
            "p": "Respeita a regra dele e oferece o filtro. Não tenta convencer ninguém a comprar o que não quer."
          },
          {
            "t": "Financiamento",
            "o": "Dá pra financiar?",
            "m": "Depende da documentação. Com matrícula em dia, sim. Em posse, não. {imovel} está [situação]. Se o financiamento for essencial, eu já separo só imóveis que o banco aceita.",
            "p": "Resposta direta e um caminho. A pergunta mais comum do médio padrão respondida sem rodeio."
          },
          {
            "t": "Usucapião",
            "o": "Dá pra regularizar depois?",
            "m": "Em alguns casos dá, mas é caminho longo e sem prazo garantido. Prefiro não te vender essa expectativa. Se a regularização for condição pra vocês, a June olha o caso específico antes de qualquer proposta e te diz o que é realista.",
            "p": "Não promete o que não controla. Entrega a avaliação de quem sabe."
          },
          {
            "t": "Preservação",
            "o": "A casa está em área de preservação?",
            "m": "Boa parte da ilha tem alguma restrição ambiental, e isso precisa estar claro antes da proposta. Em {imovel}, [situação: o que pode e o que não pode fazer no terreno]. Te mando o documento que mostra isso.",
            "p": "Fato com documento. Restrição ambiental dita cedo evita arrependimento depois."
          },
          {
            "t": "Construir ou ampliar",
            "o": "Posso ampliar a casa?",
            "m": "Depende do terreno e da restrição ambiental dele. Em {imovel}, [o que o documento diz]. O Marco, que é arquiteto, consegue te dizer o que é viável antes de você decidir. Quer que eu marque uma conversa com ele?",
            "p": "Usa o diferencial real da OPA: arquiteto na casa."
          },
          {
            "t": "Inventário",
            "o": "A casa está em inventário.",
            "m": "Está, e isso define o prazo. Pelo que o proprietário informou, o inventário está [fase]. A June acompanha e te diz o que isso muda na escritura e no tempo. Quer esperar essa leitura antes de avançar?",
            "p": "Transparência sobre o prazo, que é o risco real do inventário."
          },
          {
            "t": "Medo de golpe",
            "o": "Como sei que não é golpe?",
            "m": "Faz todo sentido perguntar. Nenhum valor passa pela OPA: pagamento é direto ao proprietário, com contrato. Te mando a matrícula ou o contrato de posse pra você conferir em cartório e, se quiser, seu advogado fala direto com a June.",
            "p": "Explica o fluxo do dinheiro e dá como conferir sozinho."
          },
          {
            "t": "Contrato de gaveta",
            "o": "Isso é contrato de gaveta?",
            "m": "Não é, e eu te explico a diferença. Em {imovel} existe [contrato de compra e venda registrado / escritura / cadeia de posse documentada]. Te mando pra você ler com calma ou passar ao seu advogado.",
            "p": "Responde ao termo que assusta com o documento certo."
          },
          {
            "t": "Custos de cartório",
            "o": "Quanto vou gastar de cartório?",
            "m": "Pra essa casa, ITBI, escritura e registro ficam em torno de [valor estimado com fonte]. Te mando a conta aberta. Em posse o caminho é outro, e o custo também; te explico qual se aplica.",
            "p": "Número com fonte e a distinção que só quem trabalha na ilha faz."
          },
          {
            "t": "Quero meu advogado",
            "o": "Quero que meu advogado veja tudo antes.",
            "m": "Perfeito, é o certo. Te mando matrícula ou contrato, certidões e IPTU, e ele pode falar direto com a June, que cuida do jurídico aqui. A conversa deles costuma adiantar semanas.",
            "p": "Facilita a diligência em vez de temer."
          }
        ]
      },
      {
        "nome": "Confiança",
        "desc": "Na OPA, no corretor e no processo. Confiança não se pede: se mostra com documento, resposta rápida e o que a OPA recusa.",
        "regras": [
          "Nunca fale mal de outro corretor ou imobiliária da ilha.",
          "Prova concreta no lugar de discurso: documento, prazo cumprido, caso recusado.",
          "Caso de cliente só se for seu e autorizado."
        ],
        "itens": [
          {
            "t": "Não te conheço",
            "o": "Não te conheço, por que confiar?",
            "m": "Justo. Confiança se mostra, não se pede. Posso te mandar a documentação de {imovel} antes de qualquer conversa sobre valor e, se quiser, o contato de [cliente que autorizou] que comprou comigo.",
            "p": "Prova concreta no lugar de discurso."
          },
          {
            "t": "Só quer a comissão",
            "o": "Você só quer a comissão.",
            "m": "A comissão existe, e eu só recebo se o negócio for bom o suficiente pra você fechar e ficar. Por isso prefiro te mostrar menos casas e mais certas, e te dizer quando uma não serve.",
            "p": "Assume o interesse e mostra como ele se alinha ao do cliente."
          },
          {
            "t": "Todo corretor é do vendedor",
            "o": "Corretor está sempre do lado de quem vende.",
            "m": "Entendo por que parece. Aqui a gente trabalha diferente: tem casa que a OPA recusou vender por problema de documento, e isso eu te conto. Se quiser, te mostro o que eu confiro antes de uma casa entrar no site.",
            "p": "A recusa visível é a prova de curadoria. Só cite caso real."
          },
          {
            "t": "Imobiliária pequena",
            "o": "Nunca ouvi falar da OPA.",
            "m": "A OPA é de Ilhabela e trabalha só aqui, com casas de médio e alto padrão. O Marco está no mercado da ilha há mais de vinte anos, e a June cuida do jurídico. Se quiser, te passo o CRECI e clientes que autorizaram contato.",
            "p": "Fatos verificáveis, sem adjetivo. Só use o que está confirmado."
          },
          {
            "t": "Outro corretor",
            "o": "Já estou com outro corretor.",
            "m": "Sem problema nenhum. Se em algum momento quiser uma segunda opinião sobre uma casa que te mostrarem, principalmente sobre documentação, pode me mandar.",
            "p": "Sem disputa. A porta fica aberta pelo ponto em que a OPA é mais forte."
          },
          {
            "t": "Direto com o dono",
            "o": "Prefiro negociar direto com o proprietário.",
            "m": "É um direito seu. O que eu faço é cuidar da documentação, da negociação e do contrato, que é onde costuma dar problema na ilha. Se quiser, te explico o que confiro antes de qualquer assinatura.",
            "p": "Mostra o trabalho invisível sem diminuir a escolha dele."
          },
          {
            "t": "Informação diferente",
            "o": "Me falaram outra coisa sobre essa casa.",
            "m": "Pode ser que a informação tenha mudado. Vou confirmar com [proprietário / cartório / prefeitura] e te mando o documento. Assim não fica palavra contra palavra.",
            "p": "Resolve com fonte, não com discussão."
          },
          {
            "t": "Muita mensagem",
            "o": "Corretor manda mensagem demais.",
            "m": "Entendo. Me diz como prefere: uma mensagem por semana, só quando entrar algo muito alinhado, ou só quando você me chamar?",
            "p": "Dá o controle da frequência a ele. E anote no CRM."
          },
          {
            "t": "Processo complicado",
            "o": "Comprar na ilha parece complicado demais.",
            "m": "Parece, porque ninguém explica em ordem. Te mando o passo a passo em uma página, do sim até a chave, com quem faz cada coisa: eu, a June e o cartório.",
            "p": "Organização tira o medo."
          },
          {
            "t": "Já me enganaram",
            "o": "Já tive problema com corretor antes.",
            "m": "Sinto muito, isso marca. O que aconteceu? Pergunto pra saber o que eu preciso fazer diferente com você.",
            "p": "Escuta antes de prometer."
          }
        ]
      },
      {
        "nome": "Imóvel e localização",
        "desc": "Quando a casa não bate 100% com a lista. Na ilha, lado, sol, vento e acesso valem mais que metragem.",
        "regras": [
          "Pergunte o que pesa mais antes de defender a casa.",
          "Casa perfeita não existe. Ajude a priorizar.",
          "Se não serve, diga que não serve e procure outra."
        ],
        "itens": [
          {
            "t": "Lado errado da ilha",
            "o": "Queria do outro lado da ilha.",
            "m": "Entendo. O que te atrai lá: [sossego, proximidade da balsa, uma praia específica]? Se for sossego, tenho opção deste lado que entrega isso. Se for a praia, eu procuro lá.",
            "p": "Separa o motivo do endereço. Cada lado da ilha resolve uma coisa."
          },
          {
            "t": "Vista",
            "o": "Não tem vista pro mar.",
            "m": "Não tem mesmo, e isso pesa no preço. Vista pro mar aqui custa [diferença aproximada] a mais, e às vezes vem junto com vento e maresia direta. Quer que eu te mostre uma com vista pra você sentir a diferença na conta e no dia a dia?",
            "p": "Mostra o outro lado da troca com honestidade."
          },
          {
            "t": "Sol",
            "o": "O sol não bate onde eu queria.",
            "m": "Faz diferença no dia a dia mesmo, ainda mais com morro atrás. Tenho [opção com outra face]. Se quiser, vou com você no horário em que o sol importa pra vocês.",
            "p": "Leva a sério um critério que muita gente ignora."
          },
          {
            "t": "Vento",
            "o": "Deve ventar muito aí.",
            "m": "Depende da face. Vento sul bate forte em alguns pontos e passa longe de outros. Em {imovel}, [como é]. Vale visitar num dia de vento, que é quando a casa mostra se foi bem pensada.",
            "p": "Fato de quem conhece e um teste real."
          },
          {
            "t": "Pequena",
            "o": "Achei a casa pequena.",
            "m": "Pequena pra quê, especificamente? Se for pra receber a família toda, posso te mostrar a planta com os ambientes e como ela cresce pra área externa, que aqui é metade da casa.",
            "p": "Testa a objeção com algo visual e com a lógica de casa de praia."
          },
          {
            "t": "Reforma",
            "o": "Vai precisar de reforma.",
            "m": "Vai sim. O Marco, que é arquiteto, pode te dizer o que é reforma simples e o que depende de aprovação. Com isso, a gente põe o custo na conta antes da proposta.",
            "p": "Coloca o custo na mesa e usa o diferencial da OPA."
          },
          {
            "t": "Terreno em declive",
            "o": "O terreno é muito íngreme.",
            "m": "É, e na ilha isso é regra, não exceção. O que importa é a escada, o acesso de carro e como a casa foi assentada. Em {imovel}, [como é]. Pra quem pensa em envelhecer na casa, isso pesa, e eu prefiro falar agora.",
            "p": "Honestidade sobre um ponto que decide o uso a longo prazo."
          },
          {
            "t": "Barulho na temporada",
            "o": "Essa rua deve ser barulhenta no verão.",
            "m": "Em janeiro fica mais movimentada mesmo. Fora dele, é outra rua. Como vocês pensam em usar a casa? Se for ano inteiro, vale ver num sábado de verão antes de decidir.",
            "p": "Diferencia por época e devolve ao uso."
          },
          {
            "t": "Vizinhança",
            "o": "Não gostei da vizinhança.",
            "m": "Obrigado por falar. O que te incomodou? Se for algo que dá pra conferir, eu levanto. Se for sensação, a gente procura em outro lugar.",
            "p": "Separa fato de impressão e respeita os dois."
          },
          {
            "t": "Não é o que eu pedi",
            "o": "Não é exatamente o que eu pedi.",
            "m": "Tem razão, não é. De tudo o que você pediu, quais itens ela cumpre e quais não? Se os que faltam forem os principais, eu descarto e procuro outra.",
            "p": "Honestidade: você também descarta casa."
          }
        ]
      },
      {
        "nome": "Família e decisão",
        "desc": "Quando outra pessoa precisa concordar. Na segunda residência, a família inteira decide.",
        "regras": [
          "O cônjuge não é obstáculo, é alguém que ainda não está na conversa.",
          "Leve a apresentação até quem decide, de preferência numa visita.",
          "Não peça ao cliente para vender por você."
        ],
        "itens": [
          {
            "t": "Cônjuge",
            "o": "Preciso ver com meu marido / minha esposa.",
            "m": "Faz todo sentido. Querem que eu mostre de novo com vocês dois juntos? Vou no horário que for melhor, inclusive fim de semana.",
            "p": "Leva o decisor para a mesa."
          },
          {
            "t": "Chamada de vídeo",
            "o": "Ele(a) não consegue vir agora.",
            "m": "Posso fazer uma chamada de vídeo rápida com vocês dois, andando pela casa. Uns dez minutos à noite funciona?",
            "p": "Remove a barreira da agenda e da distância."
          },
          {
            "t": "Filhos",
            "o": "Os filhos precisam gostar.",
            "m": "Ótimo critério. Na próxima visita, vamos com eles? Aqui criança vai direto pra área externa, e isso diz muito sobre a casa.",
            "p": "Inclui a família na decisão com a lógica da casa de praia."
          },
          {
            "t": "Sócio ou contador",
            "o": "Vou consultar meu contador.",
            "m": "Perfeito. Te mando a ficha técnica e a documentação organizadas pra ele. Se preferir, falo direto com ele ou com a June junto.",
            "p": "Facilita a consulta em vez de esperar."
          },
          {
            "t": "Opiniões diferentes",
            "o": "A gente não está de acordo.",
            "m": "Acontece muito, ainda mais em casa de família. O que cada um prioriza? Às vezes existe uma casa que atende o principal dos dois, e eu procuro com esse filtro.",
            "p": "Ajuda o casal a decidir em vez de escolher lado."
          },
          {
            "t": "Ele(a) não gostou",
            "o": "Meu marido / minha esposa não gostou.",
            "m": "Obrigado por me contar. Sabe o que não agradou? Se for algo da casa, procuro outra. Se for algo da ilha, vale a gente conversar sobre isso antes de ver mais casas.",
            "p": "Separa casa de ilha. Objeção à ilha não se resolve com outra casa."
          },
          {
            "t": "Herança",
            "o": "Depende de inventário do meu lado.",
            "m": "Entendo. Sabe em que fase está? Dependendo, dá pra fazer uma proposta com prazo ou condição. Quero entender antes de te mostrar mais opções.",
            "p": "Leva em conta o prazo real dele."
          },
          {
            "t": "Mostrar as fotos",
            "o": "Vou mostrar as fotos pra família.",
            "m": "Boa. Te mando também o vídeo de um minuto e a planta, que mostram melhor que foto. Se surgir dúvida, posso responder direto a eles.",
            "p": "Melhora o material que vai circular sem você."
          },
          {
            "t": "Pais ou sogros",
            "o": "Meus pais vão usar muito a casa.",
            "m": "Então vale olhar escada, acesso de carro até a porta e banheiro no térreo. Em {imovel}, [como é]. Prefiro falar disso agora do que descobrir na visita com eles.",
            "p": "Antecipa um critério de uso que muda a escolha da casa."
          },
          {
            "t": "Decidir junto",
            "o": "Preciso decidir junto com todo mundo.",
            "m": "Faz sentido. Quer que eu organize uma visita num fim de semana em que todos possam vir? Mostro a casa e os bairros, e vocês decidem com calma depois.",
            "p": "Transforma a decisão coletiva numa visita coletiva."
          }
        ]
      },
      {
        "nome": "Pagamento e financiamento",
        "perfis": [
          "medio",
          "alto"
        ],
        "desc": "Como pagar uma casa na ilha, onde boa parte dos imóveis não financia.",
        "regras": [
          "Só imóvel com matrícula financia. Diga isso antes de simular qualquer coisa.",
          "Explique o processo antes de pedir documento.",
          "Se reprovar, diga o motivo e o caminho."
        ],
        "itens": [
          {
            "t": "Quero financiar",
            "o": "Preciso de financiamento.",
            "m": "Então o primeiro filtro é documentação: só imóvel com matrícula financia. {imovel} está [situação]. Se for posse, eu separo só opções que o banco aceita. Combinado?",
            "p": "A pergunta decide o filtro da busca inteira."
          },
          {
            "t": "Medo de não aprovar",
            "o": "Tenho medo de não aprovar.",
            "m": "É um receio comum. A análise não te obriga a nada, e se não passar eu te digo o motivo e o que dá pra fazer. Quer tentar sem compromisso?",
            "p": "Tira o peso da tentativa."
          },
          {
            "t": "Entrada",
            "o": "Não tenho toda a entrada agora.",
            "m": "Vamos ver as opções: prazo pra entrada com o proprietário, FGTS se couber, ou compor com a venda do imóvel atual de vocês. Alguma delas é possível?",
            "p": "Mostra caminhos em vez de encerrar a conversa."
          },
          {
            "t": "Vender o atual",
            "o": "Preciso vender meu apartamento primeiro.",
            "m": "Faz sentido. Dá pra organizar de três jeitos: vender antes, dar como parte do pagamento se o proprietário aceitar, ou comprar com prazo pra venda. Quer que eu faça uma avaliação do seu pra saber de quanto estamos falando?",
            "p": "Caminhos concretos para o freio mais comum da troca, e pode virar captação."
          },
          {
            "t": "Parcela sobe",
            "o": "E se a parcela aumentar?",
            "m": "Depende do tipo de financiamento. Te mando a simulação mostrando mês a mês, com a correção que o banco usa, pra não ter surpresa.",
            "p": "Explicação com documento, não com promessa."
          },
          {
            "t": "À vista",
            "o": "Pago à vista, quero condição.",
            "m": "Pagamento à vista ajuda a negociar. Me diz o valor que faz sentido pra você que eu levo ao proprietário com essa condição destacada.",
            "p": "Usa a força real da oferta dele."
          },
          {
            "t": "Permuta",
            "o": "Aceita meu imóvel na troca?",
            "m": "Depende do proprietário, mas posso propor. Me passa os dados do seu imóvel que eu faço uma avaliação e levo a proposta com os números.",
            "p": "Tenta antes de dizer não."
          },
          {
            "t": "Pessoa jurídica",
            "o": "Vou comprar pela empresa.",
            "m": "Ótimo. Me passa o contato do seu contador ou advogado que a June alinha a documentação direto com eles.",
            "p": "Remove trabalho dele e mostra preparo."
          },
          {
            "t": "Burocracia",
            "o": "É muita burocracia.",
            "m": "É bastante papel mesmo, e na ilha tem mais uma camada por causa da documentação. A parte que dá pra eu e a June fazermos, a gente faz. Te mando a lista dividida em etapas.",
            "p": "Divide o trabalho em pedaços pequenos."
          },
          {
            "t": "Banco já negou",
            "o": "Já tentei e o banco negou.",
            "m": "Sabe qual foi o motivo? Às vezes muda com outro banco, com outra composição de renda ou depois de resolver uma pendência. Se quiser, olho o seu caso com cuidado.",
            "p": "Reabre com diagnóstico, não com otimismo vazio."
          }
        ]
      },
      {
        "nome": "Patrimônio, locação e liquidez",
        "desc": "Quando a compra também é decisão de patrimônio: alugar na temporada, revender depois, custo de manter.",
        "regras": [
          "Nunca prometa rentabilidade ou valorização.",
          "Número só com período e fonte, ou nada.",
          "Mostre custo de manter, não só preço de compra."
        ],
        "itens": [
          {
            "t": "Alugar na temporada",
            "o": "Quero alugar na temporada pra pagar a casa.",
            "m": "Faz sentido, e dá pra olhar com números. Posso te mostrar ocupação e diária de casas parecidas que conhecemos, com o período. Só não prometo retorno: temporada varia de ano pra ano.",
            "p": "Número com período e fonte, e a honestidade de não prometer."
          },
          {
            "t": "Revenda",
            "o": "E se eu precisar vender depois?",
            "m": "Boa pergunta pra fazer agora. Posso te mostrar quanto tempo casas parecidas levaram pra vender na ilha, com a fonte. Documentação em dia é o que mais acelera a revenda aqui.",
            "p": "Dado de mercado real e o critério que ele controla na compra."
          },
          {
            "t": "Custo de manter",
            "o": "Casa fechada o ano todo dá trabalho.",
            "m": "Dá, e aqui a maresia não perdoa casa fechada. O proprietário informa [valor] por mês com caseiro, jardim e piscina. Te mando aberto, e indico quem cuida disso quando vocês não estão.",
            "p": "Responde com número com fonte e com solução."
          },
          {
            "t": "Segunda casa",
            "o": "Já tenho casa de praia em outro lugar.",
            "m": "Então você sabe o que funciona e o que não funciona. O que faria uma casa aqui valer a pena: a ilha em si, mais espaço, ou patrimônio?",
            "p": "Usa a experiência dele como ponto de partida."
          },
          {
            "t": "Aplicação",
            "o": "Prefiro deixar o dinheiro aplicado.",
            "m": "É uma escolha válida. Imóvel e aplicação servem pra coisas diferentes. Se quiser, te mostro quanto a casa renderia alugada na temporada, com fonte, pra você comparar com o seu investimento. Sem prometer nada.",
            "p": "Coloca os dois lado a lado sem prometer retorno."
          },
          {
            "t": "Valorização",
            "o": "Vai valorizar?",
            "m": "Não tenho como prometer valorização, e desconfio de quem promete. O que posso te mostrar é o histórico de preço da região, com fonte. Você tira a conclusão.",
            "p": "Regra da casa: sem previsão. Dado com fonte e decisão dele."
          },
          {
            "t": "Discrição",
            "o": "Não quero que ninguém saiba da compra.",
            "m": "Entendido. A negociação fica entre você, eu e o proprietário. Nada é divulgado, nem a visita, e posso tratar com seu assessor, se preferir.",
            "p": "Discrição dita com clareza. É critério de escolha neste perfil."
          },
          {
            "t": "Administrar de longe",
            "o": "Como cuido da casa morando longe?",
            "m": "Com caseiro, com uma administradora da ilha ou com os dois. Te passo os contatos de quem a gente conhece e o que cada um cobra, pra entrar na conta antes da compra.",
            "p": "Resolve o medo prático com rede local."
          },
          {
            "t": "Documentação",
            "o": "Quero ver toda a documentação antes.",
            "m": "Perfeito, é o certo. Te mando matrícula ou contrato, certidões e IPTU. Se quiser, seu advogado fala direto com a June.",
            "p": "Facilita a diligência."
          },
          {
            "t": "Tempo de decisão",
            "o": "Decisões assim eu tomo devagar.",
            "m": "Entendo e respeito. Me diz como prefere que eu siga: te mando só o essencial, no ritmo que você indicar.",
            "p": "Ajusta o ritmo ao dele sem tentar acelerar."
          }
        ]
      },
      {
        "nome": "Off market e sigilo",
        "perfis": [
          "off"
        ],
        "desc": "As perguntas de quem recebe um link reservado pela primeira vez. Toda resposta protege o proprietário sem tratar o cliente como suspeito.",
        "regras": [
          "Explique a regra com o motivo. Regra sem motivo soa como mistério.",
          "Nunca abra exceção no link: nem print, nem encaminhamento.",
          "Se a pessoa não aceita as regras, o off market não é pra ela, e tudo bem."
        ],
        "itens": [
          {
            "t": "Por que não está no site",
            "o": "Se é boa, por que não está anunciada?",
            "m": "Porque o proprietário pediu. Às vezes é vizinho, às vezes é família, às vezes ele só não quer curioso visitando. A documentação é a mesma de qualquer casa da OPA, conferida pela June, e você vê tudo no link reservado.",
            "p": "Motivos comuns e verificáveis no lugar de mistério."
          },
          {
            "t": "Manda as fotos",
            "o": "Me manda as fotos por aqui.",
            "m": "Prefiro te mandar pelo link reservado, no seu nome. É o combinado com o proprietário: foto solta no WhatsApp acaba circulando. No link você vê fotos, vídeo e documentação, tudo junto.",
            "p": "Nega o pedido com o motivo e entrega mais do que foi pedido."
          },
          {
            "t": "Encaminhar o link",
            "o": "Posso mandar o link pra minha esposa?",
            "m": "Melhor não encaminhar: o link abre num aparelho só e vai travar pra ela. Me passa o nome e o WhatsApp dela que eu crio um link igual ao seu em um minuto.",
            "p": "Resolve a necessidade real dentro da regra."
          },
          {
            "t": "Link venceu",
            "o": "O link não abre mais.",
            "m": "Ele vence em [prazo], é assim com todos. Gero outro agora. Se precisar de mais tempo, me diz que eu faço de sete dias.",
            "p": "Sem drama. A validade é regra, não desconfiança."
          },
          {
            "t": "Valor antes de conversar",
            "o": "Me fala o valor antes, pra não perder tempo.",
            "m": "Justo. Te ligo em [horário] e em dois minutos te passo o valor e o que está incluso. Falo por voz porque o proprietário não quer esse número em print.",
            "p": "Respeita o tempo dele e mantém a regra do valor por voz."
          },
          {
            "t": "Sigilo demais",
            "o": "Por que tanto segredo? Parece golpe.",
            "m": "Entendo a estranheza. O sigilo é do proprietário, não da OPA: ele não quer a casa exposta. Da nossa parte, a documentação está no link e seu advogado pode falar com a June antes de qualquer passo. Nenhum valor passa pela OPA.",
            "p": "Separa o sigilo do proprietário da transparência da OPA."
          },
          {
            "t": "Ir sozinho",
            "o": "Posso passar lá pra ver de fora?",
            "m": "Prefiro que não. O proprietário pediu que ninguém apareça sem combinar, e vizinho repara. Eu organizo a visita com ele e vou junto. Qual dia funciona pra vocês?",
            "p": "Protege o proprietário e converte o impulso em visita marcada."
          },
          {
            "t": "Tirar fotos",
            "o": "Posso tirar fotos na visita?",
            "m": "O proprietário pede que não. O que vocês quiserem rever depois, eu mando pelo link reservado. Se precisar de alguma medida ou detalhe, eu levanto com ele.",
            "p": "Regra com alternativa. Ninguém sai da visita sem o que precisa."
          },
          {
            "t": "Preço alto por ser off",
            "o": "Se não está anunciada, o preço deve estar inflado.",
            "m": "Não é regra. Algumas casas estão fora do site justamente porque o proprietário não tem pressa, e isso pesa no preço; outras estão por discrição, com valor de mercado. Te falo o valor por voz e te mostro comparáveis, com fonte.",
            "p": "Honestidade sobre os dois casos e comparáveis como prova."
          },
          {
            "t": "Exclusividade",
            "o": "Quero que ninguém mais veja essa casa.",
            "m": "Isso eu não posso prometer, e desconfiaria de quem prometesse. O que posso te dizer com sinceridade é quantas pessoas estão olhando agora: [número real]. Se quiser andar rápido, a proposta por escrito é o caminho.",
            "p": "Não vende exclusividade falsa. Transparência e o próximo passo concreto."
          }
        ]
      }
    ]
  }
];
