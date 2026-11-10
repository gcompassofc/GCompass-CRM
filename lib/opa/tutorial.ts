/**
 * Tutorial de boas-vindas do CRM da OPA (pedido do Allyson, 01/11/2026).
 *
 * Duas versões: a do corretor (o dia a dia) e a do gestor (só o que muda para
 * quem cuida da equipe). Abre sozinho no primeiro acesso e pode ser reaberto
 * em "Tutoriais", que também traz as dúvidas frequentes, a busca e o link
 * direto para cada passo. Que a pessoa já viu fica no `user_metadata` dela, na chave
 * `tutorial_opa`, uma data por versão: quem vira gestor depois de ter visto a
 * versão do corretor recebe a do gestor no próximo acesso.
 *
 * Módulo puro (sem React, sem Supabase): o conteúdo e as regras moram aqui para
 * serem testados; o desenho fica em `app/app/_opa/tutorial.tsx`.
 */
import type { Role } from "@/lib/auth/types";

export type VersaoTutorial = "corretor" | "gestor";

/** Chave no `user_metadata`. */
export const CHAVE_TUTORIAL = "tutorial_opa";

/** Ícone de cada passo, resolvido no componente (o módulo fica sem React). */
export type IconePasso =
  | "boas-vindas"
  | "hoje"
  | "fila"
  | "leads"
  | "ficha"
  | "imoveis"
  | "agenda"
  | "whatsapp"
  | "funis"
  | "equipe"
  | "roleta"
  | "numeros";

/** Telas do CRM, na ordem em que aparecem em Tutoriais. */
export type TelaTutorial =
  | "comeco"
  | "hoje"
  | "fila"
  | "leads"
  | "ficha"
  | "imoveis"
  | "agenda"
  | "whatsapp"
  | "funis"
  | "equipe"
  | "roleta";

export const TELAS: ReadonlyArray<{ id: TelaTutorial; nome: string; rotas: string[] }> = [
  { id: "comeco", nome: "Primeiros passos", rotas: [] },
  { id: "hoje", nome: "Hoje", rotas: ["/app/hoje"] },
  { id: "fila", nome: "Fila", rotas: ["/app/fila"] },
  { id: "leads", nome: "Leads", rotas: ["/app/leads"] },
  // A ficha é /app/leads/<id>: a rota com "/" no fim só casa com algo depois dela.
  { id: "ficha", nome: "Ficha do lead", rotas: ["/app/leads/", "/app/kit"] },
  { id: "imoveis", nome: "Imóveis", rotas: ["/app/imoveis"] },
  { id: "agenda", nome: "Agenda e lembretes", rotas: ["/app/lembretes"] },
  { id: "whatsapp", nome: "Meu WhatsApp", rotas: ["/app/meu-whatsapp"] },
  { id: "funis", nome: "Funis", rotas: ["/app/pipeline"] },
  { id: "equipe", nome: "Equipe", rotas: ["/app/membros"] },
  { id: "roleta", nome: "Roleta e funis", rotas: ["/app/configuracoes"] },
];

export interface PassoTutorial {
  id: string;
  /** Tela a que o passo se refere: agrupa os tópicos em Tutoriais e liga o "?" do cabeçalho. */
  tela: TelaTutorial;
  icone: IconePasso;
  titulo: string;
  texto: string;
  /** Atrás do "Ver mais": uma frase por item. */
  detalhes?: string[];
  /** Tela real do passo, para abrir depois. */
  href?: string;
  rotuloLink?: string;
}

