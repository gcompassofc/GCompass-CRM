/**
 * Temperatura da conversa — o vocabulário que o app de celular usa para dizer,
 * de relance, o que está pegando fogo.
 *
 * Por que isto existe como módulo, e não como um `if` dentro do componente:
 * três telas do celular (lista, cabeçalho da conversa e ficha do lead) mostram
 * a MESMA temperatura. Quando a regra vivia em cada uma delas, as três
 * divergiam — e divergir aqui é pior que em outros lugares, porque o operador
 * usa a cor para decidir quem atender primeiro.
 *
 * A temperatura é CALCULADA, nunca uma coluna (doutrina DIRC — "C" de
 * Calcular): ela é função do status e de há quanto tempo o cliente espera.
 * Guardá-la em `conversations` criaria um campo que só um cron manteria vivo,
 * que é exatamente o anti-pattern nº 5 do CLAUDE.md.
 *
 * A cor NUNCA viaja sozinha. Todo lugar que pinta a bolinha também escreve o
 * rótulo: quem não distingue laranja de amarelo continua sabendo o que é
 * urgente. Só a cor seria informação perdida (WCAG 1.4.1).
 */

export type Temperatura = "quente" | "morno" | "frio" | "fechado";

export interface TemperaturaMeta {
  key: Temperatura;
  label: string;
  /** Token CSS do escopo `.mobile-shell`. */
  color: string;
  /** Lido por leitor de tela no lugar da bolinha. */
  descricao: string;
}

export const TEMPERATURA_META: Record<Temperatura, TemperaturaMeta> = {
  quente: {
    key: "quente",
    label: "Quente",
    color: "var(--m-quente)",
    descricao: "Cliente esperando resposta agora",
  },
  morno: {
    key: "morno",
    label: "Morno",
    color: "var(--m-morno)",
    descricao: "Conversa em andamento",
  },
  frio: {
    key: "frio",
    label: "Frio",
    color: "var(--m-frio)",
    descricao: "Sem movimento recente",
  },
  fechado: {
    key: "fechado",
    label: "Fechado",
    color: "var(--m-fechado)",
    descricao: "Atendimento encerrado",
  },
};

/** Minutos desde a última entrada do cliente que ainda contam como "quente". */
const QUENTE_ATE_MIN = 60;
/** Acima disto a conversa esfriou de vez. */
const MORNO_ATE_MIN = 60 * 24;

interface EntradaTemperatura {
  status: string | null | undefined;
  /** Última mensagem RECEBIDA do cliente. É ela que gera a espera. */
  last_inbound_at?: string | null;
  last_message_at?: string | null;
  created_at?: string | null;
}

/**
 * Regra, em uma frase: conversa fechada é fechada; fora isso, a temperatura é
 * a idade da espera do cliente.
 *
 * Usa `last_inbound_at` e cai para `last_message_at` só se ele não vier — o
 * que importa é há quanto tempo O CLIENTE espera, não há quanto tempo alguém
 * digitou. Uma conversa onde o atendente acabou de responder e o cliente
 * sumiu há dois dias está fria, mesmo com `last_message_at` recente.
 */
export function temperaturaDaConversa(c: EntradaTemperatura): Temperatura {
  if (c.status === "closed" || c.status === "archived") return "fechado";

  const desde = c.last_inbound_at ?? c.last_message_at ?? c.created_at ?? null;
  if (!desde) return "frio";

  const minutos = (Date.now() - new Date(desde).getTime()) / 60000;
  if (Number.isNaN(minutos)) return "frio";
  if (minutos <= QUENTE_ATE_MIN) return "quente";
  if (minutos <= MORNO_ATE_MIN) return "morno";
  return "frio";
}

export function metaDaConversa(c: EntradaTemperatura): TemperaturaMeta {
  return TEMPERATURA_META[temperaturaDaConversa(c)];
}

/**
 * Cor determinística do avatar a partir do id do contato.
 *
 * Paleta fechada e escolhida à mão para contrastar com texto branco — gerar
 * matiz por hash livre produz, de vez em quando, um amarelo onde o nome some.
 */
const AVATAR_CORES = [
  "#7C5CFC",
  "#4DA3FF",
  "#34D399",
  "#FFC24C",
  "#FF7A45",
  "#F472B6",
  "#22D3EE",
  "#A78BFA",
] as const;

export function corDoAvatar(seed: string | null | undefined): string {
  const s = seed ?? "";
  if (!s) return "#3A3F52";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVATAR_CORES[h % AVATAR_CORES.length]!;
}

/** Iniciais para o avatar. Cai para o telefone quando não há nome. */
export function iniciais(nome: string | null | undefined, fallback: string): string {
  const v = (nome ?? "").trim();
  if (!v) return fallback.replace(/\D/g, "").slice(-2) || "?";
  const partes = v.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return fallback.slice(0, 2).toUpperCase();
  if (partes.length === 1) return (partes[0] ?? "").slice(0, 2).toUpperCase();
  return ((partes[0]?.[0] ?? "") + (partes[partes.length - 1]?.[0] ?? "")).toUpperCase();
}
