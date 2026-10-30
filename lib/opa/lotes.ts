/**
 * Consultas que crescem com a base (teste de carga de 30/10/2026).
 *
 * Duas armadilhas do PostgREST que só aparecem com a base grande:
 *  - `.in("coluna", ids)` vai inteiro no endereço da requisição: com algumas
 *    centenas de UUIDs o servidor responde "URI too long" e a consulta volta vazia;
 *  - toda consulta para em 1.000 linhas (max_rows), sem avisar.
 */

type Resposta<R> = { data: R[] | null; error: { message: string } | null };

/** Roda a consulta em lotes de `tamanho` ids (em paralelo) e junta o resultado. */
export async function emLotes<T, R>(
  itens: T[],
  consulta: (lote: T[]) => PromiseLike<Resposta<R>>,
  tamanho = 150,
): Promise<R[]> {
  if (itens.length === 0) return [];
  const lotes: T[][] = [];
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho));
  const respostas = await Promise.all(lotes.map((l) => consulta(l)));
  const tudo: R[] = [];
  for (const r of respostas) {
    if (r.error) throw new Error(r.error.message);
    tudo.push(...(r.data ?? []));
  }
  return tudo;
}

/** Busca todas as páginas de uma consulta ordenada, de 1.000 em 1.000. */
export async function todasAsPaginas<R>(
  pagina: (de: number, ate: number) => PromiseLike<Resposta<R>>,
  tamanho = 1000,
  teto = 20_000,
): Promise<R[]> {
  const tudo: R[] = [];
  for (let de = 0; de < teto; de += tamanho) {
    const r = await pagina(de, de + tamanho - 1);
    if (r.error) throw new Error(r.error.message);
    const linhas = r.data ?? [];
    tudo.push(...linhas);
    if (linhas.length < tamanho) break;
  }
  return tudo;
}
