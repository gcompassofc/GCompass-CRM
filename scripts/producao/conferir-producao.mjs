/**
 * Conferência do CRM OPA em produção: o arquivo de segredos, o Supabase e o app
 * no ar. Não grava nada e não imprime segredo. Sai com código 1 se algo falhar.
 *
 * Uso (na raiz do repositório):
 *   node scripts/producao/conferir-producao.mjs                  lê .env.producao
 *   node scripts/producao/conferir-producao.mjs --env .env.local --local
 *        (ensaio contra o ambiente local: https e HSTS viram só aviso)
 */
import { createHash } from "node:crypto";
import fs from "node:fs";

const arg = (n) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const LOCAL = process.argv.includes("--local");
const ARQUIVO = arg("env") ?? ".env.producao";

function lerEnv(p) {
  if (!fs.existsSync(p)) return null;
  const v = {};
  for (const l of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) v[m[1]] = m[2].replace(/^['"](.*)['"]$/, "$1");
  }
  return v;
}

const env = lerEnv(ARQUIVO);
if (!env) {
  console.error(`Não achei ${ARQUIVO}. Gere com: node scripts/producao/gerar-segredos.mjs`);
  process.exit(1);
}

const linhas = [];
const ok = (t) => linhas.push(["ok", t]);
const falha = (t, como) => linhas.push(["FALHOU", t, como]);
const aviso = (t, como) => linhas.push(["atenção", t, como]);
const checa = (cond, t, como) => (cond ? ok(t) : falha(t, como));
const forteOuAviso = (cond, t, como) => (cond ? ok(t) : LOCAL ? aviso(t, como) : falha(t, como));

async function buscar(url, opcoes = {}) {
  try {
    return await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000), ...opcoes });
  } catch (e) {
    return { erro: String(e.cause?.code ?? e.name ?? e) };
  }
}

// ---------------------------------------------------------------- 1. Arquivo
console.info(`\n1. Arquivo ${ARQUIVO}`);
const obrigatorios = [
  "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_DB_URL",
  "NEXT_PUBLIC_APP_URL", "INTERNAL_SECRET", "INTERNAL_CRON_SECRET", "INVITE_TOKEN_SECRET",
  "CPF_ENCRYPTION_KEY", "AI_CRED_AES_KEY", "WAHA_API_KEY", "UPSTASH_REDIS_REST_TOKEN",
  "PII_CHAVES", "PII_CHAVE_ATUAL", "PII_CHAVE_INDICE",
];
const vazios = obrigatorios.filter((k) => !env[k]);
checa(vazios.length === 0, "variáveis obrigatórias preenchidas", `faltam: ${vazios.join(", ")}`);

const b32 = (s) => {
  try {
    return Buffer.from((s ?? "").trim(), "base64").length === 32;
  } catch {
    return false;
  }
};
const pares = (env.PII_CHAVES ?? "").split(",").map((p) => p.split(":"));
const atualExiste = pares.some(([v]) => v?.trim() === env.PII_CHAVE_ATUAL);
checa(
  pares.length > 0 && pares.every(([v, k]) => /^v\d+$/.test(v?.trim() ?? "") && b32(k)) && atualExiste && b32(env.PII_CHAVE_INDICE),
  "chaves da cifra no formato certo (32 bytes, versão atual presente)",
  "rode de novo o gerar-segredos.mjs ou confira PII_CHAVES / PII_CHAVE_ATUAL / PII_CHAVE_INDICE",
);
checa(!pares.some(([, k]) => k?.trim() === env.PII_CHAVE_INDICE?.trim()), "chave do índice diferente das de cifra", "PII_CHAVE_INDICE repetida");

