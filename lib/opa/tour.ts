/**
 * Tour guiado nas telas reais do CRM da OPA (pedido do Allyson, 01/11/2026):
 * um recorte em volta do elemento de verdade, o resto escurecido, e um balão
 * que diz o que ele faz. Cada passo se prende a um atributo `data-tour` da
 * tela; se o elemento não existe (lista vazia, papel, celular), o passo some
 * ou vira uma explicação no centro, e o tour nunca quebra.
 *
 * Módulo puro: passos, regras e a geometria do balão moram aqui para serem
 * testados; o desenho fica em `app/app/_opa/tour.tsx`.
 */
import type { TelaTutorial, VersaoTutorial } from "./tutorial";

export type TourId = "hoje" | "fila" | "leads" | "ficha" | "funil" | "imoveis" | "agenda" | "whatsapp" | "roleta" | "equipe";

export interface PassoTour {
  /** Valor do `data-tour` do elemento. */
  alvo: string;
  titulo: string;
  /** Uma ou duas frases. */
  texto: string;
  /** Só nesta versão. Ausente = as duas. */
  so?: VersaoTutorial;
  /** Se o elemento não está na tela, explica no centro em vez de pular. */
  seFaltar?: { titulo: string; texto: string };
}

export interface Tour {
  id: TourId;
  /** Tela correspondente em Tutoriais. */
  tela: TelaTutorial;
  nome: string;
  /** Onde o tour começa. */
  rota: string;
  soGestor?: boolean;
  passos: PassoTour[];
  /** Tela vazia (nenhum elemento achado): um passo no centro. */
  vazio: { titulo: string; texto: string };
}

const AJUDA: PassoTour = {
  alvo: "cab-ajuda",
  titulo: "Dúvida? Toque no ?",
  texto: "Ele abre o tour e o tutorial da tela em que você está.",
};
const NOVO_LEAD: PassoTour = {
  alvo: "cab-novo-lead",
  titulo: "Lead novo à mão",
  texto: "Chegou alguém por fora do WhatsApp? Cadastre por aqui.",
};

