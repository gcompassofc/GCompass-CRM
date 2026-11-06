import { carregarEquipe } from "@/lib/opa/dados";
import { carregarPessoas, donosParaTela, type DonosDaConversa } from "@/lib/opa/donos-da-conversa";
import { perfilAtivo } from "@/lib/navigation/registry";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Acrescenta quem é o responsável e o principal de cada número. Só nomes e datas, e
 * nunca derruba a conversa: se falhar, a tela segue sem esse dado.
 */
export async function comDonos<T extends { contact_id?: string | null }>(orgId: string, conversas: T[]): Promise<Array<T & { donos?: DonosDaConversa | null }>> {
  if (perfilAtivo() !== "imobiliaria" || conversas.length === 0) return conversas;
  try {
    const ids = [...new Set(conversas.map((c) => c.contact_id).filter((x): x is string => Boolean(x)))];
    const equipe = await carregarEquipe(orgId);
    const pessoas = await carregarPessoas(createAdminClient(), orgId, (id) => equipe.get(id)?.nome ?? "Corretor", ids);
    return conversas.map((c) => {
      const p = c.contact_id ? pessoas.get(c.contact_id) : undefined;
      return { ...c, donos: p ? donosParaTela(p) : null };
    });
  } catch (e) {
    console.error("[conversations/comDonos]", e instanceof Error ? e.message : e);
    return conversas;
  }
}
