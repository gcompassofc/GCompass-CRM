/**
 * Rotina de lembretes da OPA (revisão de 31/10/2026, F1), chamada de minuto em
 * minuto por /api/v1/cron/opa-lembretes. Faz, nesta ordem:
 *
 *  1. manda os lembretes agendados que venceram (OPA Lembretes -> corretor);
 *  2. avisa o corretor quando o lead espera o PRIMEIRO atendimento há 20/40 min
 *     (pago) ou 20/60/120 min (orgânico), ou o que Configurações definir, contando
 *     só o horário de atendimento. Lead que já teve resposta, ou com lembretes
 *     desligados, fica fora (pendências de 01/11/2026, A2);
 *  3. no fim do prazo, passa o lead para o próximo da roleta que ainda está na
 *     equipe (menos lead próprio do corretor), desde que o dono tenha recebido
 *     algum aviso antes, e avisa quem recebeu, quem perdeu e o gerente; se ninguém
 *     mais pode pegar, ou o dono não foi avisado, ou o dono saiu da equipe, escala
 *     para a gestão;
 *  4. avisa negócio parado em proposta, negociação e fechamento.
 *
 * Nada aqui fala com o cliente. Cada aviso é reservado antes do envio por uma
 * linha única em `opa_avisos` (lead, tipo, marca, pessoa): duas rodadas ao mesmo
 * tempo, ou o mesmo minuto repetido, não mandam o aviso duas vezes.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

import {
  avisarPessoa,
  carregarCanalDeAvisos,
  textoAvisoDePrazo,
  textoEscala,
  textoLembrete,
  textoParado,
  textoRepasseParaGestor,
  textoRepasseParaNovoDono,
  textoRepasseParaQuemPerdeu,
  duracao,
  type CanalDeAvisos,
  type ResultadoAviso,
} from "./aviso-whatsapp";
import { boasVindasEnviadaEm, esperaDesde, esperaEmMinutos, minutosUteis, saidaDoCorretor } from "./atendimento";
import { carregarConfig, type ConfigOpa } from "./config";
import { carregarEquipe, type Pessoa } from "./dados";
import { emLotes } from "./lotes";
import { diaSP } from "./periodo";
import {
  aguardaPrimeiraResposta,
  avisosDevidos,
  avisosLigados,
  decidirRepasse,
  destinoDoLembrete,
  limitesDeParado,
  prazosDaTrilha,
  repasseLiberado,
  repasseLigado,
  roletaDaEquipe,
} from "./repasse";

const DIA_MS = 86_400_000;
/** Lead que espera há mais que isto já não é assunto de aviso. */
const JANELA_DIAS = 7;
/** A rotina para de começar trabalho novo depois disto (o cron tem 55 s). */
const ORCAMENTO_MS = 45_000;
const MAX_TENTATIVAS_LEMBRETE = 3;
/** Quem já segurou o lead nesta janela não pega de novo no repasse. */
const CICLO_REPASSE_MS = 3 * DIA_MS;

export interface ResultadoRotina {
  lembretes: number;
  avisos: number;
  repasses: number;
  escaladas: number;
  parados: number;
  semNumero: number;
}

const vazio = (): ResultadoRotina => ({ lembretes: 0, avisos: 0, repasses: 0, escaladas: 0, parados: 0, semNumero: 0 });

type Admin = SupabaseClient;

type LinhaAviso = { orgId: string; leadId: string; userId: string | null; tipo: string; marca: string; dados?: Record<string, unknown> };

const chaveDoAviso = (l: Pick<LinhaAviso, "leadId" | "tipo" | "marca" | "userId">) => `${l.leadId}|${l.tipo}|${l.marca}|${l.userId ?? ""}`;

/**
 * Reserva o aviso. null = já existia (outra rodada mandou, ou este minuto repetiu).
 * `feitos` guarda os avisos já gravados da janela: a rotina roda a cada minuto e
 * não precisa bater no banco só para descobrir que o aviso de ontem já saiu.
 */
