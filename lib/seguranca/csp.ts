/**
 * Política de conteúdo (CSP) e HSTS das páginas (auditoria de 30/10/2026, P8).
 *
 * Montada no proxy, em tempo de execução: a imagem Docker é a mesma em todo
 * ambiente e o endereço do Supabase só chega pelo .env.
 *
 * O que ela segura, mesmo com script inline liberado (o Next precisa dele sem
 * nonce, e nonce obrigaria toda página a ser dinâmica):
 *  - script só do próprio domínio: nada de <script src> de fora;
 *  - fetch, XHR e WebSocket só para o app e o Supabase: um XSS não manda a
 *    carteira para servidor de terceiro;
 *  - imagem só de origens conhecidas, que fecha a saída por <img src>;
 *  - frame-ancestors 'none': ninguém embute o CRM para clickjacking;
 *  - base-uri, form-action e object-src travados.
 *
 * Origem nova de imagem (CDN de fotos, por exemplo) entra por CSP_IMG_EXTRA,
 * separada por espaço, sem rebuild.
 *
 * Única exceção ao "script só do próprio domínio": com o CAPTCHA do acesso ligado
 * (lib/seguranca/captcha.ts), o script e a moldura da Cloudflare são liberados.
 * Com ele desligado, a política é a mesma de antes.
 */

import { ORIGEM_DO_CAPTCHA } from "./captcha";

const IMAGENS_CONHECIDAS = [
  "https://opailhabela.com.br",
  "https://*.opailhabela.com.br",
  "https://*.r2.dev",
  "https://*.r2.cloudflarestorage.com",
  "https://pps.whatsapp.net",
];

export interface OpcoesCsp {
  supabaseUrl: string;
  appUrl: string;
  dev: boolean;
  imagensExtras?: string;
  /** CAPTCHA do acesso ligado (há chave do site no ambiente). */
  captcha?: boolean;
}

function origem(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function montarCsp({ supabaseUrl, appUrl, dev, imagensExtras, captcha }: OpcoesCsp): string {
  const supa = origem(supabaseUrl);
  const supaWs = supa ? supa.replace(/^http/, "ws") : null;
  const extras = (imagensExtras ?? "").split(/\s+/).filter((o) => /^https:\/\/[a-z0-9*.-]+(:\d+)?$/i.test(o));
  const https = appUrl.startsWith("https://");
  const cf = captcha ? ORIGEM_DO_CAPTCHA : null;

  const diretivas: Array<[string, Array<string | null>]> = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", "'unsafe-inline'", dev ? "'unsafe-eval'" : null, cf]],
    ["style-src", ["'self'", "'unsafe-inline'"]],
    ["img-src", ["'self'", "data:", "blob:", supa, ...IMAGENS_CONHECIDAS, ...extras]],
    ["media-src", ["'self'", "data:", "blob:", supa]],
    ["font-src", ["'self'", "data:"]],
    ["connect-src", ["'self'", supa, supaWs, dev ? "ws:" : null]],
    ["worker-src", ["'self'", "blob:"]],
    ["frame-src", ["'self'", cf]],
    ["frame-ancestors", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'"]],
    ["object-src", ["'none'"]],
  ];
  const partes = diretivas.map(([nome, fontes]) => `${nome} ${fontes.filter(Boolean).join(" ")}`);
  if (https) partes.push("upgrade-insecure-requests");
  return partes.join("; ");
}

/** HSTS só faz sentido servido em https. */
export function cabecalhoHsts(appUrl: string): string | null {
  return appUrl.startsWith("https://") ? "max-age=31536000; includeSubDomains" : null;
}
