/**
 * Comprador ou vendedor: na OPA isso é o funil do lead (pedido do Allyson,
 * 05/11/2026). Todo lead entra como comprador, e quem quer vender precisa passar
 * para a Captação sem apagar nada. Só regra, sem banco: quem grava é a ação
 * mudarTipoDoLead, em app/app/leads/actions.ts.
 */

export type TipoDeLead = "comprador" | "vendedor";

export const TIPOS_DE_LEAD: Record<TipoDeLead, { rotulo: string; funil: string; etapa: string }> = {
  comprador: { rotulo: "Comprador", funil: "compradores", etapa: "lead-recebido" },
  vendedor: { rotulo: "Vendedor", funil: "captacao", etapa: "contato" },
};

/** Relacionamento com proprietário também é vendedor: só Compradores é comprador. */
export function tipoDoFunil(slug: string | null | undefined): TipoDeLead {
  return slug === "compradores" ? "comprador" : "vendedor";
}

export function ehTipoDeLead(v: unknown): v is TipoDeLead {
  return v === "comprador" || v === "vendedor";
}
