/**
 * GET/POST /api/v1/cron/opa-relatorio-mensal
 *
 * Relatório mensal da OPA por e-mail para gestores e administradores, sobre o mês
 * anterior (lib/opa/relatorio-mensal.ts). ESTRUTURA PRONTA E DESLIGADA: sem
 * OPA_RELATORIO_MENSAL=on a rota responde e não envia nada, e ela não está no
 * agendador do docker-compose (decisão do Allyson, 01/11/2026).
 *
 * Para ligar: OPA_RELATORIO_MENSAL=on no .env e uma linha no agendador para o
 * dia 1 às 8h (docs/EMAILS-OPA.md). `?previa=1` monta o relatório e devolve os
 * números sem mandar e-mail, mesmo desligado, para conferir antes.
 *
 * Auth: igual às outras rotinas, `Authorization: Bearer <INTERNAL_CRON_SECRET>`
 * (ou `<INTERNAL_SECRET>`), também aceito em `X-Cron-Secret`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { sendEmail } from "@/lib/email/resend";
import { buildRelatorioMensalEmail } from "@/lib/email/templates/relatorio-mensal";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { carregarDadosDoMes, destinatariosDoRelatorio, mesAnterior, montarRelatorio } from "@/lib/opa/relatorio-mensal";
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

  const previa = req.nextUrl.searchParams.get("previa") === "1";
  if (!previa && env.OPA_RELATORIO_MENSAL !== "on") {
    return ok({ ligado: false, enviados: 0 }, { requestId });
  }

  try {
    const admin = createAdminClient();
    const { data: org, error } = await admin.from("organizations").select("id").eq("slug", "opa").maybeSingle();
    if (error) throw new Error(error.message);
    if (!org) return ok({ ligado: true, enviados: 0, motivo: "sem_empresa_opa" }, { requestId });
    const orgId = (org as { id: string }).id;

    const relatorio = montarRelatorio(await carregarDadosDoMes(admin, orgId, mesAnterior(Date.now())));
    if (previa) return ok({ ligado: env.OPA_RELATORIO_MENSAL === "on", relatorio }, { requestId });

    const email = buildRelatorioMensalEmail(relatorio, env.NEXT_PUBLIC_APP_URL);
    const para = await destinatariosDoRelatorio(admin, orgId);
    let enviados = 0;
    for (const destino of para) {
      const r = await sendEmail({ to: destino, ...email, tags: [{ name: "kind", value: "relatorio_mensal" }] });
      if (r.ok) enviados++;
    }
    return ok({ ligado: true, mes: relatorio.mes, destinatarios: para.length, enviados }, { requestId });
  } catch (err) {
    logger.error("[opa-relatorio-mensal.cron] falha", { error: String(err), requestId });
    return fail("internal_error", "Falha no relatório mensal.", 500, { requestId });
  }
}

export const GET = handle;
export const POST = handle;
