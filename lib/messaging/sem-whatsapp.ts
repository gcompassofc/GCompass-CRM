/**
 * `messages.error_code` de quando o canal afirma que o número não tem conta
 * (consulta antes do primeiro envio, `ChannelAdapter.checkRecipient`).
 *
 * Fica num arquivo próprio, sem dependência, porque três pontas leem o mesmo
 * texto: o envio (grava), as boas-vindas (explicam no histórico do lead) e o
 * aviso acima da caixa de mensagem (tela).
 */
export const NUMERO_SEM_WHATSAPP = "numero_sem_whatsapp";
