/**
 * Duplicados resolvidos sozinhos (pedido do Allyson, 13/11/2026, depois do caso da Wandalcy).
 *
 * Regra: lead de formulário (anúncio ou site) é de quem a roleta escolheu. A cada 30 minutos
 * a rotina do OPA Lembretes olha as pessoas da tela Duplicados e:
 *
 *  - caso sem dúvida (exatamente um lead de formulário entre os leads abertos da pessoa):
 *    fica o lead da roleta; os outros abertos são encerrados como "Lead duplicado"; se o lead
 *    que fica está no cadastro de um número que não funciona e o outro cadastro da mesma
 *    pessoa (com ou sem o nono dígito) é o que funciona, o lead passa para ele. Tudo vai
 *    para o histórico e a gestão recebe um aviso do que foi feito;
 *  - caso com dúvida (dois leads abertos e nenhum, ou mais de um, de formulário): nada muda,
 *    a gestão recebe um aviso com o link da tela Duplicados.
 *
 * Nunca junta cadastros (isso não tem volta) e nunca apaga nada: encerrar e religar dá para
 * desfazer pela tela (Reabrir) e pela API.
 */
import { logger } from "@/lib/logger";
import type { createAdminClient } from "@/lib/supabase/admin";

import { ehLeadDaRoleta, type LeadLinha, type PessoaDoNumero } from "./donos-da-conversa";

type Admin = ReturnType<typeof createAdminClient>;

export const MOTIVO_DUPLICADO = "Lead duplicado";
/** Casos tratados por rodada, para a rotina de cada minuto não passar do tempo. */
export const MAX_CASOS_POR_RODADA = 20;

export type PlanoDuplicado =
  | { acao: "nada" }
  | { acao: "corrigir"; manter: LeadLinha; encerrar: LeadLinha[]; religarPara: string | null }
  | { acao: "avisar"; leads: LeadLinha[] };

/**
 * Qual cadastro tem o número que funciona no WhatsApp (observação do Allyson, 13/11/2026: a
 * Wandalcy tinha conversa nos dois números, mas no de 99 só a boas-vindas, sem resposta e sem
 * foto). Ter conversa não prova nada; prova o próprio WhatsApp:
 *  1. o cliente escreveu desse número (a mensagem mais recente ganha);
 *  2. sem isso, o número tem foto do WhatsApp guardada;
 *  3. sem nenhum dos dois, null: o CRM não troca o lead de cadastro.
 */
export function cadastroQueFunciona(p: Pick<PessoaDoNumero, "contatos" | "conversas">): string | null {
  const ultimaDoCliente = new Map<string, string>();
  for (const c of p.conversas) {
    if (!c.last_inbound_at) continue;
    const atual = ultimaDoCliente.get(c.contact_id);
    if (!atual || c.last_inbound_at > atual) ultimaDoCliente.set(c.contact_id, c.last_inbound_at);
  }
  const escreveu = [...ultimaDoCliente.entries()].sort((a, b) => b[1].localeCompare(a[1]))[0]?.[0];
  if (escreveu) return escreveu;
  const comFoto = p.contatos.filter((c) => c.avatar_storage_path);
  return comFoto.length === 1 ? comFoto[0]!.id : null;
}

/** O que fazer com uma pessoa da tela Duplicados. Só regra, sem banco. */
export function planoDoDuplicado(p: PessoaDoNumero): PlanoDuplicado {
  const abertos = p.leads;
  if (abertos.length === 0) return { acao: "nada" };
  const daRoleta = abertos.filter(ehLeadDaRoleta);
  if (abertos.length > 1 && daRoleta.length !== 1) return { acao: "avisar", leads: abertos };
  if (daRoleta.length !== 1) return { acao: "nada" };

  const manter = daRoleta[0]!;
  const encerrar = abertos.filter((l) => l.id !== manter.id);
  const certo = p.contatos.length > 1 ? cadastroQueFunciona(p) : null;
  const religarPara = certo && certo !== manter.contact_id ? certo : null;
  if (encerrar.length === 0 && !religarPara) return { acao: "nada" };
  return { acao: "corrigir", manter, encerrar, religarPara };
}

