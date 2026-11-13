/**
 * De quem é este número? Um número pode conversar com mais de um corretor, e cada um
 * tem a própria conversa. Aqui sai a resposta única das telas (pedido do Allyson,
 * 06/11/2026):
 *
 *  - principal: o dono do lead de formulário (quem a roleta escolheu), desde 13/11/2026
 *    (decisão do Allyson no caso da Wandalcy); sem lead de formulário, o corretor que
 *    falou primeiro com a pessoa;
 *  - responsável: o dono do lead aberto; sem lead, o dono da conversa.
 *
 * O mesmo número pode estar em dois contatos (telefone e @lid do WhatsApp, ou com e sem
 * o nono dígito), então a pessoa é agrupada pelo telefone, não pelo contato. Só devolve nomes e datas,
 * nunca o que foi conversado: é o que o corretor precisa para não pisar no colega.
 */
import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import type { createAdminClient } from "@/lib/supabase/admin";

import { veioDeFormulario } from "./veio-de-formulario";

type Admin = ReturnType<typeof createAdminClient>;

export interface ContatoLinha {
  id: string;
  display_name?: string | null;
  name?: string | null;
  phone_number: string | null;
  telefone_indice: string | null;
}
export interface ConversaLinha {
  id: string;
  contact_id: string;
  channel_session_id: string | null;
  assigned_to_user_id: string | null;
  created_at: string;
}
export interface LeadLinha {
  id: string;
  title: string;
  contact_id: string;
  owner_user_id: string | null;
  created_at: string;
  /** Para saber se nasceu de formulário (roleta). */
  source?: string | null;
  origem?: unknown;
}

/** Lead que nasceu de formulário do anúncio ou do site: o dono é quem a roleta escolheu. */
export function ehLeadDaRoleta(l: Pick<LeadLinha, "source" | "origem" | "owner_user_id">): boolean {
  return Boolean(l.owner_user_id) && veioDeFormulario(l.origem ? { origem: l.origem } : null, l.source ?? null);
}

export interface CorretorDoNumero {
  id: string;
  nome: string;
  desde: string;
  conversaId: string;
  principal: boolean;
}

export interface DonosDaConversa {
  responsavel: { id: string; nome: string } | null;
  principal: { id: string; nome: string; desde: string; criterio: "roleta" | "primeira_conversa" } | null;
  corretores: CorretorDoNumero[];
  leadsAbertos: number;
}

export interface PessoaDoNumero extends DonosDaConversa {
  contatos: ContatoLinha[];
  conversas: Array<ConversaLinha & { corretorId: string | null; primeira: string }>;
  leads: LeadLinha[];
  motivos: Array<"dois_leads" | "corretores_diferentes" | "contato_repetido" | "lead_com_outro">;
}

/** Corretor da conversa: o dono do número por onde ela corre; no número da empresa, quem atende. */
export function corretorDaConversa(c: Pick<ConversaLinha, "channel_session_id" | "assigned_to_user_id">, donoDoNumero: Map<string, string | null>): string | null {
  const dono = c.channel_session_id ? donoDoNumero.get(c.channel_session_id) : null;
  return dono ?? c.assigned_to_user_id ?? null;
}

/** Agrupa contatos da mesma pessoa: mesmo índice de telefone ou mesmo número. */
export function agruparContatos(contatos: ContatoLinha[]): ContatoLinha[][] {
  const grupos = new Map<string, ContatoLinha[]>();
  const chaves = new Map<string, string>();
  for (const c of contatos) {
    // Com e sem o nono dígito é a mesma pessoa (13/11/2026): as duas formas viram chave.
    const telefones = c.phone_number ? phoneLookupVariants(c.phone_number) : [];
    const minhas = [c.telefone_indice && `i:${c.telefone_indice}`, ...telefones.map((t) => `t:${t}`)].filter((k): k is string => Boolean(k));
    const achadas = [...new Set(minhas.map((k) => chaves.get(k)).filter((k): k is string => Boolean(k)))];
    const chave = achadas[0] ?? `c:${c.id}`;
    // Um contato pode ligar dois grupos que já existiam (um pelo índice, outro pelo número): junta.
    for (const outra of achadas.slice(1)) {
      grupos.set(chave, [...(grupos.get(chave) ?? []), ...(grupos.get(outra) ?? [])]);
      grupos.delete(outra);
      for (const [k, v] of chaves) if (v === outra) chaves.set(k, chave);
    }
    for (const k of minhas) chaves.set(k, chave);
    grupos.set(chave, [...(grupos.get(chave) ?? []), c]);
  }
  return [...grupos.values()];
}