export const TOURS: Record<TourId, Tour> = {
  hoje: {
    id: "hoje",
    tela: "hoje",
    nome: "Hoje",
    rota: "/app/hoje",
    passos: [
      { alvo: "hoje-fila", titulo: "Sua fila de hoje", texto: "Quem está esperando resposta, do mais antigo para o mais novo. Comece por aqui." },
      { alvo: "hoje-ia", titulo: "O que a IA anotou", texto: "A IA lê as conversas e anota o que o cliente quer. Confirme para salvar na ficha." },
      { alvo: "hoje-visitas", titulo: "Visitas do dia", texto: "As visitas marcadas para hoje, com o imóvel e o cliente." },
      { alvo: "hoje-numeros", titulo: "Números da equipe", texto: "Leads novos, respostas no prazo e vendas do período.", so: "gestor" },
      { alvo: "cab-equipe", titulo: "Um corretor por vez", texto: "Filtre a tela para ver o dia de um corretor específico.", so: "gestor" },
      NOVO_LEAD,
      AJUDA,
    ],
    vazio: { titulo: "Tela Hoje", texto: "Quando chegarem leads, aqui aparece o que fazer primeiro." },
  },
  fila: {
    id: "fila",
    tela: "fila",
    nome: "Fila",
    rota: "/app/fila",
    passos: [
      { alvo: "fila-proximo", titulo: "Responda primeiro este", texto: "O cartão escuro é quem espera há mais tempo. Toque em Conversa para responder." },
      {
        alvo: "fila-prazo",
        titulo: "Prazo do primeiro atendimento",
        texto: "A barra mostra quanto falta. Se vencer sem resposta, o lead vai para o próximo da roleta.",
      },
      { alvo: "fila-acoes", titulo: "Respondi", texto: "Respondeu por fora, por ligação ou outro número? Toque em Respondi e o prazo para." },
      { alvo: "fila-item", titulo: "O resto da fila", texto: "Os outros leads esperando, em ordem. Toque no nome para abrir a ficha." },
      { alvo: "cab-equipe", titulo: "Fila da equipe", texto: "Filtre por corretor para ver quem está segurando a fila.", so: "gestor" },
    ],
    vazio: { titulo: "Fila vazia", texto: "Ninguém esperando resposta agora. Quando um lead escrever, ele aparece aqui." },
  },
  leads: {
    id: "leads",
    tela: "leads",
    nome: "Leads",
    rota: "/app/leads",
    passos: [
      { alvo: "leads-busca", titulo: "Busca", texto: "Ache o cliente pelo nome, pelo telefone ou pelo código do imóvel." },
      { alvo: "leads-abas", titulo: "Filtros", texto: "Separe por situação: quem espera resposta, os quentes, off market e outros." },
      { alvo: "leads-lista", titulo: "Seus leads", texto: "O ponto laranja mostra quem espera resposta. Toque no lead para abrir a ficha." },
      NOVO_LEAD,
    ],
    vazio: { titulo: "Seus leads", texto: "Quando chegar o primeiro lead, ele aparece nesta lista." },
  },
  ficha: {
    id: "ficha",
    tela: "ficha",
    nome: "Ficha do lead",
    rota: "/app/leads",
    passos: [
      { alvo: "ficha-etapa", titulo: "Etapa do negócio", texto: "Toque numa etapa para mover o lead quando o cliente avança." },
      { alvo: "ficha-acoes", titulo: "Ações rápidas", texto: "Abrir a conversa, agendar mensagem e registrar visita, tudo daqui." },
      { alvo: "ficha-ligar", titulo: "Ligar em um toque", texto: "O número já vem discado. Depois, registre como foi a ligação." },
      { alvo: "ficha-copiloto", titulo: "Copiloto", texto: "Resume a conversa, sugere o próximo passo e mostra o que preocupa o cliente." },
      {
        alvo: "ficha-sugestoes",
        titulo: "Confirme ou descarte",
        texto: "Nada entra no lead sem você. Confirme ou descarte cada campo.",
        seFaltar: {
          titulo: "Sugestões da IA",
          texto: "Quando a IA anotar algo novo da conversa, aparece no Copiloto para você confirmar ou descartar.",
        },
      },
      { alvo: "ficha-mensagem", titulo: "Próxima mensagem", texto: "Um texto pronto para responder o cliente. Revise antes de mandar." },
      {
        alvo: "ficha-selecao",
        titulo: "Seleção de imóveis",
        texto: "Os imóveis que combinam com o cliente. Monte uma seleção de até três e mande numa mensagem só.",
        seFaltar: {
          titulo: "Seleção de imóveis",
          texto: "Na aba Imóveis da ficha, toque em Montar seleção e mande até três imóveis numa mensagem só.",
        },
      },
    ],
    vazio: { titulo: "Ficha do lead", texto: "Abra um lead para fazer o tour da ficha." },
  },
  funil: {
    id: "funil",
    tela: "funis",
    nome: "Funis",
    rota: "/app/pipeline",
    passos: [
      { alvo: "funil-abas", titulo: "Os funis", texto: "Compradores, captação e proprietários. Troque de funil por aqui." },
      { alvo: "funil-etapa", titulo: "Etapas", texto: "Cada coluna é uma etapa. O número mostra quantos leads estão nela." },
      { alvo: "funil-cartao", titulo: "Cartão do lead", texto: "Arraste o cartão para outra coluna para mudar a etapa." },
      { alvo: "funil-mover", titulo: "No celular, Mover", texto: "Toque em Mover e escolha a nova etapa, sem precisar arrastar." },
    ],
    vazio: { titulo: "Funis", texto: "Quando houver leads, cada um aparece como um cartão na etapa em que está." },
  },
  imoveis: {
    id: "imoveis",
    tela: "imoveis",
    nome: "Imóveis",
    rota: "/app/imoveis",
    passos: [
      { alvo: "imoveis-regioes", titulo: "Regiões", texto: "Filtre o acervo por região da ilha." },
      { alvo: "imoveis-busca", titulo: "Busca", texto: "Procure pelo código, pelo bairro ou pelo nome do imóvel." },
      { alvo: "imoveis-card", titulo: "Imóvel", texto: "Toque para ver os detalhes e os clientes que combinam com ele." },
    ],
    vazio: { titulo: "Imóveis", texto: "O acervo da OPA aparece aqui, com quem combina com cada imóvel." },
  },
  agenda: {
    id: "agenda",
    tela: "agenda",
    nome: "Agenda e lembretes",
    rota: "/app/lembretes",
    passos: [
      { alvo: "agenda-abas", titulo: "Sua agenda e os avisos", texto: "Minha agenda tem os seus retornos. Avisos mostra quando o CRM te avisa sozinho." },
      {
        alvo: "agenda-agendadas",
        titulo: "Seus retornos",
        texto: "Hoje e os próximos dias, com a hora. Toque em Abrir cliente para ir direto à ficha.",
        seFaltar: {
          titulo: "Seus retornos",
          texto: "Em Minha agenda ficam os retornos marcados. Agende pelo botão Agendar lembrete ou pela ficha do cliente.",
        },
      },
      {
        alvo: "agenda-trilha",
        titulo: "O que o CRM avisa",
        texto: "Cada linha é um aviso: quando chega e o que diz.",
        seFaltar: {
          titulo: "Avisos",
          texto: "Na aba Avisos você vê quando o CRM te avisa sozinho, como o prazo da primeira resposta.",
        },
      },
      { alvo: "agenda-nova-regra", titulo: "Criar um aviso", texto: "Crie um aviso novo para o tipo de lead escolhido.", so: "gestor" },
    ],
    vazio: { titulo: "Agenda", texto: "Seus lembretes e as mensagens agendadas aparecem aqui." },
  },
  whatsapp: {
    id: "whatsapp",
    tela: "whatsapp",
    nome: "Meu WhatsApp",
    rota: "/app/meu-whatsapp",
    passos: [
      { alvo: "whats-cartao", titulo: "Seu número", texto: "Aqui você liga o seu WhatsApp ao CRM. Só você mexe nele." },
      { alvo: "whats-estado", titulo: "Situação", texto: "Mostra se está conectado, esperando a leitura ou desconectado." },
      {
        alvo: "whats-protecao",
        titulo: "Conversas pessoais protegidas",
        texto: "O que é pessoal não é guardado nem lido. A IA acompanha só os leads: use a etiqueta Lead OPA ou o botão É lead.",
      },
      { alvo: "contatos-novos", titulo: "É lead?", texto: "Quem escreveu e ainda não foi classificado. Um toque decide." },
      { alvo: "whats-acao", titulo: "Conectar", texto: "Leia o código com o celular, em Aparelhos conectados no WhatsApp." },
    ],
    vazio: { titulo: "Meu WhatsApp", texto: "Aqui você liga o seu número lendo um código com o celular." },
  },
  roleta: {
    id: "roleta",
    tela: "roleta",
    nome: "Roleta e funis",
    rota: "/app/configuracoes",
    soGestor: true,
    passos: [
      { alvo: "roleta-ordem", titulo: "Roleta de leads", texto: "A ordem em que os leads novos são distribuídos. Pause quem estiver fora." },
      { alvo: "roleta-prazos", titulo: "Prazos", texto: "Quanto tempo o corretor tem para a primeira resposta antes do repasse." },
      { alvo: "roleta-regras", titulo: "Quem fica com o lead", texto: "As regras que valem antes da roleta, nesta ordem." },
    ],
    vazio: { titulo: "Roleta e funis", texto: "Aqui você define quem entra na roleta e os prazos de resposta." },
  },
  equipe: {
    id: "equipe",
    tela: "equipe",
    nome: "Equipe",
    rota: "/app/membros",
    soGestor: true,
    passos: [
      { alvo: "membros-convidar", titulo: "Convidar", texto: "Convide corretores pelo e-mail." },
      { alvo: "membros-lista", titulo: "A equipe", texto: "Papel, WhatsApp conectado e último acesso de cada um. O administrador troca o papel aqui." },
      { alvo: "membros-papeis", titulo: "O que cada papel pode", texto: "As permissões ficam no banco, não só na tela." },
    ],
    vazio: { titulo: "Equipe", texto: "Quem está na equipe e o que cada papel pode fazer." },
  },
};

