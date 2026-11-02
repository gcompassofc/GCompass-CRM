/**
 * WhatsApp do corretor: separa contato pessoal de lead ANTES de qualquer gravação
 * (pedido do Allyson, 01/11/2026). Regra em lib/opa/contatos-whatsapp.ts.
 *
 * Vale só para número com dono (`channel_sessions.owner_user_id`, o "Meu
 * WhatsApp" do corretor). O número da empresa (OPA Lembretes, número central)
 * segue o caminho de sempre.
 *
 * Os dois webhooks chamam `filtrarEventoDoCorretor` logo depois de autenticar e
 * ANTES de gravar o corpo no `webhook_events_log`: mensagem de contato pessoal ou
 * a classificar não deixa corpo no log, em `messages` nem na IA. Do contato
 * pessoal fica só o índice cego da identidade, para lembrar a decisão.
 *
 * Contato a classificar (decisão do Allyson, 02/11/2026): a mensagem vai cifrada
 * para `whatsapp_mensagens_a_classificar` (migration 0124), que só o servidor lê,
 * para o corretor saber quem é antes de decidir. "É lead" leva essas mensagens
 * para a conversa normal; "Pessoal" apaga; sem decisão, somem em 7 dias.
 */
import { createHash } from "node:crypto";

import { logger } from "@/lib/logger";
import {
  cifraConfigurada,
  cifrar,
  decifrar,
  indiceCego,
  indiceTelefone,
} from "@/lib/crypto/dados-pessoais";
import {
  CONVERSA_NA_TELA,
  ESPERA_MAX_POR_CONTATO,
  ESPERA_MS,
  ETIQUETAS,
  HISTORICO_AO_VIRAR_LEAD,
  chatIgnorado,
  decidir,
  decisaoDoCorretor,
  emJanelaDeImportacao,
  etiquetaDe,
  sinalDeEntrada,
  telefoneAlternativo,
  textoDaEspera,
  tipoEmEspera,
  type OrigemContato,
  type Situacao,
} from "@/lib/opa/contatos-whatsapp";
import { registrarLeadDoContato } from "@/lib/opa/entrada";
import type { createAdminClient } from "@/lib/supabase/admin";
import { getWahaClient } from "@/lib/waha/client";
import {
  ingerirHistorico,
  parseChatId,
  resolveMessageType,
  upsertContact,
  upsertConversation,
  type WahaEnvelope,
  type WahaPayload,
} from "@/lib/waha/ingest";
import { bareWaMessageId, chatIdFromWaMessageId } from "@/lib/waha/message-id";

type Admin = ReturnType<typeof createAdminClient>;

/** Mensagens de contato a classificar, cifradas, até o corretor decidir (0124). */
const ESPERA = "whatsapp_mensagens_a_classificar";

/** Campos da sessão que os webhooks já buscam e que este módulo usa. */
export interface SessaoDoCorretor {
  id: string;
  organization_id: string;
  owner_user_id?: string | null;
  waha_session_name?: string | null;
  status?: string | null;
  is_warmup_complete: boolean | null;
  warmup_started_at: string | null;
  pessoais_import_inicio?: string | null;
  pessoais_importados_em?: string | null;
  etiqueta_lead_id?: string | null;
  etiqueta_pessoal_id?: string | null;
}

/** Colunas extras que os webhooks pedem na busca da sessão. */
export const COLUNAS_SESSAO_DO_CORRETOR =
  "owner_user_id, pessoais_import_inicio, pessoais_importados_em, etiqueta_lead_id, etiqueta_pessoal_id";

export function separaPessoal(s: Pick<SessaoDoCorretor, "owner_user_id">): boolean {
  return Boolean(s.owner_user_id);
}

/**
 * - descartar: nada é gravado (nem o corpo no log).
 * - seguir: o pipeline normal grava; `registrarCorpo` diz se o corpo vai para o
 *   `webhook_events_log`; `depois` roda depois da gravação (lead novo: criar o
 *   lead no CRM e trazer o histórico).
 */
export type ResultadoFiltro =
  | { acao: "descartar"; motivo: string }
  | { acao: "seguir"; registrarCorpo: boolean; depois?: () => Promise<void> };

const SEGUIR: ResultadoFiltro = { acao: "seguir", registrarCorpo: true };

/** Identidade do chat de uma mensagem, nos dois sentidos (mesma ordem do ingest). */
export function chatDaMensagem(p: WahaPayload): { chatId: string; direcao: "entrada" | "saida" } {
  if (p.fromMe) return { chatId: p.to ?? chatIdFromWaMessageId(p.id ?? "") ?? p.from ?? "", direcao: "saida" };
  return { chatId: p.from ?? "", direcao: "entrada" };
}

/**
 * Índice cego da identidade (telefone ou lid), preso à org. Sem as chaves de
 * cifra (ambiente de teste local sem PII_*), cai num SHA-256 com a org: nunca
 * grava a identidade em claro.
 */
