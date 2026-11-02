"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { podeMexerNoNumero } from "@/lib/channels/dono";
import { LIMITE_A_CLASSIFICAR } from "@/lib/opa/contatos-whatsapp";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  aplicarDecisao,
  chatDaLinha,
  contatosAClassificar,
  conversaEmEspera,
  numeroDoCorretor,
  type ContatoAClassificar,
  type MensagemEmEspera,
  type SessaoDoCorretor,
} from "@/lib/waha/contatos-pessoais";

/**
 * Contatos novos do WhatsApp do corretor que esperam a decisão "é lead?". Tudo é
 * do número da pessoa logada (busca por `owner_user_id = quem chamou`): não existe
 * parâmetro para mexer no número de outra pessoa.
 *
 * Desde 02/11/2026 a conversa desses contatos fica guardada, cifrada, até a
 * decisão (migration 0124): o nome, o número e a última mensagem vêm na lista; as
 * últimas mensagens só abrem no toque "Ver conversa".
 */

export type ContatoNovo = ContatoAClassificar;
export type MensagemDoContatoNovo = MensagemEmEspera;

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
