/**
 * Modelos dos e-mails do Supabase Auth na marca da OPA, em português.
 *
 * Fonte única: `scripts/gerar-modelos-email-opa.ts` grava cada um em
 * supabase/templates/opa/<arquivo> e um teste confere que os arquivos batem com
 * esta lista. Para mudar um texto: mude aqui, rode o script e cole no painel do
 * Supabase (docs/EMAILS-OPA.md diz onde fica cada um).
 *
 * Os links vão todos para {{ .SiteURL }}/auth/confirm com token_hash e type, que é
 * a rota do app que troca o token por sessão (app/auth/confirm/route.ts). SiteURL
 * é o "Site URL" do painel (https://crm.opailhabela.com.br): diferente do
 * RedirectTo, ele existe em todo e-mail, inclusive no convite feito pelo painel.
 *
 * Variáveis do Supabase usadas: TokenHash, Token, SiteURL, Email, NewEmail,
 * OldEmail (troca de e-mail) e FactorType (segundo fator). O texto fixo passa por
 * `esc`; as variáveis entram como estão para o Supabase trocar.
 */
import { esc, moldeHtml } from "@/lib/email/molde";

const SITE = "{{ .SiteURL }}";
const confirmar = (tipo: string) => `${SITE}/auth/confirm?token_hash={{ .TokenHash }}&type=${tipo}`;

export interface ModeloSupabase {
  arquivo: string;
  /** Nome do modelo no painel: Authentication > Emails. */
  painel: string;
  /** Aviso de segurança (aba de notificações), não e-mail com link. */
  notificacao: boolean;
  assunto: string;
  html: () => string;
}

