/**
 * Imóveis da OPA dentro do CRM: foto, preço e o cruzamento lead x imóvel.
 *
 * Afinidade de 0 a 100 com os pesos do protótipo do CRM da OPA (29/10/2026):
 * bairro 30, preço 25, suítes 20, atributos 15, demanda 10. Aparece a partir de 60.
 */

export const MEDIA_BASE = "https://media.opailhabela.com.br";
export const SITE_BASE = "https://opailhabela.com.br";
/** Mínimo padrão para o imóvel aparecer; a empresa muda em Integrações > Cruzamento (config.cruzamento.minimo). */
export const AFINIDADE_MINIMA = 60;

export interface PesosAfinidade {
  bairro: number;
  preco: number;
  suites: number;
  atributos: number;
  demanda: number;
}

export const PESOS_PADRAO: PesosAfinidade = { bairro: 30, preco: 25, suites: 20, atributos: 15, demanda: 10 };

export interface Imovel {
  id: string;
  codigo: string;
  slug: string | null;
  titulo: string;
  tipo: string | null;
  finalidade: string | null;
  preco_venda_cents: number | null;
  preco_locacao_cents: number | null;
  condominio_cents: number | null;
  iptu_cents: number | null;
  bairro: string | null;
  regiao: string | null;
  area_m2: number | null;
  area_terreno_m2: number | null;
  dormitorios: number | null;
  suites: number | null;
  vagas: number | null;
  descricao: string | null;
  caracteristicas: string[];
  fotos: string[];
  url_site: string | null;
  off_market: boolean;
  status: string;
  captador_user_id: string | null;
}

