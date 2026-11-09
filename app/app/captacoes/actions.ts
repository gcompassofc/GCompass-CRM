"use server";

import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { carregarEquipe } from "@/lib/opa/dados";
import { ERROS_RADAR, lerRegistroRadar } from "@/lib/opa/radar-captacoes";
import { importarDistribuicoes } from "@/lib/opa/radar-captacoes-dados";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Resultado = { ok: true; aviso?: string } | { ok: false; erro: string };

/** Até 5 MB: o registro de hoje tem uns 25 KB. */
const LIMITE_BYTES = 5 * 1024 * 1024;

/**
 * Gestor importa o registro do Radar (material/distribuicoes/registro.json). Cada
 * distribuição ENVIADA vira um card de captação do corretor; reimportar só
 * atualiza os dados do anúncio. "avisar" liga o aviso de chegada pelo OPA Lembretes
 * (desligado: o corretor já recebeu por e-mail).
 */
export async function importarDoRadar(formData: FormData): Promise<Resultado> {
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sem organização ativa." };
  const gestor = Boolean(user.is_platform_admin) || org.role === "manager" || org.role === "admin";
  if (!gestor) return { ok: false, erro: "Só a gestão importa do Radar." };

  const arquivo = formData.get("registro");
  if (!(arquivo instanceof File) || arquivo.size === 0) return { ok: false, erro: "Escolha o arquivo registro.json do Radar." };
  if (arquivo.size > LIMITE_BYTES) return { ok: false, erro: "Arquivo grande demais para ser o registro do Radar." };

  let distribuicoes;
  try {
    distribuicoes = lerRegistroRadar(JSON.parse(await arquivo.text()), { avisarChegada: formData.get("avisar") === "on" });
  } catch (e) {
    return { ok: false, erro: e instanceof SyntaxError ? "O arquivo não é um JSON válido." : e instanceof Error ? e.message : "Arquivo inválido." };
  }
  if (distribuicoes.length === 0) return { ok: false, erro: "O registro não tem nenhuma distribuição enviada." };

  const equipe = [...(await carregarEquipe(org.orgId)).values()].map((p) => ({ id: p.id, nome: p.nome }));
  try {
    const r = await importarDistribuicoes(createAdminClient(), org.orgId, distribuicoes, equipe, user.id);
    void audit({
      action: "radar.importado",
      actorUserId: user.id,
      organizationId: org.orgId,
      resourceType: "crm_lead",
      resourceId: null,
      metadata: { novos: r.novos, atualizados: r.atualizados, sem_corretor: r.semCorretor },
    });
    revalidatePath("/app/captacoes");
    const partes = [`${r.novos} ${r.novos === 1 ? "imóvel novo" : "imóveis novos"}`, `${r.atualizados} ${r.atualizados === 1 ? "atualizado" : "atualizados"}`];
    const falta = r.semCorretor.length ? ` Sem corretor na equipe: ${r.semCorretor.join(", ")}.` : "";
    return { ok: true, aviso: `Radar importado: ${partes.join(", ")}.${falta}` };
  } catch (e) {
    console.error("[captacoes/importar]", e);
    return { ok: false, erro: "Não deu para importar agora. Tente de novo." };
  }
}

/**
 * "Algo errado no anúncio": vira uma anotação na ficha (com autor e hora), para a
 * gestão ver. O Radar ainda não lê o CRM. Usa o cliente da sessão: o RLS decide se
 * a pessoa pode mexer neste card.
 */
export async function marcarErroNoAnuncio(formData: FormData): Promise<Resultado> {
  const leadId = String(formData.get("leadId") ?? "");
  const erro = String(formData.get("erro") ?? "");
  const obs = String(formData.get("obs") ?? "").trim().slice(0, 1000);
  if (!(ERROS_RADAR as readonly string[]).includes(erro)) return { ok: false, erro: "Escolha o que está errado." };
  const user = await requireAuth();
  const org = await resolveActiveOrg(user);
  if (!org) return { ok: false, erro: "Sem organização ativa." };
  if (org.role === "viewer") return { ok: false, erro: "Seu acesso é só de leitura." };
  const supabase = await createClient();
  const { data: lead } = await supabase.from("crm_leads").select("id, custom_fields").eq("organization_id", org.orgId).eq("id", leadId).maybeSingle();
  const radar = ((lead as { custom_fields: Record<string, unknown> | null } | null)?.custom_fields?.radar ?? null) as { dist?: string } | null;
  if (!lead || !radar?.dist) return { ok: false, erro: "Card do Radar não encontrado." };
  const agora = new Date().toISOString();
  const { error } = await supabase.from("crm_lead_activities").insert({
    organization_id: org.orgId,
    lead_id: leadId,
    contact_id: null,
    source_module: "opa",
    type: "nota",
    payload: { texto: `Algo errado no anúncio: ${erro}.${obs ? ` ${obs}` : ""}`, radar_erro: erro },
    performed_at: agora,
    performed_by_user_id: user.id,
    actor_kind: "user",
  });
  if (error) return { ok: false, erro: "Não deu para salvar. Tente de novo." };
  await supabase.from("crm_leads").update({ last_activity_at: agora }).eq("organization_id", org.orgId).eq("id", leadId);
  revalidatePath(`/app/leads/${leadId}`);
  revalidatePath("/app/captacoes");
  return { ok: true };
}
