/**
 * Assistente da equipe no número OPA Lembretes: recebe a mensagem, aplica as travas,
 * entende o pedido, consulta e responde (plano aprovado pelo Allyson em 10/11/2026).
 *
 * Caminho de uma mensagem:
 *   1. só vale mensagem que CHEGA, de conversa individual, no número OPA Lembretes;
 *   2. quem é: pelo número de quem mandou (Configurações, assistente.numeros). Fora da
 *      lista, o assistente não existe: a mensagem segue o caminho de sempre do CRM;
 *   3. registro em opa_assistente_mensagens (a mesma mensagem não é atendida duas vezes);
 *   4. travas fixas (tipo, tamanho, ritmo, recusas seguidas);
 *   5. pedido: primeiro por regras; se não reconhecer, a IA classifica (só classifica);
 *   6. permissão do papel, consulta e resposta em texto fixo;
 *   7. envio pelo próprio OPA Lembretes, que respeita o modo de teste.
 *
 * Mensagem de quem está na lista NÃO vira contato, conversa nem lead no CRM.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText, Output } from "ai";

import { resolveLanguageModel } from "@/lib/ai/gateway";
import { logger } from "@/lib/logger";
import { parseChatId, resolveMessageType, type WahaEnvelope, type WahaPayload } from "@/lib/waha/ingest";
import { bareWaMessageId } from "@/lib/waha/message-id";

import { MODELO_COPILOTO } from "../analisar";
import { avisarDestino, carregarCanalDeAvisos } from "../aviso-whatsapp";
import { carregarConfig } from "../config";
import { telefoneAlternativo } from "../contatos-whatsapp";
import { carregarEquipe } from "../dados";
import { acharLeads, agendaDoDia, dadosDoImovel, ehDaPessoa, historicoDoLead, leadsNovos, leadsSemResposta, resumoDoDia, situacaoDoLead, type LeadAchado } from "./consultas";
import {
  EsquemaDaIA,
  INSTRUCOES_DA_IA,
  MAX_ITENS,
  SILENCIO_MIN,
  TEXTO_ERRO,
  TEXTO_NAO_ACHEI,
  TEXTO_RITMO,
  TEXTO_SEM_ESCOLHA,
  TEXTO_SEM_LEAD,
  TEXTO_SO_TEXTO,
  entradaDaIA,
  interpretarPorRegras,
  podeUsar,
  quemFala,
  textoAjuda,
  textoDeOutroCorretor,
  textoRecusa,
  textoVariosLeads,
  travaAntesDaIA,
  validarPedido,
  type Funcao,
  type MensagemAnterior,
  type Pedido,
  type Pessoa,
} from "./regras";

type Admin = SupabaseClient;

export const SESSAO_DO_ASSISTENTE = "opa-lembretes";
const TABELA = "opa_assistente_mensagens";
/** A lista "qual destes leads?" vale por este tempo. */
const ESCOLHA_VALE_MIN = 10;
/** O registro some depois disto (rotina de minuto em minuto). */
export const GUARDA_DIAS = 30;

export type ResultadoDoAssistente =
  /** Não é assunto do assistente: o CRM segue com a mensagem como sempre. */
  | { consumiu: false }
  /** É do assistente: nada é gravado como conversa. `depois` roda depois de responder ao WhatsApp. */
  | { consumiu: true; depois?: () => Promise<void> };

interface SessaoMinima {
  id: string;
  organization_id: string;
  waha_session_name?: string | null;
}

/** O telefone de quem mandou: o do chat, ou o alternativo quando o WhatsApp manda o número oculto. */
function telefoneDe(p: WahaPayload): string | null {
  const chat = parseChatId(p.from ?? "");
  if (chat.kind === "phone") return chat.phone;
  if (chat.kind === "lid") return telefoneAlternativo(p, "entrada");
  return null;
}

/**
 * Ponto de entrada dos webhooks do WhatsApp, antes de qualquer gravação. Só olha a
 * sessão do OPA Lembretes; para as outras devolve `consumiu: false` sem ler nada.
 */
export async function tratarMensagemDoAssistente(admin: Admin, sessao: SessaoMinima, envelope: WahaEnvelope, requestId: string): Promise<ResultadoDoAssistente> {
  if (sessao.waha_session_name !== SESSAO_DO_ASSISTENTE) return { consumiu: false };
  const evento = envelope.event ?? "";
  if (evento !== "message" && evento !== "message.any") return { consumiu: false };
  const p = envelope.payload ?? {};

  const config = await carregarConfig(admin, sessao.organization_id);
  if (!config.assistente.ligado) return { consumiu: false };

  // O que o próprio número mandou (avisos e respostas): nada a fazer, e não vira conversa
  // quando o destino é alguém da lista.
  const telefone = p.fromMe ? (parseChatId(p.to ?? "").phone ?? null) : telefoneDe(p);
  const pessoa = quemFala(config.assistente.numeros, telefone);
  if (!pessoa) return { consumiu: false };
  if (p.fromMe || !p.id) return { consumiu: true };

  return { consumiu: true, depois: () => atender(admin, sessao.organization_id, pessoa, p, requestId) };
}

