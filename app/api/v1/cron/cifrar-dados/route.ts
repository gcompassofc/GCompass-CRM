/**
 * GET/POST /api/v1/cron/cifrar-dados
 *
 * Fase 2 da cifra dos dados pessoais: a cada tick cifra os contatos e as
 * mensagens que entraram ou mudaram desde o último (lib/crypto/cifrar-pendentes.ts,
 * migration 0116). Sem as chaves PII_* no ambiente, responde `configurada: false`.
 *
 * Auth: igual às outras rotinas de cron, `Authorization: Bearer <INTERNAL_CRON_SECRET>`
 * (ou `<INTERNAL_SECRET>`), também aceito em `X-Cron-Secret`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { cifrarPendentes } from "@/lib/crypto/cifrar-pendentes";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { mesmoSegredo } from "@/lib/opa/segredos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

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
    const r = await cifrarPendentes(createAdminClient());
    if (!r.configurada) logger.warn("[cifrar-dados] chaves PII_* ausentes; nada cifrado", { requestId });
    return ok(r, { requestId });
  } catch (e) {
    logger.error("[cifrar-dados] falhou", { requestId, error: e instanceof Error ? e.message : String(e) });
    return fail("internal_error", "Falha ao cifrar.", 500, { requestId });
  }
}

export const GET = handle;
export const POST = handle;