/** Tours que a versão pode fazer. */
export function toursPermitidos(versao: VersaoTutorial): Tour[] {
  return Object.values(TOURS).filter((t) => !t.soGestor || versao === "gestor");
}

export function tourDaTela(tela: TelaTutorial): Tour | null {
  return Object.values(TOURS).find((t) => t.tela === tela) ?? null;
}

/** O tour da rota atual. A ficha é `/app/leads/<id>`; a lista é só `/app/leads`. */
export function tourDaRota(pathname: string): TourId | null {
  const p = pathname.replace(/\/+$/, "") || "/";
  if (/^\/app\/leads\/[^/]+$/.test(p) && p !== "/app/leads/exportar") return "ficha";
  for (const t of Object.values(TOURS)) if (t.id !== "ficha" && p === t.rota) return t.id;
  return null;
}

export interface PassoAtivo {
  /** `null` = passo no centro, sem recorte. */
  alvo: string | null;
  titulo: string;
  texto: string;
}

/**
 * Os passos que valem nesta tela agora: filtra pela versão, pula elemento
 * ausente (ou explica no centro, se o passo pede) e, se nada sobrou, um passo
 * central com o texto de tela vazia.
 */
export function passosAtivos(tour: Tour, versao: VersaoTutorial, existe: (alvo: string) => boolean): PassoAtivo[] {
  const lista: PassoAtivo[] = [];
  let algumReal = false;
  for (const p of tour.passos) {
    if (p.so && p.so !== versao) continue;
    if (existe(p.alvo)) {
      lista.push({ alvo: p.alvo, titulo: p.titulo, texto: p.texto });
      algumReal = true;
    } else if (p.seFaltar) {
      lista.push({ alvo: null, ...p.seFaltar });
    }
  }
  // Nenhum elemento real: as explicações soltas não fazem sentido sem a tela, fica só o aviso de tela vazia.
  return algumReal ? lista : [{ alvo: null, ...tour.vazio }];
}

