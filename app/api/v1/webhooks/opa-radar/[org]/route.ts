/**
 * POST /api/v1/webhooks/opa-radar/:org[?avisar=1]
 *
 * O OPA Radar (coletor radar-ilhabela, `npm run distribuicao -- --enviei ...`) manda o
 * registro das distribuições (material/distribuicoes/registro.json) e as enviadas
 * viram cards em Captações do Radar, com o dono = corretor que recebeu. Mesma regra
 * do botão "Importar do Radar": idempotente, o que já existe só atualiza o anúncio.
 * `avisar=1` liga o aviso de chegada pelo OPA Lembretes (sem ele, o e-mail já foi).
 *
 * Auth: `Authorization: Bearer <chave do Radar>` (Conexões > OPA Radar, migration
 * 0131), comparada em tempo constante com a da org do caminho (slug).
 */
import type { NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { carregarEquipe } from "@/lib/opa/dados";
import { lerRegistroRadar } from "@/lib/opa/radar-captacoes";
import { importarDistribuicoes } from "@/lib/opa/radar-captacoes-dados";
import { lerCorpoLimitado, mesmoSegredo, tokenDoRadar } from "@/lib/opa/segredos";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/** O registro de hoje tem uns 40 KB e só cresce (nada se apaga nele). */
const LIMITE = 5 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ org: string }> }): Promise<Response> {
  const { org } = await params;
  const admin = createAdminClient();
  const { data } = await admin.from("organizations").select("id").eq("slug", org).maybeSingle();
  const linha = data as { id: string } | null;
  const token = linha ? ((await tokenDoRadar(admin, linha.id)) ?? "") : "";
  const auth = req.headers.get("authorization") ?? "";
  const enviado = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  if (!linha || !mesmoSegredo(token, enviado)) return fail("forbidden", "Chave do Radar inválida.", 403);

  const texto = await lerCorpoLimitado(req, LIMITE);
  if (texto === null) return fail("payload_too_large", "Registro maior que 5 MB.", 413);
  let distribuicoes;
  try {
    distribuicoes = lerRegistroRadar(JSON.parse(texto), { avisarChegada: req.nextUrl.searchParams.get("avisar") === "1" });
  } catch (e) {
    return fail("validation_failed", e instanceof SyntaxError ? "O corpo não é JSON." : e instanceof Error ? e.message : "Registro inválido.", 422);
  }

  const equipe = [...(await carregarEquipe(linha.id)).values()].map((p) => ({ id: p.id, nome: p.nome }));
  try {
    const r = await importarDistribuicoes(admin, linha.id, distribuicoes, equipe, null);
    return ok({ enviadas: distribuicoes.length, novos: r.novos, atualizados: r.atualizados, sem_corretor: r.semCorretor });
  } catch (e) {
    console.error("[opa-radar] importação", e instanceof Error ? e.message : e);
    return fail("internal_error", "Não deu para importar agora.", 500);
  }
}
