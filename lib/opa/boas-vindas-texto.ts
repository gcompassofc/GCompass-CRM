/**
 * Texto da boas-vindas ao lead de formulário, pelo número do corretor da vez
 * (#498, especificação em opa/Tracking/37-boas-vindas-pelo-numero-do-corretor.md).
 *
 * Modelo único com variáveis; o gestor muda o texto em Configurações > Mensagens.
 * Sem imports com alias "@/" (testável sem Next).
 */

export const MODELO_BOAS_VINDAS =
  "Oi {primeiro_nome}, tudo bem? Aqui é {corretor}, da OPA. {tipo_imovel} {de_onde} {situacao}. Para eu te ajudar melhor: {tipo_imovel_minusculo} é para morar, para as temporadas ou para investir?";

/** Variáveis que o modelo aceita, com o exemplo que a tela de Configurações mostra. */
export const VARIAVEIS_BOAS_VINDAS: Array<[string, string]> = [
  ["{primeiro_nome}", "primeiro nome do lead"],
  ["{corretor}", "primeiro nome do corretor da vez"],
  ["{tipo_imovel}", "\"A casa\", \"O apartamento\"... pelo código do imóvel"],
  ["{tipo_imovel_minusculo}", "o mesmo, com inicial minúscula"],
  ["{de_onde}", "\"do anúncio\" ou \"que você viu no site\""],
  ["{situacao}", "\"está disponível\" ou \"saiu do site, mas tenho opções parecidas\""],
];

const TIPOS: Record<string, string> = {
  CA: "A casa",
  AP: "O apartamento",
  TE: "O terreno",
  CH: "A chácara",
  CO: "O comercial",
};

export function tipoDoImovel(codigo: string | null | undefined): string {
  const prefixo = (codigo ?? "").trim().slice(0, 2).toUpperCase();
  return TIPOS[prefixo] ?? "O imóvel";
}

function primeiraPalavra(nome: string | null | undefined): string {
  const p = (nome ?? "").trim().split(/\s+/)[0] ?? "";
  if (!p) return "";
  return p[0]!.toUpperCase() + p.slice(1).toLowerCase();
}

export interface DadosBoasVindas {
  modelo?: string | null;
  nomeLead: string | null | undefined;
  corretor: string;
  imovelCodigo: string | null | undefined;
  /** "meta" = formulário do anúncio; "site" = formulário do site. */
  canal: "meta" | "site";
  /** O imóvel está no site agora? false = vendido ou fora do ar. */
  publicado: boolean;
}

/** Monta a mensagem. Uma linha só, sem link, sem emoji, sem travessão. */
export function montarBoasVindas(d: DadosBoasVindas): string {
  const tipo = tipoDoImovel(d.imovelCodigo);
  const nome = primeiraPalavra(d.nomeLead);
  const valores: Record<string, string> = {
    "{tipo_imovel}": tipo,
    "{tipo_imovel_minusculo}": tipo[0]!.toLowerCase() + tipo.slice(1),
    "{corretor}": primeiraPalavra(d.corretor) || "a equipe",
    "{de_onde}": d.canal === "site" ? "que você viu no site" : "do anúncio",
    "{situacao}": d.publicado ? "está disponível" : "saiu do site, mas tenho opções parecidas",
  };
  let texto = (d.modelo?.trim() || MODELO_BOAS_VINDAS).replace(/\r?\n+/g, " ");
  // Sem nome: "Oi, tudo bem?" (a vírgula fica no lugar certo).
  texto = nome ? texto.split("{primeiro_nome}").join(nome) : texto.replace(/\s*\{primeiro_nome\}\s*,?/g, ",").replace(/^(\S+?),+/, "$1,");
  for (const [k, v] of Object.entries(valores)) texto = texto.split(k).join(v);
  return texto.replace(/\s{2,}/g, " ").replace(/\s+([,.?!])/g, "$1").trim();
}
