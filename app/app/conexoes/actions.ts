"use server";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { novoTokenDoRadar, tokenDeEntrada, tokenDoRadar } from "@/lib/opa/segredos";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Token da porta de entrada de leads. Sai do servidor só no clique de copiar,
 * só para gestor ou administrador; a página mostra apenas o final.
 */
export async function pegarTokenEntrada(): Promise<string | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org || (org.role !== "manager" && org.role !== "admin")) return null;
  return tokenDeEntrada(createAdminClient(), org.orgId);
}

/** Chave do OPA Radar (0131): sai do servidor só no clique de copiar, para gestor ou administrador. */
export async function pegarChaveRadar(): Promise<string | null> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org || (org.role !== "manager" && org.role !== "admin")) return null;
  return tokenDoRadar(createAdminClient(), org.orgId);
}

/** Gera ou troca a chave do Radar (só administrador). A anterior para de valer na hora. */
export async function gerarChaveRadar(): Promise<{ ok: true; chave: string } | { ok: false; erro: string }> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org || (org.role !== "admin" && !user.is_platform_admin)) return { ok: false, erro: "Só o administrador gera a chave do Radar." };
  try {
    return { ok: true, chave: await novoTokenDoRadar(createAdminClient(), org.orgId) };
  } catch (e) {
    console.error("[conexoes/radar]", e instanceof Error ? e.message : e);
    return { ok: false, erro: "Não deu para gerar a chave agora." };
  }
}
