/**
 * GET/POST /api/v1/cron/opa-copiloto
 *
 * O CRM da OPA lendo as conversas sem ninguém abrir a ficha: a cada tick pega
 * as conversas com mensagem nova desde a última leitura do copiloto e roda a
 * análise (Claude, ou regras sem chave). Até 20 leads por tick.
 *
 * Auth: igual às outras rotinas de cron, `Authorization: Bearer <INTERNAL_CRON_SECRET>`
 * (ou `<INTERNAL_SECRET>`), também aceito em `X-Cron-Secret`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { analisarLead } from "@/lib/opa/analisar";
import { mesmoSegredo } from "@/lib/opa/segredos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const POR_TICK = 20;
const JANELA_HORAS = 48;

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const provided = bearer || (req.headers.get("x-cron-secret")?.trim() ?? "");
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean) as string[];
  if (!accepted.some((a) => mesmoSegredo(a, provided))) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  const admin = createAdminClient();
  const desde = new Date(Date.now() - JANELA_HORAS * 3_600_000).toISOString();
  const { data: conversas, error } = await admin
    .from("conversations")
    .select("organization_id, contact_id, last_message_at")
    .gte("last_message_at", desde)
    .eq("is_group", false)
    .order("last_message_at", { ascending: false })
    .limit(500);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const ultimaPorContato = new Map<string, { org: string; em: number }>();
  for (const c of (conversas ?? []) as Array<{ organization_id: string; contact_id: string; last_message_at: string }>) {
    if (!ultimaPorContato.has(c.contact_id)) {
      ultimaPorContato.set(c.contact_id, { org: c.organization_id, em: Date.parse(c.last_message_at) });
    }
  }
  if (ultimaPorContato.size === 0) return ok({ analisados: 0 }, { requestId });

  const { data: leads } = await admin
    .from("crm_leads")
    .select("id, organization_id, contact_id, custom_fields")
    .eq("status", "open")
    .in("contact_id", [...ultimaPorContato.keys()]);

  const pendentes = ((leads ?? []) as Array<{
    id: string;
    organization_id: string;
    contact_id: string;
    custom_fields: { copiloto?: { analisado_em?: string } } | null;
  }>)
    .filter((l) => {
      const ultima = ultimaPorContato.get(l.contact_id);
      if (!ultima || ultima.org !== l.organization_id) return false;
      const lido = Date.parse(l.custom_fields?.copiloto?.analisado_em ?? "") || 0;
      return ultima.em > lido;
    })
    .slice(0, POR_TICK);

  let analisados = 0;
  for (const l of pendentes) {
    try {
      await analisarLead(admin, l.organization_id, l.id);
      analisados++;
    } catch (err) {
      logger.warn("[opa-copiloto.cron] falha num lead", { leadId: l.id, error: String(err), requestId });
    }
  }
  return ok({ analisados, fila: pendentes.length }, { requestId });
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
