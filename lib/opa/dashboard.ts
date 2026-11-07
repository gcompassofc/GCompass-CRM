/**
 * Dashboard da operação (Central #564, pedido do Marco repassado pelo Kallyl em
 * 06/11/2026). Só conta: quem lê o banco é lib/opa/dashboard-dados.ts.
 *
 * Regras que valem para a tela inteira:
 *  - um período só (o do topo); "antes" é o período anterior do mesmo tamanho;
 *  - todo número guarda os leads por trás dele (`listas`), para o clique abrir a
 *    lista e ninguém discutir de onde saiu;
 *  - respondido no prazo = primeira resposta do corretor (mensagem, ligação ou
 *    "Respondi") dentro do prazo da trilha (pago 1 h, orgânico 3 h), contando só o
 *    horário de atendimento. A boas-vindas automática não conta (0130);
 *  - comissão em duas linhas: bruta 6% sobre o VGV e a da OPA, a que o botão de
 *    Ganho grava (3%). Investimento, CPL e custo por conversa ficam no painel.
 *
 * Sem imports com alias "@/" (testável sem Next).
 */
import { esperaEmMinutos } from "./atendimento";
import type { DiaAtendimento } from "./config";

export const COMISSAO_BRUTA = 0.06;
const DIA_MS = 86_400_000;
export const MOTIVOS_EM_DESTAQUE = ["Contato inválido", "Contato pessoal"];

export interface LeadDash {
  id: string;
  nome: string;
  donoId: string | null;
  etapaId: string;
  status: "open" | "won" | "lost";
  pago: boolean;
  /** chaveOrigem: meta, anuncio_whatsapp, site, whatsapp, linkbio, indicacao... */
  origem: string;
  anuncio: string | null;
  imovel: string | null;
  interesse: string[];
  criadoEm: number;
  fechadoEm: number | null;
  /** Entrou na etapa atual (crm_leads.stage_changed_at). */
  etapaDesde: number | null;
  valorCents: number | null;
  vgvCents: number | null;
  comissaoOpaCents: number | null;
  motivoPerda: string | null;
  /** custom_fields.perdido_na_etapa (gravado desde 07/11/2026). */
  perdidoNaEtapa: string | null;
  voltouEm: number | null;
}

export interface EtapaDash {
  id: string;
  nome: string;
  slug: string;
  posicao: number;
  ganho: boolean;
  perdido: boolean;
}

export interface VisitaDash {
  leadId: string;
  status: string;
  quando: number;
}

export interface RepasseDash {
  leadId: string;
  de: string | null;
  para: string | null;
  em: number;
}

export interface EntradaDash {
  periodo: { de: number; ate: number; anterior: { de: number; ate: number } };
  agora: number;
  leads: LeadDash[];
  etapas: EtapaDash[];
  /** Início da espera e primeira resposta (fn_opa_resposta_do_lead). */
  respostas: Map<string, { inicio: number; resposta: number | null }>;
  prazos: { pago_min: number; organico_min: number };
  horario: DiaAtendimento[];
  visitas: VisitaDash[];
  repasses: RepasseDash[];
  imoveisAtivos: Array<{ codigo: string; titulo: string }>;
}

export interface Comparado {
  atual: number;
  antes: number | null;
}

export interface LinhaCorretor {
  id: string;
  recebidos: number;
  avaliados: number;
  noPrazo: number;
  /** % no prazo entre os avaliados; null sem lead avaliado. */
  pctPrazo: number | null;
  /** Média em minutos de atendimento até a primeira resposta. */
  tempoMedioMin: number | null;
  visitas: number;
  propostas: number;
  ganhos: number;
  perdidos: number;
  /** ganhos / recebidos. */
  conversao: number | null;
  repassesRecebidos: number;
  repassesPerdidos: number;
}

