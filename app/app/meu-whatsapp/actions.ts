"use server";

import { randomUUID } from "node:crypto";

import { audit } from "@/lib/audit";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { podeMexerNoNumero } from "@/lib/channels/dono";
import { estadoDaSessao, mascararTelefone, type EstadoMeuWhatsapp } from "@/lib/channels/meu-whatsapp";
import {
  apagarSessaoRecemCriada,
  atualizarSessao,
  buscarSessaoDoDono,
  criarSessaoDoDono,
  type SessaoDoDono,
} from "@/lib/channels/sessao-do-dono";
import { createAdminClient } from "@/lib/supabase/admin";
import { getWahaClient, wahaFriendlyError } from "@/lib/waha/client";
import {
  abrirJanelaDeImportacao,
  fecharJanelaSeVenceu,
  numeroDoCorretor,
  resumoDoNumero,
} from "@/lib/waha/contatos-pessoais";
import { emJanelaDeImportacao } from "@/lib/opa/contatos-whatsapp";

/**
 * O corretor liga o próprio WhatsApp (decisão de 01/11/2026). Tudo aqui é sobre a
 * sessão cujo dono é a pessoa logada: a busca é sempre por `owner_user_id = quem
 * chamou`, então não existe parâmetro para apontar o número de outra pessoa. O QR
 * tem a mesma trava na rota `/api/v1/channel-sessions/[id]/qr`.
 */

export interface MeuWhatsapp {
  estado: EstadoMeuWhatsapp;
  sessaoId: string | null;
  telefone: string | null;
  erro?: string;
  /** Contatos pessoais protegidos (a IA só lê os leads). Só com o número conectado. */
  protecao?: {
    pessoais: number;
    aClassificar: number;
    leads: number;
    /** Ainda nos 15 minutos depois de conectar: o que chega é tratado como do aparelho. */
    separando: boolean;
    /** As etiquetas "Lead OPA" e "Pessoal" existem no WhatsApp Business deste número. */
    etiquetas: boolean;
  };
}

/** Separação pessoal x lead do número conectado (0123). Nunca derruba a tela. */
async function protecaoDoNumero(admin: ReturnType<typeof createAdminClient>, orgId: string, donoId: string, sessaoId: string) {
  try {
    const s = await numeroDoCorretor(admin, orgId, donoId);
    if (!s || s.id !== sessaoId) return undefined;
    // Reserva do evento WORKING do webhook: abre a janela se ela nunca abriu.
    if (!s.pessoais_import_inicio) {
      await abrirJanelaDeImportacao(admin, s);
      s.pessoais_import_inicio = new Date().toISOString();
    } else {
      await fecharJanelaSeVenceu(admin, s);
    }
    const r = await resumoDoNumero(admin, s.id);
    return {
      ...r,
      separando: emJanelaDeImportacao({ pessoais_import_inicio: s.pessoais_import_inicio, pessoais_importados_em: s.pessoais_importados_em ?? null }),
      etiquetas: Boolean(s.etiqueta_lead_id && s.etiqueta_pessoal_id),
    };
  } catch {
    return undefined;
  }
}

const ERRO_PREPARO = "Não consegui preparar o seu número. Tente de novo em instantes.";
const ERRO_SEM_WAHA = "O serviço do WhatsApp não está no ar agora. Avise o administrador.";

async function contexto() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  // Mesma regra do QR e da reconexão (podeMexerNoNumero), aplicada ao número da
  // própria pessoa: leitura (viewer) e operador de IA não têm WhatsApp próprio.
  if (!org) return null;
  const pode = podeMexerNoNumero({
    papel: org.role,
    souPlatformAdmin: user.is_platform_admin,
    userId: user.id,
    donoDaSessao: user.id,
  });
  if (!pode) return null;
  return { user, org, admin: createAdminClient() };
}

function resposta(l: SessaoDoDono | null, erro?: string): MeuWhatsapp {
  return {
    estado: l ? estadoDaSessao(l.status) : "sem",
    sessaoId: l?.id ?? null,
    telefone: mascararTelefone(l?.phone_number),
    ...(erro ? { erro } : {}),
  };
}

/**
 * Estado do número do corretor logado. Pergunta ao WAHA o que está valendo agora e
 * grava no banco, para a tela mudar sozinha quando o QR for lido.
 */
