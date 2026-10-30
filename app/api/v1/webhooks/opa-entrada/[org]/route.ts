/**
 * POST /api/v1/webhooks/opa-entrada/:org
 *
 * Entrada de lead da OPA (site, formulário do Meta pelo n8n na transição, link
 * da bio). Aplica a regra "lead que já tem dono não passa pela roleta" de
 * lib/opa/entrada.ts.
 *
 * Auth: `Authorization: Bearer <token>`, comparado em tempo constante com o
 * token da org do caminho (slug), guardado em `opa_segredos` (só o servidor lê).
 *
 * Idempotente: o mesmo telefone chegando várias vezes ao mesmo tempo (n8n e Meta
 * reenviam em erro) vira um lead só e todas as chamadas respondem 200.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { registrarEntrada } from "@/lib/opa/entrada";
import { lerCorpoLimitado, mesmoSegredo, tokenDeEntrada } from "@/lib/opa/segredos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const corpo = z.object({
  nome: z.string().trim().min(1).max(120),
  // 10 a 13 dígitos depois de tirar a máscara: lixo não vira contato "+55".
  telefone: z
    .string()
    .trim()
    .max(30)
    .refine((t) => /^\d{10,13}$/.test(t.replace(/\D/g, "")), "Telefone com DDD (10 a 13 dígitos)."),
  email: z.string().email().max(200).nullish(),
  imovel_codigo: z.string().trim().max(30).nullish(),
  origem: z.enum(["meta", "site", "whatsapp", "linkbio", "indicacao"]),
  campanha: z.string().max(300).nullish(),
  conjunto: z.string().max(300).nullish(),
  anuncio: z.string().max(300).nullish(),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ org: string }> }): Promise<Response> {
  const { org } = await params;
  const admin = createAdminClient();
  const { data } = await admin.from("organizations").select("id").eq("slug", org).maybeSingle();
  const linha = data as { id: string } | null;
  const token = linha ? ((await tokenDeEntrada(admin, linha.id)) ?? "") : "";
  const auth = req.headers.get("authorization") ?? "";
  const enviado = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!linha || !mesmoSegredo(token, enviado)) {
    return fail("forbidden", "Token inválido.", 403);
  }

  const texto = await lerCorpoLimitado(req);
  if (texto === null) return fail("payload_too_large", "Corpo maior que 32 KB.", 413);
  let json: unknown = null;
  try {
    json = JSON.parse(texto);
  } catch {
    json = null;
  }
  const lido = corpo.safeParse(json);
  if (!lido.success) return fail("validation_error", lido.error.issues[0]?.message ?? "Corpo inválido.", 422);

  const b = lido.data;
  const entrada = {
    nome: b.nome,
    telefone: b.telefone,
    email: b.email,
    imovelCodigo: b.imovel_codigo,
    origem: b.origem,
    campanha: b.campanha,
    conjunto: b.conjunto,
    anuncio: b.anuncio,
  };
  // Corrida de entradas iguais: a perdedora bate na constraint única do contato
  // ou do lead. Na segunda tentativa o registro já existe e vira "voltou".
  for (let tentativa = 0; ; tentativa++) {
    try {
      const r = await registrarEntrada(admin, linha.id, entrada);
      // Só o necessário para quem chamou; quem é o dono fica dentro do CRM.
      return ok({ tipo: r.tipo, leadId: r.leadId });
    } catch (e) {
      if (tentativa >= 3) throw e;
      await new Promise((res) => setTimeout(res, 120 * (tentativa + 1)));
    }
  }
}
