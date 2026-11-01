import { randomUUID } from "node:crypto";

import type { createAdminClient } from "@/lib/supabase/admin";

/**
 * Acesso ao banco para o "Meu WhatsApp" do corretor. Fica em `lib` (e não na tela)
 * porque aqui a consulta é pelo DONO da sessão, não um seletor de canais: seletor de
 * canal passa por `listSelectableChannels` (ver tests/unit/canais-selecionaveis).
 * Toda função recebe a org já resolvida do servidor e filtra por ela.
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface SessaoDoDono {
  id: string;
  waha_session_name: string | null;
  display_name: string | null;
  phone_number: string | null;
  status: string;
}

const COLUNAS = "id, waha_session_name, display_name, phone_number, status";

export async function buscarSessaoDoDono(admin: Admin, orgId: string, donoId: string): Promise<SessaoDoDono | null> {
  const { data } = await admin
    .from("channel_sessions")
    .select(COLUNAS)
    .eq("organization_id", orgId)
    .eq("owner_user_id", donoId)
    .is("archived_at", null)
    .maybeSingle();
  return (data as SessaoDoDono | null) ?? null;
}

/** Cria a sessão do corretor. `duplicada: true` quando o índice único barrou (dois cliques ao mesmo tempo). */
export async function criarSessaoDoDono(
  admin: Admin,
  orgId: string,
  donoId: string,
  nome: string,
): Promise<{ sessao: SessaoDoDono | null; duplicada: boolean }> {
  const nomeSessao = `org_${orgId.slice(0, 8)}_${randomUUID().replace(/-/g, "").slice(0, 6)}`;
  const { data, error } = await admin
    .from("channel_sessions")
    .insert({
      organization_id: orgId,
      waha_session_name: nomeSessao,
      display_name: nome,
      engine: "NOWEB",
      webhook_path_token: randomUUID().replace(/-/g, ""),
      webhook_secret_encrypted: "\\x00",
      status: "STARTING",
      last_status_change_at: new Date().toISOString(),
      consecutive_health_fails: 0,
      daily_message_limit: 250,
      metadata: {},
      created_by: donoId,
      owner_user_id: donoId,
    })
    .select(COLUNAS)
    .single();
  if (error?.code === "23505") return { sessao: null, duplicada: true };
  if (error || !data) return { sessao: null, duplicada: false };
  return { sessao: data as SessaoDoDono, duplicada: false };
}

/** Atualiza a sessão (sempre dentro da org). Devolve o código de erro do banco, se houve. */
export async function atualizarSessao(
  admin: Admin,
  orgId: string,
  sessaoId: string,
  patch: Record<string, unknown>,
): Promise<{ codigoErro: string | null }> {
  const { error } = await admin.from("channel_sessions").update(patch).eq("organization_id", orgId).eq("id", sessaoId);
  return { codigoErro: error?.code ?? null };
}

/** Desfaz uma sessão recém-criada que não chegou a subir no WAHA. */
export async function apagarSessaoRecemCriada(admin: Admin, orgId: string, sessaoId: string): Promise<void> {
  await admin.from("channel_sessions").delete().eq("organization_id", orgId).eq("id", sessaoId);
}