async function reservarAviso(admin: Admin, linha: LinhaAviso, feitos?: Set<string>): Promise<string | null> {
  const chave = chaveDoAviso(linha);
  if (feitos?.has(chave)) return null;
  const { data, error } = await admin
    .from("opa_avisos")
    .insert({
      organization_id: linha.orgId,
      lead_id: linha.leadId,
      user_id: linha.userId,
      tipo: linha.tipo,
      marca: linha.marca,
      dados: linha.dados ?? {},
    })
    .select("id")
    .single();
  feitos?.add(chave);
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`opa_avisos: ${error.message}`);
  }
  return (data as { id: string }).id;
}

async function fecharAviso(admin: Admin, id: string, r: ResultadoAviso | "pulado", sobrescreve?: Record<string, unknown>) {
  const status = r === "enviado" || r === "pulado" ? "enviado" : r === "sem_numero" ? "sem_numero" : "falhou";
  const patch: Record<string, unknown> = { status };
  if (r === "pulado" || sobrescreve) patch.dados = { ...(r === "pulado" ? { pulado: true } : {}), ...(sobrescreve ?? {}) };
  await admin.from("opa_avisos").update(patch).eq("id", id);
}

const digitos = (t: string | null | undefined) => (t ?? "").replace(/\D/g, "") || null;

// ---------------------------------------------------------------- 1. lembretes agendados

interface Agendado {
  id: string;
  organization_id: string;
  lead_id: string | null;
  para_user_id: string | null;
  mensagem: string;
  origem: string;
  tentativas: number;
}

async function enviarAgendados(admin: Admin, agora: number, canais: Map<string, CanalDeAvisos>, r: ResultadoRotina) {
  // Reserva como 'enviando' (migration 0122): o 'enviado' só é gravado depois do envio.
  const { data, error } = await admin.rpc("fn_opa_reservar_lembretes", { p_limite: 30 });
  if (error) throw new Error(`fn_opa_reservar_lembretes: ${error.message}`);
  const lembretes = (data ?? []) as Agendado[];

  for (const l of lembretes) {
    if (Date.now() - agora > ORCAMENTO_MS) {
      // Sem tempo: devolve para a fila da próxima rodada.
      await admin.from("lembretes_agendados").update({ status: "pendente", enviado_em: null, tentativas: Math.max(0, l.tentativas - 1) }).eq("id", l.id);
      continue;
    }
    // "sem_sessao" até provar o contrário: falha antes do envio volta para a fila.
    let resultado: ResultadoAviso = "sem_sessao";
    let erro: string | null = null;
    try {
      const equipe = await carregarEquipe(l.organization_id);
      const pessoa = l.para_user_id ? equipe.get(l.para_user_id) : undefined;
      let canal = canais.get(l.organization_id);
      if (!canal) {
        canal = await carregarCanalDeAvisos(admin, l.organization_id);
        canais.set(l.organization_id, canal);
      }
      let leadNome: string | null = null;
      let fone: string | null = null;
      if (l.lead_id) {
        const { data: lead } = await admin
          .from("crm_leads")
          .select("title, contacts(name, phone_number)")
          .eq("organization_id", l.organization_id)
          .eq("id", l.lead_id)
          .maybeSingle();
        const c = (lead as { title: string; contacts: { name: string | null; phone_number: string | null } | null } | null);
        leadNome = c?.contacts?.name ?? c?.title.split(" · ")[0] ?? null;
        fone = digitos(c?.contacts?.phone_number);
      }
      if (!pessoa) {
        resultado = "sem_numero";
        erro = "O corretor do lembrete não está mais na equipe.";
      } else {
        const texto = textoLembrete({
          corretor: pessoa.nome,
          mensagem: l.mensagem,
          lead: leadNome,
          paraLead: l.origem === "para_lead",
          link: l.lead_id ? `${env.NEXT_PUBLIC_APP_URL}/app/leads/${l.lead_id}` : null,
          whatsapp: fone,
        });
        resultado = await avisarPessoa(canal, pessoa, texto);
        if (resultado === "sem_numero") erro = "A pessoa não tem WhatsApp conectado com o nome dela.";
        if (resultado === "sem_sessao") erro = "O OPA Lembretes não está conectado.";
        if (resultado === "erro") erro = "O WhatsApp não confirmou o envio. Pode ter saído: confira antes de agendar de novo.";
      }
    } catch (e) {
      // Falhou antes de chegar ao WhatsApp (avisarPessoa nunca lança): nada saiu.
      resultado = "sem_sessao";
      erro = e instanceof Error ? e.message.slice(0, 200) : "Falha ao preparar o envio.";
    }

    const destino = destinoDoLembrete(resultado, l.tentativas, Boolean(l.para_user_id), MAX_TENTATIVAS_LEMBRETE);
    if (destino === "enviado") {
      await admin.from("lembretes_agendados").update({ status: "enviado", enviado_em: new Date().toISOString(), erro: null }).eq("id", l.id);
      r.lembretes++;
    } else {
      await admin
        .from("lembretes_agendados")
        .update({ status: destino, erro, ...(destino === "pendente" ? { enviado_em: null } : {}) })
        .eq("id", l.id);
      if (resultado === "sem_numero") r.semNumero++;
    }
  }
}

