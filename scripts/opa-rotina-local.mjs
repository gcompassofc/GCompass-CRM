/**
 * Rotina local do CRM da OPA: chama o cron do copiloto a cada minuto, como o
 * cron do servidor faz em produção (vercel.ts / crontab do kit self-host).
 * Sem ela, no localhost a IA só relê a conversa quando alguém abre a ficha.
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

async function tick() {
  try {
    const r = await fetch(`${base}/api/v1/cron/opa-copiloto`, {
      headers: { Authorization: `Bearer ${segredo}` },
    });
    const corpo = await r.json().catch(() => ({}));
    const n = corpo?.data?.analisados ?? 0;
    if (!r.ok || n > 0) console.log(new Date().toLocaleTimeString("pt-BR"), r.status, JSON.stringify(corpo.data ?? corpo));
  } catch (e) {
    console.log(new Date().toLocaleTimeString("pt-BR"), "sem resposta do app:", String(e).slice(0, 120));
  }
}

console.log(`Copiloto lendo conversas a cada minuto em ${base}`);
await tick();
setInterval(tick, 60_000);
