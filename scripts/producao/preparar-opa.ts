/**
 * Prepara a OPA no banco de PRODUÇÃO: empresa, os três funis com as etapas,
 * token da porta de entrada, configuração, imóveis do site e o convite do
 * primeiro administrador.
 *
 * Diferente do seed de demonstração: nunca apaga nada e pode rodar de novo.
 * Só cria o que falta; imóvel que já existe é atualizado pelo código, sem
 * mexer no captador.
 *
 * Uso (na raiz do repositório):
 *   npx tsx scripts/producao/preparar-opa.ts \
 *     --env .env.producao \
 *     --confirmar <ref-do-projeto>.supabase.co \
 *     [--imoveis "D:/1. OPA/1. SITE/dados/imoveis.json"] \
 *     [--admin allyson@...]
 *
 * --confirmar repete o host do Supabase do arquivo: trava contra rodar no banco errado.
 * --admin imprime o link de convite (24 h) para essa pessoa criar a senha.
 */
import { createClient } from "@supabase/supabase-js";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

import {
  DOMINIOS_IMOVEL,
  ETAPAS_FINAIS,
  FUNIS,
  TRAVADAS,
  VOCABULARIO,
  linhaDeImovel,
  type ImovelJson,
} from "../../lib/opa/estrutura";
import { PADRAO } from "../../lib/opa/config";

function arg(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function sair(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const arquivoEnv = arg("env") ?? ".env.producao";
if (!fs.existsSync(arquivoEnv)) sair(`Não achei ${arquivoEnv}. Gere com scripts/producao/gerar-segredos.mjs.`);
const env: Record<string, string> = {};
for (const linha of fs.readFileSync(path.resolve(arquivoEnv), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]!] = m[2]!.replace(/^['"](.*)['"]$/, "$1");
}

const url = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const host = url ? new URL(url).hostname : "";
if (!host || !env.SUPABASE_SERVICE_ROLE_KEY) sair("Faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no arquivo.");
if (arg("confirmar") !== host) sair(`Confirme o banco: rode com --confirmar ${host}`);

const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

async function q<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, oQue: string): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`${oQue}: ${error.message}`);
  return data;
}

