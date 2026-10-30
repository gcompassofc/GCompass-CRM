/**
 * Preenche as colunas cifradas da migration 0112 (fase 1): nome, telefone e
 * e-mail dos contatos, índice cego de telefone/e-mail e corpo das mensagens.
 * Não apaga o texto puro (isso é a fase 3).
 *
 * Uso:
 *   tsx scripts/cifrar-dados-pessoais.ts              só conta o que falta (não grava)
 *   tsx scripts/cifrar-dados-pessoais.ts --aplicar    grava
 *   tsx scripts/cifrar-dados-pessoais.ts --conferir   decifra uma amostra e compara com o texto puro
 *
 * Também serve para rotação: com PII_CHAVE_ATUAL nova, regrava o que estiver
 * cifrado com chave antiga.
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

import { cifrar, decifrar, indiceEmail, indiceTelefone, precisaRecifrar, recifrar } from "../lib/crypto/dados-pessoais";

const envFile = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
const env: Record<string, string> = {};
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1");
}
for (const k of ["PII_CHAVES", "PII_CHAVE_ATUAL", "PII_CHAVE_INDICE"]) process.env[k] ??= env[k];


const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
const aplicar = process.argv.includes("--aplicar");
const conferir = process.argv.includes("--conferir");
const LOTE = 500;

interface Contato {
  id: string;
  organization_id: string;
  name: string | null;
  phone_number: string | null;
  email: string | null;
  nome_cifrado: string | null;
  telefone_cifrado: string | null;
  email_cifrado: string | null;
}

async function contatos() {
  let feitos = 0;
  let faltam = 0;
  let conferidos = 0;
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await admin
      .from("contacts")
      .select("id, organization_id, name, phone_number, email, nome_cifrado, telefone_cifrado, email_cifrado")
      .order("id")
      .range(de, de + LOTE - 1);
    if (error) throw error;
    const lote = (data ?? []) as Contato[];
    if (!lote.length) break;
    for (const c of lote) {
      const org = c.organization_id;
      if (conferir) {
        const ok =
          (c.nome_cifrado == null || decifrar(c.nome_cifrado, { org, campo: "nome" }) === c.name) &&
          (c.telefone_cifrado == null || decifrar(c.telefone_cifrado, { org, campo: "telefone" }) === c.phone_number) &&
          (c.email_cifrado == null || decifrar(c.email_cifrado, { org, campo: "email" }) === c.email);
        if (!ok) throw new Error(`contato ${c.id}: cifrado não bate com o texto puro`);
        conferidos++;
        continue;
      }
      const pendente =
        (c.name != null && (c.nome_cifrado == null || precisaRecifrar(c.nome_cifrado))) ||
        (c.phone_number != null && (c.telefone_cifrado == null || precisaRecifrar(c.telefone_cifrado))) ||
        (c.email != null && (c.email_cifrado == null || precisaRecifrar(c.email_cifrado)));
      if (!pendente) continue;
      faltam++;
      if (!aplicar) continue;
      const novo = {
        nome_cifrado: c.nome_cifrado ? recifrar(c.nome_cifrado, { org, campo: "nome" }) : cifrar(c.name, { org, campo: "nome" }),
        telefone_cifrado: c.telefone_cifrado
          ? recifrar(c.telefone_cifrado, { org, campo: "telefone" })
          : cifrar(c.phone_number, { org, campo: "telefone" }),
        email_cifrado: c.email_cifrado ? recifrar(c.email_cifrado, { org, campo: "email" }) : cifrar(c.email, { org, campo: "email" }),
        telefone_indice: c.phone_number ? indiceTelefone(org, c.phone_number) : null,
        email_indice: c.email ? indiceEmail(org, c.email) : null,
        cifrado_em: new Date().toISOString(),
      };
      const { error: e } = await admin.from("contacts").update(novo).eq("id", c.id);
      if (e) throw e;
      feitos++;
    }
  }
  return { faltam, feitos, conferidos };
}

async function mensagens() {
  let faltam = 0;
  let feitos = 0;
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await admin
      .from("messages")
      .select("id, organization_id, body, corpo_cifrado")
      .not("body", "is", null)
      .order("id")
      .range(de, de + LOTE - 1);
    if (error) throw error;
    const lote = (data ?? []) as Array<{ id: string; organization_id: string; body: string; corpo_cifrado: string | null }>;
    if (!lote.length) break;
    for (const m of lote) {
      const ctx = { org: m.organization_id, campo: "mensagem" as const };
      if (conferir) {
        if (m.corpo_cifrado && decifrar(m.corpo_cifrado, ctx) !== m.body) throw new Error(`mensagem ${m.id}: não bate`);
        continue;
      }
      if (m.corpo_cifrado && !precisaRecifrar(m.corpo_cifrado)) continue;
      faltam++;
      if (!aplicar) continue;
      const corpo = m.corpo_cifrado ? recifrar(m.corpo_cifrado, ctx) : cifrar(m.body, ctx);
      const { error: e } = await admin.from("messages").update({ corpo_cifrado: corpo }).eq("id", m.id);
      if (e) throw e;
      feitos++;
    }
  }
  return { faltam, feitos };
}

async function main() {
  const c = await contatos();
  const m = await mensagens();
  if (conferir) console.info(`Conferência ok: ${c.conferidos} contatos e as mensagens cifradas batem com o texto puro.`);
  else if (aplicar) console.info(`Cifrados: ${c.feitos} contatos e ${m.feitos} mensagens.`);
  else console.info(`Faltam cifrar: ${c.faltam} contatos e ${m.faltam} mensagens. Rode com --aplicar para gravar.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