export const PASSOS: Record<VersaoTutorial, PassoTutorial[]> = {
  corretor: [
    {
      id: "boas-vindas",
      tela: "comeco",
      icone: "boas-vindas",
      titulo: "Bem-vindo ao CRM da OPA",
      texto: "Aqui ficam seus clientes, suas conversas e o que fazer em cada dia. Em dois minutos você vê como funciona.",
    },
    {
      id: "hoje",
      tela: "hoje",
      icone: "hoje",
      titulo: "Comece pelo Hoje",
      texto: "A tela Hoje diz o que fazer agora: quem responder primeiro, as visitas e os retornos do dia.",
      href: "/app/hoje",
      rotuloLink: "Abrir o Hoje",
    },
    {
      id: "fila",
      tela: "fila",
      icone: "fila",
      titulo: "Lead novo cai na Fila",
      texto: "Responda rápido. No primeiro atendimento existe um prazo: se ele vencer, o lead passa para o próximo corretor da roleta.",
      detalhes: [
        "Depois da sua primeira resposta, o lead é seu. O prazo não volta.",
        "Respondeu por fora, por ligação ou outro número? Toque em Respondi no cartão do lead.",
        "Antes do prazo acabar, o CRM te avisa pelo WhatsApp.",
        "O relógio só corre dentro do horário de atendimento.",
      ],
      href: "/app/fila",
      rotuloLink: "Abrir a Fila",
    },
    {
      id: "leads",
      tela: "leads",
      icone: "leads",
      titulo: "Seus leads",
      texto: "Todos os seus clientes num lugar só. Busque pelo nome ou pelo telefone e toque no lead para abrir a ficha.",
      detalhes: [
        "Nos Funis, veja em que etapa está cada lead seu.",
        "O avião no topo da etapa monta uma mensagem para todos dela.",
      ],
      href: "/app/leads",
      rotuloLink: "Abrir Meus leads",
    },
    {
      id: "ficha",
      tela: "ficha",
      icone: "ficha",
      titulo: "A ficha do lead",
      texto: "O assistente lê a conversa e anota o que o cliente procura. Ele sugere a próxima mensagem. Você confirma ou ajusta.",
      detalhes: [
        "Ligar: um toque no telefone e a ligação já começa.",
        "Etapa: mude pela ficha ou nos Funis quando o cliente avança.",
        "Comprador ou vendedor: entrou errado? Um toque na ficha troca o funil, sem apagar o lead.",
        "Kit: escolha o cliente e a situação, e a mensagem sai pronta para mandar.",
      ],
    },
    {
      id: "imoveis",
      tela: "imoveis",
      icone: "imoveis",
      titulo: "Imóveis e seleção",
      texto: "O acervo da OPA mostra quais clientes combinam com cada imóvel. Na ficha, monte uma seleção de até três imóveis e mande numa mensagem só.",
      href: "/app/imoveis",
      rotuloLink: "Abrir Imóveis",
    },
    {
      id: "agenda",
      tela: "agenda",
      icone: "agenda",
      titulo: "Agenda",
      texto: "Toque em Agendar lembrete e escolha o cliente e a hora. Na hora marcada, o CRM te avisa pelo WhatsApp com a mensagem pronta.",
      href: "/app/lembretes",
      rotuloLink: "Abrir a Agenda",
    },
    {
      id: "whatsapp",
      tela: "whatsapp",
      icone: "whatsapp",
      titulo: "Ligue o seu WhatsApp",
      texto: "Em Meu WhatsApp, leia o código com o celular. Suas conversas pessoais ficam protegidas: o CRM e a IA só acompanham os seus leads.",
      detalhes: [
        "Só você mexe no seu número.",
        "Contato novo aparece em Contatos novos: toque em É lead ou Pessoal.",
        "No WhatsApp Business, a etiqueta Lead OPA também marca o lead.",
        "Se a conexão cair, o CRM avisa e você lê o código de novo.",
      ],
      href: "/app/meu-whatsapp",
      rotuloLink: "Ligar meu WhatsApp",
    },
  ],
  gestor: [
    {
      id: "boas-vindas-gestor",
      tela: "comeco",
      icone: "boas-vindas",
      titulo: "Sua visão de gestor",
      texto: "Você vê a equipe toda. Estes passos mostram só o que muda em relação ao corretor.",
    },
    {
      id: "fila-equipe",
      tela: "fila",
      icone: "fila",
      titulo: "Fila da equipe",
      texto: "Todos os leads esperando a primeira resposta, com o prazo de cada um. Se o prazo vence, o lead passa sozinho para o próximo da roleta.",
      detalhes: [
        "Você recebe cópia do repasse pelo WhatsApp.",
        "Lead de quem saiu da equipe vem para você.",
      ],
      href: "/app/fila",
      rotuloLink: "Abrir a Fila da equipe",
    },
    {
      id: "funis",
      tela: "funis",
      icone: "funis",
      titulo: "Funis",
      texto: "Arraste o cartão entre as etapas. Compradores, captação e proprietários, cada um no seu funil.",
      detalhes: ["Negócio parado por muitos dias ganha alerta."],
      href: "/app/pipeline",
      rotuloLink: "Abrir os Funis",
    },
    {
      id: "equipe",
      tela: "equipe",
      icone: "equipe",
      titulo: "Equipe",
      texto: "Convide corretores pelo e-mail e veja quem está com o WhatsApp ligado.",
      detalhes: ["Números de WhatsApp e exclusões ficam com o administrador."],
      href: "/app/membros",
      rotuloLink: "Abrir a Equipe",
    },
    {
      id: "roleta",
      tela: "roleta",
      icone: "roleta",
      titulo: "Roleta e funis",
      texto: "Escolha quem entra na roleta, os prazos de resposta e o horário de atendimento.",
      href: "/app/configuracoes",
      rotuloLink: "Abrir Roleta e funis",
    },
    {
      id: "numeros",
      tela: "hoje",
      icone: "numeros",
      titulo: "Números da equipe",
      texto: "No Hoje você vê leads novos, respostas no prazo e vendas. Filtre por corretor no topo da tela.",
      detalhes: ["Quer ver o que o corretor vê? Em Tutoriais, abra a versão do corretor."],
      href: "/app/hoje",
      rotuloLink: "Abrir o Hoje",
    },
  ],
};