export interface Dashboard {
  grandes: {
    leads: Comparado;
    pctPrazo: { atual: number | null; antes: number | null; avaliados: number; pendentes: number };
    visitasRealizadas: Comparado;
    vgvProposta: { cents: number; leads: number };
    ganhos: Comparado & { vgvCents: number; comissaoBrutaCents: number; comissaoOpaCents: number };
  };
  funil: Array<{ id: string; nome: string; alcancaram: number; agora: number; passagem: number | null }>;
  semMomento: number;
  corretores: LinhaCorretor[];
  perdidos: { total: number; porMotivo: Array<{ motivo: string; n: number; destaque: boolean }>; porEtapa: Array<{ etapa: string; n: number }> };
  origens: Array<{ chave: string; leads: number; ganhos: number; conversao: number | null }>;
  visitas: { realizadas: number; agendadas: number; naoAconteceram: number };
  porImovel: Array<{ codigo: string; n: number }>;
  porAnuncio: Array<{ anuncio: string; n: number }>;
  imoveisSemLead: Array<{ codigo: string; titulo: string }>;
  parados: Array<{ etapaId: string; etapa: string; d7: number; d14: number; d30: number }>;
  tempoNaEtapa: Array<{ etapaId: string; etapa: string; dias: number | null; abertos: number }>;
  repasses: Array<{ de: string | null; para: string | null; n: number }>;
  voltaram: number;
  ticketMedioCents: number | null;
  cicloMedioDias: number | null;
  /** chave -> ids dos leads por trás do número (clique). */
  listas: Map<string, string[]>;
}

const em = (t: number | null, p: { de: number; ate: number }) => t !== null && t >= p.de && t < p.ate;
const pct = (a: number, b: number) => (b > 0 ? a / b : null);

