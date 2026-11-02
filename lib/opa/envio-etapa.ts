/**
 * "Mandar para todos" da etapa (pedido do Kallyl, decisão do Allyson em 02/11/2026).
 *
 * Não é disparo: o CRM monta uma mensagem por lead e o corretor abre um por um
 * no WhatsApp dele (link wa.me), tocando em enviar no próprio aparelho. Nada sai
 * pelo servidor nem pelo WAHA. O número do corretor é WhatsApp não oficial, e
 * envio em massa por ele costuma terminar em bloqueio.
 *
 * Tudo aqui é função pura: a tela e a server action só juntam as peças.
 */

import type { Role } from "@/lib/auth/types";

/** Teto da lista de uma vez. Passou disso, a tela avisa e mostra os mais recentes. */
export const TETO_ENVIO = 100;

/** Marcador do texto livre, trocado pelo primeiro nome de cada lead. */
export const MARCADOR_NOME = "[nome]";

// ---------------------------------------------------------------- escopo

/**
 * De quem são os leads que a pessoa vê no Funil e no envio.
 *
 * Corretor: só os dele, sempre. O `?corretor=` da URL é do gestor e não vale
 * para o corretor; e o filtro não depende só da regra do banco, que deixa o
 * corretor ver a equipe toda se a conta mudar a visibilidade para "todos".
 * Gestor, administrador e leitura: o que o banco libera, com o filtro de
 * corretor opcional do cabeçalho.
 *
 * Devolve o id do dono a filtrar, ou `null` para não filtrar.
 */
export function escopoDoFunil(args: {
  role: Role | null | undefined;
  plataforma: boolean;
  userId: string;
  corretor?: string | null;
}): string | null {
  if (args.role === "agent" && !args.plataforma) return args.userId;
  return args.corretor || null;
}

// ---------------------------------------------------------------- lista

/** Linha que a server action lê de crm_leads (com o contato junto). */
export interface LinhaEnvio {
  id: string;
  title: string | null;
  owner_user_id: string | null;
  tags: string[] | null;
  contacts: { name: string | null; phone_number: string | null } | null;
}

export interface ItemEnvio {
  id: string;
  nome: string;
  primeiroNome: string;
  /** Só dígitos, pronto para o wa.me. `null` = sem número que dê para abrir. */
  telefone: string | null;
  offMarket: boolean;
}

/**
 * Monta a lista do envio. Filtra pelo dono de novo (além da consulta), para um
 * lead de outro corretor nunca entrar na lista, mesmo que o banco o devolva.
 */
export function montarListaDoEnvio(linhas: LinhaEnvio[], dono: string | null): ItemEnvio[] {
  return linhas
    .filter((l) => !dono || l.owner_user_id === dono)
    .map((l) => {
      const nome = limparNome(l.contacts?.name) || limparNome(l.title?.split(" · ")[0]) || "Lead";
      const tags = l.tags ?? [];
      return {
        id: l.id,
        nome,
        primeiroNome: primeiroNomeDoLead(nome),
        telefone: telefoneWhatsApp(l.contacts?.phone_number),
        offMarket: tags.includes("off-market-comprador") || tags.includes("off-market-proprietario"),
      };
    });
}

/** Valor cifrado (pii1.…) nunca vai para a tela como se fosse nome ou número. */
function cifrado(v: string): boolean {
  return v.startsWith("pii1.");
}

function limparNome(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  return t && !cifrado(t) ? t : "";
}

// ---------------------------------------------------------------- mensagem

/**
 * Primeiro nome para a saudação: a primeira palavra com letra, sem emoji nem
 * pontuação em volta. Nome todo em maiúscula ou minúscula ganha só a inicial
 * maiúscula ("JOÃO" e "joão" viram "João"); "McCartney" fica como está.
 */
export function primeiroNomeDoLead(nome: string | null | undefined): string {
  const palavra = limparNome(nome)
    .split(/\s+/)
    .map((p) => p.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ""))
    .find((p) => /\p{L}/u.test(p));
  if (!palavra) return "";
  const igual = palavra === palavra.toLowerCase() || palavra === palavra.toUpperCase();
  return igual ? palavra[0]!.toUpperCase() + palavra.slice(1).toLowerCase() : palavra;
}

/**
 * Troca `[nome]` pelo primeiro nome. Sem nome, o marcador sai e a frase é
 * arrumada: "Oi [nome], tudo bem?" vira "Oi, tudo bem?" e "[nome], vi que"
 * vira "Vi que".
 */