export function chaveDoChat(orgId: string, chatId: string): string | null {
  const p = parseChatId(chatId);
  const identidade = p.kind === "phone" ? p.phone : p.kind === "lid" ? `lid:${p.lid}` : null;
  if (!identidade) return null;
  if (!cifraConfigurada()) return createHash("sha256").update(`${orgId}|wa|${identidade}`).digest("hex");
  return p.kind === "phone" ? indiceTelefone(orgId, identidade) : indiceCego(identidade, { org: orgId, campo: "telefone" });
}

function cifrado(org: string, campo: "telefone" | "nome" | "mensagem", valor: string | null): string | null {
  if (!valor || !cifraConfigurada()) return null;
  return cifrar(valor, { org, campo });
}

/** Abre um valor cifrado; sem chave ou com a chave aposentada, devolve null em vez de derrubar a tela. */
function aberto(org: string, campo: "telefone" | "nome" | "mensagem", valor: string | null): string | null {
  if (!valor || !cifraConfigurada()) return null;
  try {
    return decifrar(valor, { org, campo });
  } catch (err) {
    logger.warn("contatos-pessoais: valor cifrado não abriu", { campo, erro: String(err).slice(0, 120) });
    return null;
  }
}

/**
 * Telefone, nome e chat cifrados. `telefoneOculto` é o telefone de um contato
 * `@lid` lido dos campos alternativos do payload (pode não vir).
 */
function dadosDoContato(org: string, chatId: string, nome: string | null, telefoneOculto: string | null = null) {
  const p = parseChatId(chatId);
  return {
    telefone_cifrado: cifrado(org, "telefone", p.kind === "phone" ? p.phone : telefoneOculto),
    nome_cifrado: cifrado(org, "nome", nome),
    chat_cifrado: cifrado(org, "telefone", chatId),
  };
}

const SEM_DADOS = { telefone_cifrado: null, nome_cifrado: null, chat_cifrado: null };

interface LinhaContato {
  id: string;
  situacao: Situacao;
  mensagens_ignoradas: number;
  nome_cifrado?: string | null;
  telefone_cifrado?: string | null;
}

async function lerContato(admin: Admin, sessaoId: string, chave: string): Promise<LinhaContato | null> {
  const { data } = await admin
    .from("whatsapp_contatos_numero")
    .select("id, situacao, mensagens_ignoradas, nome_cifrado, telefone_cifrado")
    .eq("channel_session_id", sessaoId)
    .eq("chave", chave)
    .maybeSingle();
  return (data as LinhaContato | null) ?? null;
}

/** O CRM já tem lead aberto para esta pessoa (porta de entrada, cadastro do corretor). */
async function temLeadNoCrm(admin: Admin, orgId: string, chatId: string): Promise<boolean> {
  const p = parseChatId(chatId);
  const identidade = p.kind === "phone" ? `phone:${p.phone}` : p.kind === "lid" ? `lid:${p.lid}` : null;
  if (!identidade) return false;
  const filtros = [`wa_identity.eq.${identidade}`];
  if (p.kind === "phone" && cifraConfigurada()) filtros.push(`telefone_indice.eq.${indiceTelefone(orgId, p.phone)}`);
  const { data: contatos } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", orgId)
    .or(filtros.join(","))
    .limit(5);
  const ids = ((contatos ?? []) as Array<{ id: string }>).map((c) => c.id);
  if (!ids.length) return false;
  const { count } = await admin
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .in("contact_id", ids)
    .eq("status", "open");
  return (count ?? 0) > 0;
}

/**
 * Grava a situação. `promoveu` é `true` quando ESTA chamada foi quem pôs o
 * contato em "lead" (o WAHA manda `message` e `message.any` da mesma mensagem ao
 * mesmo tempo: só uma das duas cria o lead e traz o histórico). `id` é a linha do
 * contato (para guardar a mensagem em espera).
 */
