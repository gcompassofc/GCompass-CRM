/**
 * Importa as distribuições ENVIADAS do OPA Radar para o funil Captação de imóvel
 * (Captações do Radar, 09/11/2026). Idempotente: o que já existe só atualiza os
 * dados do anúncio. Em produção, o gestor faz o mesmo pela tela Captações do Radar
 * ("Importar do Radar"); este script serve ao CRM local.
 *
 *   npx tsx scripts/opa-importar-radar.ts "D:/1. OPA/radar-ilhabela/material/distribuicoes/registro.json" [--avisar]
 *
 * --avisar: o OPA Lembretes manda o aviso de chegada (sem ele, entende que o
 * corretor já foi avisado por e-mail, como D1 a D30).
 */
import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

import { lerRegistroRadar } from "../lib/opa/radar-captacoes";
import { importarDistribuicoes } from "../lib/opa/radar-captacoes-dados";

const envFile = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
const env: Record<string, string> = {};
for (const line of envFile.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]!] = m[2]!.replace(/^"(.*)"$/, "$1");
}
const host = new URL(env.NEXT_PUBLIC_SUPABASE_URL!).hostname;
if (!["localhost", "127.0.0.1", "host.docker.internal"].includes(host)) {
  console.error(`Recusado: ${host} não é o Supabase local. Em produção, importe pela tela Captações do Radar.`);
  process.exit(1);
}
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

const arquivo = process.argv[2];
if (!arquivo) {
  console.error("Uso: npx tsx scripts/opa-importar-radar.ts <registro.json> [--avisar]");
  process.exit(1);
}
const avisar = process.argv.includes("--avisar");

async function main() {
  const dists = lerRegistroRadar(JSON.parse(fs.readFileSync(arquivo, "utf8")), { avisarChegada: avisar });
  const { data: org } = await admin.from("organizations").select("id").eq("slug", "opa").single();
  const orgId = (org as { id: string }).id;
  const { data: membros } = await admin.from("user_organizations").select("user_id").eq("organization_id", orgId).is("revoked_at", null);
  const ids = new Set(((membros ?? []) as Array<{ user_id: string }>).map((m) => m.user_id));
  const { data: lista } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const equipe = (lista?.users ?? [])
    .filter((u) => ids.has(u.id))
    .map((u) => ({ id: u.id, nome: (u.user_metadata?.full_name as string | undefined) ?? u.email ?? "" }));
  const r = await importarDistribuicoes(admin, orgId, dists, equipe, null);
  console.info(`Radar: ${dists.length} enviadas no registro; ${r.novos} novas, ${r.atualizados} atualizadas.`);
  if (r.semCorretor.length) console.warn(`Sem corretor na equipe: ${r.semCorretor.join(", ")}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