function gestorOuMais(role: Role | null, isPlatformAdmin: boolean): boolean {
  return isPlatformAdmin || role === "manager" || role === "admin";
}

/** A versão que abre sozinha no primeiro acesso. `null` = ninguém abre (operador de IA, sem papel). */
export function versaoDoPapel(role: Role | null, isPlatformAdmin = false): VersaoTutorial | null {
  if (gestorOuMais(role, isPlatformAdmin)) return "gestor";
  if (role === "agent" || role === "viewer") return "corretor";
  return null;
}

/** Versões que a pessoa pode abrir em Tutoriais: o gestor confere também a do corretor. */
export function versoesPermitidas(role: Role | null, isPlatformAdmin = false): VersaoTutorial[] {
  if (gestorOuMais(role, isPlatformAdmin)) return ["corretor", "gestor"];
  if (role === "agent" || role === "viewer") return ["corretor"];
  return [];
}

/** Uma data por versão do tutorial e, em `tours`, uma data por tour de tela feito. */
export type TutorialVisto = Partial<Record<VersaoTutorial, string>> & { tours?: Record<string, string> };

/** Lê o que já foi visto a partir do `user_metadata` inteiro. Tolera lixo. */
export function lerVisto(metadata: unknown): TutorialVisto {
  if (!metadata || typeof metadata !== "object") return {};
  const bruto = (metadata as Record<string, unknown>)[CHAVE_TUTORIAL];
  if (!bruto || typeof bruto !== "object") return {};
  const visto: TutorialVisto = {};
  for (const v of ["corretor", "gestor"] as const) {
    const data = (bruto as Record<string, unknown>)[v];
    if (typeof data === "string" && data) visto[v] = data;
  }
  const tours = (bruto as Record<string, unknown>).tours;
  if (tours && typeof tours === "object") {
    const feitos: Record<string, string> = {};
    for (const [id, data] of Object.entries(tours as Record<string, unknown>)) if (typeof data === "string" && data) feitos[id] = data;
    if (Object.keys(feitos).length > 0) visto.tours = feitos;
  }
  return visto;
}

