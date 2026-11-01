/**
 * Molde único dos e-mails da instalação: convite, senha alterada, relatório e os
 * modelos do Supabase Auth (gerados por scripts/gerar-modelos-email-opa.ts).
 *
 * Com APP_PALETTE=opa sai na marca da OPA (logo em PNG, petróleo, cartão branco
 * sobre o cinza azulado das telas). Sem ela, a marca vem de APP_NAME, em texto.
 *
 * Regras de e-mail que valem aqui (Gmail, Outlook, Apple Mail):
 *  - tabela para o esqueleto e estilo inline: cliente de e-mail ignora CSS externo;
 *  - logo em PNG: Gmail e Outlook não mostram SVG;
 *  - nada de dado de lead: estes e-mails são da conta da pessoa, não do cliente.
 *
 * `urlBase` é o endereço público do CRM. Nos modelos do Supabase ele é a variável
 * `{{ .SiteURL }}`, e por isso os textos chegam aqui já prontos: quem chama escapa
 * o que veio de fora (`esc`) e manda as variáveis Go do Supabase como estão.
 */
import { branding } from "@/lib/branding";

export const COR_OPA = {
  petroleo: "#0a2d40",
  azul: "#2a7ca8",
  fundo: "#eef3f6",
  texto: "#34566b",
  apoio: "#5b7284",
  borda: "#dde7ee",
} as const;

const FONTE = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** A instalação está na marca da OPA? */
export function marcaOpaAtiva(): boolean {
  return (process.env.APP_PALETTE ?? "").trim().toLowerCase() === "opa";
}

/** Nome do sistema como aparece no assunto e no texto. */
export function nomeDoSistema(): string {
  return marcaOpaAtiva() ? "CRM da OPA" : branding().name;
}

export function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface Molde {
  /** Endereço público do CRM, sem barra no fim (ou `{{ .SiteURL }}`). */
  urlBase: string;
  /** Linha que o leitor vê na caixa de entrada, ao lado do assunto. */
  previa: string;
  titulo: string;
  /** Parágrafos em HTML já seguro. */
  paragrafos: string[];
  /** Código grande no meio (reautenticação). */
  codigo?: string;
  /** HTML já seguro depois dos parágrafos: tabelas do relatório. */
  blocos?: string;
  botao?: { rotulo: string; url: string };
  /** Repete o endereço do botão em texto, para quem não consegue clicar. */
  mostrarLink?: boolean;
  /** Linhas pequenas abaixo do cartão: validade, "se não foi você". */
  observacao?: string;
}

export function moldeHtml(m: Molde): string {
  const opa = marcaOpaAtiva();
  const cor = opa ? COR_OPA.petroleo : "#004fb3";
  const cabecalho = opa
    ? `<img src="${m.urlBase}/opa/opa-logo-email.png" width="84" height="32" alt="OPA" style="display:block;border:0;outline:none;text-decoration:none">`
    : `<span style="font-family:${FONTE};font-size:16px;font-weight:700;color:${cor}">${esc(branding().name)}</span>`;

  const paragrafos = m.paragrafos
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${COR_OPA.texto}">${p}</p>`)
    .join("\n              ");

  const codigo = m.codigo
    ? `<p style="margin:22px 0;padding:16px 18px;background:${COR_OPA.fundo};border-radius:14px;font-size:28px;font-weight:700;letter-spacing:8px;text-align:center;color:${cor}">${m.codigo}</p>`
    : "";

  const botao = m.botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 6px">
                <tr>
                  <td style="background:${cor};border-radius:999px">
                    <a href="${m.botao.url}" style="display:inline-block;padding:14px 30px;font-family:${FONTE};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none">${m.botao.rotulo}</a>
                  </td>
                </tr>
              </table>`
    : "";

  const link =
    m.botao && m.mostrarLink
      ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.55;color:${COR_OPA.apoio}">Se o botão não abrir, copie este endereço no navegador:<br><span style="word-break:break-all;color:${COR_OPA.azul}">${m.botao.url}</span></p>`
      : "";

  const observacao = m.observacao ? `${m.observacao}<br><br>` : "";

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light">
    <meta name="supported-color-schemes" content="light">
    <title>${m.titulo}</title>
  </head>
  <body style="margin:0;padding:0;background:${COR_OPA.fundo}">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${m.previa}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COR_OPA.fundo}">
      <tr>
        <td align="center" style="padding:32px 16px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">
            <tr>
              <td style="padding:0 6px 20px">${cabecalho}</td>
            </tr>
            <tr>
              <td style="background:#ffffff;border-radius:22px;padding:32px 28px;font-family:${FONTE};color:${cor}">
              ${[
                `<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.01em;color:${cor}">${m.titulo}</h1>`,
                paragrafos,
                m.blocos ?? "",
                codigo,
                botao,
                link,
              ]
                .filter(Boolean)
                .join("\n              ")}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 6px 0;font-family:${FONTE};font-size:12px;line-height:1.55;color:${COR_OPA.apoio}">${observacao}${esc(nomeDoSistema())}. E-mail automático, não precisa responder.</td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`;
}

/** Versão em texto puro: alguns leitores e filtros de spam olham só para ela. */
export function moldeTexto(m: { titulo: string; linhas: string[]; url?: string; observacao?: string }): string {
  return [
    m.titulo,
    "",
    ...m.linhas,
    ...(m.url ? ["", m.url] : []),
    ...(m.observacao ? ["", m.observacao] : []),
    "",
    `${nomeDoSistema()}. E-mail automático, não precisa responder.`,
  ].join("\n");
}
