/**
 * Verificação em duas etapas da conta: aplicativo, código por e-mail, código por
 * WhatsApp, ou desligada (pedido do Allyson, 03/11/2026: cada pessoa escolhe,
 * inclusive o administrador).
 *
 * Onde vive cada coisa:
 *  - aplicativo: fator TOTP do Supabase; o proxy cobra o aal2;
 *  - e-mail / WhatsApp: `app_metadata.segundo_fator` do usuário (só o service
 *    role escreve) e o número em `app_metadata.segundo_fator_whatsapp`; o proxy
 *    cobra o cookie de lib/auth/segundo-fator-cookie.ts;
 *  - códigos: tabela `codigos_segundo_fator` (0125), só o HMAC.
 *
 * Um método por vez: ligar um desliga os outros.
 */
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { mesmoTelefone } from "@/lib/opa/aviso-whatsapp";
import { numerosDeAviso } from "@/lib/opa/config";
import { getWahaClient } from "@/lib/waha/client";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { COOKIE_SEGUNDO_FATOR, assinarSegundoFator } from "./segundo-fator-cookie";
import { COOKIE_LEMBRAR, restanteDoLembrar } from "./lembrar";

export type Metodo = "nenhum" | "app" | "email" | "whatsapp";
export type Canal = "email" | "whatsapp";
export type Finalidade = "entrar" | "ativar";

export const VALIDADE_MIN = 10;
export const MAX_TENTATIVAS = 5;
/** Intervalo mínimo entre dois envios para a mesma pessoa (evita disparo em série). */
export const INTERVALO_REENVIO_S = 45;
const SESSAO_AVISOS = "opa-lembretes";

// ------------------------------------------------------------- funções puras

/** Só dígitos, com 55 na frente quando vier o número nacional (DDD + número). */
export function normalizarWhatsapp(bruto: string): string | null {
  let d = bruto.replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return /^55\d{10,11}$/.test(d) ? d : null;
}

/** "a***@gmail.com" ou "+55 12 *****-4321": diz para onde foi sem expor tudo. */
export function mascararDestino(canal: Canal, destino: string): string {
  if (canal === "email") {
    const [nome, dominio] = destino.split("@");
    if (!nome || !dominio) return destino;
    return `${nome.slice(0, 1)}***@${dominio}`;
  }
  const m = /^55(\d{2})\d+(\d{4})$/.exec(destino);
  return m ? `+55 ${m[1]} *****-${m[2]}` : `***${destino.slice(-4)}`;
}

export function metodoDoUsuario(user: Pick<User, "app_metadata">, temApp: boolean): Metodo {
  if (temApp) return "app";
  const m = user.app_metadata?.segundo_fator;
  return m === "email" || m === "whatsapp" ? m : "nenhum";
}

/** Só caminho interno: "/app/x". Nunca "//outro.site" nem URL completa. */
export function destinoSeguro(next: string | null | undefined): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : "/app";
}

function hashCodigo(userId: string, codigo: string): string {
  return createHmac("sha256", env.INTERNAL_SECRET).update(`codigo-sf:${userId}:${codigo}`).digest("hex");
}

