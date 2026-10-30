/**
 * Etiquetas do lead no formato grupo:valor do protótipo da OPA.
 *
 * Parte delas sai sozinha (regra do protótipo): bairro, região, faixa e tipo
 * vêm do imóvel de entrada (a faixa nunca de pergunta); off market vem da
 * etiqueta ou do imóvel; finalidade, momento e estilo de vida vêm do que o
 * corretor confirmou na conversa. O resto o corretor marca à mão, e fica em
 * custom_fields.etiquetas.
 */
import { BAIRROS, faixaDoValor, regiaoDoBairro } from "./config";
import type { LeadOpa } from "./dados";
import type { Imovel } from "./imoveis";

export interface EtiquetaMarcada {
  valor: string;
  /** true = veio do imóvel ou da conversa; o corretor não precisa marcar. */
  auto: boolean;
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Nome canônico do bairro na tabela BAIRROS ("Engenho D'Água" vira "Engenho d'Água"). */
export function bairroCanonico(bairro: string | null | undefined): string | null {
  if (!bairro) return null;
  const alvo = semAcento(bairro);
  for (const lista of Object.values(BAIRROS)) {
    const achou = lista.find((b) => semAcento(b) === alvo);
    if (achou) return achou;
  }
  return bairro;
}

const MOMENTO: Array<[RegExp, string]> = [
  [/agora|3 meses/i, "Comprar em até 3 meses"],
  [/6 meses|1 ano/i, "Em até 1 ano"],
  [/pesquisando|sem pressa/i, "Sem pressa"],
];

const INTERESSE: Array<[RegExp, string]> = [
  [/barco|vela/i, "Barco"],
  [/vela/i, "Vela"],
  [/pesca/i, "Pesca"],
  [/pet|cachorro/i, "Pet"],
  [/remoto|home/i, "Home office"],
  [/praia|areia/i, "Praia"],
];

export function etiquetasDoLead(lead: LeadOpa, imovel: Imovel | null | undefined): Record<string, EtiquetaMarcada[]> {
  const out: Record<string, EtiquetaMarcada[]> = {};
  const por = (grupo: string, valor: string | null | undefined, auto: boolean) => {
    if (!valor) return;
    const lista = (out[grupo] ??= []);
    if (!lista.some((e) => e.valor === valor)) lista.push({ valor, auto });
  };

  if (lead.offMarket === "comprador") por("offmarket", "Comprador off market", true);
  if (lead.offMarket === "proprietario") por("offmarket", "Proprietário off market", true);

  if (imovel) {
    const bairro = bairroCanonico(imovel.bairro);
    por("bairro", bairro, true);
    por("regiao", regiaoDoBairro(bairro) ?? imovel.regiao, true);
    por("faixa", faixaDoValor(imovel.preco_venda_cents), true);
    const t = semAcento(`${imovel.tipo ?? ""} ${imovel.titulo}`);
    por("tipo", t.includes("terreno") ? "Terreno" : t.includes("apartamento") ? "Apartamento" : "Casa", true);
    if (t.includes("condominio")) por("tipo", "Condomínio fechado", true);
    if (t.includes("pe na areia") || t.includes("frente pro mar") || t.includes("frente para o mar")) por("tipo", "Pé na areia", true);
    if (t.includes("vista")) por("tipo", "Vista para o mar", true);
  }

  const c = lead.campos;
  if (c.finalidade) por("finalidade", c.finalidade === "Temporada" || c.finalidade === "Investimento" || c.finalidade === "Locação" ? c.finalidade : "Moradia", true);
  for (const [re, v] of MOMENTO) if (c.momento && re.test(c.momento)) por("momento", v, true);
  for (const [re, v] of INTERESSE) if (c.estilo_vida && re.test(c.estilo_vida)) por("int", v, true);

  for (const [grupo, valores] of Object.entries(lead.etiquetas)) for (const v of valores) por(grupo, v, false);
  return out;
}

export function contarEtiquetas(e: Record<string, EtiquetaMarcada[]>): number {
  return Object.values(e).reduce((s, l) => s + l.length, 0);
}