export function nomeDaPessoa(p: PessoaDoNumero): string {
  return p.contatos.map((c) => c.display_name?.trim() || c.name?.trim()).find(Boolean) ?? "Contato sem nome";
}

const primeiro = (nome: string) => nome.trim().split(/\s+/)[0] ?? nome;

/** Aviso à gestão do que o CRM fez sozinho. */
export function textoDuplicadoCorrigido(p: { pessoa: string; dono: string; outros: string[]; religou: boolean; link: string }): string {
  const linhas = [
    `${p.pessoa} estava duplicado no CRM e foi resolvido sozinho.`,
    `Ficou com ${primeiro(p.dono)}, que recebeu pela roleta.`,
    p.outros.length
      ? `${p.outros.length === 1 ? "O outro lead" : `Os outros ${p.outros.length} leads`} (${p.outros.map(primeiro).join(", ")}) ${p.outros.length === 1 ? "foi encerrado" : "foram encerrados"} como "Lead duplicado".`
      : null,
    p.religou ? "O lead passou para o número que funciona no WhatsApp (o que ela usa para responder)." : null,
    `Ficha: ${p.link}`,
  ];
  return linhas.filter(Boolean).join("\n\n");
}

/** Aviso à gestão quando o CRM não sabe com quem fica. */
export function textoDuplicadoParaDecidir(p: { pessoa: string; donos: string[]; link: string }): string {
  return [
    `${p.pessoa} tem ${p.donos.length} leads abertos (${p.donos.map(primeiro).join(", ")}) e o CRM não soube com quem fica.`,
    `Resolva em Duplicados: ${p.link}`,
  ].join("\n\n");
}

async function registrar(admin: Admin, orgId: string, leadId: string, contactId: string | null, motivo: string, payload: Record<string, unknown>) {
  const { error } = await admin.from("crm_lead_activities").insert({
    organization_id: orgId,
    lead_id: leadId,
    contact_id: contactId,
    source_module: "opa",
    type: "duplicado_resolvido",
    payload,
    performed_at: new Date().toISOString(),
    actor_kind: "system",
    reason: motivo,
  });
  if (error) logger.warn("[duplicados] sem registro no histórico", { leadId, error: error.message });
}

/** Garante "Lead duplicado" na lista de motivos do funil (a base só aceita motivo cadastrado). */
async function garantirMotivo(admin: Admin, orgId: string, pipelineId: string): Promise<void> {
  const { data } = await admin.from("crm_pipelines").select("settings").eq("id", pipelineId).eq("organization_id", orgId).maybeSingle();
  const atuais = (((data as { settings: Record<string, unknown> | null } | null)?.settings ?? {}).lost_reasons as string[] | undefined) ?? [];
  if (atuais.includes(MOTIVO_DUPLICADO)) return;
  const { error } = await admin.rpc("fn_opa_garantir_motivos" as never, { p_pipeline: pipelineId, p_motivos: [...atuais, MOTIVO_DUPLICADO] } as never);
  if (error) throw new Error(`motivo: ${error.message}`);
}

/** Encerra um lead aberto como "Lead duplicado". Devolve false se ele já não estava aberto. */
async function encerrarComoDuplicado(admin: Admin, orgId: string, leadId: string, fica: { dono: string; leadId: string }): Promise<boolean> {
  const { data: lead } = await admin.from("crm_leads").select("pipeline_id, contact_id, status").eq("organization_id", orgId).eq("id", leadId).maybeSingle();
  const l = lead as { pipeline_id: string; contact_id: string | null; status: string } | null;
  if (!l || l.status !== "open") return false;
  await garantirMotivo(admin, orgId, l.pipeline_id);
  const { data: etapa } = await admin.from("crm_stages").select("id").eq("organization_id", orgId).eq("pipeline_id", l.pipeline_id).eq("is_lost", true).limit(1).maybeSingle();
  const agora = new Date().toISOString();
  const { data: mudou, error } = await admin
    .from("crm_leads")
    .update({
      status: "lost",
      lost_reason: MOTIVO_DUPLICADO,
      closed_at: agora,
      last_activity_at: agora,
      ...(etapa ? { stage_id: (etapa as { id: string }).id, stage_changed_at: agora } : {}),
    })
    .eq("organization_id", orgId)
    .eq("id", leadId)
    .eq("status", "open")
    .select("id");
  if (error) throw new Error(`encerrar: ${error.message}`);
  if (!mudou?.length) return false;
  await registrar(admin, orgId, leadId, l.contact_id, `Encerrado sozinho pelo CRM como duplicado: a mesma pessoa tem o lead de formulário com ${primeiro(fica.dono)}.`, {
    acao: "encerrado",
    fica: fica.leadId,
  });
  return true;
}

