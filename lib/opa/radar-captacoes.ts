/**
 * Captações do Radar (pedido do Allyson, 09/11/2026).
 *
 * O OPA Radar (coletor `radar-ilhabela`, em D:\1. OPA) separa, a cada rodada, 2
 * imóveis por corretor: anúncios de outras imobiliárias de Ilhabela que a OPA não
 * tem. Aqui cada distribuição do Radar vira um card do funil "Captação de imóvel",
 * na etapa "Oportunidade do Radar", com o dono = o corretor que recebeu.
 *
 * Nada de tabela nova: o card é um `crm_leads` comum, sem contato até o corretor
 * achar o dono, com `source = 'radar'` e `external_id = 'D21'` (o índice único
 * `uniq_crm_leads_org_source_external` impede o mesmo imóvel de entrar duas vezes).
 * Os dados do anúncio ficam em `custom_fields.radar`. Devolutiva é anotação da
 * ficha; "Não serve" é Perdido com motivo; etapas são as do funil.
 *
 * Prazos (Configurações > Captação, `config.captacao`): lembrete ao corretor no 3º
 * dia sem retorno e último aviso no dia do prazo (`devolutiva_dias`), com cópia
 * para a gestão. Até a reunião que decide o prazo, NADA é repassado sozinho: o
 * gestor decide no card (pedido do Allyson, 09/11/2026).
 *
 * Este arquivo é só regra (sem banco), para testar sem Supabase.
 */
import { z } from "zod";

import { BAIRROS } from "./config";

/** Dias sem retorno até o primeiro lembrete (regra "3º dia sem retorno" de Configurações). */
export const LEMBRETE_DIAS = 3;

/** Motivos de "Não serve" de um imóvel do Radar (somam aos de Configurações > Motivos de perda). */
export const MOTIVOS_RADAR = [
  "Radar: já é da OPA",
  "Radar: dono não quer anunciar com a OPA",
  "Radar: já foi vendido",
  "Radar: preço fora da realidade",
  "Radar: não achei o dono",
  "Radar: outro motivo",
] as const;

/**
 * O que o corretor pode apontar de errado no anúncio. Fica anotado na ficha, para a
 * gestão ver; o Radar ainda não lê o CRM (decisão do Allyson, 09/11/2026).
 */
export const ERROS_RADAR = [
  "Preço diferente do anúncio",
  "Bairro ou tipo errado",
  "É o mesmo imóvel de outro anúncio",
  "Anúncio saiu do ar",
  "Outro",
] as const;

/** Respostas rápidas da devolutiva (viram o começo da anotação). */
export const RESPOSTAS_RAPIDAS = [
  "Falei com o dono",
  "Falei com caseiro ou parente",
  "Não atendeu",
  "Visitei o imóvel",
  "Dono pediu um tempo",
] as const;

/** Dados do anúncio guardados no card (`custom_fields.radar`). */
export interface RadarDoCard {
  /** "D21": número da distribuição no registro do Radar. */
  dist: string;
  sigla: string;
  imobiliaria: string;
  codigo: string;
  link: string;
  tipo: string | null;
  bairro: string | null;
  regiao: string | null;
  preco_anunciado: number | null;
  quartos: number | null;
  suites: number | null;
  area_construida: number | null;
  /** "novo que a OPA não tem", "preço anunciado baixou"... */
  motivo: string | null;
  primeira_vez: string | null;
  /** Histórico de preço anunciado visto pelo Radar. */
  precos: Array<{ data: string; preco: number }>;
  /** "Possivelmente o mesmo imóvel" em outras imobiliárias. */
  outros: Array<{ fonte: string; link: string; preco?: number | null }>;
  rodada: string | null;
  /** Quando o e-mail ou o aviso saiu para o corretor (o relógio do prazo começa aqui). */
  enviado_em: string;
  /** false = já foi avisado fora do CRM (e-mail): a rotina não manda o aviso de chegada. */
  avisar_chegada: boolean;
}