async function gravarSituacao(
  admin: Admin,
  sessao: SessaoDoCorretor,
  chave: string,
  linha: LinhaContato | null,
  nova: Situacao,
  origem: OrigemContato | null,
  dados: ReturnType<typeof dadosDoContato>,
  extra: { ignorada?: boolean; decididoPor?: string | null } = {},
): Promise<{ promoveu: boolean; id: string | null }> {
  const agora = new Date().toISOString();
  const conteudo = nova === "pessoal" ? SEM_DADOS : dados;
  const decisao = extra.decididoPor !== undefined ? { decidido_por: extra.decididoPor, decidido_em: agora } : {};

  if (!linha) {
    const { data } = await admin
      .from("whatsapp_contatos_numero")
      .upsert(
        {
          organization_id: sessao.organization_id,
          channel_session_id: sessao.id,
          chave,
          situacao: nova,
          origem: origem ?? "novo",
          ...conteudo,
          mensagens_ignoradas: extra.ignorada ? 1 : 0,
          ultimo_contato_em: agora,
          ...decisao,
        },
        { onConflict: "channel_session_id,chave", ignoreDuplicates: true },
      )
      .select("id");
    const criada = ((data ?? []) as Array<{ id: string }>)[0];
    if (criada) return { promoveu: nova === "lead", id: criada.id };
    // Corrida: outra chamada criou a linha agora. Relê e segue como mudança.
    const atual = await lerContato(admin, sessao.id, chave);
    if (!atual) return { promoveu: false, id: null };
    return gravarSituacao(admin, sessao, chave, atual, nova, origem, dados, extra);
  }

  if (linha.situacao === nova) {
    // Nome e telefone que faltavam (o primeiro aviso pode vir sem nome, ou o
    // telefone de um `@lid` só aparecer numa mensagem depois). Pessoal não ganha nada.
    const completa =
      nova === "pessoal"
        ? {}
        : {
            ...(!linha.nome_cifrado && dados.nome_cifrado ? { nome_cifrado: dados.nome_cifrado } : {}),
            ...(!linha.telefone_cifrado && dados.telefone_cifrado ? { telefone_cifrado: dados.telefone_cifrado } : {}),
          };
    await admin
      .from("whatsapp_contatos_numero")
      .update({
        ultimo_contato_em: agora,
        ...(extra.ignorada ? { mensagens_ignoradas: linha.mensagens_ignoradas + 1 } : {}),
        ...completa,
        ...decisao,
      })
      .eq("id", linha.id);
    return { promoveu: false, id: linha.id };
  }

  // Na mudança para lead ou a classificar, vazio não apaga o que já estava guardado
  // (o telefone de um `@lid` só vem em algumas mensagens). Pessoal zera tudo.
  const mudanca =
    nova === "pessoal" ? SEM_DADOS : Object.fromEntries(Object.entries(conteudo).filter(([, v]) => v !== null));
  // Muda só se ainda estava na situação lida: quem chegar segundo não promove de novo.
  const { data } = await admin
    .from("whatsapp_contatos_numero")
    .update({ situacao: nova, ...(origem ? { origem } : {}), ...mudanca, ultimo_contato_em: agora, ...decisao })
    .eq("id", linha.id)
    .eq("situacao", linha.situacao)
    .select("id");
  return { promoveu: nova === "lead" && (data ?? []).length > 0, id: linha.id };
}

export function nomeDoPayload(p: WahaPayload): string | null {
  return p._data?.notifyName ?? p._data?.pushName ?? null;
}

/**
 * Guarda, cifrada, uma mensagem de contato a classificar (entrada ou saída do
 * corretor). Sem as chaves de cifra não guarda nada (o texto puro nunca entra; o
 * banco também recusa). Mídia não é baixada: fica o tipo e a legenda. O banco só
 * aceita se o contato ainda está a classificar e corta em 20 por contato.
 */
async function guardarEmEspera(
  admin: Admin,
  sessao: SessaoDoCorretor,
  contatoNumeroId: string,
  p: WahaPayload,
  direcao: "entrada" | "saida",
): Promise<boolean> {
  if (!p.id || !cifraConfigurada()) return false;
  const tipo = resolveMessageType(p);
  if (!tipoEmEspera(tipo)) return false;
  const corpo = p.body?.trim() ? p.body : null;
  // Evento sem conteúdo (presença, protocolo): o ingest também não grava.
  if (tipo === "text" && !corpo) return false;
  const org = sessao.organization_id;
  const { error } = await admin.from(ESPERA).upsert(
    {
      organization_id: org,
      channel_session_id: sessao.id,
      contato_numero_id: contatoNumeroId,
      // Só a parte do id sem o chat: o id completo leva o telefone em claro.
      mensagem_wa_id: bareWaMessageId(p.id),
      direcao,
      tipo,
      corpo_cifrado: cifrado(org, "mensagem", corpo),
      mensagem_em: p.timestamp ? new Date(p.timestamp * 1000).toISOString() : new Date().toISOString(),
    },
    { onConflict: "channel_session_id,mensagem_wa_id", ignoreDuplicates: true },
  );
  if (error) {
    // Sem o corpo no aviso: é registro operacional, não cópia da conversa.
    logger.warn("contatos-pessoais: mensagem em espera não foi guardada", { sessao: sessao.id, erro: error.message });
    return false;
  }
  return true;
}

/**
 * Ponto de entrada dos webhooks. Para número sem dono devolve "seguir" sem olhar
 * nada (comportamento de sempre).
 */
export async function filtrarEventoDoCorretor(
  admin: Admin,
  sessao: SessaoDoCorretor,
  envelope: WahaEnvelope,
  requestId: string,
): Promise<ResultadoFiltro> {
  if (!separaPessoal(sessao)) return SEGUIR;
  const evento = envelope.event ?? "unknown";
  const p = envelope.payload ?? {};

  if (evento === "message" || evento === "message.any") return filtrarMensagem(admin, sessao, p, requestId);

  if (evento.startsWith("label.")) {
    try {
      await tratarEtiqueta(admin, sessao, evento, p as unknown as Record<string, unknown>, requestId);
    } catch (err) {
      logger.warn("contatos-pessoais: evento de etiqueta falhou", { evento, sessao: sessao.id, erro: String(err) });
    }
    // Etiqueta traz o chat (telefone) de contato possivelmente pessoal: corpo fora do log.
    return { acao: "descartar", motivo: "etiqueta tratada" };
  }

  if ((evento === "session.status" || evento === "state.change") && String(p.status ?? "").toUpperCase() === "WORKING") {
    return { acao: "seguir", registrarCorpo: true, depois: () => abrirJanelaDeImportacao(admin, sessao) };
  }
  if (evento === "session.status" || evento === "state.change") return SEGUIR;
  // Confirmação de leitura, reação e afins também carregam o chat (telefone): no
  // número do corretor seguem para o pipeline, mas sem corpo no log.
  return { acao: "seguir", registrarCorpo: false };
}

