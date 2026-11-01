/**
 * GET/POST /api/v1/cron/opa-lembretes
 *
 * Rotina de lembretes do CRM da OPA, de minuto em minuto: manda os lembretes
 * agendados que venceram, avisa o corretor quando o lead espera resposta, passa
 * o lead para o próximo da roleta no fim do prazo e avisa negócio parado.
 * Tudo sai do número OPA Lembretes para a equipe (lib/opa/rotina-lembretes.ts).
 *
 * Auth: igual às outras rotinas de cron, `Authorization: Bearer <INTERNAL_CRON_SECRET>`
 * (ou `<INTERNAL_SECRET>`), também aceito em `X-Cron-Secret`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { rodarRotinaLembretes } from "@/lib/opa/rotina-lembretes";
import { mesmoSegredo } from "@/lib/opa/segredos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const auth = req.headers.get("authorization") ?? "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const provided = bearer || (req.headers.get("x-cron-secret")?.trim() ?? "");
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean) as string[];
  if (!accepted.some((a) => mesmoSegredo(a, provided))) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  try {
    const resultado = await rodarRotinaLembretes(createAdminClient());
    return ok(resultado, { requestId });
  } catch (err) {
    logger.error("[opa-lembretes.cron] falha", { error: String(err), requestId });
    return fail("internal_error", "Falha na rotina de lembretes.", 500, { requestId });
  }
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}