/** Uma distribuição lida do registro do Radar, pronta para virar card. */
export interface DistribuicaoRadar {
  radar: RadarDoCard;
  /** Nome do corretor no Radar ("Luana", "Martin"). */
  corretor: string;
  /** Título do card: "Casa · Praia Grande". */
  titulo: string;
}

const num = z.number().finite().nullable().optional();
const registroSchema = z.object({
  corretores: z.array(z.object({ id: z.string(), nome: z.string() })),
  distribuicoes: z.array(
    z.object({
      id: z.number().int().positive(),
      corretor: z.string(),
      origem: z.string().nullable().optional(),
      imovel: z.object({
        sigla: z.string(),
        codigo: z.union([z.string(), z.number()]).transform(String),
        tipo: z.string().nullable().optional(),
        bairro: z.string().nullable().optional(),
        regiao: z.string().nullable().optional(),
        preco_anunciado: num,
        quartos: num,
        suites: num,
        area_construida: num,
        fonte: z.string(),
        link: z.string().url(),
        motivo: z.string().nullable().optional(),
        primeira_vez: z.string().nullable().optional(),
        precos: z.array(z.object({ data: z.string(), preco: z.number() })).optional(),
        outros: z
          .array(z.object({ fonte: z.string(), url: z.string().optional(), link: z.string().optional(), preco_anunciado: z.number().nullable().optional() }))
          .optional(),
      }),
    }),
  ),
  eventos: z.array(z.object({ distribuicao: z.number().int(), tipo: z.string(), em: z.string() })),
});

/** "Casa Em Condominio" -> "Casa em condomínio" (o Radar guarda como vem do site). */
export function tipoLegivel(tipo: string | null | undefined): string {
  const t = (tipo ?? "").trim();
  if (!t) return "Imóvel";
  const baixo = t.toLowerCase().replace(/condominio/g, "condomínio").replace(/padrao/g, "padrão");
  return baixo.charAt(0).toUpperCase() + baixo.slice(1);
}

/**
 * Bairro com a grafia da OPA (lista de Configurações): "Engenho D Agua" ->
 * "Engenho d'Água", "Armacao" -> "Armação", "Feiticeira (Cambaquara)" -> "Feiticeira".
 * Bairro fora da lista fica como veio.
 */
export function bairroLegivel(bairro: string | null | undefined): string | null {
  const b = (bairro ?? "").trim();
  if (!b) return null;
  const chave = chaveBairro(b);
  const achado = TODOS_BAIRROS.find((x) => chaveBairro(x) === chave) ?? TODOS_BAIRROS.find((x) => chave.startsWith(chaveBairro(x) + " "));
  return achado ?? b;
}

const chaveBairro = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
const TODOS_BAIRROS = Object.values(BAIRROS).flat();

/** Tipo sem o bairro repetido ("Casa no Curral", "Casa - Santa Tereza" -> "Casa"). */
export function tipoSemBairro(tipo: string, bairro: string | null): string {
  if (!bairro) return tipo;
  const alvo = chaveBairro(bairro);
  const limpo = tipo
    .split(/\s+-\s+|\s+(?:no|na|em)\s+/i)
    .filter((parte) => chaveBairro(parte) !== alvo)
    .join(" ")
    .trim();
  return limpo || tipo;
}

/**
 * Lê o `registro.json` do Radar (material/distribuicoes/registro.json) e devolve as
 * distribuições que já foram ENVIADAS (só elas têm corretor avisado e relógio
 * correndo). Distribuição só preparada fica de fora; a repassada entra com o
 * corretor de agora. Lança erro com frase legível se o arquivo não é o registro.
 */
