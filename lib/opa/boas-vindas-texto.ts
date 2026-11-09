/**
 * Texto da boas-vindas ao lead de formulário, pelo número do corretor da vez
 * (#498, especificação em opa/Tracking/37-boas-vindas-pelo-numero-do-corretor.md).
 *
 * Modelo único com variáveis; o gestor muda o texto em Configurações > Mensagens.
 * Sem imports com alias "@/" (testável sem Next).
 *
 * Versão de 09/11/2026 (Kallyl): o formulário já pergunta a finalidade e a relação
 * com Ilhabela, então a mensagem não pergunta de novo. Ela repete o que a pessoa
 * respondeu e pergunta da visita; e diz o imóvel com o bairro e o código.
 */

export const MODELO_BOAS_VINDAS =
  "Oi {primeiro_nome}, tudo bem? Aqui é {corretor}, da OPA. {tipo_imovel} {do_bairro}, código {codigo}, {situacao}. {vi_no_formulario} Para eu te ajudar melhor: você já tem uma data em mente para vir conhecer?";

/** O modelo anterior (até 09/11/2026). Conta salva com ele passa a usar o novo. */
export const MODELO_ANTERIOR =
  "Oi {primeiro_nome}, tudo bem? Aqui é {corretor}, da OPA. {tipo_imovel} {de_onde} {situacao}. Para eu te ajudar melhor: {tipo_imovel_minusculo} é para morar, para as temporadas ou para investir?";

/** Variáveis que o modelo aceita, com o exemplo que a tela de Configurações mostra. */
export const VARIAVEIS_BOAS_VINDAS: Array<[string, string]> = [
  ["{primeiro_nome}", "primeiro nome do lead"],
  ["{corretor}", "primeiro nome do corretor da vez"],
  ["{tipo_imovel}", "\"A casa\", \"O apartamento\"... pelo código do imóvel"],
  ["{tipo_imovel_minusculo}", "o mesmo, com inicial minúscula"],
  ["{do_bairro}", "\"do Siriúba\", \"da Barra Velha\"; sem bairro, \"do anúncio\" ou \"que você viu no site\""],
  ["{bairro}", "o bairro do imóvel"],
  ["{codigo}", "o código do imóvel (CA006779)"],
  ["{de_onde}", "\"do anúncio\" ou \"que você viu no site\""],
  ["{situacao}", "\"está disponível\" ou \"saiu do site, mas tenho opções parecidas\""],
  ["{vi_no_formulario}", "\"Vi no formulário que você...\" com a relação com Ilhabela e a finalidade; some se faltar resposta"],
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

/** "casa", "apartamento"... sem artigo, para "busca casa para morar". */
function substantivo(codigo: string | null | undefined): string {
  return tipoDoImovel(codigo).replace(/^(A|O) /, "").toLowerCase();
}

/** Bairro com artigo: "do Siriúba", "da Barra Velha". */
export function doBairro(bairro: string): string {
  const b = bairro.trim();
  const feminino = /^(praia|barra|ponta|ilha|armação|feiticeira|água|costa|vila|reserva|santa|fome|serraria|figueira)(\s|$)/iu.test(b);
  return `${feminino ? "da" : "do"} ${b}`;
}

/** Relação com Ilhabela, como o formulário manda (valor) ou como a ficha mostra (texto). */
const RELACAO: Record<string, string> = {
  tem_imovel: "tem ou sua família tem imóvel na ilha",
  "tenho ou minha família tem imóvel na ilha": "tem ou sua família tem imóvel na ilha",
  venho_todo_ano: "vem todo ano a Ilhabela",
  "venho todo ano": "vem todo ano a Ilhabela",
  ja_vim_algumas: "já veio algumas vezes a Ilhabela",
  "já vim algumas vezes": "já veio algumas vezes a Ilhabela",
  nunca_vim: "ainda não conhece Ilhabela",
  "nunca vim": "ainda não conhece Ilhabela",
};

/** Finalidade: o complemento de "busca {imóvel} ...". "Ainda não sei" não entra. */
const FINALIDADE: Record<string, string> = {
  moradia: "para morar",
  veraneio: "para passar temporadas",
  moradia_veraneio: "para morar ou passar temporadas",
  "moradia ou veraneio": "para morar ou passar temporadas",
  temporada: "para as temporadas",
  "para as temporadas": "para as temporadas",
  investimento: "para investir",
};

const chave = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** "Vi no formulário que você já veio algumas vezes a Ilhabela e busca casa para morar." ou "". */
export function frasesDoFormulario(respostas: { relacao?: string | null; finalidade?: string | null }, codigo: string | null | undefined): string {
  const relacao = RELACAO[chave(respostas.relacao)];
  const fim = FINALIDADE[chave(respostas.finalidade)];
  const busca = fim ? `busca ${substantivo(codigo)} ${fim}` : null;
  const partes = [relacao, busca].filter(Boolean);
  return partes.length ? `Vi no formulário que você ${partes.join(" e ")}.` : "";
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
  /** Bairro do imóvel (da carteira). */
  bairro?: string | null;
  /** "meta" = formulário do anúncio; "site" = formulário do site. */
  canal: "meta" | "site";
  /** O imóvel está no site agora? false = vendido ou fora do ar. */
  publicado: boolean;
  /** Respostas do formulário: relação com Ilhabela e finalidade (valor ou texto). */
  respostas?: { relacao?: string | null; finalidade?: string | null };
}

/** Monta a mensagem. Uma linha só, sem link, sem emoji, sem travessão. */
export function montarBoasVindas(d: DadosBoasVindas): string {
  const tipo = tipoDoImovel(d.imovelCodigo);
  const nome = primeiraPalavra(d.nomeLead);
  const deOnde = d.canal === "site" ? "que você viu no site" : "do anúncio";
  const bairro = d.bairro?.trim() || "";
  const valores: Record<string, string> = {
    "{tipo_imovel}": tipo,
    "{tipo_imovel_minusculo}": tipo[0]!.toLowerCase() + tipo.slice(1),
    "{corretor}": primeiraPalavra(d.corretor) || "a equipe",
    "{do_bairro}": bairro ? doBairro(bairro) : deOnde,
    "{bairro}": bairro,
    "{de_onde}": deOnde,
    "{situacao}": d.publicado ? "está disponível" : "saiu do site, mas tenho opções parecidas",
    "{vi_no_formulario}": frasesDoFormulario(d.respostas ?? {}, d.imovelCodigo),
  };
  const salvo = d.modelo?.trim();
  let texto = (salvo && salvo !== MODELO_ANTERIOR ? salvo : MODELO_BOAS_VINDAS).replace(/\r?\n+/g, " ");
  // Sem código: some o ", código {codigo}" inteiro.
  const codigo = (d.imovelCodigo ?? "").trim();
  texto = codigo ? texto.split("{codigo}").join(codigo) : texto.replace(/,\s*código\s*\{codigo\}\s*,/g, "").replace(/,?\s*código\s*\{codigo\}/g, "").split("{codigo}").join("");
  // Sem nome: "Oi, tudo bem?" (a vírgula fica no lugar certo).
  texto = nome ? texto.split("{primeiro_nome}").join(nome) : texto.replace(/\s*\{primeiro_nome\}\s*,?/g, ",").replace(/^(\S+?),+/, "$1,");
  for (const [k, v] of Object.entries(valores)) texto = texto.split(k).join(v);
  return texto.replace(/\s{2,}/g, " ").replace(/\s+([,.?!])/g, "$1").replace(/,\s*,/g, ",").trim();
}
