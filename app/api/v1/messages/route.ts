/**
 * POST /api/v1/messages — envia mensagem outbound (handler em ./_handler.ts).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { IS_DEMO_MODE } from "@/lib/demo-mode";
import { sendMessageSchema, validateRequest, type SendMessageInput } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

import { sendMessageHandler } from "./_handler";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  // Na demo a mensagem "sai" mas não viaja: não há transporte para entregá-la.
  // Ela volta com `status: "sent"` para a bolha aparecer na conversa com o
  // tique de enviada — o botão de enviar é a interação central da tela, e um
  // composer que engole o texto faria a demo parecer quebrada.
  // O eco NÃO é persistido: recarregar a página devolve o roteiro fixo.
  if (IS_DEMO_MODE) {
    const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const agora = new Date().toISOString();
    return ok(
      {
        id: `demo-${randomUUID()}`,
        conversation_id: corpo.conversation_id ?? null,
        organization_id: "00000000-0000-0000-0000-000000000002",
        direction: "outbound",
        type: "text",
        status: "sent",
        ack: 1,
        body: typeof corpo.body === "string" ? corpo.body : "",
        media_url: null,
        media_storage_path: null,
        sent_at: agora,
        created_at: agora,
        sent_via: "human",
        metadata: {},
      },
      { requestId },
    );
  }

  const supabase = await createClient();

  // spec 13 §4: escrita é agent+ (viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "messages" });
  if (!authz.ok) return authz.response;
  const user = authz.user;
  const activeOrg = authz.org;

  let input;
  try {
    input = await validateRequest(sendMessageSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  try {
    const message = await sendMessageHandler(
      supabase,
      {
        organization_id: activeOrg.orgId,
        actor: { type: "user", id: user.id },
        requestId,
      },
      input as SendMessageInput,
    );
    return ok(message, { status: 201, requestId });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    throw err;
  }
}
