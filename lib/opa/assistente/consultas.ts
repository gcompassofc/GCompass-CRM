/**
 * Consultas do assistente do OPA Lembretes (lib/opa/assistente/regras.ts).
 *
 * Só leitura. Usa o cliente admin, então a permissão é conferida AQUI, em cada
 * função: o corretor recebe só o que é dele; gestor e administrador, a equipe toda.
 * Nenhuma função devolve telefone em lista, valor de comissão ou texto de conversa
 * com o cliente: só os acontecimentos do lead.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";

import { carregarEquipe, rotuloOrigem, type OrigemLead } from "../dados";
import { montarHistorico, tempoGasto, type AtividadeDoLead } from "../historico";
import { precoCheio } from "../imoveis";
import { emLotes } from "../lotes";
import { diaSP } from "../periodo";
import { MAX_ITENS, TEXTO_SEM_CORRETOR, TEXTO_SO_OS_SEUS, diaEHora, soHora, textoHistorico, textoLista, textoSituacao, veTudo, type Pessoa } from "./regras";

type Admin = SupabaseClient;
type Equipe = Awaited<ReturnType<typeof carregarEquipe>>;

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const link = (leadId: string) => `${env.NEXT_PUBLIC_APP_URL}/app/leads/${leadId}`;
const nomeNaEquipe = (equipe: Equipe, id: string | null | undefined) => (equipe.get(id ?? "")?.nome ?? "").trim().split(/\s+/)[0] || "alguém que saiu da equipe";

/** O lead é de quem pergunta? Gestor e administrador veem todos. */
export function ehDaPessoa(pessoa: Pick<Pessoa, "papel" | "usuario">, donoId: string | null): boolean {
  return veTudo(pessoa.papel) || (Boolean(pessoa.usuario) && pessoa.usuario === donoId);
}

interface LinhaLead {
  id: string;
  title: string;
  status: "open" | "won" | "lost";
  owner_user_id: string | null;
  source: string | null;
  created_at: string;
  custom_fields: Record<string, unknown> | null;
  contacts: { name: string | null; phone_number: string | null } | null;
  crm_stages: { name: string | null } | null;
  crm_pipelines: { slug: string | null } | null;
}

const COLUNAS = "id, title, status, owner_user_id, source, created_at, custom_fields, contacts(name, phone_number), crm_stages(name), crm_pipelines(slug)";

export interface LeadAchado {
  id: string;
  nome: string;
  etapa: string;
  donoId: string | null;
  status: "open" | "won" | "lost";
  criadoEm: string;
  origem: OrigemLead;
  imovel: string | null;
}

function paraLead(l: LinhaLead): LeadAchado {
  const cf = l.custom_fields ?? {};
  return {
    id: l.id,
    // Nome de formulário vem com espaço sobrando e caractere invisível: uma linha limpa.
    nome: (l.contacts?.name ?? "").replace(/[​-‏‪-‮⁠﻿]/g, "").replace(/\s+/g, " ").trim() || l.title.split(" · ")[0]?.trim() || "Lead",
    etapa: l.status === "won" ? "Ganho" : l.status === "lost" ? "Perdido" : (l.crm_stages?.name ?? "Sem etapa"),
    donoId: l.owner_user_id,
    status: l.status,
    criadoEm: l.created_at,
    origem: (cf.origem as OrigemLead | undefined) ?? { canal: l.source ?? undefined },
    imovel: (cf.imovel_codigo as string | undefined) ?? null,
  };
}

/** Os leads de compradores da empresa (sem os cards do Radar), do mais novo para o mais velho. */
async function leadsDaEmpresa(admin: Admin, orgId: string, filtro: { desde?: string; soAbertos?: boolean } = {}): Promise<LinhaLead[]> {
  const todos: LinhaLead[] = [];
  for (let de = 0; de < 5000; de += 1000) {
    // `source` vazio também entra: no Postgres, "diferente de radar" sozinho deixaria o nulo de fora.
    let c = admin.from("crm_leads").select(COLUNAS).eq("organization_id", orgId).or("source.is.null,source.neq.radar");
    if (filtro.desde) c = c.gte("created_at", filtro.desde);
    if (filtro.soAbertos) c = c.eq("status", "open");
    const { data, error } = await c.order("created_at", { ascending: false }).order("id").range(de, de + 999);
    if (error) throw new Error(`assistente: leads: ${error.message}`);
    const pagina = (data ?? []) as unknown as LinhaLead[];
    todos.push(...pagina);
    if (pagina.length < 1000) break;
  }
  return todos.filter((l) => (l.crm_pipelines?.slug ?? "compradores") === "compradores");
}

