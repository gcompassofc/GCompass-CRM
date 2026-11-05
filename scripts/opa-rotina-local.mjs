/**
 * Rotina local do CRM da OPA: chama a cada minuto o cron do copiloto e o da
 * cifra dos dados pessoais, como o cron do servidor faz em produção (vercel.ts /
 * crontab do kit self-host). Sem ela, no localhost a IA só relê a conversa
 * quando alguém abre a ficha, e contato novo fica sem a versão cifrada.
 *
 * Run: node scripts/opa-rotina-local.mjs   (Ctrl+C para parar)
 */
import fs from "node:fs";
import path from "node:path";

const env = Object.fromEntries(
  fs
    .readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^([A-Z_]+)=(.*)$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2].replace(/^"(.*)"$/, "$1")]),
);

const segredo = env.INTERNAL_CRON_SECRET || env.INTERNAL_SECRET;
const base = process.env.APP_URL || "http://localhost:3000";
if (!segredo) {
  console.error("Falta INTERNAL_CRON_SECRET ou INTERNAL_SECRET no .env.local");
  process.exit(1);
}

async function cifrar() {
  try {
    const r = await fetch(`${base}/api/v1/cron/cifrar-dados`, { headers: { Authorization: `Bearer ${segredo}` } });
    const d = (await r.json().catch(() => ({})))?.data ?? {};
    if (!r.ok || d.contatos || d.mensagens || d.configurada === false) {
      console.info(new Date().toLocaleTimeString("pt-BR"), "cifra", r.status, JSON.stringify(d));
    }
  } catch {
    // o tick do copiloto já avisa quando o app não responde
  }
}

/** Lembretes e, a cada 5 minutos, as etiquetas que estão no aparelho e o CRM ainda não sabe. */
async function lembretes() {
  try {
    const r = await fetch(`${base}/api/v1/cron/opa-lembretes`, { headers: { Authorization: `Bearer ${segredo}` } });
    const d = (await r.json().catch(() => ({})))?.data ?? {};
    if (!r.ok || d.etiquetasConciliadas) console.info(new Date().toLocaleTimeString("pt-BR"), "etiquetas", r.status, d.etiquetasConciliadas ?? "");
  } catch {
    // o tick do copiloto já avisa quando o app não responde
  }
}

async function tick() {
  await cifrar();
  await lembretes();
  try {
    const r = await fetch(`${base}/api/v1/cron/opa-copiloto`, {
      headers: { Authorization: `Bearer ${segredo}` },
    });
    const corpo = await r.json().catch(() => ({}));
    const n = corpo?.data?.analisados ?? 0;
    if (!r.ok || n > 0) console.info(new Date().toLocaleTimeString("pt-BR"), r.status, JSON.stringify(corpo.data ?? corpo));
  } catch (e) {
    console.info(new Date().toLocaleTimeString("pt-BR"), "sem resposta do app:", String(e).slice(0, 120));
  }
}

console.info(`Copiloto lendo conversas a cada minuto em ${base}`);
await tick();
setInterval(tick, 60_000);