/** Ids dos tours de tela que a pessoa já terminou. */
export function toursFeitos(metadata: unknown): string[] {
  return Object.keys(lerVisto(metadata).tours ?? {});
}

/** O valor novo da chave `tutorial_opa` com mais um tour feito, preservando o resto. */
export function marcarTourFeito(metadata: unknown, tour: string, agora: Date = new Date()): TutorialVisto {
  const atual = lerVisto(metadata);
  return { ...atual, tours: { ...(atual.tours ?? {}), [tour]: agora.toISOString() } };
}

/** Abre sozinho quando a versão do papel ainda não foi vista. */
export function deveAbrirSozinho(role: Role | null, isPlatformAdmin: boolean, metadata: unknown): VersaoTutorial | null {
  const versao = versaoDoPapel(role, isPlatformAdmin);
  if (!versao) return null;
  return lerVisto(metadata)[versao] ? null : versao;
}

/** O valor novo da chave `tutorial_opa`, preservando as outras versões vistas. */
export function marcarVisto(metadata: unknown, versao: VersaoTutorial, agora: Date = new Date()): TutorialVisto {
  return { ...lerVisto(metadata), [versao]: agora.toISOString() };
}

/* Tutoriais: dúvidas frequentes, busca e link direto para um passo. */

export interface Duvida {
  id: string;
  pergunta: string;
  /** De 1 a 3 frases. */
  resposta: string;
  tela: TelaTutorial;
  href?: string;
  rotuloLink?: string;
  /** Só aparece para quem vê a versão do gestor. */
  soGestor?: boolean;
}