async function filtrarMensagem(admin: Admin, sessao: SessaoDoCorretor, p: WahaPayload, requestId: string): Promise<ResultadoFiltro> {
  const { chatId, direcao } = chatDaMensagem(p);
  if (chatIgnorado(chatId)) return { acao: "descartar", motivo: "grupo, status ou canal" };
  const chave = chaveDoChat(sessao.organization_id, chatId);
  // Formato desconhecido: o ingest emite o aviso e não grava. Sem corpo no log.
  if (!chave) return { acao: "seguir", registrarCorpo: false };

  const linha = await lerContato(admin, sessao.id, chave);
  if (linha?.situacao === "lead") return SEGUIR;

  const d = decidir({
    atual: linha?.situacao ?? null,
    temLeadNoCrm: await temLeadNoCrm(admin, sessao.organization_id, chatId),
    sinal: sinalDeEntrada(p),
    direcao,
    emImportacao: emJanelaDeImportacao({
      pessoais_import_inicio: sessao.pessoais_import_inicio ?? null,
      pessoais_importados_em: sessao.pessoais_importados_em ?? null,
    }),
  });

  // Na saída, o nome do payload é o do corretor: não serve.
  const nome = direcao === "entrada" ? nomeDoPayload(p) : null;
  const telefoneOculto = parseChatId(chatId).kind === "lid" ? telefoneAlternativo(p, direcao) : null;
  const { promoveu, id } = await gravarSituacao(
    admin,
    sessao,
    chave,
    linha,
    d.situacao,
    d.origem,
    dadosDoContato(sessao.organization_id, chatId, nome, telefoneOculto),
    { ignorada: !d.gravar },
  );

  if (!d.gravar) {
    // A classificar: a conversa fica guardada (cifrada, só para o dono) até ele
    // decidir. Pessoal (inclusive a janela de 15 min depois do QR) não guarda nada.
    if (d.situacao === "a_classificar" && id) await guardarEmEspera(admin, sessao, id, p, direcao);
    return { acao: "descartar", motivo: d.situacao };
  }
  if (!promoveu) return SEGUIR;
  const sinal = sinalDeEntrada(p);
  return {
    acao: "seguir",
    registrarCorpo: true,
    depois: () =>
      promoverParaLead(admin, sessao, chatId, {
        origem: d.origem ?? "novo",
        nome,
        imovelCodigo: sinal?.imovelCodigo ?? null,
        requestId,
        trazerHistorico: true,
      }),
  };
}

/**
 * Primeira conexão do número: tudo o que aparecer nos próximos 15 minutos é do
 * aparelho. Idempotente (só marca o início uma vez). Chamada pelo evento WORKING
 * do webhook e, de reserva, pela tela Meu WhatsApp.
 */
export async function abrirJanelaDeImportacao(admin: Admin, sessao: SessaoDoCorretor): Promise<void> {
  await admin
    .from("channel_sessions")
    .update({ pessoais_import_inicio: new Date().toISOString() })
    .eq("id", sessao.id)
    .is("pessoais_import_inicio", null);
  await garantirEtiquetas(admin, sessao);
}

/**
 * Cria "Lead OPA" e "Pessoal" no WhatsApp Business do corretor (uma vez). Conta
 * comum não tem etiqueta: o erro é esperado e o caminho vira o botão no CRM.
 */
async function garantirEtiquetas(admin: Admin, sessao: SessaoDoCorretor): Promise<void> {
  const waha = getWahaClient();
  if (!waha || !sessao.waha_session_name) return;
  const faltam: Array<["lead" | "pessoal", string]> = [];
  if (!sessao.etiqueta_lead_id) faltam.push(["lead", ETIQUETAS.lead]);
  if (!sessao.etiqueta_pessoal_id) faltam.push(["pessoal", ETIQUETAS.pessoal]);
  for (const [tipo, nome] of faltam) {
    try {
      const criada = await waha.createLabel(sessao.waha_session_name, nome, tipo === "lead" ? 1 : 9);
      if (criada?.id) {
        await admin
          .from("channel_sessions")
          .update(tipo === "lead" ? { etiqueta_lead_id: String(criada.id) } : { etiqueta_pessoal_id: String(criada.id) })
          .eq("id", sessao.id);
      }
    } catch (err) {
      logger.info("contatos-pessoais: etiqueta não criada (conta comum ou já existe)", { sessao: sessao.id, erro: String(err).slice(0, 120) });
    }
  }
}

function idDaEtiqueta(payload: Record<string, unknown>): { id: string | null; nome: string | null } {
  const label = (payload.label ?? null) as { id?: unknown; name?: unknown } | null;
  const id = payload.labelId ?? label?.id ?? payload.id ?? null;
  const nome = label?.name ?? payload.name ?? null;
  return { id: id == null ? null : String(id), nome: typeof nome === "string" ? nome : null };
}