async function atender(admin: Admin, orgId: string, pessoa: Pessoa, p: WahaPayload, requestId: string): Promise<void> {
  const agora = Date.now();
  const tipo = resolveMessageType(p);
  const texto = (p.body ?? "").trim();

  // Reserva: `message` e `message.any` trazem a mesma mensagem; só a primeira atende.
  const { data: linha, error } = await admin
    .from(TABELA)
    .insert({
      organization_id: orgId,
      numero: pessoa.numero,
      user_id: pessoa.usuario,
      mensagem_wa_id: bareWaMessageId(p.id ?? ""),
      texto: tipo === "text" ? texto.slice(0, 300) : null,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code !== "23505") logger.warn("[opa.assistente] não registrou a mensagem", { requestId, error: error.message });
    return;
  }
  const id = (linha as { id: string }).id;

  let resultado = "erro";
  let funcao: string | null = null;
  let dados: Record<string, unknown> = {};
  let resposta: string | null = TEXTO_ERRO;
  try {
    const anteriores = await mensagensAnteriores(admin, orgId, pessoa.numero, id, agora);
    const trava = travaAntesDaIA({ tipo, texto, agora }, anteriores);
    if (trava) {
      if (trava.tipo === "so_texto") [resultado, resposta] = ["so_texto", TEXTO_SO_TEXTO];
      else if (trava.tipo === "ritmo") [resultado, resposta] = ["ritmo", trava.avisar ? TEXTO_RITMO : null];
      else if (trava.tipo === "silencio") [resultado, resposta] = ["silencio", null];
      // Mensagem sem texto (reação, aviso do próprio WhatsApp): não responde e não conta como recusa.
      else if (trava.tipo === "vazia") [resultado, resposta] = ["ignorada", null];
      else [resultado, resposta] = ["recusada", textoRecusa(pessoa.papel)];
    } else {
      const pedido = interpretarPorRegras(texto) ?? (await interpretarComIA(texto, requestId));
      const r = await responder(admin, orgId, pessoa, pedido, anteriores, agora);
      resultado = r.resultado;
      resposta = r.texto;
      funcao = r.funcao;
      dados = r.dados ?? {};
    }
  } catch (e) {
    logger.warn("[opa.assistente] falhou ao atender", { requestId, error: e instanceof Error ? e.message : String(e) });
  }

  let envio = "nada";
  if (resposta) {
    const canal = await carregarCanalDeAvisos(admin, orgId);
    envio = await avisarDestino(canal, { userId: null, nome: pessoa.nome, telefone: pessoa.numero }, resposta);
  }
  await admin
    .from(TABELA)
    .update({ funcao, resultado, dados: { ...dados, envio } })
    .eq("id", id);
}

interface LinhaAnterior extends MensagemAnterior {
  dados: { opcoes?: string[]; para?: Funcao } | null;
}

/** As mensagens desta pessoa na última meia hora, da mais nova para a mais velha, sem a atual. */
async function mensagensAnteriores(admin: Admin, orgId: string, numero: string, atualId: string, agora: number): Promise<LinhaAnterior[]> {
  const desde = new Date(agora - Math.max(SILENCIO_MIN, ESCOLHA_VALE_MIN, 30) * 60_000).toISOString();
  const { data, error } = await admin
    .from(TABELA)
    .select("id, resultado, dados, created_at")
    .eq("organization_id", orgId)
    .eq("numero", numero)
    .gte("created_at", desde)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw new Error(`mensagens anteriores: ${error.message}`);
  return ((data ?? []) as Array<{ id: string; resultado: string; dados: LinhaAnterior["dados"]; created_at: string }>)
    .filter((l) => l.id !== atualId)
    .map((l) => ({ em: Date.parse(l.created_at), resultado: l.resultado, dados: l.dados }));
}

/** A IA só classifica. Sem IA configurada, ou se ela falhar, o pedido que as regras não entenderam é recusado. */
async function interpretarComIA(texto: string, requestId: string): Promise<Pedido> {
  const modelo = resolveLanguageModel(MODELO_COPILOTO as never);
  if (!modelo) return { funcao: "recusa" };
  try {
    const r = await generateText({
      model: modelo as never,
      output: Output.object({ schema: EsquemaDaIA }),
      instructions: { role: "system" as const, content: INSTRUCOES_DA_IA, providerOptions: { anthropic: { cacheControl: { type: "ephemeral" as const } } } },
      messages: [{ role: "user" as const, content: entradaDaIA(texto) }],
    } as never);
    return validarPedido((r as { output?: unknown }).output);
  } catch (e) {
    logger.warn("[opa.assistente] a IA não classificou", { requestId, error: e instanceof Error ? e.message : String(e) });
    return { funcao: "recusa" };
  }
}

interface Resposta {
  resultado: "atendida" | "recusada";
  funcao: string | null;
  texto: string;
  dados?: Record<string, unknown>;
}