export const DUVIDAS: Duvida[] = [
  {
    id: "lead-foi-para-outro",
    pergunta: "O lead foi para outro corretor. Por quê?",
    resposta:
      "No primeiro atendimento existe um prazo. Se ele vence sem resposta, o lead passa para o próximo corretor da roleta. Depois da sua primeira resposta, o lead não sai mais de você.",
    tela: "fila",
    href: "/app/fila",
    rotuloLink: "Abrir a Fila",
  },
  {
    id: "o-que-e-roleta",
    pergunta: "O que é a roleta?",
    resposta: "É a ordem em que os leads novos são distribuídos. Cada lead novo vai para o próximo corretor da vez. O gestor escolhe quem entra.",
    tela: "fila",
  },
  {
    id: "marcar-respondi",
    pergunta: "Como marco que respondi?",
    resposta: "Na Fila, toque em Respondi no cartão do lead. Use quando você respondeu por fora, por ligação ou por outro número: o prazo para.",
    tela: "fila",
    href: "/app/fila",
    rotuloLink: "Abrir a Fila",
  },
  {
    id: "copiloto-errou",
    pergunta: "O copiloto errou um campo. Como corrijo?",
    resposta: "Na ficha do lead, descarte a sugestão errada. Se o campo já foi salvo, edite e salve o valor certo.",
    tela: "ficha",
    href: "/app/leads",
    rotuloLink: "Abrir Meus leads",
  },
  {
    id: "ligar-para-cliente",
    pergunta: "Como ligo para o cliente?",
    resposta: "Na ficha do lead, toque no telefone. A ligação começa e fica registrada no histórico do lead.",
    tela: "ficha",
    href: "/app/leads",
    rotuloLink: "Abrir Meus leads",
  },
  {
    id: "mudar-etapa",
    pergunta: "Como mudo a etapa do lead?",
    resposta: "Na ficha do lead, escolha a nova etapa. Nos Funis, arraste o cartão ou toque em Mover no celular.",
    tela: "ficha",
    href: "/app/leads",
    rotuloLink: "Abrir Meus leads",
  },
  {
    id: "mensagem-etapa",
    pergunta: "Como mando uma mensagem para todos de uma etapa?",
    resposta:
      "Nos Funis, toque no avião no topo da etapa, ajuste a mensagem e abra um por um no seu WhatsApp. Você confere e envia cada uma. O CRM não dispara nada sozinho, para o seu número não ser bloqueado.",
    tela: "funis",
    href: "/app/pipeline",
    rotuloLink: "Abrir os Funis",
  },
  {
    id: "tres-imoveis",
    pergunta: "Como mando três imóveis numa mensagem?",
    resposta: "Na ficha do lead, toque em Montar seleção, escolha até três imóveis e envie. Eles vão juntos numa mensagem só.",
    tela: "imoveis",
    href: "/app/leads",
    rotuloLink: "Abrir Meus leads",
  },
  {
    id: "onde-lembretes",
    pergunta: "Onde vejo meus lembretes?",
    resposta: "Na Agenda. Lá ficam os retornos e as visitas marcados, e o CRM avisa pelo WhatsApp na hora.",
    tela: "agenda",
    href: "/app/lembretes",
    rotuloLink: "Abrir a Agenda",
  },
  {
    id: "conversa-pessoal",
    pergunta: "O CRM lê minhas conversas pessoais?",
    resposta:
      "Não. Quem escreve depois que você liga o WhatsApp aparece em Contatos novos, com as últimas mensagens guardadas até você decidir, visíveis para você e para os gestores: se for pessoal, apagamos tudo, e sem decisão some em 7 dias. A IA só lê quem é lead: veio de anúncio ou do site, foi cadastrado no CRM ou você marcou com a etiqueta Lead OPA ou o botão É lead.",
    tela: "whatsapp",
    href: "/app/meu-whatsapp",
    rotuloLink: "Abrir Meu WhatsApp",
  },
  {
    id: "whatsapp-caiu",
    pergunta: "Como ligo meu WhatsApp de novo?",
    resposta: "Em Meu WhatsApp, toque em Reconectar. Se pedir, toque em Ler o código de novo e leia com o celular, em Aparelhos conectados.",
    tela: "whatsapp",
    href: "/app/meu-whatsapp",
    rotuloLink: "Abrir Meu WhatsApp",
  },
  {
    id: "aviso-opa-lembretes",
    pergunta: "Recebi uma mensagem do OPA Lembretes. O que é?",
    resposta:
      "É o número da OPA que avisa a equipe: prazo de resposta, lembretes e leads novos. Também avisa quando um lead que preencheu o formulário e está com outro corretor escreve para você: peça a ele para seguir a conversa com o número do corretor responsável. Não responda por ele: abra o CRM.",
    tela: "agenda",
  },
  {
    id: "esqueci-senha",
    pergunta: "Esqueci a senha.",
    resposta: "Na tela de entrada, toque em Esqueci minha senha e siga o e-mail que chegar. Se o e-mail não chegar, fale com o gestor.",
    tela: "comeco",
  },
  {
    id: "corretor-saiu",
    pergunta: "Um corretor saiu da equipe. E os leads dele?",
    resposta: "Ele sai da roleta e os leads abertos dele vêm para a gestão. Redistribua pela Fila da equipe.",
    tela: "equipe",
    href: "/app/fila",
    rotuloLink: "Abrir a Fila da equipe",
    soGestor: true,
  },
  {
    id: "trocar-papel",
    pergunta: "Como mudo o papel de alguém da equipe?",
    resposta:
      "Em Equipe, o administrador escolhe o novo papel ao lado do nome e toca em Salvar. Quem vira Gestor passa a ver a equipe toda; quem vira Leitura não muda mais nada.",
    tela: "equipe",
    href: "/app/membros",
    rotuloLink: "Abrir a Equipe",
    soGestor: true,
  },
];

/** Minúsculas e sem acento: "Roleta" e "roléta" acham a mesma coisa. */
export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export interface Topico {
  versao: VersaoTutorial;
  passo: PassoTutorial;
  indice: number;
}

/** Os passos que a pessoa pode abrir, cada um como tópico. */
export function topicosPermitidos(versoes: VersaoTutorial[]): Topico[] {
  return versoes.flatMap((versao) => PASSOS[versao].map((passo, indice) => ({ versao, passo, indice })));
}

