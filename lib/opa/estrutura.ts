/**
 * Estrutura fixa do CRM da OPA: os três funis com as etapas, as etapas que
 * exigem os 4 campos do diagnóstico e o formato dos imóveis do site.
 *
 * Usada pelo seed de demonstração (scripts/seed-opa.ts) e pelo preparo da
 * produção (scripts/producao/preparar-opa.ts), para os dois nascerem iguais.
 */

export const FUNIS = [
  {
    slug: "compradores",
    nome: "Compradores",
    padrao: true,
    etapas: [
      ["lead-recebido", "Lead recebido", "#0071C6", 1],
      ["primeiro-contato", "Primeiro contato", "#2B8FD6", 24],
      ["diagnostico", "Diagnóstico feito", "#156187", 72],
      ["selecao", "Seleção enviada", "#3E86A8", 72],
      ["visita-agendada", "Visita agendada", "#1F7AA8", 168],
      ["visita-realizada", "Visita realizada", "#4C93B8", 72],
      ["proposta", "Proposta feita", "#23506B", 168],
      ["negociacao", "Negociação", "#1B4560", 336],
      ["fechamento", "Fechamento", "#0B3D57", 720],
      ["sem-momento", "Sem momento", "#8FA3AE", null],
    ],
  },
  {
    slug: "captacao",
    nome: "Captação de imóvel",
    padrao: false,
    etapas: [
      ["radar", "Oportunidade do Radar", "#5A6B75", 168],
      ["contato", "Contato / candidatura", "#0071C6", 360],
      ["triagem", "Triagem", "#2B8FD6", 72],
      ["visita-avaliacao", "Visita de avaliação", "#156187", 72],
      ["parecer", "Parecer de preço", "#3E86A8", 72],
      ["proposta-trabalho", "Proposta de trabalho", "#1F7AA8", 168],
      ["contrato", "Contrato", "#23506B", 168],
      ["publicado", "Imóvel publicado", "#0B3D57", null],
    ],
  },
  {
    slug: "relacionamento",
    nome: "Relacionamento com proprietário",
    padrao: false,
    etapas: [
      ["observacao", "No ar em observação", "#0071C6", 360],
      ["parecer-enviado", "Parecer enviado", "#156187", 168],
      ["ajuste-proposto", "Ajuste proposto", "#3E86A8", 168],
      ["ajuste-aplicado", "Ajuste aplicado", "#1F7AA8", null],
      ["sem-tracao", "Sem tração", "#8FA3AE", null],
    ],
  },
] as const;

/** Etapas de fim do funil de compradores (ganho e perda). */
export const ETAPAS_FINAIS = [
  ["vendido", "Vendido", "#0B7A4B", null],
  ["perdido", "Perdido", "#8FA3AE", null],
] as const;

/** Do diagnóstico em diante (menos Sem momento e Perdido) o lead precisa de 2 dos 4 campos (0133). */
export const TRAVADAS = new Set([
  "diagnostico", "selecao", "visita-agendada", "visita-realizada", "proposta", "negociacao", "fechamento", "vendido",
]);

export const VOCABULARIO = {
  lead: "Lead", lead_plural: "Leads", deal: "Negócio", deal_plural: "Negócios",
  won: "Vendido", lost: "Perdido", stage: "Etapa", stage_plural: "Etapas",
};

/** Domínios aceitos em URL e foto de imóvel (gatilho da 0115). */
export const DOMINIOS_IMOVEL = ["opailhabela.com.br", "r2.dev", "r2.cloudflarestorage.com"];

/** Imóvel como vem de `dados/imoveis.json` do site da OPA. */
export interface ImovelJson {
  codigo: string;
  slug?: string;
  titulo: string;
  tipo?: string;
  finalidade?: string;
  precoVenda?: number | null;
  precoLocacao?: number | null;
  condominio?: number | null;
  iptu?: number | null;
  bairro?: string;
  regiao?: string;
  area?: number | null;
  areaTerreno?: number | null;
  dormitorios?: number | null;
  suites?: number | null;
  vagas?: number | null;
  descricao?: string;
  caracteristicas?: string[];
  fotos?: string[];
}

const cents = (v: number | null | undefined) => (v ? Math.round(v * 100) : null);

/** Linha da tabela `imoveis` a partir do JSON do site. */
export function linhaDeImovel(i: ImovelJson, orgId: string, captador: string | null = null) {
  return {
    organization_id: orgId,
    codigo: i.codigo,
    slug: i.slug ?? null,
    titulo: i.titulo,
    tipo: i.tipo ?? null,
    finalidade: i.finalidade ?? null,
    preco_venda_cents: cents(i.precoVenda),
    preco_locacao_cents: cents(i.precoLocacao),
    condominio_cents: cents(i.condominio),
    iptu_cents: cents(i.iptu),
    bairro: i.bairro ?? null,
    regiao: i.regiao ?? null,
    area_m2: i.area ?? null,
    area_terreno_m2: i.areaTerreno ?? null,
    dormitorios: i.dormitorios ?? null,
    suites: i.suites ?? null,
    vagas: i.vagas ?? null,
    descricao: i.descricao ?? null,
    caracteristicas: i.caracteristicas ?? [],
    fotos: i.fotos ?? [],
    url_site: i.slug ? `https://opailhabela.com.br/imovel/${i.slug}/` : null,
    captador_user_id: captador,
  };
}