async function tratarEtiqueta(
  admin: Admin,
  sessao: SessaoDoCorretor,
  evento: string,
  payload: Record<string, unknown>,
  requestId: string,
): Promise<void> {
  const { id, nome } = idDaEtiqueta(payload);

  if (evento === "label.upsert" || evento === "label.deleted") {
    const tipo = etiquetaDe(nome);
    if (!tipo || !id) return;
    const valor = evento === "label.deleted" ? null : id;
    await admin
      .from("channel_sessions")
      .update(tipo === "lead" ? { etiqueta_lead_id: valor } : { etiqueta_pessoal_id: valor })
      .eq("id", sessao.id);
    return;
  }

  // Tirar a etiqueta não desfaz a decisão: só pôr a outra muda.
  if (evento !== "label.chat.added") return;
  const chatId = typeof payload.chatId === "string" ? payload.chatId : null;
  if (!chatId || chatIgnorado(chatId)) return;

  // O nome vem no evento; logo depois do QR pode vir nulo, aí vale o id guardado.
  let tipo = etiquetaDe(nome);
  if (!tipo && id) {
    if (id === sessao.etiqueta_lead_id) tipo = "lead";
    else if (id === sessao.etiqueta_pessoal_id) tipo = "pessoal";
  }
  if (!tipo) return;
  if (tipo === "lead" && id && !sessao.etiqueta_lead_id) {
    await admin.from("channel_sessions").update({ etiqueta_lead_id: id }).eq("id", sessao.id);
  }
  await aplicarDecisao(admin, sessao, chatId, tipo, { origem: "etiqueta", porUserId: sessao.owner_user_id ?? null, requestId });
}

/**
 * Decisão explícita (etiqueta no WhatsApp ou botão no CRM).
 * - lead: cria o lead no CRM (dono = corretor do número), leva para a conversa as
 *   mensagens que estavam em espera e tenta trazer o histórico recente;
 * - pessoal: apaga o que o CRM tiver guardado da conversa deste número (inclusive
 *   o que estava em espera) e para de ler.
 */
export async function aplicarDecisao(
  admin: Admin,
  sessao: SessaoDoCorretor,
  chatId: string,
  nova: "lead" | "pessoal",
  o: { origem: OrigemContato; porUserId: string | null; requestId: string; nome?: string | null },
): Promise<void> {
  const chave = chaveDoChat(sessao.organization_id, chatId);
  if (!chave) return;
  const linha = await lerContato(admin, sessao.id, chave);
  const efeito = decisaoDoCorretor(nova);
  const { promoveu, id } = await gravarSituacao(
    admin,
    sessao,
    chave,
    linha,
    efeito.situacao,
    o.origem,
    dadosDoContato(sessao.organization_id, chatId, o.nome ?? null),
    { decididoPor: o.porUserId },
  );
  if (efeito.apagarConteudo) {
    // O gatilho da 0124 já apaga ao virar pessoal; aqui é a segunda camada.
    if (id) await admin.from(ESPERA).delete().eq("contato_numero_id", id);
    await apagarConteudoGuardado(admin, sessao, chatId);
  }
  if (efeito.criarLead && (promoveu || linha?.situacao === "lead")) {
    await promoverParaLead(admin, sessao, chatId, {
      origem: o.origem,
      nome: o.nome ?? null,
      imovelCodigo: null,
      requestId: o.requestId,
      trazerHistorico: promoveu,
    });
  }
}

interface LinhaEspera {
  id: string;
  mensagem_wa_id: string;
  direcao: "entrada" | "saida";
  tipo: string;
  corpo_cifrado: string | null;
  mensagem_em: string;
}

/**
 * Uma mensagem em espera no formato do webhook, para entrar pelo mesmo caminho
 * do histórico (`ingerirHistorico`). O id volta ao formato do NOWEB
 * (`{fromMe}_{chat}_{id}`), o mesmo que o webhook grava em `messages.external_id`:
 * levar duas vezes não duplica (dedup por external_id).
 */
function payloadDaEspera(m: LinhaEspera, chatId: string, org: string): WahaPayload | null {
  const corpo = aberto(org, "mensagem", m.corpo_cifrado);
  if (m.corpo_cifrado && corpo === null) return null; // não abriu: não inventa mensagem vazia
  const saida = m.direcao === "saida";
  return {
    id: `${saida}_${chatId}_${m.mensagem_wa_id}`,
    fromMe: saida,
    ...(saida ? { to: chatId } : { from: chatId }),
    body: corpo ?? undefined,
    type: m.tipo,
    hasMedia: m.tipo !== "text",
    timestamp: Math.floor(Date.parse(m.mensagem_em) / 1000),
  };
}

/**
 * Contato `@lid` cujo telefone apareceu num campo alternativo do payload: a ficha
 * do lead passa a ter o número (botão do WhatsApp). Vai cifrado, em
 * `contacts.telefone_cifrado` e no índice cego, e NÃO em `phone_number`: trocar
 * `phone_number` mudaria a identidade do contato (`wa_identity` passa a ser o
 * telefone) e a próxima mensagem do mesmo `@lid` criaria outro contato.
 */
