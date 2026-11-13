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
 * Contato que não é lead: a mensagem vai cifrada para
 * `whatsapp_mensagens_a_classificar` (migration 0124), que só o servidor lê e nenhuma
 * tela mostra (05/11/2026). Virar lead leva essas mensagens para a conversa normal;
 * "Pessoal" apaga; sem decisão, somem em 7 dias.
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
  ESPERA_MAX_POR_CONTATO,
  ESPERA_MS,
  ETIQUETAS,
  MOTIVO_PESSOAL,
  HISTORICO_AO_VIRAR_LEAD,
  chatIgnorado,
  decidir,
  decisaoDoCorretor,
  ehLeadDaOpa,
  emJanelaDeImportacao,
  etiquetaDe,
  sinalDeEntrada,
  telefoneAlternativo,
  tipoEmEspera,
  type OrigemContato,
  type Situacao,
} from "@/lib/opa/contatos-whatsapp";
import { avisarLeadDeOutroCorretor } from "@/lib/opa/aviso-outro-corretor";
import { chaveDoTelefone } from "@/lib/opa/aviso-whatsapp";
import { carregarConfig, numerosInternos } from "@/lib/opa/config";
import { phoneLookupVariants } from "@/lib/channels/phone-variants";
import { entregarConversaAoDono } from "@/lib/opa/conversa-do-lead";
import { registrarLeadDoContato } from "@/lib/opa/entrada";
import { avisarMudancaDeEtapa } from "@/lib/opa/eventos-lead";
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
  decidido_em?: string | null;
}

async function lerContato(admin: Admin, sessaoId: string, chave: string): Promise<LinhaContato | null> {
  const { data } = await admin
    .from("whatsapp_contatos_numero")
    .select("id, situacao, mensagens_ignoradas, nome_cifrado, telefone_cifrado, decidido_em")
    .eq("channel_session_id", sessaoId)
    .eq("chave", chave)
    .maybeSingle();
  return (data as LinhaContato | null) ?? null;
}

/** Os contatos do CRM desta pessoa, pela identidade do WhatsApp ou pelo telefone. */
async function contatosDoChat(admin: Admin, orgId: string, chatId: string): Promise<string[]> {
  const p = parseChatId(chatId);
  let filtros: string[];
  if (p.kind === "phone") {
    // Com e sem o nono dígito (13/11/2026, caso da Wandalcy): o formulário grava o
    // número como a pessoa digitou e o WhatsApp manda o de antes do nono dígito.
    const formas = phoneLookupVariants(p.phone);
    filtros = formas.map((f) => `wa_identity.eq.phone:${f}`);
    if (cifraConfigurada()) filtros.push(...formas.map((f) => `telefone_indice.eq.${indiceTelefone(orgId, f)}`));
  } else if (p.kind === "lid") {
    filtros = [`wa_identity.eq.lid:${p.lid}`];
  } else {
    return [];
  }
  const { data: contatos } = await admin
    .from("contacts")
    .select("id")
    .eq("organization_id", orgId)
    .or(filtros.join(","))
    .limit(5);
  return ((contatos ?? []) as Array<{ id: string }>).map((c) => c.id);
}

/** O lead da OPA desta pessoa, se houver. Encerrado como pessoal pelo gestor não conta. */
async function leadDaOpaDoChat(admin: Admin, orgId: string, chatId: string): Promise<string | null> {
  const ids = await contatosDoChat(admin, orgId, chatId);
  if (!ids.length) return null;
  const { data } = await admin
    .from("crm_leads")
    .select("id, tags, lost_reason")
    .eq("organization_id", orgId)
    .in("contact_id", ids);
  const achado = ((data ?? []) as Array<{ id: string; tags: string[] | null; lost_reason: string | null }>).find(
    (l) => ehLeadDaOpa(l.tags) && l.lost_reason !== MOTIVO_PESSOAL,
  );
  return achado?.id ?? null;
}

/** "5512...@c.us" a partir de "+5512...". */
function chatDoTelefone(telefone: string): string {
  return `${telefone.replace(/\D/g, "")}@c.us`;
}

/**
 * O telefone é a identidade do contato: o WhatsApp manda o mesmo cliente ora por
 * telefone, ora por `@lid`, e sem isto a etiqueta e a mensagem caíam em contatos
 * diferentes. `@lid` que já é lead continua como está, para não partir a conversa.
 */
