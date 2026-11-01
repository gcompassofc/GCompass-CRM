import type { Role } from "@/lib/auth/types";

/**
 * Quem pode abrir o QR, reconectar ou desconectar um número de WhatsApp.
 * O dono da sessão (o corretor que a conectou) e o administrador. Gerente e
 * corretor não mexem no número de outra pessoa.
 */
export function podeMexerNoNumero(args: {
  papel: Role;
  souPlatformAdmin?: boolean;
  userId: string;
  donoDaSessao: string | null | undefined;
}): boolean {
  if (args.souPlatformAdmin || args.papel === "admin") return true;
  if (args.papel === "viewer" || args.papel === "ai_operator") return false;
  return Boolean(args.donoDaSessao) && args.donoDaSessao === args.userId;
}

/** O QR segue a mesma regra de reconectar. */
export const podeAbrirQr = podeMexerNoNumero;