export function duvidasPermitidas(versoes: VersaoTutorial[]): Duvida[] {
  return DUVIDAS.filter((d) => !d.soGestor || versoes.includes("gestor"));
}

/** Todas as palavras do termo precisam aparecer, sem acento e em qualquer ordem. */
function casa(termo: string, texto: string): boolean {
  const palavras = semAcento(termo).split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return true;
  const alvo = semAcento(texto);
  return palavras.every((p) => alvo.includes(p));
}

export function nomeDaTela(t: TelaTutorial): string {
  return TELAS.find((x) => x.id === t)?.nome ?? "";
}

export function buscarTutoriais(termo: string, versoes: VersaoTutorial[]): { topicos: Topico[]; duvidas: Duvida[] } {
  return {
    topicos: topicosPermitidos(versoes).filter(({ passo }) =>
      casa(termo, [nomeDaTela(passo.tela), passo.titulo, passo.texto, ...(passo.detalhes ?? [])].join(" ")),
    ),
    duvidas: duvidasPermitidas(versoes).filter((d) => casa(termo, [nomeDaTela(d.tela), d.pergunta, d.resposta].join(" "))),
  };
}

/** Agrupa tópicos por tela, na ordem de TELAS; telas sem tópico saem. */
export function agruparPorTela(topicos: Topico[]): Array<{ tela: (typeof TELAS)[number]; topicos: Topico[] }> {
  return TELAS.map((tela) => ({ tela, topicos: topicos.filter((t) => t.passo.tela === tela.id) })).filter((g) => g.topicos.length > 0);
}

/** Endereço que abre o tutorial direto num passo. */
export function linkDoPasso(versao: VersaoTutorial, passoId: string): string {
  return `/app/tutoriais?versao=${versao}&passo=${encodeURIComponent(passoId)}`;
}

/**
 * Lê `?passo=fila` (e `versao=`, opcional) e devolve a versão e o índice a
 * abrir. Sem versão no link, procura primeiro na versão do papel da pessoa.
 * Passo desconhecido ou versão não permitida: nada abre.
 */
export function lerDeepLink(
  params: { passo?: string | null; versao?: string | null },
  versoes: VersaoTutorial[],
  preferida: VersaoTutorial | null,
): { versao: VersaoTutorial; indice: number } | null {
  const passo = params.passo?.trim();
  if (!passo) return null;
  const pedida = params.versao === "corretor" || params.versao === "gestor" ? params.versao : null;
  if (params.versao && !pedida) return null;
  const ordem: VersaoTutorial[] = pedida ? [pedida] : [...(preferida ? [preferida] : []), ...versoes.filter((v) => v !== preferida)];
  for (const versao of ordem) {
    if (!versoes.includes(versao)) continue;
    const indice = PASSOS[versao].findIndex((p) => p.id === passo);
    if (indice >= 0) return { versao, indice };
  }
  return null;
}

/** Para o "?" do cabeçalho: a tela de uma rota. A rota mais específica ganha. */
export function telaDaRota(pathname: string): TelaTutorial | null {
  let melhor: { id: TelaTutorial; tam: number } | null = null;
  for (const t of TELAS)
    for (const r of t.rotas) {
      const bate = r.endsWith("/") ? pathname.startsWith(r) && pathname.length > r.length : pathname === r || pathname.startsWith(`${r}/`);
      if (bate && (!melhor || r.length > melhor.tam)) melhor = { id: t.id, tam: r.length };
    }
  return melhor?.id ?? null;
}

/** O passo daquela tela, na versão da pessoa primeiro. */
export function passoDaTela(
  tela: TelaTutorial,
  versoes: VersaoTutorial[],
  preferida: VersaoTutorial | null,
): { versao: VersaoTutorial; passoId: string } | null {
  const ordem = [...(preferida ? [preferida] : []), ...versoes.filter((v) => v !== preferida)];
  for (const versao of ordem) {
    if (!versoes.includes(versao)) continue;
    const passo = PASSOS[versao].find((p) => p.tela === tela);
    if (passo) return { versao, passoId: passo.id };
  }
  return null;
}