// ---------------------------------------------------------------- 2 e 3. fila de resposta

interface LinhaLead {
  id: string;
  title: string;
  status: "open" | "won" | "lost";
  owner_user_id: string | null;
  source: string | null;
  tags: string[] | null;
  contact_id: string | null;
  created_at: string;
  assigned_at: string | null;
  custom_fields: Record<string, unknown> | null;
  contacts: { name: string | null; phone_number: string | null } | null;
}

const COLUNAS_LEAD = "id, title, status, owner_user_id, source, tags, contact_id, created_at, assigned_at, custom_fields, contacts(name, phone_number)";

async function funilCompradores(admin: Admin, orgId: string): Promise<string | null> {
  const { data } = await admin.from("crm_pipelines").select("id").eq("organization_id", orgId).eq("slug", "compradores").maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** Leads abertos que podem estar esperando: criados, com mensagem ou voltados na janela. */
async function candidatosDaFila(admin: Admin, orgId: string, funilId: string, agora: number): Promise<LinhaLead[]> {
  const desde = new Date(agora - JANELA_DIAS * DIA_MS).toISOString();
  const base = () => admin.from("crm_leads").select(COLUNAS_LEAD).eq("organization_id", orgId).eq("pipeline_id", funilId).eq("status", "open").not("owner_user_id", "is", null);

  const [novos, voltaram, { data: conversas, error: erroConversas }] = await Promise.all([
    base().gte("created_at", desde).limit(1000),
    base().gte("custom_fields->voltou->>em", desde).limit(1000),
    admin
      .from("conversations")
      .select("contact_id")
      .eq("organization_id", orgId)
      .eq("is_group", false)
      .gte("last_inbound_at", desde)
      .limit(1000),
  ]);
  if (novos.error) throw new Error(`candidatos: ${novos.error.message}`);
  if (voltaram.error) throw new Error(`candidatos: ${voltaram.error.message}`);
  if (erroConversas) throw new Error(`candidatos: ${erroConversas.message}`);

  const contatos = [...new Set(((conversas ?? []) as Array<{ contact_id: string }>).map((c) => c.contact_id))];
  const comMensagem = await emLotes(contatos, (lote) => base().in("contact_id", lote));

  const porId = new Map<string, LinhaLead>();
  for (const l of [...(novos.data ?? []), ...(voltaram.data ?? []), ...comMensagem] as unknown as LinhaLead[]) porId.set(l.id, l);
  return [...porId.values()];
}

interface ConversaResumo {
  contact_id: string;
  last_message_at: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
}

async function conversasDosContatos(admin: Admin, orgId: string, contatos: string[]): Promise<Map<string, ConversaResumo>> {
  const linhas = await emLotes(contatos, (lote) =>
    admin
      .from("conversations")
      .select("contact_id, last_message_at, last_inbound_at, last_outbound_at")
      .eq("organization_id", orgId)
      .in("contact_id", lote),
  );
  const mapa = new Map<string, ConversaResumo>();
  for (const c of linhas as ConversaResumo[]) {
    // Mais de uma conversa por contato: vale a que tem a mensagem mais recente.
    const atual = mapa.get(c.contact_id);
    if (!atual || (c.last_message_at ?? "") > (atual.last_message_at ?? "")) mapa.set(c.contact_id, c);
  }
  return mapa;
}

interface Contexto {
  admin: Admin;
  orgId: string;
  config: ConfigOpa;
  equipe: Map<string, Pessoa>;
  canal: CanalDeAvisos;
  agora: number;
  r: ResultadoRotina;
  gestores: Pessoa[];
  /** Avisos já gravados dos leads em análise (chaveDoAviso). */
  feitos: Set<string>;
  /** Quem já segurou cada lead por repasse, na janela do ciclo. */
  repassados: Map<string, string[]>;
  /** `lead|marca` de esperas em que algum aviso de prazo chegou ao corretor. */
  avisoSaiu: Set<string>;
}

const chaveDaEspera = (leadId: string, marca: string) => `${leadId}|${marca}`;

const link = (leadId: string) => `${env.NEXT_PUBLIC_APP_URL}/app/leads/${leadId}`;
const nomeDoLead = (l: LinhaLead) => l.contacts?.name ?? l.title.split(" · ")[0] ?? "Lead";

async function avisar(c: Contexto, linha: Omit<LinhaAviso, "orgId">, pessoa: Pessoa | undefined, texto: string): Promise<boolean> {
  const id = await reservarAviso(c.admin, { orgId: c.orgId, ...linha }, c.feitos);
  if (!id) return false;
  if (!pessoa) {
    await fecharAviso(c.admin, id, "sem_numero");
    return true;
  }
  const resultado = await avisarPessoa(c.canal, pessoa, texto);
  if (resultado === "sem_numero") c.r.semNumero++;
  await fecharAviso(c.admin, id, resultado);
  return true;
}

/** Carrega o que a rotina já mandou sobre estes leads (para não repetir e para saber quem já tentou). */
async function carregarHistorico(c: Contexto, leadIds: string[]) {
  const desde = new Date(c.agora - Math.max(JANELA_DIAS * DIA_MS, 31 * DIA_MS)).toISOString();
  const linhas = await emLotes(leadIds, (lote) =>
    c.admin.from("opa_avisos").select("lead_id, user_id, tipo, marca, status, dados, created_at").eq("organization_id", c.orgId).in("lead_id", lote).gte("created_at", desde),
  );
  const corte = c.agora - CICLO_REPASSE_MS;
  for (const x of linhas as Array<{
    lead_id: string;
    user_id: string | null;
    tipo: string;
    marca: string;
    status: string;
    dados: { de?: string; pulado?: boolean } | null;
    created_at: string;
  }>) {
    c.feitos.add(chaveDoAviso({ leadId: x.lead_id, tipo: x.tipo, marca: x.marca, userId: x.user_id }));
    if (x.tipo.startsWith("aviso_") && x.status === "enviado" && !x.dados?.pulado) c.avisoSaiu.add(chaveDaEspera(x.lead_id, x.marca));
    if (x.tipo === "repasse" && x.dados?.de && Date.parse(x.created_at) >= corte) {
      c.repassados.set(x.lead_id, [...(c.repassados.get(x.lead_id) ?? []), x.dados.de]);
    }
  }
}

async function processarFila(c: Contexto, inicio: number) {
  const funilId = await funilCompradores(c.admin, c.orgId);
  if (!funilId) return;
  const leads = await candidatosDaFila(c.admin, c.orgId, funilId, c.agora);
  if (leads.length === 0) return;
  const [conversas] = await Promise.all([
    conversasDosContatos(c.admin, c.orgId, [...new Set(leads.map((l) => l.contact_id).filter((x): x is string => Boolean(x)))]),
    carregarHistorico(c, leads.map((l) => l.id)),
  ]);

  for (const l of leads) {
    if (Date.now() - inicio > ORCAMENTO_MS) return;
    const donoId = l.owner_user_id;
    if (!donoId) continue;
    const dono = c.equipe.get(donoId);
    if (!dono) {
      // O dono saiu da equipe (C1): o lead não fica preso, a gestão decide. Uma vez por lead e dono.
      let enviou = false;
      for (const g of c.gestores) {
        enviou =
          (await avisar(
            c,
            { leadId: l.id, userId: g.id, tipo: "escala", marca: `dono-saiu:${donoId}` },
            g,
            textoEscala({ gestor: g.nome, lead: nomeDoLead(l), dono: null, link: link(l.id), motivo: "dono_saiu" }),
          )) || enviou;
      }
      if (enviou) c.r.escaladas++;
      continue;
    }
    const cf = (l.custom_fields ?? {}) as { voltou?: { em?: string }; respondido_em?: string; lembretes_desligados?: boolean };
    // Lembretes desligados no lead: nem aviso nem repasse (A2).
    if (cf.lembretes_desligados) continue;
    const conv = l.contact_id ? conversas.get(l.contact_id) : undefined;
    // Só a espera pelo PRIMEIRO atendimento gera aviso e repasse (A2).
    const boasVindasEm = boasVindasEnviadaEm(cf as unknown as Record<string, unknown>);
    if (!aguardaPrimeiraResposta({ criadoEm: l.created_at, respondidoEm: cf.respondido_em, ultimaSaidaEm: saidaDoCorretor(conv?.last_outbound_at, boasVindasEm) })) continue;
    const desde = esperaDesde({
      status: l.status,
      criadoEm: l.created_at,
      atribuidoEm: l.assigned_at,
      voltouEm: cf.voltou?.em,
      respondidoEm: cf.respondido_em,
      temConversa: Boolean(conv),
      ultimaMensagemEm: conv?.last_message_at,
      ultimaEntradaEm: conv?.last_inbound_at,
      ultimaSaidaEm: conv?.last_outbound_at,
      boasVindasEm,
    });
    if (desde === null) continue;

    const esperaMin = esperaEmMinutos(desde, c.agora, c.config.horario);
    if (esperaMin <= 0) continue;
    const pago = l.source === "meta" || (l.tags ?? []).includes("pago");
    const trilha = pago ? "pago" : "organico";
    const { prazoMin } = prazosDaTrilha(c.config, trilha);
    const proprio = (l.tags ?? []).includes("proprio");
    const marca = new Date(desde).toISOString();
    const nome = nomeDoLead(l);
    const fone = digitos(l.contacts?.phone_number);

    // 2. avisos de prazo: se a rotina ficou fora do ar, manda só o mais recente.
    if (esperaMin < prazoMin) {
      const devidos = avisosDevidos(c.config, trilha, esperaMin);
      const novos: Array<{ a: number; id: string }> = [];
      for (const a of devidos) {
        const id = await reservarAviso(c.admin, { orgId: c.orgId, leadId: l.id, userId: donoId, tipo: `aviso_${a}`, marca }, c.feitos);
        if (id) novos.push({ a, id });
      }
      for (const [i, n] of novos.entries()) {
        if (i < novos.length - 1) {
          await fecharAviso(c.admin, n.id, "pulado");
          continue;
        }
        const resultado = await avisarPessoa(
          c.canal,
          dono,
          textoAvisoDePrazo({ corretor: dono.nome, lead: nome, esperaMin, faltaMin: prazoMin - esperaMin, proprio, link: link(l.id), whatsapp: fone }),
        );
        if (resultado === "sem_numero") c.r.semNumero++;
        if (resultado === "enviado") c.avisoSaiu.add(chaveDaEspera(l.id, marca));
        await fecharAviso(c.admin, n.id, resultado);
        c.r.avisos++;
      }
    }

    // 3. repasse no fim do prazo, só entre quem ainda está na equipe (C1)
    let decisao = decidirRepasse({
      esperaMin,
      prazoMin,
      proprio,
      repasseLigado: repasseLigado(c.config, trilha),
      donoId,
      roleta: roletaDaEquipe(c.config.roleta, c.equipe),
      pausados: c.config.roleta_pausados,
      jaTentaram: c.repassados.get(l.id) ?? [],
    });
    // O dono não foi avisado (OPA Lembretes fora, corretor sem número): não tira o lead dele,
    // leva para a gestão (C4).
    let motivoEscala: "roleta" | "sem_aviso" = "roleta";
    if (decisao.tipo === "passar" && !repasseLiberado({ avisoSaiu: c.avisoSaiu.has(chaveDaEspera(l.id, marca)), avisosDaTrilha: avisosLigados(c.config, trilha).length })) {
      decisao = { tipo: "escalar" };
      motivoEscala = "sem_aviso";
    }

    if (decisao.tipo === "passar") {
      const novo = c.equipe.get(decisao.para);
      if (!novo) continue;
      const linhaRepasse = { orgId: c.orgId, leadId: l.id, userId: null, tipo: "repasse", marca, dados: { de: donoId, para: decisao.para } };
      const id = await reservarAviso(c.admin, linhaRepasse, c.feitos);
      if (!id) continue;
      const agoraIso = new Date(c.agora).toISOString();
      const { data: mudou, error: erroRepasse } = await c.admin
        .from("crm_leads")
        .update({ owner_user_id: decisao.para, assigned_at: agoraIso, last_activity_at: agoraIso })
        .eq("organization_id", c.orgId)
        .eq("id", l.id)
        .eq("owner_user_id", donoId)
        .eq("status", "open")
        .select("id");
      if (erroRepasse) {
        // Falha passageira: desfaz a reserva para a próxima rodada tentar de novo (C4).
        await c.admin.from("opa_avisos").delete().eq("id", id);
        c.feitos.delete(chaveDoAviso(linhaRepasse));
        logger.warn("[opa-lembretes] repasse não gravou", { leadId: l.id, error: erroRepasse.message });
        continue;
      }
      if (!mudou || mudou.length === 0) {
        await fecharAviso(c.admin, id, "pulado", { motivo: "o lead mudou de dono antes do repasse" });
        continue;
      }
      await c.admin.from("crm_lead_activities").insert({
        organization_id: c.orgId,
        lead_id: l.id,
        contact_id: l.contact_id,
        source_module: "opa",
        type: "lead_repassado",
        payload: { de: donoId, para: decisao.para, esperaMin, prazoMin, trilha },
        performed_at: agoraIso,
        actor_kind: "system",
        reason: `Sem resposta em ${duracao(prazoMin)}: passou para o próximo da roleta.`,
      });
      await fecharAviso(c.admin, id, "enviado");
      c.r.repasses++;

      const aviso = (userId: string | null, tipo: string, pessoa: Pessoa | undefined, texto: string) =>
        avisar(c, { leadId: l.id, userId, tipo, marca: `${marca}>${decisao.para}` }, pessoa, texto);
      await aviso(decisao.para, "repasse_novo_dono", novo, textoRepasseParaNovoDono({ corretor: novo.nome, lead: nome, de: dono.nome, link: link(l.id), whatsapp: fone }));
      await aviso(donoId, "repasse_perdeu", dono, textoRepasseParaQuemPerdeu({ corretor: dono.nome, lead: nome, para: novo.nome }));
      for (const g of c.gestores) {
        if (g.id === donoId || g.id === decisao.para) continue;
        await aviso(g.id, "repasse_gestor", g, textoRepasseParaGestor({ gestor: g.nome, lead: nome, de: dono.nome, para: novo.nome, link: link(l.id) }));
      }
    } else if (decisao.tipo === "escalar") {
      let enviou = false;
      for (const g of c.gestores) {
        enviou =
          (await avisar(
            c,
            { leadId: l.id, userId: g.id, tipo: "escala", marca },
            g,
            textoEscala({ gestor: g.nome, lead: nome, dono: dono.nome, link: link(l.id), motivo: motivoEscala }),
          )) || enviou;
      }
      if (enviou) c.r.escaladas++;
    }
  }
}

// ---------------------------------------------------------------- 4. negócio parado

async function processarParados(c: Contexto) {
  const limites = limitesDeParado(c.config);
  if (limites.length === 0) return;
  const funilId = await funilCompradores(c.admin, c.orgId);
  if (!funilId) return;

  for (const lim of limites) {
    const corte = new Date(c.agora - lim.dias * DIA_MS).toISOString();
    const { data, error } = await c.admin
      .from("crm_leads")
      .select(`${COLUNAS_LEAD}, last_activity_at, crm_stages!inner(slug, name)`)
      .eq("organization_id", c.orgId)
      .eq("pipeline_id", funilId)
      .eq("status", "open")
      .eq("crm_stages.slug", lim.etapa)
      .not("owner_user_id", "is", null)
      .lte("last_activity_at", corte)
      .limit(200);
    if (error) throw new Error(`parados: ${error.message}`);
    const achados = (data ?? []) as unknown as Array<LinhaLead & { last_activity_at: string; crm_stages: { slug: string; name: string } }>;
    await carregarHistorico(c, achados.map((l) => l.id));
    for (const l of achados) {
      // Dono que saiu da equipe: o aviso vai só para a gestão (C1).
      const dono = l.owner_user_id ? c.equipe.get(l.owner_user_id) : undefined;
      const dias = Math.floor((c.agora - Date.parse(l.last_activity_at)) / DIA_MS);
      const marca = `${lim.etapa}:${diaSP(Date.parse(l.last_activity_at))}`;
      const texto = (p: Pessoa) => textoParado({ corretor: p.nome, lead: nomeDoLead(l), etapa: l.crm_stages.name, dias, link: link(l.id) });
      let enviou = dono ? await avisar(c, { leadId: l.id, userId: dono.id, tipo: "parado", marca }, dono, texto(dono)) : false;
      for (const g of c.gestores) {
        if (g.id === dono?.id) continue;
        enviou = (await avisar(c, { leadId: l.id, userId: g.id, tipo: "parado", marca }, g, texto(g))) || enviou;
      }
      if (enviou) c.r.parados++;
    }
  }
}

// ---------------------------------------------------------------- rodada

/** Organizações com o CRM da OPA ligado: têm o funil de compradores e a configuração `settings.opa`. */
async function orgsDaOpa(admin: Admin): Promise<string[]> {
  const { data, error } = await admin.from("crm_pipelines").select("organization_id").eq("slug", "compradores");
  if (error) throw new Error(`orgsDaOpa: ${error.message}`);
  const comFunil = [...new Set(((data ?? []) as Array<{ organization_id: string }>).map((x) => x.organization_id))];
  if (comFunil.length === 0) return [];
  const { data: orgs, error: erroOrgs } = await admin.from("organizations").select("id, settings").in("id", comFunil);
  if (erroOrgs) throw new Error(`orgsDaOpa: ${erroOrgs.message}`);
  return ((orgs ?? []) as Array<{ id: string; settings: { opa?: unknown } | null }>).filter((o) => o.settings?.opa != null).map((o) => o.id);
}

/** Hora de São Paulo (0 a 23) e minuto de um instante. */
function horaEMinuto(ms: number): { hora: number; minuto: number } {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(ms));
  const n = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? 0) % 24;
  return { hora: n("hour"), minuto: n("minute") };
}