async function guardarTelefoneDoLid(admin: Admin, org: string, contactId: string, telefone: string): Promise<void> {
  if (!cifraConfigurada()) return;
  await admin
    .from("contacts")
    .update({ telefone_cifrado: cifrar(telefone, { org, campo: "telefone" }), telefone_indice: indiceTelefone(org, telefone) })
    .eq("id", contactId)
    .eq("organization_id", org)
    .is("phone_number", null)
    .is("telefone_cifrado", null);
}

/**
 * Contato virou lead: garante contato e conversa, cria o lead do corretor (se o
 * CRM ainda não tem), leva para `messages` o que estava em espera (0124) e, como
 * tentativa extra, pede ao WAHA até HISTORICO_AO_VIRAR_LEAD mensagens recentes
 * (sem o store do NOWEB isso volta vazio ou falha, e tudo segue).
 */
async function promoverParaLead(
  admin: Admin,
  sessao: SessaoDoCorretor,
  chatId: string,
  o: { origem: OrigemContato; nome: string | null; imovelCodigo: string | null; requestId: string; trazerHistorico: boolean },
): Promise<void> {
  try {
    const org = sessao.organization_id;
    const parsed = parseChatId(chatId);
    const chave = chaveDoChat(org, chatId);
    const linha = chave ? await lerContato(admin, sessao.id, chave) : null;
    const nome = o.nome ?? aberto(org, "nome", linha?.nome_cifrado ?? null);
    const contactId = await upsertContact(admin, org, parsed, chatId, nome);
    if (!contactId) return;
    await upsertConversation(admin, org, contactId, sessao.id);
    if (parsed.kind === "lid") {
      const telefone = aberto(org, "telefone", linha?.telefone_cifrado ?? null);
      if (telefone) await guardarTelefoneDoLid(admin, org, contactId, telefone);
    }

    if (sessao.owner_user_id) {
      const { data: contato } = await admin.from("contacts").select("display_name, name").eq("id", contactId).maybeSingle();
      const c = contato as { display_name: string | null; name: string | null } | null;
      const nomeDoLead = nome ?? c?.display_name ?? c?.name ?? "Contato do WhatsApp";
      const canal = o.origem === "campanha" ? "meta" : o.origem === "site" ? "site" : "whatsapp";
      const r = await registrarLeadDoContato(admin, sessao.organization_id, contactId, {
        nome: nomeDoLead,
        origem: canal,
        imovelCodigo: o.imovelCodigo,
        dono: sessao.owner_user_id,
        proprio: canal === "whatsapp",
      });
      if (r.novo) {
        await admin.from("crm_lead_activities").insert({
          organization_id: sessao.organization_id,
          lead_id: r.leadId,
          contact_id: contactId,
          source_module: "opa",
          type: "lead_do_whatsapp",
          payload: { origem: o.origem },
          actor_kind: "system",
          reason:
            o.origem === "etiqueta"
              ? "O corretor marcou o contato com a etiqueta Lead OPA no WhatsApp."
              : o.origem === "corretor"
                ? "O corretor marcou o contato como lead no CRM."
                : "Contato novo no WhatsApp do corretor com sinal de anúncio ou do site.",
        });
      }
    }

    // 1. O que ficou em espera enquanto o corretor decidia: sempre (vazio, não custa).
    const espera = linha ? await lerEspera(admin, sessao, linha.id) : [];
    const daEspera = espera.map((m) => payloadDaEspera(m, chatId, org)).filter((m): m is WahaPayload => m !== null);

    // 2. Tentativa extra: o histórico do WAHA. Sem o store do NOWEB (desligado por
    //    privacidade) volta vazio ou com erro; nada quebra por isso.
    let antigas: WahaPayload[] = [];
    const waha = o.trazerHistorico ? getWahaClient() : null;
    if (waha && sessao.waha_session_name) {
      try {
        const lidas = await waha.getChatMessages(sessao.waha_session_name, chatId, HISTORICO_AO_VIRAR_LEAD);
        antigas = Array.isArray(lidas) ? (lidas as WahaPayload[]) : [];
      } catch {
        antigas = [];
      }
    }

    // A mesma mensagem pode vir dos dois lados: fica a da espera.
    const jaTem = new Set(daEspera.map((m) => bareWaMessageId(m.id ?? "")));
    const juntas = [...daEspera, ...antigas.filter((m) => m.id && !jaTem.has(bareWaMessageId(m.id)))];
    if (juntas.length) await ingerirHistorico(admin, sessao, juntas, o.requestId);

    // Só depois de levar para a conversa: se der erro no meio, a espera fica e uma
    // nova etiqueta Lead OPA tenta de novo (o dedup por external_id não repete nada).
    if (espera.length) await admin.from(ESPERA).delete().in("id", espera.map((m) => m.id));
  } catch (err) {
    logger.error("contatos-pessoais: promover para lead falhou", { sessao: sessao.id, erro: String(err) });
  }
}

/**
 * Contato marcado como pessoal: some do CRM o que estava guardado da conversa
 * neste número (mensagens e prévia) e as sugestões da IA tiradas dela. O lead, se
 * existir, fica (exclusão de lead é só do administrador), com o registro da decisão.
 */
