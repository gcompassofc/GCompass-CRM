/**
 * Plain (no React Email) PT-BR invite email. Returns subject/html/text.
 * Inline styles only (email client compat). No external assets.
 *
 * A marca vem de `branding()` (APP_NAME no `.env`), não cravada: o e-mail é a
 * primeira coisa que um convidado vê da instalação, e era o único lugar que
 * ainda dizia "DeskcommCRM" mesmo com a interface já personalizada.
 */
import { rotuloDoPapel, type Role } from "@/lib/auth/types";
import { branding } from "@/lib/branding";
import { esc, marcaOpaAtiva, moldeHtml, moldeTexto } from "@/lib/email/molde";

export interface InviteEmailOptions {
  inviterName: string;
  orgName: string;
  acceptUrl: string;
  role: string;
  expiresAt: Date;
}

export function buildInviteEmail(opts: InviteEmailOptions): {
  subject: string;
  html: string;
  text: string;
} {
  if (marcaOpaAtiva()) return conviteOpa(opts);

  const expiresStr = opts.expiresAt.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
  const appName = branding().name;
  const subject = `${opts.inviterName} convidou você para a ${opts.orgName} no ${appName}`;

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#f5f6f8;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#1c1c1e">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px">
    <p style="margin:0 0 28px;font-size:15px;font-weight:700;letter-spacing:-0.01em;color:#004fb3">${escapeHtml(appName)}</p>
    <h1 style="font-size:22px;line-height:1.3;margin:0 0 16px;color:#0c0c0d">
      Você foi convidado para a ${escapeHtml(opts.orgName)}
    </h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.55">
      ${escapeHtml(opts.inviterName)} convidou você como
      <strong>${escapeHtml(opts.role)}</strong> no ${escapeHtml(appName)}.
    </p>
    <p style="margin:28px 0">
      <a href="${opts.acceptUrl}" style="display:inline-block;padding:12px 24px;background:#004fb3;color:#ffffff;border-radius:6px;text-decoration:none;font-weight:600;font-size:15px">
        Aceitar convite
      </a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#57575c">
      Ou copie e cole este link no navegador:<br>
      <span style="word-break:break-all;color:#004fb3">${opts.acceptUrl}</span>
    </p>
    <p style="margin:28px 0 0;padding-top:20px;border-top:1px solid #e2e4e8;font-size:13px;color:#6b6b70">
      Este link expira em <strong>${expiresStr}</strong>. Se você não esperava este convite, pode ignorá-lo.
    </p>
  </div>
</body>
</html>`;

  const text = [
    `Você foi convidado para a ${opts.orgName} como ${opts.role} no ${appName}.`,
    "",
    `Aceitar: ${opts.acceptUrl}`,
    "",
    `Expira em ${expiresStr}.`,
  ].join("\n");

  return { subject, html, text };
}

/**
 * Convite na marca da OPA. O papel sai como a equipe fala ("Corretor", "Gestor"),
 * a validade em horário de Brasília, e a origem do link de aceite serve de base
 * para o logo (é o NEXT_PUBLIC_APP_URL de quem chama).
 */
function conviteOpa(opts: InviteEmailOptions): { subject: string; html: string; text: string } {
  const papel = rotuloDoPapel(opts.role as Role) ?? opts.role;
  const validade = opts.expiresAt.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const urlBase = new URL(opts.acceptUrl).origin;
  const subject = `${opts.inviterName} convidou você para o CRM da OPA`;
  const observacao = `O convite vale até ${validade} (horário de Brasília). Se você não esperava este e-mail, pode ignorar.`;

  const html = moldeHtml({
    urlBase,
    previa: `Entre como ${esc(papel)} e veja seus leads, sua fila e seus lembretes.`,
    titulo: "Você foi convidado para o CRM da OPA",
    paragrafos: [
      `${esc(opts.inviterName)} convidou você para entrar como <strong>${esc(papel)}</strong>.`,
      "No CRM você vê seus leads, responde no prazo e recebe os lembretes do dia. No primeiro acesso, um tutorial curto mostra cada tela.",
    ],
    botao: { rotulo: "Aceitar convite", url: esc(opts.acceptUrl) },
    mostrarLink: true,
    observacao: esc(observacao),
  });

  const text = moldeTexto({
    titulo: "Você foi convidado para o CRM da OPA",
    linhas: [`${opts.inviterName} convidou você para entrar como ${papel}.`, "Para aceitar, abra o endereço abaixo:"],
    url: opts.acceptUrl,
    observacao,
  });

  return { subject, html, text };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