/**
 * Acha o lead pelo nome (sem acento nem maiúscula) ou pelo telefone (4 dígitos ou
 * mais). Abertos primeiro, depois os mais novos. Não filtra por dono: quem chama
 * decide o que mostrar a quem (ehDaPessoa).
 */
export async function acharLeads(admin: Admin, orgId: string, termo: string): Promise<LeadAchado[]> {
  const alvo = semAcento(termo);
  const digitos = termo.replace(/\D/g, "");
  const porTelefone = digitos.length >= 4 && digitos.length >= termo.replace(/[\s()+-]/g, "").length - 1;
  const leads = await leadsDaEmpresa(admin, orgId);
  const achados = leads.filter((l) => {
    if (porTelefone) return (l.contacts?.phone_number ?? "").replace(/\D/g, "").includes(digitos.replace(/^0+/, ""));
    return semAcento(l.contacts?.name ?? "").includes(alvo) || semAcento(l.title).includes(alvo);
  });
  return achados.sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || Date.parse(b.created_at) - Date.parse(a.created_at)).map(paraLead);
}

/** Primeira resposta de cada lead, calculada no banco (mensagem, ligação ou "Respondi"). */
async function respostasDosLeads(admin: Admin, orgId: string, ids: string[]): Promise<Map<string, { inicio: number; resposta: number | null }>> {
  const mapa = new Map<string, { inicio: number; resposta: number | null }>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await admin.rpc("fn_opa_resposta_do_lead", { p_org: orgId, p_leads: ids.slice(i, i + 500) });
    if (error) throw new Error(`assistente: respostas: ${error.message}`);
    for (const [id, v] of Object.entries((data ?? {}) as Record<string, { inicio: string; resposta: string | null }>)) {
      mapa.set(id, { inicio: Date.parse(v.inicio), resposta: v.resposta ? Date.parse(v.resposta) : null });
    }
  }
  return mapa;
}

async function atendimentoDoLead(admin: Admin, orgId: string, lead: LeadAchado, equipe: Equipe, agora: number) {
  const [{ data, error }, respostas] = await Promise.all([
    admin
      .from("crm_lead_activities")
      .select("type, payload, performed_at, reason")
      .eq("organization_id", orgId)
      .eq("lead_id", lead.id)
      .not("type", "in", "(nota,lead_cooled,lead_reactivated,reactivation_expired,ai_turn)")
      .order("performed_at", { ascending: false })
      .limit(200),
    respostasDosLeads(admin, orgId, [lead.id]),
  ]);
  if (error) throw new Error(`assistente: histórico: ${error.message}`);
  const r = respostas.get(lead.id);
  return montarHistorico({
    criadoEm: lead.criadoEm,
    entrada: rotuloOrigem(lead.origem, "nova entrada"),
    imovelCodigo: lead.imovel,
    donoAtualId: lead.donoId,
    aberto: lead.status === "open",
    atividades: (data ?? []) as AtividadeDoLead[],
    primeiraSaidaEm: r?.resposta ? new Date(r.resposta).toISOString() : null,
    nomeDe: (id) => nomeNaEquipe(equipe, id),
    agora,
  });
}

export async function historicoDoLead(admin: Admin, orgId: string, lead: LeadAchado, agora = Date.now()): Promise<string> {
  const equipe = await carregarEquipe(orgId);
  const { itens } = await atendimentoDoLead(admin, orgId, lead, equipe, agora);
  return textoHistorico({
    nome: lead.nome,
    etapa: lead.etapa,
    corretor: nomeNaEquipe(equipe, lead.donoId),
    itens: itens.map((i) => ({ em: i.em, texto: i.texto, detalhe: i.detalhe, agora: i.tipo === "sem_resposta" })),
    link: link(lead.id),
  });
}

