/**
 * Regra da remoção de membro (OPA, 07/11/2026). A ação da tela
 * (app/app/membros/actions.ts) confere quem pede; aqui fica o que acontece:
 * leads e conversas passam ao novo dono, a pessoa sai das roletas, o WhatsApp
 * dela é desconectado e arquivado (opcional) e o acesso sai por revoked_at.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { audit } from "@/lib/audit";
import { CHANNEL_PROVIDER_WAHA } from "@/lib/channels/capabilities";
import { carregarConfig, salvarConfig } from "@/lib/opa/config";
import { getWahaClient } from "@/lib/waha/client";

export type ResultadoRemocao = { ok: true; aviso?: string; leadsMovidos: number } | { ok: false; erro: string };

export async function executarRemocao(
  admin: SupabaseClient,
  p: { orgId: string; atorId: string; alvo: string; destino: string; desconectar: boolean },
): Promise<ResultadoRemocao> {
  const { orgId, alvo, destino, desconectar } = p;
  const user = { id: p.atorId };
  if (!alvo) return { ok: false, erro: "Escolha quem sai." };
  if (alvo === user.id) return { ok: false, erro: "Você não pode remover a si mesmo." };
  const { data: membros } = await admin.from("user_organizations").select("id, user_id, role").eq("organization_id", orgId).is("revoked_at", null);
  const lista = (membros ?? []) as Array<{ id: string; user_id: string; role: string }>;
  const quem = lista.find((m) => m.user_id === alvo);
  if (!quem) return { ok: false, erro: "Essa pessoa já não está na equipe." };
  if (quem.role === "admin" && lista.filter((m) => m.role === "admin").length <= 1) {
    return { ok: false, erro: "Não dá para remover o último administrador." };
  }

  const { count: abertos } = await admin
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("owner_user_id", alvo)
    .eq("status", "open");
  const novoDono = lista.find((m) => m.user_id === destino && m.user_id !== alvo && m.role !== "viewer");
  if ((abertos ?? 0) > 0 && !novoDono) return { ok: false, erro: "Escolha quem fica com os leads abertos dessa pessoa." };

  const agora = new Date().toISOString();
  let avisos: string[] = [];
  let movidosTotal = 0;

  // 1. Leads abertos e conversas passam para o novo dono.
  if (novoDono && (abertos ?? 0) > 0) {
    const { data: movidos, error } = await admin
      .from("crm_leads")
      .update({ owner_user_id: novoDono.user_id, owner_kind: "user", assigned_at: agora, last_activity_at: agora })
      .eq("organization_id", orgId)
      .eq("owner_user_id", alvo)
      .eq("status", "open")
      .select("id, contact_id");
    if (error) return { ok: false, erro: "Não consegui passar os leads. Nada foi removido; tente de novo." };
    const linhas = (movidos ?? []) as Array<{ id: string; contact_id: string | null }>;
    movidosTotal = linhas.length;
    if (linhas.length) {
      await admin.from("crm_lead_activities").insert(
        linhas.map((l) => ({
          organization_id: orgId,
          lead_id: l.id,
          contact_id: l.contact_id,
          source_module: "opa",
          type: "dono_trocado",
          payload: { de: alvo, para: novoDono.user_id, motivo: "membro_removido" },
          performed_at: agora,
          performed_by_user_id: user.id,
          actor_kind: "user",
          reason: "O corretor saiu da equipe e o lead passou para outro.",
        })),
      );
    }
  }
  if (novoDono) {
    await admin
      .from("conversations")
      .update({ assigned_to_user_id: novoDono.user_id })
      .eq("organization_id", orgId)
      .eq("assigned_to_user_id", alvo);
  }

  // 2. Sai das roletas.
  const config = await carregarConfig(admin, orgId);
  const tirar = (ids: string[]) => ids.filter((id) => id !== alvo);
  const assinaturas = { ...config.boas_vindas.assinaturas };
  delete assinaturas[alvo];
  const modelos = { ...(config.boas_vindas.modelos ?? {}) };
  delete modelos[alvo];
  await salvarConfig(admin, orgId, {
    roleta: tirar(config.roleta),
    roleta_pausados: tirar(config.roleta_pausados),
    roleta_ultimo: config.roleta_ultimo === alvo ? null : config.roleta_ultimo,
    captacao: { ...config.captacao, ordem: tirar(config.captacao.ordem) },
    boas_vindas: { ...config.boas_vindas, assinaturas, modelos },
  });

  // 3. WhatsApp pessoal desconectado e arquivado (o histórico fica).
  if (desconectar) {
    const { data: sessoes } = await admin
      .from("channel_sessions")
      .select("id, provider, waha_session_name")
      .eq("organization_id", orgId)
      .eq("owner_user_id", alvo)
      .is("archived_at", null);
    for (const s of (sessoes ?? []) as Array<{ id: string; provider: string; waha_session_name: string | null }>) {
      if (s.provider === CHANNEL_PROVIDER_WAHA && s.waha_session_name) {
        const waha = getWahaClient();
        try {
          if (!waha) throw new Error("sem WAHA");
          await waha.logoutSession(s.waha_session_name);
          await waha.deleteSession(s.waha_session_name);
        } catch {
          avisos.push("O WhatsApp da pessoa não respondeu ao desconectar: confira em Conexões e, se precisar, saia pelo celular em Aparelhos conectados.");
        }
      }
      await admin
        .from("channel_sessions")
        .update({ archived_at: agora, status: "STOPPED", last_status_change_at: agora })
        .eq("organization_id", orgId)
        .eq("id", s.id);
    }
  }

  // 4. O acesso sai.
  const { error: erroRevogar } = await admin
    .from("user_organizations")
    .update({ revoked_at: agora, updated_at: agora })
    .eq("id", quem.id)
    .is("revoked_at", null);
  if (erroRevogar) return { ok: false, erro: "Os leads já passaram, mas o acesso não saiu. Tente remover de novo." };

  await audit({
    action: "member.revoked",
    actorUserId: user.id,
    organizationId: orgId,
    resourceType: "membership",
    resourceId: quem.id,
    requestId: `membros:remover:${alvo}`,
    metadata: { target_user_id: alvo, revoked_role: quem.role, leads_para: novoDono?.user_id ?? null, leads: abertos ?? 0, whatsapp_desconectado: desconectar },
  });

  avisos = [...new Set(avisos)];
  return { ok: true, aviso: avisos[0], leadsMovidos: movidosTotal };
}
