/**
 * Gravação segura em `crm_leads.custom_fields` (revisão de 31/10/2026, E1).
 *
 * Nunca ler o objeto inteiro e gravá-lo de volta: duas ações no mesmo lead (o
 * "Respondi" da fila com o copiloto terminando, uma ligação no meio de um salvar
 * de campos) se apagavam. A mescla roda dentro de um único UPDATE no banco
 * (migration 0118, `fn_opa_mesclar_campos`) e só toca as chaves do patch.
 *
 * Sem imports com alias "@/": o seed roda este arquivo pelo tsx, fora do Next.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface OpcoesMescla {
  /** Chaves cujo valor é objeto e deve ser mesclado um nível abaixo (ex.: "opa"). */
  mesclar?: string[];
  /** Chaves a tirar do objeto. */
  remover?: string[];
  /** Atualiza `last_activity_at` para este instante. */
  atividade?: string | null;
  /** Exige que o lead seja desta org (cliente admin, que não passa pelo RLS). */
  orgId?: string;
}

/**
 * Grava só as chaves de `patch`. Devolve o `custom_fields` novo, ou lança erro se
 * o lead não existe ou a sessão não o enxerga.
 */
export async function mesclarCampos(
  supabase: SupabaseClient,
  leadId: string,
  patch: Record<string, unknown>,
  opcoes: OpcoesMescla = {},
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("fn_opa_mesclar_campos", {
    p_lead: leadId,
    p_patch: patch,
    p_mesclar: opcoes.mesclar ?? [],
    p_remover: opcoes.remover ?? [],
    p_atividade: opcoes.atividade ?? null,
    p_org: opcoes.orgId ?? null,
  });
  if (error) throw new Error(error.message);
  if (data == null) throw new Error("Lead não encontrado.");
  return data as Record<string, unknown>;
}