/** Passa o lead para o cadastro que tem a conversa (só se ele ainda está no cadastro de antes). */
async function religar(admin: Admin, orgId: string, lead: LeadLinha, paraContato: string): Promise<boolean> {
  const { data, error } = await admin
    .from("crm_leads")
    .update({ contact_id: paraContato })
    .eq("organization_id", orgId)
    .eq("id", lead.id)
    .eq("contact_id", lead.contact_id)
    .eq("status", "open")
    .select("id");
  if (error) throw new Error(`religar: ${error.message}`);
  if (!data?.length) return false;
  await registrar(admin, orgId, lead.id, paraContato, "Passou sozinho para o número que funciona no WhatsApp: o cliente escreveu dele ou ele tem foto (o outro cadastro era a mesma pessoa, com ou sem o nono dígito).", {
    acao: "religado",
    de: lead.contact_id,
    para: paraContato,
  });
  return true;
}

export interface ResultadoDuplicados {
  corrigidos: number;
  paraDecidir: number;
}

/**
 * Aplica o plano às pessoas recebidas. `avisar` manda o aviso à gestão (quem chama cuida de
 * não repetir). Um caso que falha não para os outros.
 */
export async function resolverDuplicados(
  admin: Admin,
  orgId: string,
  pessoas: PessoaDoNumero[],
  nomeDe: (id: string | null) => string,
  avisar: (tipo: "corrigido" | "decidir", leadId: string, marca: string, texto: string) => Promise<void>,
  linkDoLead: (leadId: string) => string,
  linkDuplicados: string,
): Promise<ResultadoDuplicados> {
  const r: ResultadoDuplicados = { corrigidos: 0, paraDecidir: 0 };
  let tratados = 0;
  for (const p of pessoas) {
    if (tratados >= MAX_CASOS_POR_RODADA) break;
    const plano = planoDoDuplicado(p);
    if (plano.acao === "nada") continue;
    tratados++;
    const pessoa = nomeDaPessoa(p);
    try {
      if (plano.acao === "avisar") {
        const ids = plano.leads.map((l) => l.id).sort();
        await avisar("decidir", ids[0]!, `duplicado:${ids.join(",")}`, textoDuplicadoParaDecidir({ pessoa, donos: plano.leads.map((l) => nomeDe(l.owner_user_id)), link: linkDuplicados }));
        r.paraDecidir++;
        continue;
      }
      const dono = nomeDe(plano.manter.owner_user_id);
      const encerrados: LeadLinha[] = [];
      for (const l of plano.encerrar) {
        if (await encerrarComoDuplicado(admin, orgId, l.id, { dono, leadId: plano.manter.id })) encerrados.push(l);
      }
      // Religar depois de encerrar: o banco barra dois leads abertos da mesma pessoa.
      const religou = plano.religarPara ? await religar(admin, orgId, plano.manter, plano.religarPara) : false;
      if (!encerrados.length && !religou) continue;
      r.corrigidos++;
      await avisar(
        "corrigido",
        plano.manter.id,
        `duplicado-corrigido:${[plano.manter.id, ...encerrados.map((l) => l.id)].join(",")}`,
        textoDuplicadoCorrigido({ pessoa, dono, outros: encerrados.map((l) => nomeDe(l.owner_user_id)), religou, link: linkDoLead(plano.manter.id) }),
      );
    } catch (e) {
      logger.warn("[duplicados] caso não resolvido", { orgId, error: String(e) });
    }
  }
  return r;
}
