/**
 * Ficha de visita: confere no servidor os campos que a empresa marcou como
 * obrigatórios em Configurações > Ficha de visita. Antes só o navegador cobrava
 * (atributo `required`); a ação fixava interesse, "gostou" e "não gostou".
 */
import type { CampoVisita } from "./config";

/** Nome do campo no formulário de cada campo da ficha. */
const CAMPO_DO_FORMULARIO: Record<string, string> = {
  quando: "quando",
  imovel: "imovel",
  quem: "quem",
  chegada: "chegada",
  interesse: "interesse",
  gostou: "gostou",
  naogostou: "nao_gostou",
  objecao: "objecao",
  proximo: "proximo",
  obs: "obs",
};

/** O que existe numa visita só agendada: o resto é de quem já visitou. */
const NA_AGENDADA = new Set(["quando", "imovel"]);

/** Mensagem com os campos obrigatórios que faltam, ou null se está tudo. Campo extra criado pela empresa não tem coluna e fica de fora. */
export function faltaNaFicha(
  campos: CampoVisita[],
  valor: (campoDoFormulario: string) => string,
  status: "feita" | "agendada",
): string | null {
  const faltando = campos
    .filter((c) => c.obrigatorio && Object.hasOwn(CAMPO_DO_FORMULARIO, c.chave) && (status === "feita" || NA_AGENDADA.has(c.chave)))
    .filter((c) => !valor(CAMPO_DO_FORMULARIO[c.chave]!).trim())
    .map((c) => c.rotulo);
  return faltando.length ? `Falta preencher: ${faltando.join(", ")}.` : null;
}

/**
 * Data, hora e texto da ficha (F5 da revisão de 31/10). Fica aqui para a ficha
 * rápida conferir tudo ANTES de criar o lead: antes, uma data errada era recusada
 * só depois, e o lead novo ficava criado sem a visita.
 *
 * O campo datetime-local vem sem fuso: é hora de Ilhabela (-03:00).
 */
export function conferirDataETexto(
  valor: (campoDoFormulario: string) => string,
  status: "feita" | "agendada",
  agora = Date.now(),
): { ok: true; quandoMs: number } | { ok: false; erro: string } {
  const quando = valor("quando").trim();
  if (!quando) return { ok: false, erro: "Informe a data e a hora." };
  const quandoIso = /([zZ]|[+-]\d\d:\d\d)$/.test(quando) ? quando : `${quando.length === 16 ? `${quando}:00` : quando}-03:00`;
  const quandoMs = Date.parse(quandoIso);
  if (Number.isNaN(quandoMs)) return { ok: false, erro: "Data inválida." };
  if (status === "feita" && quandoMs > agora + 10 * 60_000) {
    return { ok: false, erro: "Visita feita não fica no futuro. Para depois, use Agendar visita." };
  }
  if (quandoMs < agora - 90 * 86_400_000) return { ok: false, erro: "Visita de mais de 90 dias atrás não entra." };
  // Regra do Painel: telefone não vai no texto da ficha (o contato já está no lead).
  // Até dois separadores entre dígitos: "(12) 99123-4567" também conta.
  const comTelefone = ["quem", "gostou", "nao_gostou", "objecao", "obs"].some((k) => /(?:\+?\d[\s().-]{0,2}){10,}/.test(valor(k)));
  if (comTelefone) return { ok: false, erro: "Tire o telefone do texto: o contato do cliente já fica no lead." };
  return { ok: true, quandoMs };
}
