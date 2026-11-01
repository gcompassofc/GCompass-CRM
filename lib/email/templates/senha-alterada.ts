/**
 * Aviso de senha alterada, mandado pelo app logo depois da troca
 * (app/actions/auth/updatePassword.ts).
 *
 * Por que pelo app e não pelo Supabase: o aviso do Supabase depende de ligar a
 * notificação no painel de cada projeto, e aqui ele sai na marca da OPA, pela
 * mesma Resend dos convites, sem depender disso. No painel, a notificação
 * "Password changed" do Supabase fica DESLIGADA para não chegar em dobro
 * (docs/EMAILS-OPA.md).
 *
 * Nada de senha, IP ou dado de lead: só quando foi e o que fazer se não foi você.
 */
import { esc, moldeHtml, moldeTexto, nomeDoSistema } from "@/lib/email/molde";

export interface SenhaAlteradaOptions {
  urlBase: string;
  quando: Date;
}

export function buildSenhaAlteradaEmail(opts: SenhaAlteradaOptions): { subject: string; html: string; text: string } {
  const sistema = nomeDoSistema();
  const quando = opts.quando.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const urlBase = opts.urlBase.replace(/\/$/, "");
  const entrar = `${urlBase}/login`;
  const subject = `Sua senha do ${sistema} foi alterada`;
  const comoFoi = `A senha da sua conta no ${sistema} foi trocada em ${quando} (horário de Brasília).`;
  const seNaoFoi = "Se foi você, está tudo certo. Se não foi, avise agora o administrador da equipe para bloquear o acesso e crie uma senha nova em \"Esqueci a senha\".";

  const html = moldeHtml({
    urlBase,
    previa: "Se foi você, está tudo certo.",
    titulo: "Sua senha foi alterada",
    paragrafos: [esc(comoFoi), esc(seNaoFoi)],
    botao: { rotulo: "Entrar no CRM", url: esc(entrar) },
  });

  const text = moldeTexto({ titulo: "Sua senha foi alterada", linhas: [comoFoi, seNaoFoi], url: entrar });

  return { subject, html, text };
}
