import type { SupabaseClient } from "@supabase/supabase-js";

import { ARCHIVED_AT, queryTolerantToMissingArchived } from "./archived";

/**
 * Os números de WhatsApp da equipe como as telas de GESTÃO os mostram
 * (Conexões, Membros, o Início do gerente): status, dono e sessão. Não é um
 * seletor — quem oferece canal como destino continua sendo
 * `listSelectableChannels` (./selectable).
 *
 * Existe para nenhuma tela montar a consulta de `channel_sessions` à mão: foi
 * um select por tela que deixou três seletores oferecendo canal arquivado, e o
 * teste de deriva (tests/unit/canais-selecionaveis) barra o padrão em app/.
 * O filtro de arquivado e a tolerância a banco sem `archived_at` moram aqui.
 */
export interface NumeroDaEquipe {
  id: string;
  display_name: string | null;
  phone_number: string | null;
  status: string;
  waha_session_name: string | null;
  provider: string;
  owner_user_id: string | null;
}

const COLUNAS = "id, display_name, phone_number, status, waha_session_name, provider, owner_user_id";

/**
 * Números ativos da organização, do mais antigo para o mais novo. `db` pode ser
 * o client do usuário (RLS) ou o admin; com o admin, quem chama já resolveu o
 * `organizationId` de fonte confiável, e ele é sempre explícito aqui.
 */
export async function listarNumerosDaEquipe(
  db: SupabaseClient,
  organizationId: string,
): Promise<NumeroDaEquipe[]> {
  const base = () =>
    db.from("channel_sessions").select(COLUNAS).eq("organization_id", organizationId);

  const { data, error } = await queryTolerantToMissingArchived(
    () => base().is(ARCHIVED_AT, null).order("created_at", { ascending: true }),
    () => base().order("created_at", { ascending: true }),
  );
  if (error) throw new Error(`channel_sessions_list_failed: ${error.message ?? "unknown"}`);
  return (data ?? []) as NumeroDaEquipe[];
}