export async function situacaoDoLead(admin: Admin, orgId: string, lead: LeadAchado, agora = Date.now()): Promise<string> {
  const equipe = await carregarEquipe(orgId);
  const { resumo } = await atendimentoDoLead(admin, orgId, lead, equipe, agora);
  const resposta = resumo.resposta
    ? `Primeira resposta: ${tempoGasto(resumo.resposta.minutos)}, de ${resumo.resposta.quem}`
    : resumo.semRespostaMin !== null
      ? `Sem resposta há ${tempoGasto(resumo.semRespostaMin)}`
      : "Primeira resposta: não registrada";
  return textoSituacao({
    nome: lead.nome,
    etapa: lead.etapa,
    corretor: nomeNaEquipe(equipe, lead.donoId),
    entrada: resumo.entrada,
    entrouEm: lead.criadoEm,
    imovel: lead.imovel,
    resposta,
    link: link(lead.id),
  });
}

/** Leads abertos dos últimos 30 dias que ainda não tiveram a primeira resposta, do que espera há mais tempo para o mais recente. */
async function esperando(admin: Admin, orgId: string, agora: number): Promise<Array<{ lead: LeadAchado; min: number }>> {
  const leads = (await leadsDaEmpresa(admin, orgId, { soAbertos: true, desde: new Date(agora - 30 * 86_400_000).toISOString() })).filter((l) => l.owner_user_id);
  const respostas = await respostasDosLeads(admin, orgId, leads.map((l) => l.id));
  return leads
    .filter((l) => respostas.get(l.id)?.resposta == null)
    .map((l) => ({ lead: paraLead(l), min: Math.max(1, Math.round((agora - (respostas.get(l.id)?.inicio ?? Date.parse(l.created_at))) / 60_000)) }))
    .sort((a, b) => b.min - a.min);
}

export async function leadsSemResposta(admin: Admin, orgId: string, pessoa: Pessoa, agora = Date.now()): Promise<string> {
  const equipe = await carregarEquipe(orgId);
  const lista = (await esperando(admin, orgId, agora)).filter((x) => ehDaPessoa(pessoa, x.lead.donoId));
  const geral = veTudo(pessoa.papel);
  return textoLista(
    `${lista.length} ${lista.length === 1 ? "lead sem resposta" : "leads sem resposta"}:`,
    lista.map((x) => `${x.lead.nome}${geral ? `, com ${nomeNaEquipe(equipe, x.lead.donoId)}` : ""}, há ${tempoGasto(x.min)}`),
    "Nenhum lead sem resposta.",
    lista.length > MAX_ITENS ? `${env.NEXT_PUBLIC_APP_URL}/app/fila` : undefined,
  );
}

/**
 * Leads abertos: os da pessoa ("meus leads") ou os de um corretor ("leads do Marco").
 * O corretor só vê os dele. Gestor e administrador sem corretor citado veem a equipe.
 * Sai o total, quantos por etapa e os 10 mais recentes, sem telefone.
 */
export async function leadsAbertos(admin: Admin, orgId: string, pessoa: Pessoa, corretor: string | null): Promise<string> {
  const equipe = await carregarEquipe(orgId);
  let donoId: string | null = null;
  if (corretor) {
    const alvo = semAcento(corretor);
    const candidatos = [...equipe.values()].filter((p) => semAcento(p.nome).split(/\s+/).includes(alvo) || semAcento(p.nome) === alvo);
    if (candidatos.length === 0) return TEXTO_SEM_CORRETOR;
    // Dois com o mesmo nome: fica o que tem o primeiro nome igual; sem desempate, o primeiro.
    donoId = (candidatos.find((p) => semAcento(p.nome).split(/\s+/)[0] === alvo) ?? candidatos[0]!).id;
    if (!veTudo(pessoa.papel) && donoId !== pessoa.usuario) return TEXTO_SO_OS_SEUS;
  } else if (!veTudo(pessoa.papel) || pessoa.usuario) {
    donoId = pessoa.usuario;
    if (!donoId) return TEXTO_SO_OS_SEUS;
  }
  const lista = (await leadsDaEmpresa(admin, orgId, { soAbertos: true })).map(paraLead).filter((l) => donoId === null || l.donoId === donoId);
  const de = donoId ? `com ${nomeNaEquipe(equipe, donoId)}` : "da equipe";
  if (lista.length === 0) return `Nenhum lead aberto ${de}.`;
  const porEtapa = new Map<string, number>();
  for (const l of lista) porEtapa.set(l.etapa, (porEtapa.get(l.etapa) ?? 0) + 1);
  const etapas = [...porEtapa.entries()].sort((a, b) => b[1] - a[1]).map(([e, n]) => `${e}: ${n}`);
  return [
    `${lista.length} ${lista.length === 1 ? "lead aberto" : "leads abertos"} ${de}`,
    `Por etapa:\n${etapas.join("\n")}`,
    `Mais recentes:\n${lista
      .slice(0, MAX_ITENS)
      .map((l, i) => `${i + 1}. ${l.nome} (${l.etapa}${donoId ? "" : `, com ${nomeNaEquipe(equipe, l.donoId)}`})`)
      .join("\n")}`,
    `Ver todos: ${env.NEXT_PUBLIC_APP_URL}/app/leads${donoId ? `?corretor=${donoId}` : ""}`,
  ].join("\n\n");
}

