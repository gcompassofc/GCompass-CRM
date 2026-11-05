"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { podeMexerNoNumero } from "@/lib/channels/dono";
import { LIMITE_A_CLASSIFICAR } from "@/lib/opa/contatos-whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  aplicarDecisao,
  chatDaLinha,
  contatosAClassificar,
  contatosAClassificarDaEquipe,
  conversaEmEspera,
  numeroDoCorretor,
  sessaoDoContatoAClassificar,
  type ContatoDaEquipe,
  type ContatoAClassificar,
  type MensagemEmEspera,
  type SessaoDoCorretor,
} from "@/lib/waha/contatos-pessoais";

/**
 * Contatos novos do WhatsApp do corretor que esperam a decisão "é lead?". Decidir é
 * só no número da pessoa logada (busca por `owner_user_id = quem chamou`): não existe
 * parâmetro para mexer no número de outra pessoa. O gestor lê os da equipe nas ações
 * "DaEquipe", sem decidir (decisão do Allyson, 05/11/2026).
 *
 * Desde 02/11/2026 a conversa desses contatos fica guardada, cifrada, até a
 * decisão (migration 0124): o nome, o número e a última mensagem vêm na lista; as
 * últimas mensagens só abrem no toque "Ver conversa".
 */

export type ContatoNovo = ContatoAClassificar;
export type MensagemDoContatoNovo = MensagemEmEspera;
export type ContatoNovoDaEquipe = ContatoDaEquipe;

async function meuNumero(): Promise<{ admin: ReturnType<typeof createAdminClient>; sessao: SessaoDoCorretor; userId: string } | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return null;
  if (!podeMexerNoNumero({ papel: org.role, souPlatformAdmin: user.is_platform_admin, userId: user.id, donoDaSessao: user.id })) {
    return null;
  }
  const admin = createAdminClient();
  const sessao = await numeroDoCorretor(admin, org.orgId, user.id);
  if (!sessao) return null;
  return { admin, sessao, userId: user.id };
}

export async function listarContatosNovos(): Promise<ContatoNovo[]> {
  const c = await meuNumero();
  if (!c) return [];
  return contatosAClassificar(c.admin, c.sessao, LIMITE_A_CLASSIFICAR);
}

/** As últimas mensagens guardadas de um contato novo, só do número de quem chamou. */
export async function verConversa(id: string): Promise<{ ok: boolean; mensagens: MensagemDoContatoNovo[]; erro?: string }> {
  if (typeof id !== "string" || !id) return { ok: false, mensagens: [], erro: "Contato inválido." };
  const c = await meuNumero();
  if (!c) return { ok: false, mensagens: [], erro: "Seu WhatsApp não está conectado." };
  return { ok: true, mensagens: await conversaEmEspera(c.admin, c.sessao, id) };
}

/** Gestor e administrador da organização ativa: a organização vem da sessão, nunca de parâmetro. */
async function gestorDaOrg() {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org || (org.role !== "manager" && org.role !== "admin")) return null;
  return { admin: createAdminClient(), orgId: org.orgId, userId: user.id };
}

/** Os contatos novos dos outros números da equipe. Para quem não é gestor, nada. */
export async function listarContatosDaEquipe(): Promise<ContatoNovoDaEquipe[]> {
  const g = await gestorDaOrg();
  if (!g) return [];
  return contatosAClassificarDaEquipe(g.admin, g.orgId, g.userId, LIMITE_A_CLASSIFICAR);
}

/** O "Ver conversa" do gestor. Fica registrado quem abriu, porque ali pode haver conversa pessoal do corretor. */
export async function verConversaDaEquipe(id: string): Promise<{ ok: boolean; mensagens: MensagemDoContatoNovo[]; erro?: string }> {
  if (typeof id !== "string" || !id) return { ok: false, mensagens: [], erro: "Contato inválido." };
  const g = await gestorDaOrg();
  if (!g) return { ok: false, mensagens: [], erro: "Só o gestor vê os contatos da equipe." };
  const sessao = await sessaoDoContatoAClassificar(g.admin, g.orgId, id);
  if (!sessao) return { ok: false, mensagens: [], erro: "Esse contato já foi decidido." };
  await audit({
    action: "whatsapp.gestor_viu_conversa_a_classificar",
    actorUserId: g.userId,
    organizationId: g.orgId,
    resourceType: "whatsapp_contatos_numero",
    resourceId: id,
  });
  return { ok: true, mensagens: await conversaEmEspera(g.admin, sessao, id) };
}

/**
 * Sinal de que os leads de quem está vendo mudaram: quantos abertos e o mais novo.
 * Só um texto, sem dado de lead. Gestor olha a organização; o resto, os próprios.
 */
export async function sinalDeLeads(): Promise<string> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return "";
  const gestor = org.role === "manager" || org.role === "admin";
  const admin = createAdminClient();
  let abertos = admin.from("crm_leads").select("id", { count: "exact", head: true }).eq("organization_id", org.orgId).eq("status", "open");
  let maisNovo = admin.from("crm_leads").select("created_at").eq("organization_id", org.orgId);
  if (!gestor) {
    abertos = abertos.eq("owner_user_id", user.id);
    maisNovo = maisNovo.eq("owner_user_id", user.id);
  }
  const [{ count }, { data }] = await Promise.all([abertos, maisNovo.order("created_at", { ascending: false }).limit(1).maybeSingle()]);
  return `${count ?? 0}:${(data as { created_at: string } | null)?.created_at ?? ""}`;
}

/** "É lead" ou "Pessoal" em um toque (pessoal pede confirmação na tela: apaga o que estava guardado). */
export async function decidirContato(id: string, decisao: "lead" | "pessoal"): Promise<{ ok: boolean; erro?: string }> {
  if (decisao !== "lead" && decisao !== "pessoal") return { ok: false, erro: "Escolha Lead ou Pessoal." };
  const c = await meuNumero();
  if (!c) return { ok: false, erro: "Seu WhatsApp não está conectado." };
  const linha = await chatDaLinha(c.admin, c.sessao, id);
  if (!linha?.chatId) return { ok: false, erro: "Não achei esse contato. Atualize a página." };
  await aplicarDecisao(c.admin, c.sessao, linha.chatId, decisao, {
    origem: "corretor",
    porUserId: c.userId,
    requestId: randomUUID(),
    nome: linha.nome,
  });
  revalidatePath("/app/hoje");
  revalidatePath("/app/meu-whatsapp");
  return { ok: true };
}