export function fotoUrl(imovel: Pick<Imovel, "codigo" | "fotos">, i = 0, tamanho: "card" | "full" = "card"): string | null {
  const foto = imovel.fotos[i];
  if (!foto) return null;
  if (/^https?:\/\//.test(foto)) return foto;
  return `${MEDIA_BASE}/fotos/${imovel.codigo}/${foto}-${tamanho}.webp`;
}

export function precoCurto(cents: number | null | undefined): string {
  if (!cents) return "Sob consulta";
  const reais = cents / 100;
  if (reais >= 1_000_000) {
    return `R$ ${(reais / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  }
  return `R$ ${Math.round(reais / 1000).toLocaleString("pt-BR")} mil`;
}

export function precoCheio(cents: number | null | undefined): string {
  if (!cents) return "Sob consulta";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

export function precoPrincipal(i: Pick<Imovel, "preco_venda_cents" | "preco_locacao_cents">): string {
  if (i.preco_venda_cents) return precoCurto(i.preco_venda_cents);
  if (i.preco_locacao_cents) return `${precoCheio(i.preco_locacao_cents)}/mês`;
  return "Sob consulta";
}

/** Perfil do lead lido dos campos confirmados (custom_fields.opa). */
export interface PerfilLead {
  regiao?: string;
  faixa?: string;
  suites?: string;
  estilo_vida?: string;
  inegociavel?: string;
  imovelEntrada?: Pick<Imovel, "bairro" | "regiao" | "preco_venda_cents" | "suites"> | null;
}

// A afinidade roda lead x imóvel (1.500 x 71 na carga de teste) e repete os
// mesmos bairros e faixas: o texto sem acento fica guardado.
const semAcentoCache = new Map<string, string>();

function semAcento(s: string): string {
  const pronto = semAcentoCache.get(s);
  if (pronto !== undefined) return pronto;
  const t = s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (semAcentoCache.size > 5000) semAcentoCache.clear();
  semAcentoCache.set(s, t);
  return t;
}

function tetoDaFaixa(faixa?: string): number | null {
  if (!faixa) return null;
  const t = semAcento(faixa);
  const mi = t.match(/(\d+(?:[.,]\d+)?)\s*mi/);
  if (mi) return Number(mi[1]!.replace(",", ".")) * 1_000_000 * 100;
  const mil = t.match(/(\d{3,4})\s*mil/);
  if (mil) return Number(mil[1]) * 1000 * 100;
  return null;
}

export interface Afinidade {
  pontos: number;
  motivos: string[];
}

/**
 * Afinidade de 0 a 100. Cada critério vale, por padrão, o peso do protótipo;
 * com `pesos` (Integrações > Cruzamento) o ponto de cada critério é
 * reescalado para o peso que a empresa definiu.
 */
export function afinidade(imovel: Imovel, perfil: PerfilLead, pesos: PesosAfinidade = PESOS_PADRAO): Afinidade {
  const motivos: string[] = [];
  const bruto: PesosAfinidade = { bairro: 0, preco: 0, suites: 0, atributos: 0, demanda: 0 };

  // Bairro e região (30)
  const regiaoLead = perfil.regiao ? semAcento(perfil.regiao) : "";
  const bairro = imovel.bairro ? semAcento(imovel.bairro) : "";
  const regiao = imovel.regiao ? semAcento(imovel.regiao) : "";
  if (bairro && regiaoLead.includes(bairro.split(" ")[0]!)) {
    bruto.bairro = 30;
    motivos.push(`no bairro que pediu (${imovel.bairro})`);
  } else if (regiao && regiaoLead && (regiaoLead.includes(regiao.split(" ")[0]!) || regiao.includes(regiaoLead.split(" ")[0]!))) {
    bruto.bairro = 22;
    motivos.push(`na região ${imovel.regiao}`);
  } else if (!regiaoLead && perfil.imovelEntrada?.regiao === imovel.regiao) {
    bruto.bairro = 18;
    motivos.push("mesma região do imóvel de entrada");
  }

  // Preço (25)
  const teto = tetoDaFaixa(perfil.faixa) ?? (perfil.imovelEntrada?.preco_venda_cents ? perfil.imovelEntrada.preco_venda_cents * 1.15 : null);
  const preco = imovel.preco_venda_cents;
  if (teto && preco) {
    if (preco <= teto && preco >= teto * 0.55) {
      bruto.preco = 25;
      motivos.push("dentro da faixa");
    } else if (preco <= teto * 1.12 && preco >= teto * 0.4) {
      bruto.preco = 14;
      motivos.push("perto da faixa");
    }
  }

  // Suítes (20)
  const minSuites = Number((perfil.suites ?? "").match(/\d+/)?.[0] ?? perfil.imovelEntrada?.suites ?? 0);
  if (minSuites && imovel.suites != null) {
    if (imovel.suites >= minSuites) {
      bruto.suites = 20;
      motivos.push(`${imovel.suites} suítes`);
    } else if (imovel.suites === minSuites - 1) {
      bruto.suites = 8;
    }
  } else if (!minSuites) {
    bruto.suites = 10;
  }

  // Atributos (15): estilo de vida e inegociável contra as características.
  const desejo = semAcento(`${perfil.estilo_vida ?? ""} ${perfil.inegociavel ?? ""}`);
  const carac = semAcento(`${imovel.caracteristicas.join(" ")} ${imovel.descricao ?? ""}`);
  const pares: Array<[RegExp, RegExp, string]> = [
    [/barco|vela|pier|marina/, /pier|marina|barco|poita|vaga nautica/, "acesso para barco"],
    [/praia|areia|mar/, /frente (para o )?mar|pe na areia|vista (para o )?mar|praia/, "perto do mar"],
    [/pet|cachorro|gato/, /permite animais|quintal|jardim/, "aceita pet"],
    [/piscina/, /piscina/, "piscina"],
    [/remoto|internet|fibra|home/, /escritorio|fibra|internet/, "espaço para trabalhar"],
  ];
  let atributos = 0;
  for (const [quer, tem, rotulo] of pares) {
    if (quer.test(desejo) && tem.test(carac)) {
      atributos += 8;
      motivos.push(rotulo);
    }
  }
  bruto.atributos = Math.min(15, atributos);

  // Demanda (10): imóvel ativo e no site conta como pronto para mandar.
  if (imovel.status === "ativo") bruto.demanda = 10;

  const pontos = (Object.keys(bruto) as Array<keyof PesosAfinidade>).reduce(
    (soma, k) => soma + (bruto[k] * (Number.isFinite(pesos[k]) ? Math.max(0, pesos[k]) : PESOS_PADRAO[k])) / PESOS_PADRAO[k],
    0,
  );
  return { pontos: Math.min(100, Math.round(pontos)), motivos };
}

/** Valor curto para card de número: uma casa decimal ("R$ 105,3 mi"). */
export function precoCompacto(cents: number | null | undefined): string {
  if (!cents) return "R$ 0";
  const reais = cents / 100;
  if (reais >= 1_000_000) {
    return `R$ ${(reais / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  }
  return `R$ ${Math.round(reais / 1000).toLocaleString("pt-BR")} mil`;
}