/** Meia-noite de hoje em Ilhabela, em ISO. */
function inicioDoDia(agora: number): string {
  return new Date(`${diaSP(agora)}T00:00:00-03:00`).toISOString();
}

export async function leadsNovos(admin: Admin, orgId: string, pessoa: Pessoa, periodo: "hoje" | "semana", agora = Date.now()): Promise<string> {
  const equipe = await carregarEquipe(orgId);
  const desde = periodo === "semana" ? new Date(Date.parse(inicioDoDia(agora)) - 6 * 86_400_000).toISOString() : inicioDoDia(agora);
  const lista = (await leadsDaEmpresa(admin, orgId, { desde })).map(paraLead).filter((l) => ehDaPessoa(pessoa, l.donoId));
  const geral = veTudo(pessoa.papel);
  const quando = periodo === "semana" ? "nos últimos 7 dias" : "hoje";
  return textoLista(
    `${lista.length} ${lista.length === 1 ? "lead novo" : "leads novos"} ${quando}:`,
    lista.map((l) => `${l.nome}, ${periodo === "semana" ? diaEHora(l.criadoEm) : soHora(l.criadoEm)}, ${rotuloOrigem(l.origem, "nova entrada")}${geral ? `, com ${nomeNaEquipe(equipe, l.donoId)}` : ""}`),
    `Nenhum lead novo ${quando}.`,
    lista.length > MAX_ITENS ? `${env.NEXT_PUBLIC_APP_URL}/app/leads` : undefined,
  );
}

export async function agendaDoDia(admin: Admin, orgId: string, pessoa: Pessoa, agora = Date.now()): Promise<string> {
  const de = inicioDoDia(agora);
  const ate = new Date(Date.parse(de) + 86_400_000).toISOString();
  const [{ data: lembretes, error: e1 }, { data: visitas, error: e2 }] = await Promise.all([
    admin
      .from("lembretes_agendados")
      .select("quando, mensagem, para_user_id, lead_id")
      .eq("organization_id", orgId)
      .eq("status", "pendente")
      .gte("quando", de)
      .lt("quando", ate)
      .order("quando")
      .limit(100),
    admin.from("visitas").select("quando, imovel_codigo, lead_id").eq("organization_id", orgId).eq("status", "agendada").gte("quando", de).lt("quando", ate).order("quando").limit(100),
  ]);
  if (e1 || e2) throw new Error(`assistente: agenda: ${(e1 ?? e2)!.message}`);
  const ls = (lembretes ?? []) as Array<{ quando: string; mensagem: string; para_user_id: string | null; lead_id: string | null }>;
  const vs = (visitas ?? []) as Array<{ quando: string; imovel_codigo: string | null; lead_id: string }>;
  const ids = [...new Set([...ls.map((l) => l.lead_id), ...vs.map((v) => v.lead_id)].filter((x): x is string => Boolean(x)))];
  const leads = (await emLotes(ids, (lote) => admin.from("crm_leads").select("id, title, owner_user_id, contacts(name)").eq("organization_id", orgId).in("id", lote))) as unknown as Array<{
    id: string;
    title: string;
    owner_user_id: string | null;
    contacts: { name: string | null } | null;
  }>;
  const porId = new Map(leads.map((l) => [l.id, { nome: l.contacts?.name?.trim() || l.title.split(" · ")[0] || "Lead", dono: l.owner_user_id }]));
  const itens = [
    ...ls
      .filter((l) => (veTudo(pessoa.papel) && !pessoa.usuario) || l.para_user_id === pessoa.usuario)
      .map((l) => ({ em: l.quando, linha: `${soHora(l.quando)} Lembrete: ${l.mensagem.slice(0, 80)}${l.lead_id && porId.get(l.lead_id) ? ` (${porId.get(l.lead_id)!.nome})` : ""}` })),
    ...vs
      .filter((v) => ehDaPessoa(pessoa, porId.get(v.lead_id)?.dono ?? null))
      .map((v) => ({ em: v.quando, linha: `${soHora(v.quando)} Visita: ${porId.get(v.lead_id)?.nome ?? "lead"}${v.imovel_codigo ? `, ${v.imovel_codigo}` : ""}` })),
  ].sort((a, b) => Date.parse(a.em) - Date.parse(b.em));
  return textoLista("Agenda de hoje:", itens.map((i) => i.linha), "Nada na agenda de hoje.");
}