/** O cálculo em si, sem banco. */
export function montarPessoa(
  contatos: ContatoLinha[],
  conversas: ConversaLinha[],
  leads: LeadLinha[],
  donoDoNumero: Map<string, string | null>,
  primeiras: Map<string, string>,
  nomeDe: (id: string) => string,
): PessoaDoNumero {
  const com = conversas
    .map((c) => ({ ...c, corretorId: corretorDaConversa(c, donoDoNumero), primeira: primeiras.get(c.id) ?? c.created_at }))
    .sort((a, b) => a.primeira.localeCompare(b.primeira));

  const leadsEmOrdem = [...leads].sort((a, b) => a.created_at.localeCompare(b.created_at));
  // Lead de formulário: o principal é quem a roleta escolheu, mesmo que outro corretor tenha
  // falado antes (a mensagem automática da Meta cai no número da página segundos depois).
  const daRoleta = leadsEmOrdem.find(ehLeadDaRoleta);

  // Sem lead da roleta, quem aparece primeiro na lista, já em ordem, é o principal. Conversa sem corretor não conta.
  const vistos = new Set<string>();
  const corretores: CorretorDoNumero[] = [];
  for (const c of com) {
    if (!c.corretorId || vistos.has(c.corretorId)) continue;
    vistos.add(c.corretorId);
    corretores.push({ id: c.corretorId, nome: nomeDe(c.corretorId), desde: c.primeira, conversaId: c.id, principal: false });
  }
  const idPrincipal = daRoleta?.owner_user_id ?? corretores[0]?.id ?? null;
  for (const c of corretores) c.principal = c.id === idPrincipal;
  const principal = daRoleta?.owner_user_id
    ? { id: daRoleta.owner_user_id, nome: nomeDe(daRoleta.owner_user_id), desde: daRoleta.created_at, criterio: "roleta" as const }
    : corretores[0]
      ? { id: corretores[0].id, nome: corretores[0].nome, desde: corretores[0].desde, criterio: "primeira_conversa" as const }
      : null;
  const donoDoLead = donoDoLeadDe(leadsEmOrdem);
  const idResponsavel = donoDoLead ?? com.find((c) => c.corretorId)?.corretorId ?? null;

  const motivos: PessoaDoNumero["motivos"] = [];
  if (leads.length > 1) motivos.push("dois_leads");
  // Outro corretor conversando não é problema quando o lead é da roleta e está com o dono certo:
  // esse corretor já recebe o aviso "esse lead está com outro corretor".
  const resolvidoPelaRoleta = Boolean(daRoleta) && leads.length === 1 && donoDoLeadDe(leadsEmOrdem) === principal?.id;
  if (corretores.length > 1 && !resolvidoPelaRoleta) motivos.push("corretores_diferentes");
  if (contatos.length > 1) motivos.push("contato_repetido");
  if (donoDoLead && principal && donoDoLead !== principal.id) motivos.push("lead_com_outro");

  return {
    responsavel: idResponsavel ? { id: idResponsavel, nome: nomeDe(idResponsavel) } : null,
    principal,
    corretores,
    leadsAbertos: leads.length,
    contatos,
    conversas: com,
    leads: leadsEmOrdem,
    motivos,
  };
}

function donoDoLeadDe(leads: LeadLinha[]): string | null {
  return leads.find(ehLeadDaRoleta)?.owner_user_id ?? leads.find((l) => l.owner_user_id)?.owner_user_id ?? null;
}

async function emLotes<T>(ids: string[], ler: (lote: string[]) => Promise<T[]>): Promise<T[]> {
  const fora: T[] = [];
  for (let i = 0; i < ids.length; i += 200) fora.push(...(await ler(ids.slice(i, i + 200))));
  return fora;
}

/**
 * As pessoas da organização, ou só as dos contatos pedidos. Cliente admin: quem chama já
 * conferiu o acesso e resolveu a org no servidor; toda consulta filtra por ela.
 */