export async function rodarRotinaLembretes(admin: Admin, agora = Date.now()): Promise<ResultadoRotina> {
  const r = vazio();
  const canais = new Map<string, CanalDeAvisos>();
  try {
    await enviarAgendados(admin, agora, canais, r);
  } catch (e) {
    logger.warn("[opa-lembretes] falha nos lembretes agendados", { error: String(e) });
  }

  for (const orgId of await orgsDaOpa(admin)) {
    if (Date.now() - agora > ORCAMENTO_MS) break;
    try {
      const [config, equipe] = await Promise.all([carregarConfig(admin, orgId), carregarEquipe(orgId)]);
      let canal = canais.get(orgId);
      if (!canal) {
        canal = await carregarCanalDeAvisos(admin, orgId);
        canais.set(orgId, canal);
      }
      const gerentes = [...equipe.values()].filter((p) => p.papel === "manager");
      // Sem gerente cadastrado, a gestão é o administrador.
      const gestores = gerentes.length ? gerentes : [...equipe.values()].filter((p) => p.papel === "admin");
      const c: Contexto = { admin, orgId, config, equipe, canal, agora, r, gestores, feitos: new Set(), repassados: new Map(), avisoSaiu: new Set() };

      await processarFila(c, agora);

      // Negócio parado: de dez em dez minutos, no horário comercial de dia aberto.
      const { hora, minuto } = horaEMinuto(agora);
      const aberto = minutosUteis(agora - 10 * 60_000, agora, config.horario) > 0;
      if (aberto && hora >= 9 && hora < 19 && minuto % 10 === 0) await processarParados(c);
    } catch (e) {
      logger.warn("[opa-lembretes] falha numa organização", { orgId, error: String(e) });
    }
  }
  return r;
}