export function lerRegistroRadar(entrada: unknown, opcoes: { avisarChegada?: boolean } = {}): DistribuicaoRadar[] {
  const r = registroSchema.safeParse(entrada);
  if (!r.success) throw new Error("Este arquivo não é o registro do Radar (registro.json).");
  const nomes = new Map(r.data.corretores.map((c) => [c.id, c.nome]));
  const enviadas = new Map<number, string>();
  for (const e of r.data.eventos) if (e.tipo === "enviada") enviadas.set(e.distribuicao, e.em);

  const saida: DistribuicaoRadar[] = [];
  for (const d of r.data.distribuicoes) {
    const enviadoEm = enviadas.get(d.id);
    if (!enviadoEm) continue;
    const i = d.imovel;
    const bairro = bairroLegivel(i.bairro);
    const tipo = tipoLegivel(tipoSemBairro(i.tipo ?? "", bairro));
    saida.push({
      corretor: nomes.get(d.corretor) ?? d.corretor,
      titulo: `${tipo} · ${bairro ?? i.regiao ?? "Ilhabela"}`,
      radar: {
        dist: `D${d.id}`,
        sigla: i.sigla,
        imobiliaria: i.fonte,
        codigo: i.codigo,
        link: i.link,
        tipo,
        bairro,
        regiao: i.regiao ?? null,
        preco_anunciado: i.preco_anunciado ?? null,
        quartos: i.quartos ?? null,
        suites: i.suites ?? null,
        area_construida: i.area_construida ?? null,
        motivo: i.motivo ?? null,
        primeira_vez: i.primeira_vez ?? null,
        precos: i.precos ?? [],
        outros: (i.outros ?? [])
          .map((o) => ({ fonte: o.fonte, link: o.url ?? o.link ?? "", preco: o.preco_anunciado ?? null }))
          .filter((o) => o.link),
        rodada: d.origem ?? null,
        enviado_em: enviadoEm,
        avisar_chegada: opcoes.avisarChegada ?? false,
      },
    });
  }
  return saida;
}

/** Acha o corretor do CRM pelo nome do Radar ("Martin" casa com "Paulo Martin"). */
export function acharCorretor(nomeRadar: string, equipe: Array<{ id: string; nome: string }>): string | null {
  const alvo = semAcentos(nomeRadar);
  const exato = equipe.filter((p) => semAcentos(p.nome).split(/\s+/)[0] === alvo);
  if (exato.length === 1) return exato[0]!.id;
  const qualquer = equipe.filter((p) => semAcentos(p.nome).split(/\s+/).includes(alvo));
  return qualquer.length === 1 ? qualquer[0]!.id : null;
}

const semAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const DIA_MS = 86_400_000;

/** Situação do card para a tela e para os avisos. */
export type SituacaoRadar = "nova" | "em_dia" | "lembrar" | "prazo" | "captado" | "perdido";

export interface CardParaSituacao {
  status: "open" | "won" | "lost";
  etapaSlug: string;
  /** Último movimento de alguém da equipe (anotação, troca de etapa); `enviado_em` se ninguém mexeu. */
  ultimoMovimento: string;
  enviadoEm: string;
}

/** Dias inteiros desde o último movimento. */
export function diasParado(c: Pick<CardParaSituacao, "ultimoMovimento">, agora: number): number {
  return Math.max(0, Math.floor((agora - Date.parse(c.ultimoMovimento)) / DIA_MS));
}

export function situacaoRadar(c: CardParaSituacao, agora: number, prazoDias: number): SituacaoRadar {
  if (c.status === "won" || c.etapaSlug === "publicado") return "captado";
  if (c.status === "lost") return "perdido";
  const dias = diasParado(c, agora);
  if (dias >= prazoDias) return "prazo";
  if (dias >= LEMBRETE_DIAS) return "lembrar";
  const nunca = Date.parse(c.ultimoMovimento) <= Date.parse(c.enviadoEm) + 60_000;
  if (nunca && c.etapaSlug === "radar" && agora - Date.parse(c.enviadoEm) < DIA_MS) return "nova";
  return "em_dia";
}

/** Aba da tela Captações em que o card aparece. */
export type AbaRadar = "agir" | "andando" | "captados" | "encerrados";

export function abaDoCard(s: SituacaoRadar, etapaSlug: string): AbaRadar {
  if (s === "captado") return "captados";
  if (s === "perdido") return "encerrados";
  if (s === "nova" || s === "lembrar" || s === "prazo" || etapaSlug === "radar") return "agir";
  return "andando";
}

