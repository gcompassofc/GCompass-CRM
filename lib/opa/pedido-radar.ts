/**
 * Pedido ao OPA Radar a partir da ficha do lead (pedido do Allyson, 03/11/2026).
 *
 * O Radar ainda não tem tela: é o coletor `radar-ilhabela` (D:\1. OPA), que lê os
 * anúncios de Ilhabela e responde "pedido de comprador" pelo script
 * `scripts/pedido/pedido.mjs <pedido.json>`. Este módulo monta o pedido no MESMO
 * formato que aquele script confere (`lerPedido` em scripts/pedido/selecao.mjs):
 * regiões, tipos e pontos daqui têm de existir lá, senão o pedido é recusado.
 *
 * O pedido fica salvo no lead (custom_fields.pedido_radar) e a ficha oferece o
 * JSON pronto para rodar a busca, até o Radar ser ligado ao CRM.
 */
import { z } from "zod";

/** Iguais a REGIOES e FAMILIAS de radar-ilhabela/scripts/pedido/selecao.mjs. */
export const REGIOES_RADAR = ["Norte", "Centro e Vila", "Sul", "Lado de fora"] as const;
export const TIPOS_RADAR = ["casa", "apartamento", "terreno", "pousada", "rural", "comercial"] as const;

/**
 * Os pontos mais pedidos em Ilhabela, com a chave do catálogo do Radar
 * (radar-ilhabela/scripts/rodada-mapeamento/pontos.mjs). Recorte de propósito:
 * a lista inteira tem mais de 60 e virava formulário.
 */
export const PONTOS_RADAR = [
  { chave: "pe_na_areia", rotulo: "Pé na areia" },
  { chave: "frente_mar", rotulo: "Frente para o mar" },
  { chave: "vista_mar", rotulo: "Vista para o mar" },
  { chave: "vista_panoramica", rotulo: "Vista panorâmica" },
  { chave: "acesso_praia", rotulo: "Acesso próprio à praia" },
  { chave: "perto_praia", rotulo: "Perto da praia" },
  { chave: "pier", rotulo: "Píer" },
  { chave: "garagem_nautica", rotulo: "Vaga para barco" },
  { chave: "piscina", rotulo: "Piscina" },
  { chave: "condominio", rotulo: "Em condomínio" },
  { chave: "portaria", rotulo: "Portaria 24 h" },
  { chave: "area_gourmet", rotulo: "Área gourmet" },
  { chave: "casa_caseiro", rotulo: "Casa de caseiro" },
  { chave: "mobiliado", rotulo: "Mobiliado" },
  { chave: "terrea", rotulo: "Térrea" },
  { chave: "pronto_para_morar", rotulo: "Pronto para morar" },
  { chave: "pet", rotulo: "Aceita animais" },
  { chave: "escritura", rotulo: "Com escritura" },
] as const;

const CHAVES = new Set<string>(PONTOS_RADAR.map((p) => p.chave));
const chave = z.string().refine((k) => CHAVES.has(k), "ponto desconhecido");
const valor = z.number().int().positive().max(1_000_000_000).nullable();

export const pedidoRadarSchema = z.object({
  titulo: z.string().trim().min(2).max(120),
  finalidade: z.enum(["venda", "locacao_anual"]),
  tipos: z.array(z.enum(TIPOS_RADAR)).max(TIPOS_RADAR.length),
  regioes: z.array(z.enum(REGIOES_RADAR)).max(REGIOES_RADAR.length),
  preco_min: valor,
  preco_max: valor,
  suites_min: z.number().int().min(1).max(20).nullable(),
  /** Cada ponto obrigatório vira um grupo de um só (o Radar aceita "A ou B" por grupo). */
  obrigatorio: z.array(chave).max(10),
  desejavel: z.array(chave).max(10),
});

export type PedidoRadar = z.infer<typeof pedidoRadarSchema>;

export interface PedidoRadarSalvo {
  pedido: PedidoRadar;
  em: string;
  por: string | null;
}