if (!LOCAL) {
  const local = lerEnv(".env.local") ?? {};
  const h = (s) => createHash("sha256").update(s ?? "").digest("hex");
  const repetidos = ["INTERNAL_SECRET", "INTERNAL_CRON_SECRET", "INVITE_TOKEN_SECRET", "PII_CHAVES", "PII_CHAVE_INDICE", "WAHA_API_KEY", "SUPABASE_SERVICE_ROLE_KEY"]
    .filter((k) => env[k] && local[k] && h(env[k]) === h(local[k]));
  checa(repetidos.length === 0, "segredos diferentes dos do computador local", `iguais ao .env.local: ${repetidos.join(", ")}`);
}
// "comunidade" é o atalho que lib/sentry/dsn.ts troca pelo DSN da comunidade.
checa(!env.SENTRY_DSN || /^(off|false|0)$/i.test(env.SENTRY_DSN) || (!/58fabf8ad5450486/.test(env.SENTRY_DSN) && !/^comunidade$/i.test(env.SENTRY_DSN.trim())), "erros não vão para o Sentry de terceiros", "SENTRY_DSN aponta para o Sentry da comunidade");
checa(env.CADASTRO_ABERTO !== "true", "cadastro do app fechado (só convite)", "CADASTRO_ABERTO=true");
// E-mails utilitários (docs/EMAILS-OPA.md): sem a chave o CRM funciona, mas o
// convite não sai por e-mail e o aviso de senha alterada não chega. Só aviso.
{
  const chave = env.RESEND_API_KEY ?? "";
  const remetente = (env.RESEND_FROM_EMAIL ?? "").match(/<?([^<>\s]+@[^<>\s]+)>?\s*$/)?.[1] ?? "";
  const dominioOk = /@opailhabela\.com\.br$/i.test(remetente);
  if (/^re_[A-Za-z0-9_]{10,}$/.test(chave) && dominioOk) ok("e-mails pela Resend (remetente no domínio opailhabela.com.br)");
  else if (!chave) aviso("e-mails pela Resend", "RESEND_API_KEY vazia: convite e aviso de senha alterada não saem por e-mail");
  else if (!/^re_/.test(chave)) aviso("e-mails pela Resend", "RESEND_API_KEY não parece uma chave da Resend (começa com re_)");
  else aviso("e-mails pela Resend", "RESEND_FROM_EMAIL precisa ser do domínio verificado opailhabela.com.br");
}
if (env.OPA_RELATORIO_MENSAL === "on") aviso("relatório mensal ligado", "a decisão de 01/11/2026 era deixar desligado: confirme que mudou");
else ok("relatório mensal desligado (decisão de 01/11/2026)");
forteOuAviso(env.NODE_ENV === "production", "NODE_ENV=production", `está ${env.NODE_ENV || "vazio"}`);
forteOuAviso((env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://"), "app em https", env.NEXT_PUBLIC_APP_URL ?? "");
checa(
  env.WAHA_WEBHOOK_REQUIRE_SIGNATURE === "true" && (env.WAHA_HMAC_SECRET ?? "").length >= 16,
  "avisos do WhatsApp só entram assinados",
  "WAHA_WEBHOOK_REQUIRE_SIGNATURE=true e WAHA_HMAC_SECRET preenchido",
);
if (!LOCAL) {
  checa(/^http:\/\/(waha|localhost|127\.0\.0\.1)[:/]/.test(env.WAHA_API_BASE_URL ?? ""), "WAHA só pela rede interna", `WAHA_API_BASE_URL=${env.WAHA_API_BASE_URL}`);
  if (env.OWNER_PASSWORD) aviso("OWNER_PASSWORD ainda no arquivo", "depois da instalação, apague o valor (a senha já está no Supabase)");
}

// ---------------------------------------------------------------- 2. Supabase
const SUPA = (env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
console.info(`2. Supabase ${SUPA}`);
const anonH = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""}` };
const svcH = { apikey: env.SUPABASE_SERVICE_ROLE_KEY ?? "", authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY ?? ""}` };

const cfg = await buscar(`${SUPA}/auth/v1/settings`, { headers: anonH });
if (cfg.erro || !cfg.ok) {
  falha("Supabase responde", `sem resposta (${cfg.erro ?? cfg.status})`);
} else {
  const s = await cfg.json();
  checa(s.disable_signup === true, "cadastro fechado no Supabase (Auth)", "Authentication > Sign In / Providers > desligar 'Allow new users to sign up'");
  checa(s.external?.email === true, "login por e-mail ligado", "o provedor Email precisa ficar LIGADO (só o cadastro fecha)");
}

const anonOrg = await buscar(`${SUPA}/rest/v1/organizations?select=id&limit=1`, { headers: anonH });
const anonCorpo = anonOrg.erro ? null : await anonOrg.text();
checa(!anonOrg.erro && (anonOrg.status >= 400 || anonCorpo === "[]"), "visitante anônimo não lê empresas", `status ${anonOrg.status}`);

const api = await buscar(`${SUPA}/rest/v1/`, { headers: { ...svcH, accept: "application/openapi+json" } });
if (api.erro || !api.ok) {
  falha("schema legível com a service_role", `status ${api.status ?? api.erro}`);
} else {
  const caminhos = Object.keys((await api.json()).paths ?? {});
  const precisa = ["/imoveis", "/opa_segredos", "/visitas", "/rpc/fn_opa_ganhar_negocio", "/rpc/fn_opa_proximo_da_roleta", "/rpc/fn_opa_mesclar_config"];
  const faltam = precisa.filter((p) => !caminhos.includes(p));
  checa(faltam.length === 0, "migrações da OPA aplicadas (0110 a 0116)", `faltam: ${faltam.join(", ")}`);
}

const org = await buscar(`${SUPA}/rest/v1/organizations?slug=eq.opa&select=id,settings`, { headers: svcH });
const orgs = org.erro || !org.ok ? [] : await org.json();
const opa = orgs[0];
checa(!!opa, "empresa OPA criada", "rode scripts/producao/preparar-opa.ts");
if (opa) {
  const funis = await (await buscar(`${SUPA}/rest/v1/crm_pipelines?organization_id=eq.${opa.id}&select=slug`, { headers: svcH })).json();
  const slugs = funis.map((f) => f.slug);
  checa(["compradores", "captacao", "relacionamento"].every((s) => slugs.includes(s)), "três funis da OPA", `tem: ${slugs.join(", ")}`);
  checa(opa.settings?.visibility_mode === "own", "corretor vê só os leads dele", "visibility_mode diferente de own");
  const seg = await (await buscar(`${SUPA}/rest/v1/opa_segredos?organization_id=eq.${opa.id}&select=organization_id`, { headers: svcH })).json();
  checa(seg.length === 1, "token da porta de entrada criado", "rode o preparar-opa.ts");
  const roleta = opa.settings?.opa?.roleta ?? [];
  if (!roleta.length) aviso("roleta de corretores vazia", "Configurações > Roleta, depois que a equipe aceitar o convite");
  const fila = await buscar(`${SUPA}/rest/v1/contacts?organization_id=eq.${opa.id}&cifrado_em=is.null&select=id`, {
    headers: { ...svcH, prefer: "count=exact", range: "0-0" },
  });
  const pendentes = Number((fila.headers?.get?.("content-range") ?? "*/0").split("/")[1] || 0);
  checa(pendentes < 50, "cifra em dia (contatos esperando cifra)", `${pendentes} contatos sem cifra: a rotina cifrar-dados está rodando?`);
}

// ---------------------------------------------------------------- 3. App
const APP = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
console.info(`3. App ${APP}`);
const login = await buscar(`${APP}/login`);
if (login.erro || login.status !== 200) {
  falha("app no ar", `/login respondeu ${login.status ?? login.erro}`);
} else {
  ok("app no ar");
  const csp = login.headers.get("content-security-policy") ?? "";
  checa(/frame-ancestors 'none'/.test(csp) && /connect-src 'self'/.test(csp), "política de conteúdo (CSP)", "cabeçalho ausente: proxy.ts não rodou?");
  forteOuAviso(/max-age=\d{7,}/.test(login.headers.get("strict-transport-security") ?? ""), "HSTS (força https)", "sem Strict-Transport-Security");
  checa(login.headers.get("x-frame-options") === "DENY", "X-Frame-Options", "ausente");
}
const signup = await buscar(`${APP}/signup`);
checa(!signup.erro && [302, 303, 307, 308].includes(signup.status) && /\/login/.test(signup.headers.get("location") ?? ""), "/signup fechado", `status ${signup.status}`);

const semSegredo = await buscar(`${APP}/api/v1/cron/cifrar-dados`);
checa(semSegredo.status === 403, "rotina recusa quem não tem o segredo", `status ${semSegredo.status ?? semSegredo.erro}`);
const lembretesSemSegredo = await buscar(`${APP}/api/v1/cron/opa-lembretes`);
checa(lembretesSemSegredo.status === 403, "rotina de lembretes recusa quem não tem o segredo", `status ${lembretesSemSegredo.status ?? lembretesSemSegredo.erro}`);
const cifra = await buscar(`${APP}/api/v1/cron/cifrar-dados`, { headers: { authorization: `Bearer ${env.INTERNAL_CRON_SECRET || env.INTERNAL_SECRET}` } });
const cifraCorpo = cifra.erro || !cifra.ok ? {} : await cifra.json();
checa(cifraCorpo?.data?.configurada === true, "app com as chaves da cifra", `resposta ${cifra.status ?? cifra.erro}: confira PII_* no .env do servidor`);

const entrada = await buscar(`${APP}/api/v1/webhooks/opa-entrada/opa`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
checa([401, 403].includes(entrada.status), "porta de entrada recusa sem token", `status ${entrada.status ?? entrada.erro}`);

if (!LOCAL) {
  const host = new URL(APP).hostname;
  for (const [porta, nome] of [[3030, "WAHA"], [3000, "app direto (sem o Caddy)"], [6379, "Redis"], [8079, "ponte do Redis"]]) {
    const r = await buscar(`http://${host}:${porta}/`, { signal: AbortSignal.timeout(5000) });
    checa(!!r.erro, `${nome} fechado para a internet (porta ${porta})`, "a porta respondeu de fora: tire o mapeamento de porta no compose ou feche no firewall");
  }
}

// ---------------------------------------------------------------- resultado
const marca = { ok: "  ok     ", FALHOU: "  FALHOU ", "atenção": "  atenção" };
console.info("");
for (const [s, t, como] of linhas) console.info(`${marca[s]} ${t}${s !== "ok" && como ? `\n           ${como}` : ""}`);
const f = linhas.filter(([s]) => s === "FALHOU").length;
const a = linhas.filter(([s]) => s === "atenção").length;
console.info(`\n${linhas.length - f - a} ok, ${a} de atenção, ${f} falhando.`);
console.info("Manual (o script não alcança): limite de tentativas e CAPTCHA no Supabase Auth, backup diário, e o segundo fator do administrador.");
process.exit(f ? 1 : 0);
