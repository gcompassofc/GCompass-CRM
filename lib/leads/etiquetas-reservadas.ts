/**
 * Etiquetas de regra do CRM da OPA: mudam a roleta e o prazo de resposta.
 * `proprio` tira o lead do repasse; `pago` e `organico` escolhem a trilha de prazo.
 * Só o servidor (entrada de lead) e gerente para cima as gravam ou tiram; o banco
 * repete a regra no gatilho `trg_protege_etiquetas_reservadas` (migration 0121).
 */
export const ETIQUETAS_RESERVADAS = ["proprio", "pago", "organico"] as const;

const RESERVADAS = new Set<string>(ETIQUETAS_RESERVADAS);

/** A operação adiciona ou remove alguma etiqueta de regra? */
export function tocaEtiquetaReservada(adicionar: readonly string[] = [], remover: readonly string[] = []): boolean {
  return [...adicionar, ...remover].some((t) => RESERVADAS.has(t.trim().toLowerCase()));
}