/** Começa o tour em outra tela: endereço com `?tour=` e a versão pedida. */
export function linkDoTour(tour: TourId, versao: VersaoTutorial): string {
  return `${TOURS[tour].rota}?tour=${tour}&como=${versao}`;
}

/* Geometria: recorte e balão. */

export interface Retangulo {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Tela {
  w: number;
  h: number;
}

/** Abaixo disto o balão vira faixa no rodapé. */
export const LARGURA_CELULAR = 768;

/** O recorte: o elemento com folga, preso à área visível. */
export function recorte(alvo: Retangulo, tela: Tela, folga = 8): Retangulo {
  const top = Math.max(4, alvo.top - folga);
  const left = Math.max(4, alvo.left - folga);
  const bottom = Math.min(tela.h - 4, alvo.top + alvo.height + folga);
  const right = Math.min(tela.w - 4, alvo.left + alvo.width + folga);
  return { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

export type PosicaoBalao =
  | { modo: "faixa" }
  | { modo: "centro" }
  | { modo: "flutuante"; top: number; left: number; lado: "baixo" | "cima" | "direita" | "esquerda" | "dentro" };

const prender = (v: number, min: number, max: number) => Math.min(Math.max(v, min), Math.max(min, max));

/**
 * Onde o balão fica: no celular, faixa no rodapé; sem alvo, no centro; com
 * alvo, embaixo se couber, senão em cima, à direita, à esquerda e, em último
 * caso, dentro da tela por cima do recorte (alvo maior que a tela).
 */
export function posicaoDoBalao(alvo: Retangulo | null, balao: { w: number; h: number }, tela: Tela, margem = 16, distancia = 14): PosicaoBalao {
  if (tela.w < LARGURA_CELULAR) return { modo: "faixa" };
  if (!alvo) return { modo: "centro" };
  const centroX = prender(alvo.left + alvo.width / 2 - balao.w / 2, margem, tela.w - balao.w - margem);
  const baixo = alvo.top + alvo.height + distancia;
  if (baixo + balao.h <= tela.h - margem) return { modo: "flutuante", top: baixo, left: centroX, lado: "baixo" };
  const cima = alvo.top - distancia - balao.h;
  if (cima >= margem) return { modo: "flutuante", top: cima, left: centroX, lado: "cima" };
  const meioY = prender(alvo.top + alvo.height / 2 - balao.h / 2, margem, tela.h - balao.h - margem);
  const direita = alvo.left + alvo.width + distancia;
  if (direita + balao.w <= tela.w - margem) return { modo: "flutuante", top: meioY, left: direita, lado: "direita" };
  const esquerda = alvo.left - distancia - balao.w;
  if (esquerda >= margem) return { modo: "flutuante", top: meioY, left: esquerda, lado: "esquerda" };
  return { modo: "flutuante", top: tela.h - balao.h - margem, left: prender((tela.w - balao.w) / 2, margem, tela.w - balao.w - margem), lado: "dentro" };
}
