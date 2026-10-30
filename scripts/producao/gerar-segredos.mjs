/**
 * Cria (ou completa) o .env.producao a partir do .env.producao.example, gerando
 * todos os segredos marcados [GERADO]. Nunca imprime valor nenhum e nunca troca
 * um segredo que já existe: rodar de novo só preenche o que está vazio.
 *
 * As chaves saem diferentes das do .env.local (são geradas aqui, na hora).
 *
 * Uso (na raiz do repositório):  node scripts/producao/gerar-segredos.mjs [arquivo]
 */
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";

const MODELO = ".env.producao.example";
const DESTINO = process.argv[2] ?? ".env.producao";

const hex = () => randomBytes(32).toString("hex");
const b64 = () => randomBytes(32).toString("base64");

/** Como cada segredo nasce. Os que dependem de outro vêm depois. */
const GERADORES = {
  INTERNAL_SECRET: hex,
  INTERNAL_CRON_SECRET: hex,
  INVITE_TOKEN_SECRET: hex,
  CPF_ENCRYPTION_KEY: b64,
  AI_CRED_AES_KEY: b64,
  WAHA_BYO_ENCRYPTION_KEY: b64,
  NUVEMSHOP_OAUTH_ENCRYPTION_KEY: hex,
  IMPERSONATE_COOKIE_SECRET: hex,
  LGPD_SIGNING_KEY: hex,
  PII_CHAVES: () => `v1:${b64()}`,
  PII_CHAVE_ATUAL: () => "v1",
  PII_CHAVE_INDICE: b64,
  WAHA_API_KEY: hex,
  WAHA_HMAC_SECRET: hex,
  SRH_TOKEN: hex,
};
const DERIVADOS = {
  WAHA_API_KEY_SHA512: (v) => createHash("sha512").update(v.WAHA_API_KEY).digest("hex"),
  UPSTASH_REDIS_REST_TOKEN: (v) => v.SRH_TOKEN,
};

if (!fs.existsSync(MODELO)) {
  console.error(`Rode na raiz do repositório (não achei ${MODELO}).`);
  process.exit(1);
}

const base = fs.existsSync(DESTINO) ? fs.readFileSync(DESTINO, "utf8") : fs.readFileSync(MODELO, "utf8");
const linhas = base.split(/\r?\n/);
const valores = {};
for (const l of linhas) {
  const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) valores[m[1]] = m[2];
}

const gerados = [];
for (const [nome, gerar] of Object.entries(GERADORES)) {
  if (!valores[nome]) {
    valores[nome] = gerar();
    gerados.push(nome);
  }
}
for (const [nome, derivar] of Object.entries(DERIVADOS)) {
  const v = derivar(valores);
  if (valores[nome] !== v) {
    valores[nome] = v;
    gerados.push(nome);
  }
}

const saida = linhas.map((l) => {
  const m = l.match(/^([A-Z0-9_]+)=/);
  return m && m[1] in valores ? `${m[1]}=${valores[m[1]]}` : l;
});
fs.writeFileSync(DESTINO, saida.join("\n"), { mode: 0o600 });

const faltam = Object.entries(valores)
  .filter(([, v]) => v === "")
  .map(([k]) => k);
console.info(gerados.length ? `Gerados em ${DESTINO}: ${gerados.join(", ")}.` : `${DESTINO}: nenhum segredo novo (já estavam todos).`);
console.info(`Ainda vazios (preencher ou deixar vazio de propósito): ${faltam.join(", ") || "nenhum"}.`);