function iguais(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function textoDoCodigo(codigo: string, finalidade: Finalidade): string {
  return finalidade === "entrar"
    ? `Seu código para entrar no CRM da OPA: ${codigo}\n\nVale por ${VALIDADE_MIN} minutos. Se não foi você, troque sua senha e avise o administrador.`
    : `Seu código para ligar a verificação em duas etapas no CRM da OPA: ${codigo}\n\nVale por ${VALIDADE_MIN} minutos.`;
}

// ------------------------------------------------------------- envio

export type ResultadoEnvio =
  | { ok: true; destinoMascarado: string }
  | { ok: false; erro: "aguarde" | "email_indisponivel" | "whatsapp_indisponivel" | "falha_envio"; segundos?: number };

/** A sessão de avisos da OPA conectada, em qualquer empresa de que a pessoa faça parte. */
async function sessaoDeAvisos(admin: SupabaseClient, userId: string): Promise<string | null> {
  return (await sessaoDeAvisosComOrg(admin, userId))?.nome ?? null;
}

async function sessaoDeAvisosComOrg(admin: SupabaseClient, userId: string): Promise<{ nome: string; orgId: string } | null> {
  const { data: orgs } = await admin.from("user_organizations").select("organization_id").eq("user_id", userId);
  const ids = (orgs ?? []).map((o: { organization_id: string }) => o.organization_id);
  if (ids.length === 0) return null;
  const { data } = await admin
    .from("channel_sessions")
    .select("waha_session_name, organization_id")
    .in("organization_id", ids)
    .eq("waha_session_name", SESSAO_AVISOS)
    .eq("status", "WORKING")
    .is("archived_at", null)
    .limit(1);
  const linha = data?.[0] as { waha_session_name: string; organization_id: string } | undefined;
  return linha ? { nome: linha.waha_session_name, orgId: linha.organization_id } : null;
}

/** Modo de teste do OPA Lembretes (settings.opa.avisos.teste): o código só sai para número da lista. */
async function retidoNoTeste(admin: SupabaseClient, orgId: string, destino: string): Promise<boolean> {
  const { data } = await admin.from("organizations").select("settings").eq("id", orgId).maybeSingle();
  const teste = numerosDeAviso((data as { settings: { opa?: { avisos?: { teste?: unknown } } } | null } | null)?.settings?.opa?.avisos?.teste);
  return teste.length > 0 && !teste.some((n) => mesmoTelefone(n, destino));
}

/** O que dá para usar nesta instalação, para a tela mostrar só o que funciona. */
export async function canaisDisponiveis(userId: string): Promise<{ email: boolean; whatsapp: boolean }> {
  const email = (process.env.RESEND_API_KEY ?? "").length >= 10;
  const whatsapp = !!getWahaClient() && !!(await sessaoDeAvisos(createAdminClient(), userId));
  return { email, whatsapp };
}

/**
 * Gera, guarda e manda um código. Invalida o código anterior da mesma finalidade:
 * só o último vale.
 */
export async function enviarCodigo(p: {
  userId: string;
  canal: Canal;
  destino: string;
  finalidade: Finalidade;
}): Promise<ResultadoEnvio> {
  const admin = createAdminClient();

  const { data: ultimo } = await admin
    .from("codigos_segundo_fator")
    .select("created_at")
    .eq("user_id", p.userId)
    .eq("finalidade", p.finalidade)
    .order("created_at", { ascending: false })
    .limit(1);
  const ultimoEm = (ultimo?.[0] as { created_at: string } | undefined)?.created_at;
  if (ultimoEm) {
    const passou = (Date.now() - new Date(ultimoEm).getTime()) / 1000;
    if (passou < INTERVALO_REENVIO_S) {
      return { ok: false, erro: "aguarde", segundos: Math.ceil(INTERVALO_REENVIO_S - passou) };
    }
  }

  let sessao: string | null = null;
  if (p.canal === "whatsapp") {
    const achada = await sessaoDeAvisosComOrg(admin, p.userId);
    sessao = achada?.nome ?? null;
    if (!sessao || !getWahaClient()) return { ok: false, erro: "whatsapp_indisponivel" };
    if (achada && (await retidoNoTeste(admin, achada.orgId, p.destino))) return { ok: false, erro: "whatsapp_indisponivel" };
  } else if ((process.env.RESEND_API_KEY ?? "").length < 10) {
    return { ok: false, erro: "email_indisponivel" };
  }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await admin
    .from("codigos_segundo_fator")
    .update({ usado_em: new Date().toISOString() })
    .eq("user_id", p.userId)
    .eq("finalidade", p.finalidade)
    .is("usado_em", null);
  const { error } = await admin.from("codigos_segundo_fator").insert({
    user_id: p.userId,
    finalidade: p.finalidade,
    canal: p.canal,
    destino: p.destino,
    codigo_hash: hashCodigo(p.userId, codigo),
    expira_em: new Date(Date.now() + VALIDADE_MIN * 60_000).toISOString(),
  });
  if (error) return { ok: false, erro: "falha_envio" };

  const texto = textoDoCodigo(codigo, p.finalidade);
  try {
    if (p.canal === "whatsapp") {
      await getWahaClient()!.sendMessage(sessao!, `${p.destino}@c.us`, texto);
    } else {
      const r = await sendEmail({
        to: p.destino,
        subject: p.finalidade === "entrar" ? `Código de acesso: ${codigo}` : `Código de confirmação: ${codigo}`,
        text: texto,
        html: `<p style="font-family:sans-serif;font-size:15px">${texto.split("\n\n")[0]!.replace(codigo, `<strong style="font-size:22px;letter-spacing:3px">${codigo}</strong>`)}</p><p style="font-family:sans-serif;font-size:13px;color:#5b7284">${texto.split("\n\n")[1] ?? ""}</p>`,
      });
      if (!r.ok) return { ok: false, erro: "falha_envio" };
    }
  } catch {
    return { ok: false, erro: "falha_envio" };
  }
  return { ok: true, destinoMascarado: mascararDestino(p.canal, p.destino) };
}

// ------------------------------------------------------------- conferência

export type ResultadoConferencia =
  | { ok: true; canal: Canal; destino: string }
  | { ok: false; erro: "errado" | "expirado" | "tentativas" | "sem_codigo"; restam?: number };

export async function conferirCodigo(p: {
  userId: string;
  finalidade: Finalidade;
  codigo: string;
}): Promise<ResultadoConferencia> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("codigos_segundo_fator")
    .select("id, canal, destino, codigo_hash, tentativas, expira_em")
    .eq("user_id", p.userId)
    .eq("finalidade", p.finalidade)
    .is("usado_em", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const linha = data?.[0] as
    | { id: string; canal: Canal; destino: string; codigo_hash: string; tentativas: number; expira_em: string }
    | undefined;
  if (!linha) return { ok: false, erro: "sem_codigo" };
  if (new Date(linha.expira_em).getTime() < Date.now()) return { ok: false, erro: "expirado" };
  if (linha.tentativas >= MAX_TENTATIVAS) return { ok: false, erro: "tentativas" };

  if (!/^\d{6}$/.test(p.codigo) || !iguais(hashCodigo(p.userId, p.codigo), linha.codigo_hash)) {
    const tentativas = linha.tentativas + 1;
    await admin.from("codigos_segundo_fator").update({ tentativas }).eq("id", linha.id);
    return tentativas >= MAX_TENTATIVAS
      ? { ok: false, erro: "tentativas" }
      : { ok: false, erro: "errado", restam: MAX_TENTATIVAS - tentativas };
  }

  // Marca como usado só se ainda não foi: dois envios do mesmo código ao mesmo
  // tempo não passam os dois.
  const { data: marcado } = await admin
    .from("codigos_segundo_fator")
    .update({ usado_em: new Date().toISOString() })
    .eq("id", linha.id)
    .is("usado_em", null)
    .select("id");
  if (!marcado || marcado.length === 0) return { ok: false, erro: "sem_codigo" };
  return { ok: true, canal: linha.canal, destino: linha.destino };
}

// ------------------------------------------------------------- estado da conta

/** Grava o método no app_metadata, preservando o resto (papel, etc.). */
export async function gravarMetodo(user: User, metodo: Metodo, whatsapp?: string | null): Promise<void> {
  const admin = createAdminClient();
  const atual = { ...(user.app_metadata ?? {}) } as Record<string, unknown>;
  if (metodo === "email" || metodo === "whatsapp") atual.segundo_fator = metodo;
  else delete atual.segundo_fator;
  if (metodo === "whatsapp" && whatsapp) atual.segundo_fator_whatsapp = whatsapp;
  else if (metodo !== "whatsapp") delete atual.segundo_fator_whatsapp;
  // `null` apaga a chave no GoTrue (o update faz merge do app_metadata).
  const app_metadata = {
    ...atual,
    segundo_fator: atual.segundo_fator ?? null,
    segundo_fator_whatsapp: atual.segundo_fator_whatsapp ?? null,
  };
  const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata });
  if (error) throw new Error(`gravarMetodo: ${error.message}`);
}

