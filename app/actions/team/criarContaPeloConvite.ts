"use server";
/**
 * Cria a conta de quem recebeu o convite, sem o /signup aberto.
 *
 * Com o cadastro fechado (auditoria de 30/10/2026, P2), o convidado não tinha
 * como ter uma conta para aceitar o convite. O token HMAC do convite chegou no
 * e-mail da pessoa: ele prova a posse do e-mail, então a conta nasce confirmada.
 * O e-mail vem do token assinado, nunca do formulário.
 *
 * Conta que já existe não é recriada nem tem a senha trocada: a pessoa entra
 * pelo login normal e volta ao link do convite.
 */
import { redirect } from "next/navigation";

import { audit, hashEmail } from "@/lib/audit";
import { verifyInviteToken } from "@/lib/auth/invite-token";
import { authRateLimited, AUTH_LIMITS } from "@/lib/auth/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { acceptInviteAction } from "./acceptInvite";
import { CAMPO_DO_CAPTCHA, codigoDoCaptcha, recusaDeCaptcha } from "@/lib/seguranca/captcha";

/** Mesma régua do GoTrue de produção (senha mínima de 12). */
const SENHA_MINIMA = 12;

export async function criarContaPeloConvite(token: string, formData: FormData): Promise<void> {
  const voltar = (erro: string) => redirect(`/team/accept-invite/${token}?erro=${erro}`);

  const payload = verifyInviteToken(token);
  if (!payload) voltar("convite");
  if (await authRateLimited("invite_accept", payload!.invite_id, AUTH_LIMITS.invite_accept)) voltar("tentativas");

  const nome = String(formData.get("nome") ?? "").trim().slice(0, 120);
  const senha = String(formData.get("senha") ?? "");
  const confirma = String(formData.get("confirma") ?? "");
  if (nome.length < 2) voltar("nome");
  if (senha.length < SENHA_MINIMA || senha.length > 128) voltar("senha");
  if (senha !== confirma) voltar("confirma");

  const email = payload!.email.trim().toLowerCase();
  const admin = createAdminClient();
  const { error: criarErr } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: nome },
  });
  if (criarErr) {
    // 422 email_exists: a conta já existe. Não diz mais nada além disso.
    if (criarErr.status === 422 || /already|exists|registered/i.test(criarErr.message)) voltar("existe");
    console.error("[convite] criar conta:", criarErr.message);
    voltar("falhou");
  }

  const supabase = await createClient();
  const { error: entrarErr } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
    options: { captchaToken: codigoDoCaptcha(formData.get(CAMPO_DO_CAPTCHA)) },
  });
  // A conta já nasceu aqui em cima. Se só a verificação de segurança falhou, a pessoa
  // entra pelo login com a senha que acabou de criar e volta ao link do convite.
  if (entrarErr && recusaDeCaptcha(entrarErr)) voltar("seguranca");
  if (entrarErr) voltar("falhou");

  await audit({
    action: "auth.signup_by_invite",
    organizationId: payload!.organization_id,
    metadata: { email_hash: hashEmail(email), invite_id: payload!.invite_id },
  });

  // Insere a membership e redireciona para o app.
  const r = await acceptInviteAction(token);
  if (!r.ok) voltar("falhou");
}