async function apagarConteudoGuardado(admin: Admin, sessao: SessaoDoCorretor, chatId: string): Promise<void> {
  const p = parseChatId(chatId);
  const identidade = p.kind === "phone" ? `phone:${p.phone}` : p.kind === "lid" ? `lid:${p.lid}` : null;
  if (!identidade) return;
  const { data: contatos } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", sessao.organization_id)
    .eq("wa_identity", identidade);
  const ids = ((contatos ?? []) as Array<{ id: string }>).map((c) => c.id);
  if (!ids.length) return;

  const { data: conversas } = await admin
    .from("conversations")
    .select("id")
    .eq("organization_id", sessao.organization_id)
    .eq("channel_session_id", sessao.id)
    .in("contact_id", ids);
  const convIds = ((conversas ?? []) as Array<{ id: string }>).map((c) => c.id);
  if (convIds.length) {
    await admin.from("messages").delete().eq("organization_id", sessao.organization_id).in("conversation_id", convIds);
    await admin.from("conversations").update({ last_message_preview: null }).in("id", convIds);
  }

  const { data: leads } = await admin
    .from("crm_leads")
    .select("id")
    .eq("organization_id", sessao.organization_id)
    .in("contact_id", ids)
    .eq("owner_user_id", sessao.owner_user_id ?? "");
  for (const l of (leads ?? []) as Array<{ id: string }>) {
    await admin.from("copiloto_sugestoes").delete().eq("lead_id", l.id);
    await admin.from("crm_lead_activities").insert({
      organization_id: sessao.organization_id,
      lead_id: l.id,
      source_module: "opa",
      type: "contato_pessoal",
      payload: {},
      actor_kind: "system",
      reason: "O corretor marcou como contato pessoal: a conversa saiu do CRM e a IA deixou de ler.",
    });
  }
}

const COLUNAS_SESSAO = `id, organization_id, waha_session_name, status, is_warmup_complete, warmup_started_at, ${COLUNAS_SESSAO_DO_CORRETOR}`;

/**
 * O número ativo de quem está logado (Meu WhatsApp). Consulta pelo DONO, não um
 * seletor de canal: fica em lib pelo mesmo motivo de lib/channels/sessao-do-dono.ts.
 */
export async function numeroDoCorretor(admin: Admin, orgId: string, userId: string): Promise<SessaoDoCorretor | null> {
  const { data } = await admin
    .from("channel_sessions")
    .select(COLUNAS_SESSAO)
    .eq("organization_id", orgId)
    .eq("owner_user_id", userId)
    .is("archived_at", null)
    .maybeSingle();
  return (data as unknown as SessaoDoCorretor | null) ?? null;
}

const COLUNAS_ESPERA = "id, contato_numero_id, mensagem_wa_id, direcao, tipo, corpo_cifrado, mensagem_em";

/** Mensagens em espera de um contato, da mais velha para a mais nova (o banco guarda até 20). */
async function lerEspera(
  admin: Admin,
  sessao: Pick<SessaoDoCorretor, "id">,
  contatoNumeroId: string,
  limite = ESPERA_MAX_POR_CONTATO,
): Promise<LinhaEspera[]> {
  const { data } = await admin
    .from(ESPERA)
    .select(COLUNAS_ESPERA)
    .eq("channel_session_id", sessao.id)
    .eq("contato_numero_id", contatoNumeroId)
    .order("mensagem_em", { ascending: false })
    .limit(limite);
  return ((data ?? []) as LinhaEspera[]).reverse();
}

/** Uma mensagem em espera aberta para a tela do dono do número. */
export interface MensagemEmEspera {
  id: string;
  direcao: "entrada" | "saida";
  /** Texto, ou o marcador da mídia ("[áudio]", "[foto]"...) com a legenda. */
  texto: string;
  em: string;
}

function abrirEspera(org: string, m: LinhaEspera): MensagemEmEspera {
  return { id: m.id, direcao: m.direcao, texto: textoDaEspera(m.tipo, aberto(org, "mensagem", m.corpo_cifrado)), em: m.mensagem_em };
}

export interface ContatoAClassificar {
  id: string;
  nome: string | null;
  telefone: string | null;
  ultimoContatoEm: string | null;
  mensagens: number;
  ultimaMensagem: MensagemEmEspera | null;
}

