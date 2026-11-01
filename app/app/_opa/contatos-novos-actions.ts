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
  numeroDoCorretor,
  type SessaoDoCorretor,
} from "@/lib/waha/contatos-pessoais";

/**
 * Contatos novos do WhatsApp do corretor que esperam a decisão "é lead?". Tudo é
 * do número da pessoa logada (busca por `owner_user_id = quem chamou`): não existe
 * parâmetro para mexer no número de outra pessoa.
 */

export interface ContatoNovo {
  id: string;
  nome: string | null;
  telefone: string | null;
  ultimoContatoEm: string | null;
  mensagens: number;
}

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

/** "É lead" ou "Pessoal" em um toque. */
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
