/**
 * Respostas do formulário (Meta ou site) que o painel de tracking manda na porta
 * de entrada (#516, item 8, pedido do Kallyl em 06/11/2026).
 *
 * O painel manda as respostas pelo valor da opção (`ainda_nao_sei`, `tem_imovel`)
 * e mistura chaves técnicas (`meta_campanha_nome`, `meta_lead_id`). Aqui a resposta
 * vira pergunta por extenso e resposta legível, na ordem do formulário, e o que
 * couber pré-preenche o diagnóstico sem nunca apagar o que o corretor já anotou.
 *
 * Sem imports com alias "@/": o seed roda pelo tsx, fora do Next.
 */

export interface RespostaDoFormulario {
  chave: string;
  pergunta: string;
  resposta: string;
}

/** Perguntas do "FORMULÁRIO PADRÃO OPA (CRM)" e do questionário do site, na ordem em que aparecem. */
export const PERGUNTAS: Array<[string, string]> = [
  ["finalidade", "Qual a finalidade da busca?"],
  ["relacao_ilhabela", "Qual é a sua relação com Ilhabela hoje?"],
  ["historia_ilhabela", "Conta um pouco: como é Ilhabela na sua vida hoje e o que você espera viver aqui com a sua família?"],
  ["momento", "Para quando você pensa em comprar?"],
  ["mensagem", "Mensagem"],
];

/** Valor da opção -> texto que a pessoa viu no formulário. */
export const OPCOES: Record<string, string> = {
  ainda_nao_sei: "Ainda não sei",
  moradia_veraneio: "Moradia ou veraneio",
  moradia: "Moradia",
  veraneio: "Veraneio",
  temporada: "Para as temporadas",
  investimento: "Investimento",
  tem_imovel: "Tenho ou minha família tem imóvel na ilha",
  venho_todo_ano: "Venho todo ano",
  ja_vim_algumas: "Já vim algumas vezes",
  nunca_vim: "Nunca vim",
};

/** Chaves que não são pergunta: ids e nomes de anúncio, consentimento, rastreio. */
const TECNICA = /^(meta_|utm_|fb|gclid|consent|lgpd|form_|lead_id|broker|origem|pagina|url|referrer)/i;

function legivel(valor: unknown): string | null {
  if (valor == null) return null;
  if (Array.isArray(valor)) {
    const partes = valor.map(legivel).filter((v): v is string => Boolean(v));
    return partes.length ? partes.join(", ") : null;
  }
  if (typeof valor === "object") return null;
  const texto = String(valor).trim();
  if (!texto) return null;
  const chave = texto.toLowerCase();
  if (OPCOES[chave]) return OPCOES[chave];
  // Valor de opção desconhecido ("algum_valor"): troca o sublinhado e põe a inicial maiúscula.
  if (/^[a-z0-9]+(_[a-z0-9]+)+$/.test(chave)) {
    const t = chave.replace(/_/g, " ");
    return t[0]!.toUpperCase() + t.slice(1);
  }
  return texto.slice(0, 1000);
}

/** "historia_ilhabela" sem pergunta conhecida vira "Historia ilhabela". */
function perguntaDaChave(chave: string): string {
  const conhecida = PERGUNTAS.find(([k]) => k === chave);
  if (conhecida) return conhecida[1];
  const t = chave.replace(/_/g, " ").trim();
  return t ? t[0]!.toUpperCase() + t.slice(1) : chave;
}

/**
 * Respostas legíveis, na ordem do formulário; as perguntas que o CRM não conhece
 * vêm no fim, pela chave. O site manda as respostas também dentro de `qualificacao`.
 */
export function lerRespostas(bruto: Record<string, unknown> | null | undefined): RespostaDoFormulario[] {
  if (!bruto || typeof bruto !== "object") return [];
  const plano: Record<string, unknown> = { ...bruto };
  const q = bruto.qualificacao;
  if (q && typeof q === "object" && !Array.isArray(q)) {
    for (const [k, v] of Object.entries(q as Record<string, unknown>)) if (plano[k] == null) plano[k] = v;
  }
  delete plano.qualificacao;

  const saida: RespostaDoFormulario[] = [];
  const vistas = new Set<string>();
  for (const [chave] of PERGUNTAS) {
    const resposta = legivel(plano[chave]);
    vistas.add(chave);
    if (resposta) saida.push({ chave, pergunta: perguntaDaChave(chave), resposta });
  }
  for (const [chave, valor] of Object.entries(plano)) {
    if (vistas.has(chave) || TECNICA.test(chave)) continue;
    const resposta = legivel(valor);
    if (resposta) saida.push({ chave, pergunta: perguntaDaChave(chave), resposta });
  }
  return saida;
}

/** Diagnóstico (custom_fields.opa) que as respostas preenchem. "Ainda não sei" fica como resposta. */
export function diagnosticoDasRespostas(respostas: RespostaDoFormulario[]): Record<string, string> {
  const r = new Map(respostas.map((x) => [x.chave, x.resposta]));
  const saida: Record<string, string> = {};
  if (r.get("finalidade")) saida.finalidade = r.get("finalidade")!;
  if (r.get("momento")) saida.momento = r.get("momento")!;
  if (r.get("historia_ilhabela")) saida.estilo_vida = r.get("historia_ilhabela")!;
  return saida;
}

/** Campos do corretor (Configurações > Campos do lead) que as respostas preenchem. */
export function camposDoCorretorDasRespostas(bruto: Record<string, unknown> | null | undefined): Record<string, string> {
  const relacao = String((bruto?.relacao_ilhabela ?? (bruto?.qualificacao as Record<string, unknown> | undefined)?.relacao_ilhabela) ?? "").toLowerCase();
  const conhece: Record<string, string> = {
    // "tem_imovel" não diz quanto a pessoa vem: fica só na resposta, sem chute no campo.
    venho_todo_ano: "Vem sempre",
    ja_vim_algumas: "Já veio algumas vezes",
    nunca_vim: "Nunca veio",
  };
  return conhece[relacao] ? { conhece: conhece[relacao]! } : {};
}

/** Só as chaves que ainda estão vazias: o que o corretor anotou nunca é trocado. */
export function soOQueFalta(atual: Record<string, unknown> | null | undefined, novo: Record<string, string>): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const [k, v] of Object.entries(novo)) {
    const a = atual?.[k];
    if (a == null || String(a).trim() === "") saida[k] = v;
  }
  return saida;
}