/** Contatos a classificar do número do corretor, com nome, telefone e a última mensagem abertos para a tela. */
export async function contatosAClassificar(
  admin: Admin,
  sessao: Pick<SessaoDoCorretor, "id" | "organization_id">,
  limite: number,
): Promise<ContatoAClassificar[]> {
  const { data } = await admin
    .from("whatsapp_contatos_numero")
    .select("id, nome_cifrado, telefone_cifrado, ultimo_contato_em, mensagens_ignoradas")
    .eq("channel_session_id", sessao.id)
    .eq("situacao", "a_classificar")
    .order("ultimo_contato_em", { ascending: false })
    .limit(limite);
  const org = sessao.organization_id;
  const linhas = (data ?? []) as Array<{
    id: string;
    nome_cifrado: string | null;
    telefone_cifrado: string | null;
    ultimo_contato_em: string | null;
    mensagens_ignoradas: number;
  }>;

  // A espera de todos de uma vez (no máximo 20 por contato): a última e a contagem.
  const porContato = new Map<string, LinhaEspera[]>();
  if (linhas.length) {
    const { data: espera } = await admin
      .from(ESPERA)
      .select(COLUNAS_ESPERA)
      .eq("channel_session_id", sessao.id)
      .in(
        "contato_numero_id",
        linhas.map((l) => l.id),
      )
      .order("mensagem_em", { ascending: false });
    for (const m of (espera ?? []) as Array<LinhaEspera & { contato_numero_id: string }>) {
      const lista = porContato.get(m.contato_numero_id) ?? [];
      lista.push(m);
      porContato.set(m.contato_numero_id, lista);
    }
  }

  return linhas.map((l) => {
    const guardadas = porContato.get(l.id) ?? [];
    const ultima = guardadas[0];
    return {
      id: l.id,
      nome: aberto(org, "nome", l.nome_cifrado),
      telefone: aberto(org, "telefone", l.telefone_cifrado),
      ultimoContatoEm: l.ultimo_contato_em,
      mensagens: guardadas.length || l.mensagens_ignoradas,
      ultimaMensagem: ultima ? abrirEspera(org, ultima) : null,
    };
  });
}

/** As últimas mensagens em espera de um contato (o "Ver conversa"), só do número informado. */
export async function conversaEmEspera(
  admin: Admin,
  sessao: Pick<SessaoDoCorretor, "id" | "organization_id">,
  contatoNumeroId: string,
  limite = CONVERSA_NA_TELA,
): Promise<MensagemEmEspera[]> {
  const org = sessao.organization_id;
  return (await lerEspera(admin, sessao, contatoNumeroId, limite)).map((m) => abrirEspera(org, m));
}

/**
 * Sem decisão do corretor, a conversa guardada some em 7 dias (decisão de
 * 02/11/2026). Chamada pela rotina de minuto em minuto (/api/v1/cron/opa-lembretes):
 * um DELETE pelo índice de `created_at`, quase sempre sem linha nenhuma.
 */
export async function apagarEsperaVencida(admin: Admin, agora = Date.now()): Promise<number> {
  const corte = new Date(agora - ESPERA_MS).toISOString();
  const { error, count } = await admin.from(ESPERA).delete({ count: "exact" }).lt("created_at", corte);
  if (error) throw new Error(`apagarEsperaVencida: ${error.message}`);
  return count ?? 0;
}

/** Quantos contatos pessoais estão protegidos e quantos esperam decisão. */
export async function resumoDoNumero(admin: Admin, sessaoId: string): Promise<{ pessoais: number; aClassificar: number; leads: number }> {
  const contar = async (situacao: Situacao) => {
    const { count } = await admin
      .from("whatsapp_contatos_numero")
      .select("id", { count: "exact", head: true })
      .eq("channel_session_id", sessaoId)
      .eq("situacao", situacao);
    return count ?? 0;
  };
  const [pessoais, aClassificar, leads] = await Promise.all([contar("pessoal"), contar("a_classificar"), contar("lead")]);
  return { pessoais, aClassificar, leads };
}

/** O chat guardado (cifrado) de uma linha a classificar, para o botão do CRM agir. */
export async function chatDaLinha(
  admin: Admin,
  sessao: Pick<SessaoDoCorretor, "id" | "organization_id">,
  linhaId: string,
): Promise<{ chatId: string | null; nome: string | null } | null> {
  const { data } = await admin
    .from("whatsapp_contatos_numero")
    .select("chat_cifrado, nome_cifrado")
    .eq("id", linhaId)
    .eq("channel_session_id", sessao.id)
    .maybeSingle();
  const l = data as { chat_cifrado: string | null; nome_cifrado: string | null } | null;
  if (!l) return null;
  const org = sessao.organization_id;
  return {
    chatId: l.chat_cifrado && cifraConfigurada() ? decifrar(l.chat_cifrado, { org, campo: "telefone" }) : null,
    nome: l.nome_cifrado && cifraConfigurada() ? decifrar(l.nome_cifrado, { org, campo: "nome" }) : null,
  };
}

/** Fecha a janela de importação depois de 15 min (marca quando os pessoais pararam de entrar sozinhos). */
export async function fecharJanelaSeVenceu(admin: Admin, sessao: SessaoDoCorretor): Promise<void> {
  if (sessao.pessoais_importados_em || !sessao.pessoais_import_inicio) return;
  if (
    emJanelaDeImportacao({
      pessoais_import_inicio: sessao.pessoais_import_inicio,
      pessoais_importados_em: null,
    })
  )
    return;
  const { count } = await admin
    .from("whatsapp_contatos_numero")
    .select("id", { count: "exact", head: true })
    .eq("channel_session_id", sessao.id)
    .eq("origem", "importacao");
  await admin
    .from("channel_sessions")
    .update({ pessoais_importados_em: new Date().toISOString(), pessoais_importados: count ?? 0 })
    .eq("id", sessao.id)
    .is("pessoais_importados_em", null);
}
