/**
 * GET/POST /api/v1/cron/opa-lembretes
 *
 * Rotina de lembretes do CRM da OPA, de minuto em minuto: manda os lembretes
 * agendados que venceram, avisa o corretor quando o lead espera resposta, passa
 * o lead para o próximo da roleta no fim do prazo e avisa negócio parado.
 * Tudo sai do número OPA Lembretes para a equipe (lib/opa/rotina-lembretes.ts).
 *
 * De carona (0124, 02/11/2026): apaga a conversa guardada de contato a classificar
 * do WhatsApp do corretor que passou de 7 dias sem decisão. Um DELETE pelo índice,
 * sem mexer no agendador.
 *
 * Auth: igual às outras rotinas de cron, `Authorization: Bearer <INTERNAL_CRON_SECRET>`
 * (ou `<INTERNAL_SECRET>`), também aceito em `X-Cron-Secret`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { apagarRegistroVelhoDoAssistente } from "@/lib/opa/assistente";
import { rodarRotinaLembretes } from "@/lib/opa/rotina-lembretes";
import { mesmoSegredo } from "@/lib/opa/segredos";
import { createAdminClient } from "@/lib/supabase/admin";
import { apagarEsperaVencida, conciliarEtiquetasDosNumeros } from "@/lib/waha/contatos-pessoais";

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
    const admin = createAdminClient();
    const resultado = await rodarRotinaLembretes(admin);
    // Falha aqui não derruba os lembretes: a próxima rodada tenta de novo.
    const esperaApagadas = await apagarEsperaVencida(admin).catch((e: unknown) => {
      logger.warn("[opa-lembretes.cron] limpeza das mensagens em espera falhou", { error: String(e), requestId });
      return 0;
    });
    // De carona (10/11/2026): o registro do assistente some depois de 30 dias.
    await apagarRegistroVelhoDoAssistente(admin).catch((e: unknown) => {
      logger.warn("[opa-lembretes.cron] limpeza do registro do assistente falhou", { error: String(e), requestId });
    });
    // A cada 5 minutos: etiquetas que estão no aparelho e o CRM ainda não sabe.
    const etiquetasConciliadas =
      new Date().getMinutes() % 5 === 0
        ? await conciliarEtiquetasDosNumeros(admin, requestId).catch((e: unknown) => {
            logger.warn("[opa-lembretes.cron] conciliar etiquetas falhou", { error: String(e), requestId });
            return 0;
          })
        : 0;
    return ok({ ...resultado, esperaApagadas, etiquetasConciliadas }, { requestId });
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
