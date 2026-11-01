"use server";

import { TOURS, type TourId } from "@/lib/opa/tour";
import { CHAVE_TUTORIAL, marcarTourFeito, marcarVisto, type VersaoTutorial } from "@/lib/opa/tutorial";
import { createClient } from "@/lib/supabase/server";

/**
 * Guardam no `user_metadata` da própria pessoa o que ela já viu: as versões
 * do tutorial e os tours de tela. Cliente do próprio usuário (nada de service
 * role): cada um só escreve o próprio metadata. Lê o metadata atual do
 * servidor antes de gravar, para não apagar o que já estava lá.
 */
async function gravar(montar: (metadata: unknown) => unknown): Promise<{ ok: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await supabase.auth.updateUser({ data: { [CHAVE_TUTORIAL]: montar(user.user_metadata) } });
  return { ok: !error };
}

export async function marcarTutorialVisto(versao: VersaoTutorial): Promise<{ ok: boolean }> {
  if (versao !== "corretor" && versao !== "gestor") return { ok: false };
  return gravar((m) => marcarVisto(m, versao));
}

export async function marcarTourConcluido(tour: TourId): Promise<{ ok: boolean }> {
  if (!Object.hasOwn(TOURS, tour)) return { ok: false };
  return gravar((m) => marcarTourFeito(m, tour));
}