export async function dadosDoImovel(admin: Admin, orgId: string, codigo: string): Promise<string> {
  const { data, error } = await admin
    .from("imoveis")
    .select("codigo, titulo, tipo, bairro, preco_venda_cents, status, dormitorios, suites, area_m2, url_site, off_market")
    .eq("organization_id", orgId)
    .eq("codigo", codigo)
    .maybeSingle();
  if (error) throw new Error(`assistente: imóvel: ${error.message}`);
  const i = data as {
    codigo: string;
    titulo: string;
    tipo: string | null;
    bairro: string | null;
    preco_venda_cents: number | null;
    status: string | null;
    dormitorios: number | null;
    suites: number | null;
    area_m2: number | null;
    url_site: string | null;
    off_market: boolean;
  } | null;
  if (!i) return `Não achei o imóvel ${codigo} na carteira.`;
  const situacao = i.status === "ativo" ? "No site" : i.status === "vendido" ? "Vendido" : "Fora do site";
  return [
    `${i.codigo}: ${i.titulo}`,
    [
      i.bairro ? `Bairro: ${i.bairro}` : null,
      i.preco_venda_cents ? `Valor: ${precoCheio(i.preco_venda_cents)}` : null,
      i.dormitorios ? `Quartos: ${i.dormitorios}${i.suites ? ` (${i.suites} ${i.suites === 1 ? "suíte" : "suítes"})` : ""}` : null,
      i.area_m2 ? `Área: ${i.area_m2} m²` : null,
      `Situação: ${i.off_market ? "Off market" : situacao}`,
    ]
      .filter(Boolean)
      .join("\n"),
    // Imóvel off market não tem link para repassar.
    i.url_site && !i.off_market ? i.url_site : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Números do dia da equipe: só gestor e administrador (podeUsar confere antes). */
export async function resumoDoDia(admin: Admin, orgId: string, agora = Date.now()): Promise<string> {
  const equipe = await carregarEquipe(orgId);
  const [novos, semResposta] = await Promise.all([leadsDaEmpresa(admin, orgId, { desde: inicioDoDia(agora) }), esperando(admin, orgId, agora)]);
  const porCorretor = new Map<string, { novos: number; espera: number }>();
  const conta = (id: string | null) => {
    const nome = nomeNaEquipe(equipe, id);
    if (!porCorretor.has(nome)) porCorretor.set(nome, { novos: 0, espera: 0 });
    return porCorretor.get(nome)!;
  };
  for (const l of novos) conta(l.owner_user_id).novos++;
  for (const x of semResposta) conta(x.lead.donoId).espera++;
  const linhas = [...porCorretor.entries()]
    .sort((a, b) => b[1].espera - a[1].espera || b[1].novos - a[1].novos)
    .map(([nome, n]) => `${nome}: ${n.novos} ${n.novos === 1 ? "novo" : "novos"}, ${n.espera} sem resposta`);
  return [
    `Resumo de hoje\nLeads novos: ${novos.length}\nSem resposta: ${semResposta.length}`,
    linhas.length ? `Por corretor:\n${linhas.slice(0, MAX_ITENS).join("\n")}` : null,
    `Fila: ${env.NEXT_PUBLIC_APP_URL}/app/fila`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
