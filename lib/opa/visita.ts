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