export async function estadoMeuWhatsapp(): Promise<MeuWhatsapp> {
  const c = await contexto();
  if (!c) return resposta(null, "Sem permissão.");
  const sessao = await buscarSessaoDoDono(c.admin, c.org.orgId, c.user.id);
  if (!sessao) return resposta(null);

  const waha = getWahaClient();
  if (!waha || !sessao.waha_session_name) return resposta(sessao);

  let status = sessao.status;
  let telefone = sessao.phone_number;
  try {
    const remoto = (await waha.getSessionQr(sessao.waha_session_name)) as { status?: string; me?: { id?: string } };
    if (remoto.status) status = remoto.status;
    const jid = remoto.me?.id;
    if (jid && !telefone) telefone = jid.replace(/@.*/, "");
  } catch (err) {
    // 404 no WAHA: a sessão não existe lá (parou). Outro erro é ruído de rede: fica o que o banco sabe.
    if (err instanceof Error && err.message.includes("404")) status = "STOPPED";
  }

  if (status !== sessao.status || telefone !== sessao.phone_number) {
    const agora = new Date().toISOString();
    const base = { status, last_health_check_at: agora, ...(status !== sessao.status ? { last_status_change_at: agora } : {}) };
    const { codigoErro } = await atualizarSessao(c.admin, c.org.orgId, sessao.id, { ...base, phone_number: telefone });
    // 23505: o número já está ligado em outro canal ativo. Mantém o estado, sem o telefone.
    if (codigoErro === "23505") {
      await atualizarSessao(c.admin, c.org.orgId, sessao.id, base);
      return { ...resposta({ ...sessao, status }), erro: "Este número já está ligado em outra conta do CRM." };
    }
  }
  const r = resposta({ ...sessao, status, phone_number: telefone });
  if (r.estado === "conectado") r.protecao = await protecaoDoNumero(c.admin, c.org.orgId, c.user.id, sessao.id);
  return r;
}

/** Cria (uma vez) o número do corretor e já pede o QR ao WhatsApp. */
export async function conectarMeuWhatsapp(): Promise<MeuWhatsapp> {
  const c = await contexto();
  if (!c) return resposta(null, "Sem permissão.");
  const waha = getWahaClient();
  if (!waha) return resposta(null, ERRO_SEM_WAHA);

  let sessao = await buscarSessaoDoDono(c.admin, c.org.orgId, c.user.id);
  let criada = false;
  if (!sessao) {
    const nome = c.user.full_name ?? c.user.email?.split("@")[0] ?? "Corretor";
    const r = await criarSessaoDoDono(c.admin, c.org.orgId, c.user.id, nome);
    // Dois cliques ao mesmo tempo: o índice deixou passar um só. Usa o que ficou.
    sessao = r.duplicada ? await buscarSessaoDoDono(c.admin, c.org.orgId, c.user.id) : r.sessao;
    criada = Boolean(r.sessao);
  }
  if (!sessao?.waha_session_name) return resposta(null, ERRO_PREPARO);

  try {
    await waha.startSession(sessao.waha_session_name);
  } catch (err) {
    // Sem WAHA não deixa número fantasma preso em "preparando".
    if (criada) await apagarSessaoRecemCriada(c.admin, c.org.orgId, sessao.id);
    return resposta(criada ? null : sessao, wahaFriendlyError(err instanceof Error ? err.message : "unknown"));
  }

  if (criada) {
    void audit({
      action: "channel.connected",
      actorUserId: c.user.id,
      organizationId: c.org.orgId,
      resourceType: "channel_session",
      resourceId: sessao.id,
      requestId: randomUUID(),
      metadata: { waha_session_name: sessao.waha_session_name, dono: c.user.id },
    });
  }
  return resposta(sessao);
}

/**
 * Reconecta o número do corretor. `novoQr` descarta a credencial (o aparelho foi
 * desvinculado pelo celular) e recomeça do QR; sem ele só reinicia a sessão.
 */
export async function reconectarMeuWhatsapp(novoQr: boolean): Promise<MeuWhatsapp> {
  const c = await contexto();
  if (!c) return resposta(null, "Sem permissão.");
  const sessao = await buscarSessaoDoDono(c.admin, c.org.orgId, c.user.id);
  if (!sessao?.waha_session_name) return resposta(null);
  const waha = getWahaClient();
  if (!waha) return resposta(sessao, ERRO_SEM_WAHA);

  try {
    await waha.stopSession(sessao.waha_session_name);
    if (novoQr) await waha.logoutSession(sessao.waha_session_name);
    await waha.startSession(sessao.waha_session_name);
  } catch (err) {
    return resposta(sessao, wahaFriendlyError(err instanceof Error ? err.message : "unknown"));
  }
  await atualizarSessao(c.admin, c.org.orgId, sessao.id, {
    status: "STARTING",
    last_status_change_at: new Date().toISOString(),
    consecutive_health_fails: 0,
  });
  void audit({
    action: "channel.reconnected",
    actorUserId: c.user.id,
    organizationId: c.org.orgId,
    resourceType: "channel_session",
    resourceId: sessao.id,
    requestId: randomUUID(),
    metadata: { waha_session_name: sessao.waha_session_name, force: novoQr, dono: c.user.id },
  });
  return resposta({ ...sessao, status: "STARTING" });
}