export const MODELOS_SUPABASE_OPA: ModeloSupabase[] = [
  {
    arquivo: "recovery.html",
    painel: "Reset password",
    notificacao: false,
    assunto: "Crie uma senha nova para o CRM da OPA",
    html: () =>
      moldeHtml({
        urlBase: SITE,
        previa: "O link leva para a tela de senha nova.",
        titulo: "Vamos criar uma senha nova",
        paragrafos: [
          esc("Recebemos um pedido para trocar a senha da sua conta no CRM da OPA."),
          esc("O botão abaixo leva para a tela onde você escolhe a senha nova."),
        ],
        botao: { rotulo: "Criar senha nova", url: confirmar("recovery") },
        mostrarLink: true,
        observacao: esc("O link vale por tempo limitado e funciona uma vez só. Se você não pediu, ignore este e-mail: sua senha atual continua valendo."),
      }),
  },
  {
    arquivo: "invite.html",
    painel: "Invite user",
    notificacao: false,
    assunto: "Você foi convidado para o CRM da OPA",
    html: () =>
      moldeHtml({
        urlBase: SITE,
        previa: "Aceite o convite e crie sua senha.",
        titulo: "Você foi convidado para o CRM da OPA",
        paragrafos: [
          esc("Sua conta no CRM da OPA está pronta. Aceite o convite e escolha sua senha."),
          esc("No primeiro acesso, um tutorial curto mostra cada tela."),
        ],
        botao: { rotulo: "Aceitar convite", url: confirmar("invite") },
        mostrarLink: true,
        observacao: esc("O convite vale por tempo limitado. Se você não esperava este e-mail, pode ignorar."),
      }),
  },
  {
    arquivo: "magic_link.html",
    painel: "Magic link",
    notificacao: false,
    assunto: "Seu link de acesso ao CRM da OPA",
    html: () =>
      moldeHtml({
        urlBase: SITE,
        previa: "Entre sem digitar a senha.",
        titulo: "Seu link de acesso",
        paragrafos: [esc("Use o botão abaixo para entrar no CRM da OPA sem digitar a senha.")],
        botao: { rotulo: "Entrar no CRM", url: confirmar("magiclink") },
        mostrarLink: true,
        observacao: esc("O link vale por tempo limitado e funciona uma vez só. Se você não pediu, ignore este e-mail."),
      }),
  },
  {
    arquivo: "email_change.html",
    painel: "Change email address",
    notificacao: false,
    assunto: "Confirme a troca de e-mail no CRM da OPA",
    html: () =>
      moldeHtml({
        urlBase: SITE,
        previa: "Confirme para o novo e-mail passar a valer.",
        titulo: "Confirme a troca de e-mail",
        paragrafos: [
          `${esc("Recebemos um pedido para trocar o e-mail da sua conta de")} <strong>{{ .Email }}</strong> ${esc("para")} <strong>{{ .NewEmail }}</strong>.`,
          esc("O novo e-mail só passa a valer depois da confirmação."),
        ],
        botao: { rotulo: "Confirmar troca", url: confirmar("email_change") },
        mostrarLink: true,
        observacao: esc("Se você não pediu esta troca, ignore este e-mail e avise o administrador da equipe."),
      }),
  },
  {
    arquivo: "reauthentication.html",
    painel: "Reauthentication",
    notificacao: false,
    assunto: "Seu código de confirmação do CRM da OPA",
    html: () =>
      moldeHtml({
        urlBase: SITE,
        previa: "Use o código para confirmar a operação.",
        titulo: "Seu código de confirmação",
        paragrafos: [esc("Digite este código no CRM da OPA para confirmar a operação.")],
        codigo: "{{ .Token }}",
        observacao: esc("O código vale por tempo limitado. Se você não pediu, troque sua senha e avise o administrador da equipe."),
      }),
  },
  {
    arquivo: "confirmation.html",
    painel: "Confirm signup",
    notificacao: false,
    assunto: "Confirme seu e-mail no CRM da OPA",
    html: () =>
      moldeHtml({
        urlBase: SITE,
        previa: "Falta só confirmar o e-mail.",
        titulo: "Confirme seu e-mail",
        paragrafos: [esc("Falta só confirmar que este e-mail é seu para entrar no CRM da OPA.")],
        botao: { rotulo: "Confirmar e-mail", url: confirmar("signup") },
        mostrarLink: true,
        observacao: esc("Se você não criou uma conta, ignore este e-mail."),
      }),
  },
  {
    arquivo: "email_changed_notification.html",
    painel: "Email address changed",
    notificacao: true,
    assunto: "O e-mail da sua conta no CRM da OPA mudou",
    html: () =>
      moldeHtml({
        urlBase: SITE,
        previa: "Se foi você, está tudo certo.",
        titulo: "O e-mail da sua conta mudou",
        paragrafos: [
          `${esc("O e-mail da sua conta no CRM da OPA mudou de")} <strong>{{ .OldEmail }}</strong> ${esc("para")} <strong>{{ .Email }}</strong>.`,
          esc("Se foi você, está tudo certo. Se não foi, avise agora o administrador da equipe."),
        ],
      }),
  },
  {
    arquivo: "mfa_factor_enrolled_notification.html",
    painel: "MFA method added",
    notificacao: true,
    assunto: "Novo método de verificação no CRM da OPA",
    html: () =>
      moldeHtml({
        urlBase: SITE,
        previa: "Se foi você, está tudo certo.",
        titulo: "Novo método de verificação",
        paragrafos: [
          `${esc("Um novo método de verificação em duas etapas")} ({{ .FactorType }}) ${esc("foi adicionado à sua conta no CRM da OPA.")}`,
          esc("Se foi você, está tudo certo. Se não foi, avise agora o administrador da equipe."),
        ],
      }),
  },
  {
    arquivo: "mfa_factor_unenrolled_notification.html",
    painel: "MFA method removed",
    notificacao: true,
    assunto: "Método de verificação removido no CRM da OPA",
    html: () =>
      moldeHtml({
        urlBase: SITE,
        previa: "Confira se foi você.",
        titulo: "Método de verificação removido",
        paragrafos: [
          `${esc("Um método de verificação em duas etapas")} ({{ .FactorType }}) ${esc("foi removido da sua conta no CRM da OPA.")}`,
          esc("Se foi você, está tudo certo. Se não foi, avise agora o administrador da equipe e troque sua senha."),
        ],
      }),
  },
];