/** O JSON que `node scripts/pedido/pedido.mjs <arquivo>.json` lê. */
export function pedidoParaRadar(p: PedidoRadar): Record<string, unknown> {
  const sai: Record<string, unknown> = {
    titulo: p.titulo,
    finalidade: p.finalidade,
    tipos: p.tipos,
    regioes: p.regioes,
    obrigatorio: p.obrigatorio.map((k) => [k]),
    desejavel: p.desejavel,
    nao_quero: [],
    margem_preco_pct: 10,
    no_email: 20,
  };
  if (p.preco_min) sai.preco_min = p.preco_min;
  if (p.preco_max) sai.preco_max = p.preco_max;
  if (p.suites_min) sai.suites_min = p.suites_min;
  return sai;
}

/** Frase curta do pedido, para a ficha. */
export function resumoDoPedidoRadar(p: PedidoRadar): string {
  const mi = (v: number) => `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  const partes: string[] = [p.finalidade === "venda" ? "Venda" : "Locação anual"];
  if (p.tipos.length) partes.push(p.tipos.join(" ou "));
  if (p.preco_min && p.preco_max) partes.push(`de ${mi(p.preco_min)} a ${mi(p.preco_max)}`);
  else if (p.preco_max) partes.push(`até ${mi(p.preco_max)}`);
  else if (p.preco_min) partes.push(`a partir de ${mi(p.preco_min)}`);
  partes.push(p.regioes.length ? p.regioes.join(" ou ") : "qualquer região");
  if (p.suites_min) partes.push(`${p.suites_min}+ suítes`);
  const rot = (k: string) => PONTOS_RADAR.find((x) => x.chave === k)?.rotulo.toLowerCase() ?? k;
  if (p.obrigatorio.length) partes.push(`precisa: ${p.obrigatorio.map(rot).join(", ")}`);
  if (p.desejavel.length) partes.push(`seria bom: ${p.desejavel.map(rot).join(", ")}`);
  return partes.join(" · ");
}

/** Primeiro número de um texto livre ("3 suítes", "até 4,5 mi") ou null. */
function primeiroNumero(t: string | undefined): number | null {
  const m = /(\d+(?:[.,]\d+)?)/.exec(t ?? "");
  return m ? Number(m[1]!.replace(",", ".")) : null;
}

/** Pedido inicial a partir do que a ficha já sabe (campos do diagnóstico). */
export function pedidoInicial(
  nome: string,
  campos: { finalidade?: string; regiao?: string; faixa?: string; suites?: string },
): PedidoRadar {
  const regiao = (campos.regiao ?? "").toLowerCase();
  const regioes = REGIOES_RADAR.filter((r) => {
    const n = r.toLowerCase();
    return regiao.includes(n) || (r === "Centro e Vila" && /centro|vila|perequê|pereque/.test(regiao));
  });
  // Faixa em texto livre: "até 4 mi", "3 a 5 milhões". Só o teto, e só quando fala de milhão.
  const nums = [...(campos.faixa ?? "").matchAll(/(\d+(?:[.,]\d+)?)/g)].map((m) => Number(m[1]!.replace(",", ".")));
  const emMilhao = /mi|milh/.test((campos.faixa ?? "").toLowerCase());
  const teto = emMilhao && nums.length ? Math.round(Math.max(...nums) * 1_000_000) : null;
  const piso = emMilhao && nums.length > 1 ? Math.round(Math.min(...nums) * 1_000_000) : null;
  const suites = primeiroNumero(campos.suites);
  return {
    titulo: `Pedido de ${nome}`.slice(0, 120),
    finalidade: /loca|alug/.test((campos.finalidade ?? "").toLowerCase()) ? "locacao_anual" : "venda",
    tipos: ["casa"],
    regioes: [...regioes],
    preco_min: piso,
    preco_max: teto,
    suites_min: suites && suites >= 1 && suites <= 20 ? Math.round(suites) : null,
    obrigatorio: [],
    desejavel: [],
  };
}
