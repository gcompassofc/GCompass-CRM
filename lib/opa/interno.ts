/**
 * Número interno da própria OPA (pedido do Allyson, 12/11/2026).
 *
 * O OPA Lembretes avisa os corretores pelo WhatsApp e, em 10/11/2026, um aviso
 * virou lead no número da Luana. O lead foi encerrado sem apagar nada, mas lead
 * encerrado continua contando no Início, no Dashboard e no relatório do mês
 * (recebidos, prazo e tempo de resposta, perdidos por motivo).
 *
 * Lead com a etiqueta `interno` não é cliente: fica fora dessas contas. Ele
 * continua existindo e aparece na lista de leads e na ficha, como qualquer outro.
 */
export const TAG_INTERNO = "interno";

export function ehInterno(tags: readonly string[] | null | undefined): boolean {
  return (tags ?? []).includes(TAG_INTERNO);
}
