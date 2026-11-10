/**
 * O lead preencheu um formulário? (pedido do Allyson, 10/11/2026)
 *
 * Formulário = entrou pela porta de entrada com canal "meta" (formulário do anúncio)
 * ou "site" (formulário do site). Lead que nasceu de conversa no WhatsApp do corretor
 * guarda `via: "whatsapp"` mesmo quando veio de anúncio (clique para WhatsApp): esse
 * escreveu primeiro, não preencheu nada.
 *
 * Duas regras usam isto:
 *  - a boas-vindas automática só sai para lead de formulário (lib/opa/boas-vindas.ts);
 *  - o aviso "esse lead está com outro corretor" (lib/opa/aviso-outro-corretor.ts).
 *
 * Só regra, sem banco e sem import com alias "@/": testável sem Next.
 */

interface OrigemGravada {
  canal?: string | null;
  via?: string | null;
}

/** A origem (custom_fields.origem ou custom_fields.voltou.origem) é de formulário? */
export function origemDeFormulario(origem: unknown): boolean {
  const o = (origem ?? {}) as OrigemGravada;
  return (o.canal === "meta" || o.canal === "site") && o.via !== "whatsapp";
}

/** O lead NASCEU de formulário (é o caso da boas-vindas). `source` cobre lead antigo sem origem gravada. */
export function veioDeFormulario(campos: Record<string, unknown> | null | undefined, source?: string | null): boolean {
  const origem = (campos ?? {}).origem;
  if (origem && typeof origem === "object") return origemDeFormulario(origem);
  return source === "meta" || source === "site";
}

/** O lead preencheu formulário em algum momento: nasceu de um, ou voltou por um. */
export function preencheuFormulario(campos: Record<string, unknown> | null | undefined, source?: string | null): boolean {
  if (veioDeFormulario(campos, source)) return true;
  const voltou = (campos ?? {}).voltou as { origem?: unknown } | undefined;
  return origemDeFormulario(voltou?.origem);
}

export interface LeadAbertoDoContato {
  id: string;
  owner_user_id: string | null;
  source?: string | null;
  custom_fields: Record<string, unknown> | null;
}

/**
 * Dos leads abertos de quem escreveu, o que está com OUTRO corretor e preencheu
 * formulário. Se algum lead aberto dessa pessoa é de quem recebeu a mensagem, não há
 * o que avisar (é a vez dele).
 */
export function leadComOutroCorretor<T extends LeadAbertoDoContato>(leads: T[], receptorId: string): T | null {
  if (leads.some((l) => l.owner_user_id === receptorId)) return null;
  return leads.find((l) => l.owner_user_id && preencheuFormulario(l.custom_fields, l.source)) ?? null;
}
