"use server";

import { CHAVE_TUTORIAL, marcarVisto, type VersaoTutorial } from "@/lib/opa/tutorial";
import { createClient } from "@/lib/supabase/server";

/**
 * Guarda no `user_metadata` da própria pessoa que ela viu uma versão do
 * tutorial. Cliente do próprio usuário (nada de service role): cada um só
 * escreve o próprio metadata. Lê o metadata atual do servidor antes de
 * gravar, para não apagar a data da outra versão.
 */
export async function marcarTutorialVisto(versao: VersaoTutorial): Promise<{ ok: boolean }> {
  if (versao !== "corretor" && versao !== "gestor") return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { error } = await supabase.auth.updateUser({
    data: { [CHAVE_TUTORIAL]: marcarVisto(user.user_metadata, versao) },
  });
  return { ok: !error };
}
