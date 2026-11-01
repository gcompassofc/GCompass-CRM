import type { Role } from "@/lib/auth/types";

/**
 * Papéis que quem convida pode dar ao convidado (decisão da OPA, 01/11/2026).
 * O administrador convida qualquer papel humano. O gerente convida só corretores
 * (`agent`): ele não cria outro gerente nem outro administrador. A rota de convite
 * é quem aplica; a tela só espelha para não oferecer o que será recusado.
 */
export function papeisQueConvida(quem: Role): ReadonlyArray<"viewer" | "agent" | "manager" | "admin"> {
  if (quem === "admin") return ["agent", "viewer", "manager", "admin"];
  if (quem === "manager") return ["agent"];
  return [];
}

export function podeConvidarComo(quem: Role, papel: string): boolean {
  return (papeisQueConvida(quem) as ReadonlyArray<string>).includes(papel);
}