function contar<K>(itens: K[], chave: (k: K) => string | null): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const i of itens) {
    const k = chave(i);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Prazo da primeira resposta de um conjunto de leads (mesma regra do Início). */
function prazoDe(leads: LeadDash[], e: EntradaDash) {
  let avaliados = 0;
  let noPrazo = 0;
  let pendentes = 0;
  let somaMin = 0;
  let respondidos = 0;
  const fora: string[] = [];
  for (const l of leads) {
    const prazo = l.pago ? e.prazos.pago_min : e.prazos.organico_min;
    const r = e.respostas.get(l.id);
    const inicio = r?.inicio ?? l.criadoEm;
    if (r?.resposta != null) {
      const min = esperaEmMinutos(inicio, r.resposta, e.horario);
      avaliados++;
      respondidos++;
      somaMin += min;
      if (min <= prazo) noPrazo++;
      else fora.push(l.id);
    } else if (esperaEmMinutos(inicio, e.agora, e.horario) > prazo) {
      avaliados++;
      fora.push(l.id);
    } else {
      pendentes++;
    }
  }
  return { avaliados, noPrazo, pendentes, fora, tempoMedioMin: respondidos ? somaMin / respondidos : null };
}

export function montarDashboard(e: EntradaDash): Dashboard {
  const { periodo } = e;
  const listas = new Map<string, string[]>();
  const guardar = (k: string, ids: string[]) => listas.set(k, ids);

  const etapas = [...e.etapas].sort((a, b) => a.posicao - b.posicao);
  const porId = new Map(etapas.map((s) => [s.id, s]));
  const caminho = etapas.filter((s) => !s.ganho && !s.perdido && s.slug !== "sem-momento");
  const semMomento = etapas.find((s) => s.slug === "sem-momento");
  const proposta = etapas.find((s) => s.slug === "proposta");
  const primeira = caminho[0]?.posicao ?? 0;
  const maxPos = Number.MAX_SAFE_INTEGER;

  const novos = e.leads.filter((l) => em(l.criadoEm, periodo));
  const novosAntes = e.leads.filter((l) => em(l.criadoEm, periodo.anterior));
  const ganhos = e.leads.filter((l) => l.status === "won" && em(l.fechadoEm, periodo));
  const ganhosAntes = e.leads.filter((l) => l.status === "won" && em(l.fechadoEm, periodo.anterior));
  const perdidos = e.leads.filter((l) => l.status === "lost" && em(l.fechadoEm, periodo));
  const abertos = e.leads.filter((l) => l.status === "open");
  const porLead = new Map(e.leads.map((l) => [l.id, l]));

  /** Até onde o lead chegou: ganho passou por tudo; perdido, pela etapa gravada; aberto, pela atual. */
  const alcance = (l: LeadDash): number => {
    if (l.status === "won") return maxPos;
    const id = l.status === "lost" ? l.perdidoNaEtapa : l.etapaId;
    const s = id ? porId.get(id) : undefined;
    if (!s || s.ganho || s.perdido || s.slug === "sem-momento") return primeira;
    return s.posicao;
  };

  // ---- grandes
  const p = prazoDe(novos, e);
  const pAntes = prazoDe(novosAntes, e);
  const realizadas = e.visitas.filter((v) => v.status === "feita" && em(v.quando, periodo));
  const realizadasAntes = e.visitas.filter((v) => v.status === "feita" && em(v.quando, periodo.anterior));
  const emProposta = proposta
    ? abertos.filter((l) => {
        const s = porId.get(l.etapaId);
        return s && !s.ganho && !s.perdido && s.slug !== "sem-momento" && s.posicao >= proposta.posicao;
      })
    : [];
  const vgvGanho = ganhos.reduce((t, l) => t + (l.vgvCents ?? l.valorCents ?? 0), 0);
  guardar("novos", novos.map((l) => l.id));
  guardar("fora-prazo", p.fora);
  guardar("visitas", [...new Set(realizadas.map((v) => v.leadId))]);
  guardar("proposta", emProposta.map((l) => l.id));
  guardar("ganhos", ganhos.map((l) => l.id));
  guardar("perdidos", perdidos.map((l) => l.id));

  // ---- funil: dos que entraram no período, quantos chegaram a cada etapa
  const funil = caminho.map((s, i) => {
    const chegaram = novos.filter((l) => alcance(l) >= s.posicao);
    guardar(`etapa:${s.id}`, chegaram.map((l) => l.id));
    const agora = novos.filter((l) => l.status === "open" && l.etapaId === s.id).length;
    return { id: s.id, nome: s.nome, alcancaram: chegaram.length, agora, passagem: null as number | null, i };
  });
  const ganhosDosNovos = novos.filter((l) => l.status === "won");
  guardar("etapa:ganho", ganhosDosNovos.map((l) => l.id));
  const linhasFunil = [...funil, { id: "ganho", nome: "Ganho", alcancaram: ganhosDosNovos.length, agora: ganhosDosNovos.length, passagem: null as number | null, i: funil.length }];
  for (let i = 1; i < linhasFunil.length; i++) linhasFunil[i]!.passagem = pct(linhasFunil[i]!.alcancaram, linhasFunil[i - 1]!.alcancaram);
  const semMomentoIds = semMomento ? novos.filter((l) => l.status === "open" && l.etapaId === semMomento.id).map((l) => l.id) : [];
  guardar("sem-momento", semMomentoIds);

  // ---- corretores
  const donos = new Set<string>();
  for (const l of [...novos, ...ganhos, ...perdidos]) if (l.donoId) donos.add(l.donoId);
  for (const r of e.repasses) {
    if (r.de) donos.add(r.de);
    if (r.para) donos.add(r.para);
  }
  const repassesNoPeriodo = e.repasses.filter((r) => em(r.em, periodo));
  const corretores: LinhaCorretor[] = [...donos].map((id) => {
    const dele = novos.filter((l) => l.donoId === id);
    const pr = prazoDe(dele, e);
    const visitas = realizadas.filter((v) => porLead.get(v.leadId)?.donoId === id);
    const propostas = proposta ? dele.filter((l) => alcance(l) >= proposta.posicao) : [];
    const g = ganhos.filter((l) => l.donoId === id);
    const pe = perdidos.filter((l) => l.donoId === id);
    guardar(`corretor:${id}`, dele.map((l) => l.id));
    guardar(`corretor-fora:${id}`, pr.fora);
    guardar(`corretor-ganhos:${id}`, g.map((l) => l.id));
    guardar(`corretor-perdidos:${id}`, pe.map((l) => l.id));
    return {
      id,
      recebidos: dele.length,
      avaliados: pr.avaliados,
      noPrazo: pr.noPrazo,
      pctPrazo: pct(pr.noPrazo, pr.avaliados),
      tempoMedioMin: pr.tempoMedioMin,
      visitas: visitas.length,
      propostas: propostas.length,
      ganhos: g.length,
      perdidos: pe.length,
      conversao: pct(g.length, dele.length),
      repassesRecebidos: repassesNoPeriodo.filter((r) => r.para === id).length,
      repassesPerdidos: repassesNoPeriodo.filter((r) => r.de === id).length,
    };
  });

  // ---- perdidos
  const porMotivo = contar(perdidos, (l) => l.motivoPerda?.trim() || "Sem motivo").map(([motivo, n]) => {
    guardar(`motivo:${motivo}`, perdidos.filter((l) => (l.motivoPerda?.trim() || "Sem motivo") === motivo).map((l) => l.id));
    return { motivo, n, destaque: MOTIVOS_EM_DESTAQUE.includes(motivo) };
  });
  const porEtapa = contar(perdidos, (l) => (l.perdidoNaEtapa ? (porId.get(l.perdidoNaEtapa)?.nome ?? "Etapa removida") : "Sem registro")).map(([etapa, n]) => ({ etapa, n }));

  // ---- origens
  const origens = contar(novos, (l) => l.origem || "outros").map(([chave, n]) => {
    const g = ganhos.filter((l) => (l.origem || "outros") === chave).length;
    guardar(`origem:${chave}`, novos.filter((l) => (l.origem || "outros") === chave).map((l) => l.id));
    return { chave, leads: n, ganhos: g, conversao: pct(g, n) };
  });

  // ---- visitas
  const doPeriodo = e.visitas.filter((v) => em(v.quando, periodo));
  const agendadas = doPeriodo.filter((v) => v.status === "agendada" && v.quando >= e.agora);
  const naoAconteceram = doPeriodo.filter((v) => v.status === "cancelada" || (v.status === "agendada" && v.quando < e.agora));
  guardar("visitas-agendadas", [...new Set(agendadas.map((v) => v.leadId))]);
  guardar("visitas-nao", [...new Set(naoAconteceram.map((v) => v.leadId))]);

  // ---- imóveis e anúncios
  const porImovel = contar(novos, (l) => l.imovel).slice(0, 8).map(([codigo, n]) => {
    guardar(`imovel:${codigo}`, novos.filter((l) => l.imovel === codigo).map((l) => l.id));
    return { codigo, n };
  });
  const porAnuncio = contar(novos, (l) => l.anuncio).slice(0, 8).map(([anuncio, n]) => {
    guardar(`anuncio:${anuncio}`, novos.filter((l) => l.anuncio === anuncio).map((l) => l.id));
    return { anuncio, n };
  });
  const desde30 = e.agora - 30 * DIA_MS;
  const comLead30 = new Set<string>();
  for (const l of e.leads) {
    if (l.criadoEm < desde30) continue;
    if (l.imovel) comLead30.add(l.imovel);
    for (const c of l.interesse) comLead30.add(c);
  }
  const imoveisSemLead = e.imoveisAtivos.filter((i) => !comLead30.has(i.codigo));

  // ---- parados e tempo na etapa atual (só abertos)
  const parados = caminho.map((s) => {
    const nela = abertos.filter((l) => l.etapaId === s.id && l.etapaDesde !== null);
    const dias = (l: LeadDash) => (e.agora - l.etapaDesde!) / DIA_MS;
    const d30 = nela.filter((l) => dias(l) >= 30);
    guardar(`parados:7:${s.id}`, nela.filter((l) => dias(l) >= 7).map((l) => l.id));
    guardar(`parados:14:${s.id}`, nela.filter((l) => dias(l) >= 14).map((l) => l.id));
    guardar(`parados:30:${s.id}`, d30.map((l) => l.id));
    return { etapaId: s.id, etapa: s.nome, d7: nela.filter((l) => dias(l) >= 7).length, d14: nela.filter((l) => dias(l) >= 14).length, d30: d30.length };
  });
  const tempoNaEtapa = caminho.map((s) => {
    const nela = abertos.filter((l) => l.etapaId === s.id && l.etapaDesde !== null);
    const soma = nela.reduce((t, l) => t + (e.agora - l.etapaDesde!) / DIA_MS, 0);
    return { etapaId: s.id, etapa: s.nome, dias: nela.length ? soma / nela.length : null, abertos: nela.length };
  });

  // ---- repasses, voltas, ticket e ciclo
  const repasses = contar(repassesNoPeriodo, (r) => `${r.de ?? ""}>${r.para ?? ""}`).map(([k, n]) => {
    const [de, para] = k.split(">");
    return { de: de || null, para: para || null, n };
  });
  guardar("repasses", [...new Set(repassesNoPeriodo.map((r) => r.leadId))]);
  const voltaram = e.leads.filter((l) => em(l.voltouEm, periodo));
  guardar("voltaram", voltaram.map((l) => l.id));
  const ciclos = ganhos.filter((l) => l.fechadoEm !== null).map((l) => (l.fechadoEm! - l.criadoEm) / DIA_MS);

  return {
    grandes: {
      leads: { atual: novos.length, antes: novosAntes.length },
      pctPrazo: { atual: pct(p.noPrazo, p.avaliados), antes: pct(pAntes.noPrazo, pAntes.avaliados), avaliados: p.avaliados, pendentes: p.pendentes },
      visitasRealizadas: { atual: realizadas.length, antes: realizadasAntes.length },
      vgvProposta: { cents: emProposta.reduce((t, l) => t + (l.valorCents ?? 0), 0), leads: emProposta.length },
      ganhos: {
        atual: ganhos.length,
        antes: ganhosAntes.length,
        vgvCents: vgvGanho,
        comissaoBrutaCents: Math.round(vgvGanho * COMISSAO_BRUTA),
        comissaoOpaCents: ganhos.reduce((t, l) => t + (l.comissaoOpaCents ?? 0), 0),
      },
    },
    funil: linhasFunil.map(({ id, nome, alcancaram, agora, passagem }) => ({ id, nome, alcancaram, agora, passagem })),
    semMomento: semMomentoIds.length,
    corretores,
    perdidos: { total: perdidos.length, porMotivo, porEtapa },
    origens,
    visitas: { realizadas: realizadas.length, agendadas: agendadas.length, naoAconteceram: naoAconteceram.length },
    porImovel,
    porAnuncio,
    imoveisSemLead,
    parados,
    tempoNaEtapa,
    repasses,
    voltaram: voltaram.length,
    ticketMedioCents: ganhos.length ? Math.round(vgvGanho / ganhos.length) : null,
    cicloMedioDias: ciclos.length ? ciclos.reduce((t, d) => t + d, 0) / ciclos.length : null,
    listas,
  };
}

export type ColunaCorretor = "recebidos" | "pctPrazo" | "tempoMedioMin" | "visitas" | "propostas" | "ganhos" | "perdidos" | "conversao";

/** Ordena a tabela por corretor; vazio vai sempre para o fim. Tempo médio: menor é melhor, mas a ordem é a pedida. */
export function ordenarCorretores(linhas: LinhaCorretor[], coluna: ColunaCorretor, direcao: "asc" | "desc"): LinhaCorretor[] {
  const sinal = direcao === "asc" ? 1 : -1;
  return [...linhas].sort((a, b) => {
    const x = a[coluna];
    const y = b[coluna];
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x - y) * sinal;
  });
}
