/**
 * "Lembrar de mim" (pedido do Allyson, 03/11/2026): marcado no login, a sessão
 * fica salva no aparelho por 30 dias contados do login; desmarcado, os cookies
 * de sessão morrem quando o navegador fecha.
 *
 * O cookie `opa-lembrar` guarda só a data em que a lembrança vence (segundos
 * desde 1970). Não é credencial: mexer nele muda quanto tempo o PRÓPRIO
 * navegador guarda os cookies, e o servidor segue validando o JWT a cada pedido.
 *
 * Os clientes do Supabase (lib/supabase/server.ts e proxy.ts) passam todo cookie
 * de sessão por `opcoesDeSessao`, porque o @supabase/ssr força 400 dias em cada
 * gravação. Só Web Crypto/API padrão: roda no proxy (edge) e no servidor.
 */
export const COOKIE_LEMBRAR = "opa-lembrar";
export const LEMBRAR_DIAS = 30;
const LEMBRAR_SEGUNDOS = LEMBRAR_DIAS * 24 * 60 * 60;

/** Valor novo do cookie, gravado no login com "Lembrar de mim" marcado. */
export function novoLembrar(agoraMs = Date.now()): { valor: string; maxAge: number } {
  return { valor: String(Math.floor(agoraMs / 1000) + LEMBRAR_SEGUNDOS), maxAge: LEMBRAR_SEGUNDOS };
}

/** Segundos que ainda faltam da lembrança, ou null (sem lembrança ou vencida). */
export function restanteDoLembrar(valor: string | null | undefined, agoraMs = Date.now()): number | null {
  if (!valor || !/^\d{9,11}$/.test(valor)) return null;
  const resta = Number(valor) - Math.floor(agoraMs / 1000);
  if (resta <= 0) return null;
  return Math.min(resta, LEMBRAR_SEGUNDOS);
}

/**
 * Ajusta a validade de um cookie de sessão: com lembrança, vence junto com ela;
 * sem, vira cookie de sessão do navegador. Remoção (maxAge 0) passa intacta.
 */
export function opcoesDeSessao<T extends { maxAge?: number; expires?: Date }>(options: T, restante: number | null): T {
  if (options.maxAge === 0) return options;
  const { maxAge: _maxAge, expires: _expires, ...resto } = options;
  void _maxAge;
  void _expires;
  return (restante ? { ...resto, maxAge: restante } : resto) as T;
}