/** "R$ 3,18 mi", "R$ 720 mil". */
export function precoCurto(v: number | null | undefined): string {
  if (!v) return "Sem preço";
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi`;
  return `R$ ${Math.round(v / 1000).toLocaleString("pt-BR")} mil`;
}

/** "R$ 3.180.000" */
export function precoCheioRadar(v: number | null | undefined): string {
  return v ? `R$ ${v.toLocaleString("pt-BR")}` : "Sem preço";
}

/** Aviso que a rotina deve mandar agora sobre este card (ou null). A marca evita repetir. */
export function avisoDevidoRadar(
  c: CardParaSituacao & { avisarChegada: boolean },
  agora: number,
  prazoDias: number,
): { tipo: "radar_chegada" | "radar_lembrete" | "radar_prazo"; marca: string } | null {
  if (c.status !== "open" || c.etapaSlug === "publicado") return null;
  const s = situacaoRadar(c, agora, prazoDias);
  const desde = c.ultimoMovimento.slice(0, 10);
  if (s === "prazo") return { tipo: "radar_prazo", marca: desde };
  if (s === "lembrar") return { tipo: "radar_lembrete", marca: desde };
  if (c.avisarChegada && Date.parse(c.ultimoMovimento) <= Date.parse(c.enviadoEm) + 60_000) return { tipo: "radar_chegada", marca: c.enviadoEm.slice(0, 10) };
  return null;
}

// ---------------------------------------------------------------- texto do OPA Lembretes

const primeiro = (n: string) => n.trim().split(/\s+/)[0] || "Oi";

export interface ItemDoAviso {
  tipo: "radar_chegada" | "radar_lembrete" | "radar_prazo";
  /** Cópia do prazo para a gestão (o card é de outro corretor). */
  paraGestor: boolean;
  titulo: string;
  dist: string;
  preco: number | null;
  imobiliaria: string;
  dias: number;
  corretor: string;
}

/**
 * Uma mensagem por pessoa e rodada, com tudo junto: imóveis novos, os que pedem
 * retorno e (para a gestão) os que passaram do prazo. Na primeira rodada depois de
 * importar, vários cards antigos vencem juntos; separado, isso viraria uma rajada.
 */
export function textoAvisoRadar(pessoa: string, itens: ItemDoAviso[], link: string): string {
  const novos = itens.filter((i) => i.tipo === "radar_chegada");
  const meus = itens.filter((i) => i.tipo !== "radar_chegada" && !i.paraGestor).sort((a, b) => b.dias - a.dias);
  const equipe = itens.filter((i) => i.paraGestor).sort((a, b) => b.dias - a.dias);
  const blocos: string[] = [];
  if (novos.length) {
    const titulo = `O Radar separou ${novos.length === 1 ? "1 imóvel" : `${novos.length} imóveis`} para você captar:`;
    const lista = novos.map((i, k) => `${k + 1}. ${i.titulo}, ${precoCheioRadar(i.preco)} (${i.imobiliaria})`);
    blocos.push([titulo, ...lista].join("\n"));
  }
  if (meus.length) {
    const titulo = `${meus.length === 1 ? "Esta captação está" : "Estas captações estão"} sem retorno:`;
    const lista = meus.map((i) => `${i.titulo} (${i.dist}), ${i.dias} dias${i.tipo === "radar_prazo" ? ", chegou o prazo" : ""}`);
    blocos.push([titulo, ...lista, "Conte na ficha como está, ou marque Não serve se não deu."].join("\n"));
  }
  if (equipe.length) {
    const titulo = `${equipe.length === 1 ? "Uma captação da equipe passou" : `${equipe.length} captações da equipe passaram`} do prazo sem retorno:`;
    const lista = equipe.map((i) => `${primeiro(i.corretor)}: ${i.titulo} (${i.dist}), ${i.dias} dias`);
    blocos.push([titulo, ...lista, "Decida na ficha: cobrar, dar mais prazo ou passar para outro corretor."].join("\n"));
  }
  return [`Oi, ${primeiro(pessoa)}. ${blocos.join("\n\n")}`, `Captações do Radar: ${link}`].join("\n\n");
}