export async function carregarPessoas(admin: Admin, orgId: string, nomeDe: (id: string) => string, contatoIds?: string[]): Promise<Map<string, PessoaDoNumero>> {
  const COLUNAS = "id, display_name, name, phone_number, telefone_indice";
  let contatos: ContatoLinha[];
  if (contatoIds) {
    const pedidos = await emLotes(contatoIds, async (lote) => {
      const { data, error } = await admin.from("contacts").select(COLUNAS).eq("organization_id", orgId).in("id", lote);
      if (error) throw new Error(`pessoas: contatos: ${error.message}`);
      return (data ?? []) as ContatoLinha[];
    });
    const indices = [...new Set(pedidos.map((c) => c.telefone_indice).filter((x): x is string => Boolean(x)))];
    const gemeos = await emLotes(indices, async (lote) => {
      const { data, error } = await admin.from("contacts").select(COLUNAS).eq("organization_id", orgId).in("telefone_indice", lote).is("is_merged_into", null);
      if (error) throw new Error(`pessoas: gêmeos: ${error.message}`);
      return (data ?? []) as ContatoLinha[];
    });
    // A outra forma do celular (com ou sem o nono dígito) também é a pessoa.
    const variantes = [...new Set(pedidos.flatMap((c) => (c.phone_number ? phoneLookupVariants(c.phone_number) : [])))];
    const pelaVariante = await emLotes(variantes, async (lote) => {
      const { data, error } = await admin.from("contacts").select(COLUNAS).eq("organization_id", orgId).in("phone_number", lote).is("is_merged_into", null);
      if (error) throw new Error(`pessoas: outra forma do número: ${error.message}`);
      return (data ?? []) as ContatoLinha[];
    });
    contatos = [...new Map([...pedidos, ...gemeos, ...pelaVariante].map((c) => [c.id, c])).values()];
  } else {
    const { data, error } = await admin.from("contacts").select(COLUNAS).eq("organization_id", orgId).is("is_merged_into", null).limit(20000);
    if (error) throw new Error(`pessoas: contatos: ${error.message}`);
    contatos = (data ?? []) as ContatoLinha[];
  }
  const ids = contatos.map((c) => c.id);

  const conversas = await emLotes(ids, async (lote) => {
    const { data, error } = await admin
      .from("conversations")
      .select("id, contact_id, channel_session_id, assigned_to_user_id, created_at")
      .eq("organization_id", orgId)
      .eq("is_group", false)
      .in("contact_id", lote);
    if (error) throw new Error(`pessoas: conversas: ${error.message}`);
    return (data ?? []) as ConversaLinha[];
  });
  const leads = await emLotes(ids, async (lote) => {
    const { data, error } = await admin
      .from("crm_leads")
      .select("id, title, contact_id, owner_user_id, created_at, source, origem:custom_fields->origem")
      .eq("organization_id", orgId)
      .eq("status", "open")
      .in("contact_id", lote);
    if (error) throw new Error(`pessoas: leads: ${error.message}`);
    return (data ?? []) as LeadLinha[];
  });
  const { data: sessoes, error: erroSessoes } = await admin.from("channel_sessions").select("id, owner_user_id").eq("organization_id", orgId);
  if (erroSessoes) throw new Error(`pessoas: números: ${erroSessoes.message}`);
  const donoDoNumero = new Map(((sessoes ?? []) as Array<{ id: string; owner_user_id: string | null }>).map((s) => [s.id, s.owner_user_id]));

  const primeiras = new Map<string, string>();
  const linhasPrimeiras = await emLotes(conversas.map((c) => c.id), async (lote) => {
    const { data, error } = await admin.rpc("fn_primeira_mensagem_das_conversas" as never, { p_org: orgId, p_conversas: lote } as never);
    if (error) throw new Error(`pessoas: primeira mensagem: ${error.message}`);
    return (data ?? []) as unknown as Array<{ conversation_id: string; primeira: string }>;
  });
  for (const p of linhasPrimeiras) primeiras.set(p.conversation_id, p.primeira);

  const porContato = new Map<string, PessoaDoNumero>();
  for (const grupo of agruparContatos(contatos)) {
    const doGrupo = new Set(grupo.map((c) => c.id));
    const pessoa = montarPessoa(
      grupo,
      conversas.filter((c) => doGrupo.has(c.contact_id)),
      leads.filter((l) => doGrupo.has(l.contact_id)),
      donoDoNumero,
      primeiras,
      nomeDe,
    );
    for (const c of grupo) porContato.set(c.id, pessoa);
  }
  return porContato;
}

/** Só o que a tela da conversa precisa: sem contatos, telefones nem ids de lead. */
export function donosParaTela(p: PessoaDoNumero): DonosDaConversa {
  return { responsavel: p.responsavel, principal: p.principal, corretores: p.corretores, leadsAbertos: p.leadsAbertos };
}