/** Tira todos os aplicativos autenticadores da conta (a sessão já passou do segundo fator). */
export async function removerAplicativos(supabase: SupabaseClient, manter?: string): Promise<void> {
  const { data } = await supabase.auth.mfa.listFactors();
  for (const f of data?.all ?? []) {
    if (f.factor_type === "totp" && f.id !== manter) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) throw new Error(`removerAplicativos: ${error.message}`);
    }
  }
}

/** `session_id` do JWT da sessão atual: é a ele que o cookie do código fica preso. */
export async function idDaSessao(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.auth.getClaims();
  const sid = (data?.claims as { session_id?: unknown } | undefined)?.session_id;
  return typeof sid === "string" ? sid : null;
}

/** Libera esta sessão: o código foi confirmado nela. */
export async function liberarSessao(supabase: SupabaseClient, userId: string): Promise<void> {
  const sid = await idDaSessao(supabase);
  if (!sid) throw new Error("liberarSessao: sessão sem session_id");
  const valor = await assinarSegundoFator(env.INTERNAL_SECRET, userId, sid);
  const loja = await cookies();
  // Com "Lembrar de mim", o código confirmado vale o mesmo tempo da sessão salva;
  // sem, morre quando o navegador fecha, junto com a sessão.
  const restante = restanteDoLembrar(loja.get(COOKIE_LEMBRAR)?.value);
  loja.set(COOKIE_SEGUNDO_FATOR, valor, {
    httpOnly: true,
    sameSite: "strict",
    secure: cookieSecure(),
    path: "/",
    ...(restante ? { maxAge: restante } : {}),
  });
}
