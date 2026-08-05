/**
 * GET /api/v1/conversations — list inbox (handler em ./_handler.ts).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { listConversationsQuerySchema } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

import { listConversationsHandler } from "./_handler";

import { MOCK_DEV_CONVERSATIONS } from "@/lib/mock-dev-data";
import { IS_DEMO_MODE } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  if (IS_DEMO_MODE) {
    // Os filtros VALEM na demo. Devolver a lista inteira sempre fazia os chips
    // ("Fila", "Minhas", "Fechadas") parecerem quebrados: clicar não mudava
    // nada, e é justamente a fila que a tela existe para separar.
    const sp = req.nextUrl.searchParams;
    const assignedTo = sp.get("assigned_to");
    const status = sp.get("status");
    const busca = sp.get("search")?.trim().toLowerCase() ?? "";
    const EU_DEMO = "00000000-0000-0000-0000-000000000001";

    const lista = MOCK_DEV_CONVERSATIONS.filter((c) => {
      if (assignedTo === "unassigned" && c.assigned_to_user_id !== null) return false;
      if (assignedTo === "me" && c.assigned_to_user_id !== EU_DEMO) return false;
      if (status && c.status !== status) return false;
      if (busca) {
        const alvo = `${c.contacts?.display_name ?? ""} ${c.contacts?.phone_number ?? ""} ${c.last_message_preview ?? ""}`;
        if (!alvo.toLowerCase().includes(busca)) return false;
      }
      return true;
    });

    return ok(lista, { requestId, meta: { cursor: null, has_more: false } });
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return fail("unauthenticated", "Auth required.", 401, { requestId });
  }

  const authUser = await loadAuthUser();
  const activeOrg = authUser ? await resolveActiveOrg(authUser) : null;
  if (!activeOrg) {
    return fail("no_active_org", "No active organization.", 403, { requestId });
  }

  const url = new URL(req.url);
  const qsParsed = listConversationsQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    assigned_to: url.searchParams.get("assigned_to") ?? undefined,
    channel_session_id: url.searchParams.get("channel_session_id") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!qsParsed.success) {
    return fail("validation_failed", "Query inválida.", 422, {
      details: qsParsed.error.flatten().fieldErrors as Record<string, unknown>,
      requestId,
    });
  }

  try {
    const { conversations, cursor, has_more } = await listConversationsHandler(
      supabase,
      {
        organization_id: activeOrg.orgId,
        actor: { type: "user", id: user.id },
        requestId,
      },
      qsParsed.data,
    );
    return ok(conversations, { requestId, meta: { cursor, has_more } });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    throw err;
  }
}
