/**
 * Quem precisa ter o WhatsApp conectado (pedido do Allyson, 12/11/2026).
 *
 * O corretor atende lead pelo próprio número: sem ele conectado, falta algo.
 * Gestor e administrador não precisam: só entram na conta quando conectaram
 * (o Marco, gestor que também atende). Assim a tela diz "5 de 5" com cinco
 * corretores, e não "5 de 6" por causa de um acesso da gestão sem número.
 *
 * Número sem dono conhecido (sessão antiga achada pelo nome) conta como de corretor.
 */

export type Papel = "viewer" | "agent" | "manager" | "admin" | string;

export function precisaDeWhatsApp(papel: Papel | null | undefined, conectado: boolean): boolean {
  if (conectado) return true;
  if (papel === "manager" || papel === "admin" || papel === "viewer") return false;
  return true;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Papel de quem é dono de um número: pelo dono (owner_user_id); número antigo sem
 * dono, pelo nome igual ao de alguém da equipe (ex. "growthcompassofc"). Sem achar, null (conta como corretor).
 */
export function papelDoNumero(
  s: { owner_user_id: string | null; display_name: string | null },
  equipe: Array<{ id: string; nome: string; papel: string }>,
): string | null {
  if (s.owner_user_id) return equipe.find((p) => p.id === s.owner_user_id)?.papel ?? null;
  const nome = semAcento(s.display_name ?? "");
  if (!nome) return null;
  return equipe.find((p) => semAcento(p.nome) === nome)?.papel ?? null;
}

/** "X de Y": conectados sobre quem precisa estar conectado. */
export function contagemDeWhatsApp<T>(itens: T[], papelDe: (i: T) => Papel | null | undefined, conectadoDe: (i: T) => boolean): { conectados: number; total: number } {
  const contam = itens.filter((i) => precisaDeWhatsApp(papelDe(i), conectadoDe(i)));
  return { conectados: contam.filter(conectadoDe).length, total: contam.length };
}
