/**
 * CAPTCHA do acesso (Cloudflare Turnstile), pendência S2 da revisão de 31/10/2026.
 *
 * Fica DESLIGADO enquanto TURNSTILE_SITE_KEY não existir no .env: sem a chave, nenhum
 * formulário mostra a verificação, nada é mandado ao Supabase e a CSP não muda.
 *
 * Ordem para ligar (docs/PRODUCAO-OPA.md): primeiro a chave no .env e o app publicado,
 * depois o CAPTCHA no painel do Supabase. Ao contrário, ninguém entra: o Supabase passa
 * a exigir um código que o formulário ainda não manda.
 *
 * A chave do site é pública (vai para o navegador). A chave secreta nunca passa por
 * aqui: ela mora só no painel do Supabase, que é quem confere o código.
 *
 * A chave é lida em tempo de execução, e não como NEXT_PUBLIC_*, porque a imagem é a
 * mesma em todo ambiente: a página do servidor lê e entrega ao formulário.
 */

export const ORIGEM_DO_CAPTCHA = "https://challenges.cloudflare.com";

/** Campo que o Turnstile acrescenta sozinho a um <form> quando é desenhado dentro dele. */
export const CAMPO_DO_CAPTCHA = "cf-turnstile-response";

const FORMATO_DA_CHAVE = /^[0-9A-Za-z_-]{10,64}$/;
const TAMANHO_MAXIMO_DO_CODIGO = 4096;

/** Chave do site, ou null quando o CAPTCHA está desligado ou a chave veio torta. */
export function chaveDoCaptcha(valor: string | undefined = process.env.TURNSTILE_SITE_KEY): string | null {
  const chave = (valor ?? "").trim();
  return FORMATO_DA_CHAVE.test(chave) ? chave : null;
}

/** Código que veio do navegador: só texto de tamanho plausível segue para o Supabase. */
export function codigoDoCaptcha(valor: unknown): string | undefined {
  if (typeof valor !== "string") return undefined;
  const codigo = valor.trim();
  if (!codigo || codigo.length > TAMANHO_MAXIMO_DO_CODIGO) return undefined;
  return codigo;
}

/**
 * O Supabase recusou por causa do CAPTCHA (código ausente, vencido ou já usado)?
 * Separar isso de senha errada importa: recusa de CAPTCHA não pode gastar o
 * orçamento de tentativas da conta nem dizer "senha incorreta" a quem acertou.
 */
export function recusaDeCaptcha(erro: { message?: string; code?: string } | null | undefined): boolean {
  if (!erro) return false;
  return erro.code === "captcha_failed" || /captcha/i.test(erro.message ?? "");
}