async function main() {
  // Empresa
  let org = (await q(admin.from("organizations").select("id, settings").eq("slug", "opa").maybeSingle(), "org")) as
    | { id: string; settings: Record<string, unknown> | null }
    | null;
  let nova = false;
  let adotada = false;
  if (!org) {
    // O instalador da VPS (hostgator-setup-kit/install.sh) cria a empresa
    // "minha-empresa" com o primeiro administrador. Ainda vazia, ela vira a OPA.
    const doInstalador = (await q(
      admin.from("organizations").select("id, settings").eq("slug", "minha-empresa").maybeSingle(),
      "org do instalador",
    )) as { id: string; settings: Record<string, unknown> | null } | null;
    if (doInstalador) {
      const { count } = await admin.from("crm_leads").select("id", { count: "exact", head: true }).eq("organization_id", doInstalador.id);
      if (!count) {
        await q(
          admin
            .from("organizations")
            .update({
              slug: "opa",
              legal_name: "M.H da Silva Filho Arquitetura e Imobiliária",
              display_name: "OPA Imóveis Ilhabela",
              onboarded_at: new Date().toISOString(),
              onboarding_state: { completed: true },
            })
            .eq("id", doInstalador.id),
          "adotar org do instalador",
        );
        org = doInstalador;
        adotada = true;
        console.info("A empresa criada pelo instalador virou a OPA (o administrador dela continua).");
      }
    }
  }
  if (!org) {
    org = (await q(
      admin
        .from("organizations")
        .insert({
          slug: "opa",
          legal_name: "M.H da Silva Filho Arquitetura e Imobiliária",
          display_name: "OPA Imóveis Ilhabela",
          onboarded_at: new Date().toISOString(),
          onboarding_state: { completed: true },
        })
        .select("id, settings")
        .single(),
      "criar org",
    )) as { id: string; settings: Record<string, unknown> | null };
    nova = true;
  }
  const orgId = org.id;
  if (nova) console.info("Empresa OPA criada.");
  else if (!adotada) console.info("Empresa OPA já existia.");

  // Funis: a base cria um padrão junto com a empresa; sai se estiver vazio.
  const funis = (await q(admin.from("crm_pipelines").select("id, slug").eq("organization_id", orgId), "funis")) as Array<{
    id: string;
    slug: string;
  }>;
  const nossos = new Set<string>(FUNIS.map((f) => f.slug));
  for (const f of funis.filter((x) => !nossos.has(x.slug))) {
    const { count } = await admin.from("crm_leads").select("id", { count: "exact", head: true }).eq("pipeline_id", f.id);
    if (!count) {
      await q(admin.from("crm_stages").delete().eq("pipeline_id", f.id), "etapas do funil padrão");
      await q(admin.from("crm_pipelines").delete().eq("id", f.id), "funil padrão");
      console.info(`Funil padrão da base removido (${f.slug}, sem leads).`);
    }
  }
  let pos = 1000;
  for (const f of FUNIS) {
    if (funis.some((x) => x.slug === f.slug)) {
      console.info(`Funil ${f.nome}: já existe.`);
      pos += 1000;
      continue;
    }
    const p = (await q(
      admin
        .from("crm_pipelines")
        .insert({ organization_id: orgId, name: f.nome, slug: f.slug, is_default: f.padrao, position: pos, vocabulary: VOCABULARIO })
        .select("id")
        .single(),
      `funil ${f.slug}`,
    )) as { id: string };
    pos += 1000;
    const etapas = [...f.etapas, ...(f.slug === "compradores" ? ETAPAS_FINAIS : [])];
    await q(
      admin.from("crm_stages").insert(
        etapas.map(([slug, nome, cor, horas], i) => ({
          organization_id: orgId,
          pipeline_id: p.id,
          name: nome,
          slug,
          color: cor,
          position: (i + 1) * 1000,
          expected_duration_hours: horas,
          is_won: slug === "vendido",
          is_lost: slug === "perdido",
          campos_obrigatorios: TRAVADAS.has(slug) ? ["finalidade", "regiao", "momento", "inegociavel"] : [],
          evento_meta: f.slug === "compradores" ? (PADRAO.meta_eventos.find((m) => m.etapa === slug)?.evento ?? null) : null,
        })),
      ),
      `etapas ${f.slug}`,
    );
    console.info(`Funil ${f.nome}: criado com ${etapas.length} etapas.`);
  }

  // Token da porta de entrada (site e formulários). Fica em opa_segredos; a
  // tela Conexões mostra para o administrador. Não é impresso aqui.
  const segredo = await q(admin.from("opa_segredos").select("organization_id").eq("organization_id", orgId).maybeSingle(), "segredo");
  if (!segredo) {
    await q(
      admin.from("opa_segredos").insert({ organization_id: orgId, entrada_token: randomBytes(32).toString("base64url") }),
      "token de entrada",
    );
    console.info("Token da porta de entrada criado (veja em Conexões).");
  }

  // Configuração: só o que falta. Corretor vê só os leads dele.
  const settings = (org.settings ?? {}) as Record<string, unknown>;
  const opa = (settings.opa ?? {}) as Record<string, unknown>;
  const faltando: Record<string, unknown> = {};
  if (!("roleta" in opa)) faltando.roleta = [];
  if (!("roleta_pausados" in opa)) faltando.roleta_pausados = [];
  if (!("dominios_imovel" in opa)) faltando.dominios_imovel = DOMINIOS_IMOVEL;
  // Decisão do Allyson (30/10/2026): o gerente vê receita, comissão e integrações.
  if (!("gerente_ve_receita" in opa)) faltando.gerente_ve_receita = true;
  if (Object.keys(faltando).length) {
    const { error } = await admin.rpc("fn_opa_mesclar_config", { p_org: orgId, p_parcial: faltando });
    if (error) throw new Error(`configuração: ${error.message}`);
  }
  if (settings.visibility_mode !== "own") {
    const { data: atual } = await admin.from("organizations").select("settings").eq("id", orgId).single();
    const s = ((atual as { settings: Record<string, unknown> | null }).settings ?? {}) as Record<string, unknown>;
    await q(admin.from("organizations").update({ settings: { ...s, visibility_mode: "own" } }).eq("id", orgId), "visibilidade");
  }

  // Imóveis do site
  const arquivoImoveis = arg("imoveis");
  if (arquivoImoveis) {
    const brutos = JSON.parse(fs.readFileSync(arquivoImoveis, "utf8")) as ImovelJson[];
    const linhas = brutos.map((i) => {
      const { captador_user_id: _semCaptador, ...linha } = linhaDeImovel(i, orgId);
      return linha;
    });
    for (let i = 0; i < linhas.length; i += 200) {
      await q(admin.from("imoveis").upsert(linhas.slice(i, i + 200), { onConflict: "organization_id,codigo" }), "imóveis");
    }
    console.info(`Imóveis: ${linhas.length} gravados ou atualizados.`);
  }

  // Convite do primeiro administrador
  const emailAdmin = arg("admin")?.trim().toLowerCase();
  if (emailAdmin) {
    const chave = env.INVITE_TOKEN_SECRET || env.INTERNAL_SECRET;
    if (!chave) sair("Sem INVITE_TOKEN_SECRET nem INTERNAL_SECRET no arquivo: o convite não teria assinatura.");
    const payload = {
      invite_id: randomUUID(),
      email: emailAdmin,
      organization_id: orgId,
      role: "admin",
      exp: Math.floor(Date.now() / 1000) + 24 * 3600,
    };
    const corpo = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const assinatura = createHmac("sha256", chave).update(corpo).digest("base64url");
    const base = (env.NEXT_PUBLIC_APP_URL ?? "").replace(/\/$/, "");
    console.info(`\nConvite de administrador para ${emailAdmin} (vale 24 h, abra no navegador):`);
    console.info(`${base}/team/accept-invite/${corpo}.${assinatura}\n`);
  }

  const { count: imoveis } = await admin.from("imoveis").select("id", { count: "exact", head: true }).eq("organization_id", orgId);
  console.info(`Pronto. Imóveis na base: ${imoveis ?? 0}.`);
}

main().catch((e) => sair(e instanceof Error ? e.message : String(e)));