async function chatCanonico(admin: Admin, sessao: SessaoDoCorretor, chatId: string): Promise<string> {
  if (parseChatId(chatId).kind !== "lid" || !sessao.waha_session_name) return chatId;
  const chave = chaveDoChat(sessao.organization_id, chatId);
  if (chave && (await lerContato(admin, sessao.id, chave))?.situacao === "lead") return chatId;
  const pn = await getWahaClient()?.telefoneDoLid(sessao.waha_session_name, chatId);
  const digitos = pn?.match(/^\+?(\d{8,15})/)?.[1];
  return digitos ? `${digitos}@c.us` : chatId;
}

/** O CRM já tem lead aberto para esta pessoa (porta de entrada, cadastro do corretor). */
async function temLeadNoCrm(admin: Admin, orgId: string, chatId: string): Promise<boolean> {
  const ids = await contatosDoChat(admin, orgId, chatId);
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
  return p._data?.notifyName ?? p._data?.pushName ?? (p._data?.Info?.PushName || null);
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

  if (evento === "message" || evento === "message.any") {
    return comAvisoDeOutroCorretor(admin, sessao, p, await filtrarMensagem(admin, sessao, p, requestId));
  }

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

/**
 * Os números de WhatsApp da própria empresa (OPA Lembretes e o de cada corretor), pela
 * chave DDD + 8 últimos dígitos. Guardado por um minuto: é consultado a cada mensagem.
 * Desde 13/11/2026 entram também os números fixos da gestão, da administração e do
 * assistente (numerosInternos): o administrador não tem WhatsApp conectado e a mensagem
 * dele a um corretor virava lead.
 */
const equipePorOrg = new Map<string, { em: number; numeros: Set<string> }>();
const EQUIPE_VALE_MS = 60_000;

export async function numerosDaEquipe(admin: Admin, orgId: string, agora = Date.now()): Promise<Set<string>> {
  const guardado = equipePorOrg.get(orgId);
  if (guardado && agora - guardado.em < EQUIPE_VALE_MS) return guardado.numeros;
  const { data, error } = await admin.from("channel_sessions").select("phone_number").eq("organization_id", orgId).is("archived_at", null);
  // Sem conseguir ler, não descarta nada: melhor um contato a classificar do que perder um lead.
  if (error) return guardado?.numeros ?? new Set();
  const numeros = new Set(
    ((data ?? []) as Array<{ phone_number: string | null }>).map((s) => chaveDoTelefone(s.phone_number)).filter((c): c is string => Boolean(c)),
  );
  // Configuração ilegível não impede o resto: fica só com os números conectados.
  try {
    for (const n of numerosInternos(await carregarConfig(admin, orgId))) {
      const chave = chaveDoTelefone(n);
      if (chave) numeros.add(chave);
    }
  } catch (err) {
    logger.warn("contatos-pessoais: configuração ilegível para os números da equipe", { erro: String(err).slice(0, 120) });
  }
  equipePorOrg.set(orgId, { em: agora, numeros });
  return numeros;
}

/** Mensagem mais velha que isto é reentrega (número reconectou), não contato de agora. */
const AVISO_SO_MENSAGEM_RECENTE_MS = 10 * 60_000;

/**
 * Lead que escreveu neste número mas está com OUTRO corretor: depois de gravar a
 * mensagem, o dono do número é avisado pelo OPA Lembretes (10/11/2026, regra em
 * lib/opa/aviso-outro-corretor.ts). Só mensagem que chega, só de contato que é lead
 * (o que segue com o corpo registrado), e sem mudar nada do que o filtro decidiu.
 */
function comAvisoDeOutroCorretor(admin: Admin, sessao: SessaoDoCorretor, p: WahaPayload, r: ResultadoFiltro): ResultadoFiltro {
  const receptorId = sessao.owner_user_id;
  if (r.acao !== "seguir" || !r.registrarCorpo || !receptorId) return r;
  // Depois do filtro o chat já está na forma canônica (telefone no lugar do `@lid`).
  const { chatId, direcao } = chatDaMensagem(p);
  if (direcao !== "entrada") return r;
  if (p.timestamp && Date.now() - p.timestamp * 1000 > AVISO_SO_MENSAGEM_RECENTE_MS) return r;
  const antes = r.depois;
  return {
    ...r,
    depois: async () => {
      if (antes) await antes();
      try {
        const contatoIds = await contatosDoChat(admin, sessao.organization_id, chatId);
        await avisarLeadDeOutroCorretor(admin as never, { orgId: sessao.organization_id, receptorId, contatoIds });
      } catch (err) {
        logger.warn("contatos-pessoais: aviso de lead com outro corretor falhou", { sessao: sessao.id, erro: String(err) });
      }
    },
  };
}

async function filtrarMensagem(admin: Admin, sessao: SessaoDoCorretor, p: WahaPayload, requestId: string): Promise<ResultadoFiltro> {
  const daMensagem = chatDaMensagem(p);
  const direcao = daMensagem.direcao;
  let chatId = daMensagem.chatId;
  if (chatIgnorado(chatId)) return { acao: "descartar", motivo: "grupo, status ou canal" };
  // Número da própria equipe (o OPA Lembretes e os outros corretores) nunca é lead nem
  // contato a classificar (10/11/2026): os avisos do OPA Lembretes levam o link do CRM,
  // foram lidos como "mensagem do site" e viraram um lead com o número da própria OPA.
  // Vem antes de tudo, inclusive de quem já estava marcado como lead por engano.
  const telefoneDoChat = parseChatId(chatId).phone ?? (parseChatId(chatId).kind === "lid" ? telefoneAlternativo(p, direcao) : null);
  if (telefoneDoChat && (await numerosDaEquipe(admin, sessao.organization_id)).has(chaveDoTelefone(telefoneDoChat) ?? "")) {
    return { acao: "descartar", motivo: "número da própria equipe" };
  }
  let chave = chaveDoChat(sessao.organization_id, chatId);
  // Formato desconhecido: o ingest emite o aviso e não grava. Sem corpo no log.
  if (!chave) return { acao: "seguir", registrarCorpo: false };

  let linha = await lerContato(admin, sessao.id, chave);
  if (linha?.situacao === "lead") return SEGUIR;

  // `@lid` com o telefone no payload: segue pelo telefone, inclusive no ingest (ver chatCanonico).
  const telefoneDoPayload = parseChatId(chatId).kind === "lid" ? telefoneAlternativo(p, direcao) : null;
  if (telefoneDoPayload) {
    chatId = chatDoTelefone(telefoneDoPayload);
    p.from = chatId;
    if (direcao === "saida") p.to = chatId;
    chave = chaveDoChat(sessao.organization_id, chatId);
    if (!chave) return { acao: "seguir", registrarCorpo: false };
    linha = await lerContato(admin, sessao.id, chave);
    if (linha?.situacao === "lead") return SEGUIR;
  }

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

/** Tipo 16 é a lista interna de leads do WhatsApp: não aceita conversa pela API. */
const LISTA_INTERNA = 16;

/**
 * Descobre os ids de "Lead OPA" e "Pessoal" no WhatsApp Business do corretor e cria
 * a que faltar. Conta comum ou NOWEB sem store dá erro: segue sem etiqueta.
 *
 * Lista vazia não cria nada. Toda conta Business tem etiquetas de fábrica, então
 * vazio é sincronização ainda em andamento, e o WAHA numera a nova a partir da
 * lista: criar agora sobrescreveria a etiqueta 1 do corretor. A rotina tenta de novo.
 */
async function garantirEtiquetas(admin: Admin, sessao: SessaoDoCorretor): Promise<void> {
  const waha = getWahaClient();
  if (!waha || !sessao.waha_session_name) return;
  let lista: Array<{ id: string; name: string; type?: number | null }>;
  try {
    lista = await waha.listLabels(sessao.waha_session_name);
  } catch (err) {
    logger.info("contatos-pessoais: etiquetas não listadas", { sessao: sessao.id, erro: String(err).slice(0, 120) });
    return;
  }
  if (!lista.length) return;

  for (const [tipo, nome] of [["lead", ETIQUETAS.lead], ["pessoal", ETIQUETAS.pessoal]] as const) {
    const candidatas = lista.filter((l) => l.type !== LISTA_INTERNA && etiquetaDe(l.name) === tipo);
    // O nome exato ganha de "Lead", se o corretor tiver as duas.
    let id = String((candidatas.find((l) => l.name === nome) ?? candidatas[0])?.id ?? "") || null;
    if (!id) {
      try {
        const criada = await waha.createLabel(sessao.waha_session_name, nome, tipo === "lead" ? 1 : 9);
        id = criada?.id ? String(criada.id) : null;
      } catch (err) {
        logger.info("contatos-pessoais: etiqueta não criada", { sessao: sessao.id, erro: String(err).slice(0, 120) });
      }
    }
    const atual = tipo === "lead" ? sessao.etiqueta_lead_id : sessao.etiqueta_pessoal_id;
    if (!id || id === atual) continue;
    await admin
      .from("channel_sessions")
      .update(tipo === "lead" ? { etiqueta_lead_id: id } : { etiqueta_pessoal_id: id })
      .eq("id", sessao.id);
    if (tipo === "lead") sessao.etiqueta_lead_id = id;
    else sessao.etiqueta_pessoal_id = id;
  }
}

/** Quantas conversas etiquetadas cada número leva por rodada (o resto fica para a próxima). */
const CONCILIAR_POR_RODADA = 20;

/**
 * Traz para o CRM o que está etiquetado no aparelho e o CRM ainda não sabe. O WAHA
 * não avisa as etiquetas que já existiam ao conectar, nem o que mudou com o servidor
 * fora do ar: sem isto, o corretor teria de etiquetar tudo de novo.
 *
 * Decisão tomada depois no CRM (ex. "Pessoal", com a etiqueta ainda no aparelho) não
 * é desfeita aqui. "Pessoal" sem decisão registrada não encerra lead aberto.
 */
export async function conciliarEtiquetas(admin: Admin, sessao: SessaoDoCorretor, requestId: string): Promise<number> {
  const waha = getWahaClient();
  if (!waha || !sessao.waha_session_name || !sessao.owner_user_id) return 0;
  await garantirEtiquetas(admin, sessao);
  const nomeSessao = sessao.waha_session_name;
  const chatsDe = async (id: string | null | undefined) => {
    if (!id) return [] as string[];
    try {
      const chats = await waha.chatsDaEtiqueta(nomeSessao, id);
      return chats.map((c) => c.id).filter((c) => typeof c === "string" && !chatIgnorado(c));
    } catch (err) {
      logger.info("contatos-pessoais: conversas da etiqueta não listadas", { sessao: sessao.id, erro: String(err).slice(0, 120) });
      return [];
    }
  };

  const leads = await chatsDe(sessao.etiqueta_lead_id);
  const pessoais = (await chatsDe(sessao.etiqueta_pessoal_id)).filter((c) => !leads.includes(c));
  let feitas = 0;
  for (const original of leads) {
    if (feitas >= CONCILIAR_POR_RODADA) return feitas;
    const chatId = await chatCanonico(admin, sessao, original);
    const chave = chaveDoChat(sessao.organization_id, chatId);
    if (!chave) continue;
    const linha = await lerContato(admin, sessao.id, chave);
    if (linha?.situacao === "lead" || linha?.decidido_em) continue;
    await aplicarDecisao(admin, sessao, chatId, "lead", { origem: "etiqueta", porUserId: sessao.owner_user_id, requestId });
    feitas++;
  }
  for (const original of pessoais) {
    if (feitas >= CONCILIAR_POR_RODADA) return feitas;
    const chatId = await chatCanonico(admin, sessao, original);
    const chave = chaveDoChat(sessao.organization_id, chatId);
    if (!chave) continue;
    const linha = await lerContato(admin, sessao.id, chave);
    if (linha?.situacao === "pessoal" || linha?.decidido_em) continue;
    if (await temLeadNoCrm(admin, sessao.organization_id, chatId)) continue;
    await aplicarDecisao(admin, sessao, chatId, "pessoal", { origem: "etiqueta", porUserId: sessao.owner_user_id, requestId });
    feitas++;
  }
  return feitas;
}

/** Concilia os números de corretor conectados. Erro em um número não para os outros. */
export async function conciliarEtiquetasDosNumeros(admin: Admin, requestId: string): Promise<number> {
  const { data } = await admin
    .from("channel_sessions")
    .select(COLUNAS_SESSAO)
    .not("owner_user_id", "is", null)
    .is("archived_at", null)
    .eq("status", "WORKING");
  let feitas = 0;
  for (const sessao of (data ?? []) as unknown as SessaoDoCorretor[]) {
    try {
      feitas += await conciliarEtiquetas(admin, sessao, requestId);
    } catch (err) {
      logger.warn("contatos-pessoais: conciliar etiquetas falhou", { sessao: sessao.id, erro: String(err) });
    }
  }
  return feitas;
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

  // No GOWS o evento nunca traz o nome: vale o id guardado. Id desconhecido (a
  // etiqueta foi criada à mão no aparelho) confere na lista de etiquetas do número.
  const tipoPeloId = () => (!id ? null : id === sessao.etiqueta_lead_id ? "lead" : id === sessao.etiqueta_pessoal_id ? "pessoal" : null);
  let tipo = etiquetaDe(nome) ?? tipoPeloId();
  if (!tipo) {
    await garantirEtiquetas(admin, sessao);
    tipo = tipoPeloId();
  }
  if (!tipo) return;
  if (tipo === "lead" && id && !sessao.etiqueta_lead_id) {
    await admin.from("channel_sessions").update({ etiqueta_lead_id: id }).eq("id", sessao.id);
  }
  await aplicarDecisao(admin, sessao, await chatCanonico(admin, sessao, chatId), tipo, { origem: "etiqueta", porUserId: sessao.owner_user_id ?? null, requestId });
}

/**
 * Decisão explícita (etiqueta no WhatsApp ou botão no CRM).
 * - lead: cria o lead no CRM (dono = corretor do número), leva para a conversa as
 *   mensagens que estavam em espera e tenta trazer o histórico recente;
 * - pessoal: apaga o que o CRM tiver guardado da conversa deste número (inclusive
 *   o que estava em espera), encerra o lead aberto como "Contato pessoal" e para
 *   de ler.
 */
export async function aplicarDecisao(
  admin: Admin,
  sessao: SessaoDoCorretor,
  chatId: string,
  nova: "lead" | "pessoal",
  o: {
    origem: OrigemContato;
    porUserId: string | null;
    requestId: string;
    nome?: string | null;
    /** Quem chama já conferiu que pode: gestor, ou lead próprio do corretor. */
    pessoalAutorizado?: boolean;
  },
): Promise<void> {
  const chave = chaveDoChat(sessao.organization_id, chatId);
  if (!chave) return;
  // Lead da OPA não vira pessoal pela etiqueta do aparelho: nada se apaga e o prazo segue.
  if (nova === "pessoal" && !o.pessoalAutorizado) {
    const daOpa = await leadDaOpaDoChat(admin, sessao.organization_id, chatId);
    if (daOpa) {
      await admin.from("crm_lead_activities").insert({
        organization_id: sessao.organization_id,
        lead_id: daOpa,
        source_module: "opa",
        type: "pessoal_recusado",
        payload: { origem: o.origem },
        actor_kind: "system",
        reason: "Tentaram marcar como pessoal um lead que veio por ação da OPA. O lead continua aberto.",
      });
      return;
    }
  }
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
  // Decisão tomada no CRM vira etiqueta no WhatsApp Business do corretor, para o
  // aparelho e o CRM dizerem a mesma coisa (03/11/2026). Quando a decisão veio da
  // própria etiqueta, não etiqueta de novo.
  if (o.origem !== "etiqueta") await etiquetarNoWhatsapp(sessao, chatId, nova);
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

/** Põe "Lead OPA" ou "Pessoal" na conversa do aparelho. Melhor esforço: nunca lança. */
async function etiquetarNoWhatsapp(sessao: SessaoDoCorretor, chatId: string, tipo: "lead" | "pessoal"): Promise<void> {
  const waha = getWahaClient();
  const etiqueta = tipo === "lead" ? sessao.etiqueta_lead_id : sessao.etiqueta_pessoal_id;
  if (!waha || !sessao.waha_session_name || !etiqueta) return;
  try {
    await waha.setChatLabels(sessao.waha_session_name, chatId, [etiqueta]);
  } catch (err) {
    logger.info("contatos-pessoais: etiqueta não aplicada no WhatsApp", { sessao: sessao.id, erro: String(err).slice(0, 120) });
  }
}

/** O chat do WhatsApp a partir da identidade do contato (`phone:55...` ou `lid:...`). */
export function chatDoContato(waIdentity: string | null | undefined): string | null {
  if (!waIdentity) return null;
  if (waIdentity.startsWith("phone:")) {
    const d = waIdentity.slice(6).replace(/\D/g, "");
    return d ? `${d}@c.us` : null;
  }
  if (waIdentity.startsWith("lid:")) {
    const l = waIdentity.slice(4);
    return l ? `${l}@lid` : null;
  }
  return null;
}

/** Uma sessão pelo id, já filtrada pela empresa (para decidir a partir de um lead). */
export async function sessaoPorId(admin: Admin, orgId: string, id: string): Promise<SessaoDoCorretor | null> {
  const { data } = await admin
    .from("channel_sessions")
    .select(COLUNAS_SESSAO)
    .eq("organization_id", orgId)
    .eq("id", id)
    .maybeSingle();
  return (data as SessaoDoCorretor | null) ?? null;
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
    const conversaId = await upsertConversation(admin, org, contactId, sessao.id);
    // O número é do corretor: a conversa é dele. Sem dono, o corretor (papel
    // agent) via o lead e não via a conversa no Multi-atendimento (03/11/2026).
    if (conversaId) await entregarConversaAoDono(admin, org, conversaId, sessao.owner_user_id ?? null);
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
      // Decisão explícita (etiqueta "Lead OPA" ou botão no CRM): a pergunta some.
      if (o.origem === "etiqueta" || o.origem === "corretor") {
        await marcarClassificadoLead(admin, sessao.organization_id, r.leadId, sessao.owner_user_id ?? null);
      }
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
 * neste número (mensagens e prévia) e as sugestões da IA tiradas dela. O lead não
 * se apaga (exclusão é só do administrador): o aberto é encerrado como "Contato
 * pessoal", com o registro da decisão, e sai das telas.
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
    .select("id, status, pipeline_id, stage_id")
    .eq("organization_id", sessao.organization_id)
    .in("contact_id", ids)
    .eq("owner_user_id", sessao.owner_user_id ?? "");
  for (const l of (leads ?? []) as Array<{ id: string; status: string; pipeline_id: string; stage_id: string }>) {
    await admin.from("copiloto_sugestoes").delete().eq("lead_id", l.id);
    // Pessoal não aparece: o lead aberto é encerrado como "Contato pessoal", venha
    // a decisão da etiqueta no WhatsApp Business ou do botão no CRM (03/11/2026).
    if (l.status === "open") await encerrarComoPessoal(admin, sessao.organization_id, l);
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

/** Encerra o lead como perdido com o motivo "Contato pessoal" (some da Fila, do Início e dos funis). */
async function encerrarComoPessoal(
  admin: Admin,
  org: string,
  lead: { id: string; pipeline_id: string; stage_id: string },
): Promise<void> {
  try {
    await admin.rpc("fn_opa_garantir_motivos" as never, { p_pipeline: lead.pipeline_id, p_motivos: [MOTIVO_PESSOAL] } as never);
    const { data: etapa } = await admin
      .from("crm_stages")
      .select("id")
      .eq("organization_id", org)
      .eq("pipeline_id", lead.pipeline_id)
      .eq("is_lost", true)
      .limit(1)
      .maybeSingle();
    const agora = new Date().toISOString();
    const { error } = await admin
      .from("crm_leads")
      .update({
        status: "lost",
        lost_reason: MOTIVO_PESSOAL,
        closed_at: agora,
        last_activity_at: agora,
        ...(etapa ? { stage_id: (etapa as { id: string }).id, stage_changed_at: agora } : {}),
      })
      .eq("organization_id", org)
      .eq("id", lead.id)
      .eq("status", "open");
    if (!error) await avisarMudancaDeEtapa(admin, org, lead.id, lead.stage_id, "opa.pessoal");
  } catch (err) {
    logger.warn("contatos-pessoais: encerrar lead pessoal falhou", { lead: lead.id, erro: String(err) });
  }
}

/** Grava no lead a resposta "é lead" (some o "Lead ou pessoal?" das telas). */
async function marcarClassificadoLead(admin: Admin, org: string, leadId: string, porUserId: string | null): Promise<void> {
  const { data } = await admin.from("crm_leads").select("custom_fields").eq("organization_id", org).eq("id", leadId).maybeSingle();
  const cf = ((data as { custom_fields: Record<string, unknown> | null } | null)?.custom_fields ?? {}) as Record<string, unknown>;
  if ((cf.classificado as { como?: string } | undefined)?.como === "lead") return;
  await admin
    .from("crm_leads")
    .update({ custom_fields: { ...cf, classificado: { como: "lead", em: new Date().toISOString(), por: porUserId } } })
    .eq("organization_id", org)
    .eq("id", leadId);
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