async function responder(admin: Admin, orgId: string, pessoa: Pessoa, pedido: Pedido, anteriores: LinhaAnterior[], agora: number): Promise<Resposta> {
  const recusa: Resposta = { resultado: "recusada", funcao: null, texto: textoRecusa(pessoa.papel) };

  // Resposta a "qual destes leads?": o número escolhe um dos leads que o assistente listou.
  if (pedido.funcao === "escolha") {
    const aberta = anteriores.find((a) => agora - a.em <= ESCOLHA_VALE_MIN * 60_000 && a.dados?.opcoes?.length);
    const leadId = aberta?.dados?.opcoes?.[(pedido.escolha ?? 0) - 1];
    const para = aberta?.dados?.para === "situacao" ? "situacao" : "historico";
    if (!aberta || !leadId) return { resultado: "recusada", funcao: "escolha", texto: TEXTO_SEM_ESCOLHA };
    return sobreUmLead(admin, orgId, pessoa, para, (await acharPorId(admin, orgId, leadId, pessoa)) ?? null, agora);
  }

  if (pedido.funcao === "recusa" || !podeUsar(pedido.funcao, pessoa.papel)) return recusa;
  const funcao = pedido.funcao;

  switch (funcao) {
    case "ajuda":
      return { resultado: "atendida", funcao, texto: textoAjuda(pessoa) };
    case "sem_resposta":
      return { resultado: "atendida", funcao, texto: await leadsSemResposta(admin, orgId, pessoa, agora) };
    case "novos":
      return { resultado: "atendida", funcao, texto: await leadsNovos(admin, orgId, pessoa, pedido.periodo === "semana" ? "semana" : "hoje", agora) };
    case "agenda":
      return { resultado: "atendida", funcao, texto: await agendaDoDia(admin, orgId, pessoa, agora) };
    case "imovel":
      return pedido.imovel ? { resultado: "atendida", funcao, texto: await dadosDoImovel(admin, orgId, pedido.imovel) } : recusa;
    case "resumo":
      return { resultado: "atendida", funcao, texto: await resumoDoDia(admin, orgId, agora) };
    case "historico":
    case "situacao": {
      if (!pedido.lead) return { resultado: "atendida", funcao, texto: TEXTO_SEM_LEAD };
      const achados = await acharLeads(admin, orgId, pedido.lead);
      if (achados.length === 0) return { resultado: "atendida", funcao, texto: TEXTO_NAO_ACHEI };
      const meus = achados.filter((l) => ehDaPessoa(pessoa, l.donoId));
      if (meus.length === 0) {
        // Existe, mas não é dele: diz só com quem está (um só achado) ou que não é dele.
        const equipe = await carregarEquipe(orgId);
        const dono = achados.length === 1 ? (equipe.get(achados[0]!.donoId ?? "")?.nome ?? "") : "";
        return { resultado: "atendida", funcao, texto: textoDeOutroCorretor(dono) };
      }
      if (meus.length === 1) return sobreUmLead(admin, orgId, pessoa, funcao, meus[0]!, agora);
      const equipe = await carregarEquipe(orgId);
      const opcoes = meus.slice(0, MAX_ITENS);
      return {
        resultado: "atendida",
        funcao,
        texto: textoVariosLeads(opcoes.map((l) => ({ nome: l.nome, etapa: l.etapa, corretor: equipe.get(l.donoId ?? "")?.nome ?? "" }))),
        dados: { opcoes: opcoes.map((l) => l.id), para: funcao },
      };
    }
  }
}

async function acharPorId(admin: Admin, orgId: string, leadId: string, pessoa: Pessoa): Promise<LeadAchado | null> {
  // Relê pela mesma consulta e confere o alcance de novo: a lista guardada não dá permissão.
  const { data } = await admin.from("crm_leads").select("title, contacts(name)").eq("organization_id", orgId).eq("id", leadId).maybeSingle();
  const l = data as unknown as { title: string; contacts: { name: string | null } | null } | null;
  if (!l) return null;
  const achados = await acharLeads(admin, orgId, l.contacts?.name?.trim() || l.title.split(" · ")[0] || "");
  const lead = achados.find((x) => x.id === leadId) ?? null;
  return lead && ehDaPessoa(pessoa, lead.donoId) ? lead : null;
}

async function sobreUmLead(admin: Admin, orgId: string, pessoa: Pessoa, funcao: "historico" | "situacao", lead: LeadAchado | null, agora: number): Promise<Resposta> {
  if (!lead) return { resultado: "atendida", funcao, texto: TEXTO_NAO_ACHEI };
  const texto = funcao === "historico" ? await historicoDoLead(admin, orgId, lead, agora) : await situacaoDoLead(admin, orgId, lead, agora);
  return { resultado: "atendida", funcao, texto };
}

/** Apaga o registro velho (GUARDA_DIAS). Chamada pela rotina de minuto em minuto. */
export async function apagarRegistroVelhoDoAssistente(admin: Admin, agora = Date.now()): Promise<void> {
  const { error } = await admin.from(TABELA).delete().lt("created_at", new Date(agora - GUARDA_DIAS * 86_400_000).toISOString());
  // Tabela ainda não criada (migration 0132 por aplicar) não é erro da rotina.
  if (error && error.code !== "42P01" && error.code !== "PGRST205") throw new Error(error.message);
}