export function personalizar(texto: string, primeiroNome: string): string {
  const marcador = /\[\s*nome\s*\]/gi;
  if (primeiroNome) return texto.replace(marcador, primeiroNome);
  const sem = texto
    .replace(marcador, "")
    .replace(/[ \t]+([,.;:?])/g, "$1")
    .replace(/(^|\n)[ \t]*[,;:][ \t]*/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return sem.replace(/(^|\n)(\p{Ll})/gu, (_, quebra: string, letra: string) => quebra + letra.toUpperCase());
}

/**
 * Número para o wa.me: só dígitos, como a ficha do lead faz. Menos de 10
 * dígitos (sem DDD) ou valor cifrado = sem número, e a linha fica desabilitada.
 */
export function telefoneWhatsApp(telefone: string | null | undefined): string | null {
  const t = (telefone ?? "").trim();
  if (!t || cifrado(t)) return null;
  const digitos = t.replace(/\D/g, "");
  return digitos.length >= 10 && digitos.length <= 15 ? digitos : null;
}

export function linkWhatsApp(telefone: string, mensagem: string): string {
  return `https://wa.me/${telefone}?text=${encodeURIComponent(mensagem)}`;
}

/** Link ou valor por escrito: o que o lead off market não recebe (regra do Kit). */
export function temLinkOuValor(texto: string): boolean {
  return /https?:\/\/|www\.|\b[\w-]+\.com(\.br)?\b|R\$\s*\d|\d[\d.,]*\s*(mil|mi|milh[õo]es)\b/i.test(texto);
}

/** Lead que pode receber esta mensagem. Off market com link ou valor fica de fora. */
export function podeReceber(item: Pick<ItemEnvio, "telefone" | "offMarket">, texto: string): "ok" | "sem-numero" | "off-market" {
  if (!item.telefone) return "sem-numero";
  if (item.offMarket && temLinkOuValor(texto)) return "off-market";
  return "ok";
}

// ---------------------------------------------------------------- sugestões

/**
 * Sugestão curta por etapa, no tom do Kit: sem exclamação, uma pergunta no fim,
 * sem link e sem valor (a mesma mensagem vai para lead off market). Vai para a
 * etapa inteira, então não afirma nada que só vale para um lead.
 * `{corretor}` é o primeiro nome de quem envia.
 */
const SUGESTOES: Record<string, string> = {
  // Compradores
  "lead-recebido": "Oi [nome], aqui é {corretor}, da OPA. Para eu te ajudar melhor: a casa é para morar, para as temporadas ou para investir?",
  "primeiro-contato": "[nome], para eu separar as casas certas para você: vocês pensam em resolver isso para quando?",
  diagnostico: "[nome], com o que você me contou já dá para separar algumas casas. Posso te mandar por aqui?",
  selecao: "[nome], das casas que te mandei, qual você quer ver de perto?",
  "visita-agendada": "[nome], passando para confirmar nossa visita. Te mando a localização certinha antes. Segue de pé?",
  "visita-realizada": "[nome], obrigado pela visita. Do que você viu, o que mais pesou a favor e o que ficou faltando?",
  proposta: "[nome], sobre a proposta: tem algum ponto que você quer que eu leve ao proprietário?",
  negociacao: "[nome], quero te atualizar sobre a negociação. Fica melhor eu te ligar hoje ou amanhã?",
  fechamento: "[nome], sigo acompanhando a parte da documentação. Ficou alguma dúvida que eu possa resolver?",
  "sem-momento": "[nome], a busca pela casa na ilha segue ou ficou para outro momento?",
  // Captação de imóvel
  radar: "Oi [nome], aqui é {corretor}, da OPA. Queria entender o seu momento com o imóvel. Podemos conversar uns minutos esta semana?",
  contato: "Oi [nome], aqui é {corretor}, da OPA. Queria entender melhor o seu imóvel. Qual o melhor horário para conversarmos?",
  triagem: "[nome], para eu preparar a avaliação, preciso conhecer o imóvel. Qual dia fica bom para você?",
  "visita-avaliacao": "[nome], passando para confirmar a visita de avaliação. Segue de pé?",
  parecer: "[nome], o parecer de preço do seu imóvel está pronto. Prefere que eu te explique por ligação ou por aqui?",
  "proposta-trabalho": "[nome], ficou alguma dúvida sobre a proposta de trabalho que te mandei?",
  contrato: "[nome], o contrato está pronto para a sua leitura. Posso te mandar por aqui?",
  publicado: "[nome], seu imóvel já está no ar. Quer que eu te mande o link para conferir?",
  // Relacionamento com proprietário
  observacao: "[nome], sigo acompanhando os contatos e as visitas do seu imóvel. Quer que eu te mande um resumo desta semana?",
  "parecer-enviado": "[nome], ficou alguma dúvida sobre o parecer que te mandei?",
  "ajuste-proposto": "[nome], conseguiu pensar no ajuste que conversamos?",
  "ajuste-aplicado": "[nome], o ajuste já está no ar. Quer que eu te conte como os contatos andaram na próxima semana?",
  "sem-tracao": "[nome], queria conversar sobre o próximo passo do seu imóvel. Fica bom falarmos esta semana?",
};

const SUGESTAO_PADRAO = "[nome], fiquei de te retornar. Tem alguma dúvida que eu possa resolver agora?";

export function sugestaoDaEtapa(slug: string, corretor: string): string {
  const quem = primeiroNomeDoLead(corretor);
  const texto = SUGESTOES[slug] ?? SUGESTAO_PADRAO;
  return quem ? texto.replace("{corretor}", quem) : texto.replace("aqui é {corretor}, da OPA", "aqui é da equipe da OPA");
}
