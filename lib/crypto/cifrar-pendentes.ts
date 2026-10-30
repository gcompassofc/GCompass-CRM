/**
 * Cifra o que está na fila (fase 2): contatos com `cifrado_em` vazio e
 * mensagens com corpo sem `corpo_cifrado`. Os gatilhos da 0116 devolvem para a
 * fila toda linha cujo texto puro mudou.
 *
 * Chamada pela rotina /api/v1/cron/cifrar-dados. Sem as chaves PII_* no
 * ambiente, não faz nada (e avisa): o app segue funcionando com o texto puro.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { cifraConfigurada, cifrar, indiceEmail, indiceTelefone } from "./dados-pessoais";

export interface ResultadoCifra {
  configurada: boolean;
  contatos: number;
  mensagens: number;
  erros: number;
}

interface Contato {
  id: string;
  organization_id: string;
  name: string | null;
  phone_number: string | null;
  email: string | null;
  nome_cifrado: string | null;
  telefone_cifrado: string | null;
  email_cifrado: string | null;
}

export async function cifrarPendentes(
  admin: SupabaseClient,
  limites: { contatos: number; mensagens: number } = { contatos: 300, mensagens: 1000 },
): Promise<ResultadoCifra> {
  const r: ResultadoCifra = { configurada: cifraConfigurada(), contatos: 0, mensagens: 0, erros: 0 };
  if (!r.configurada) return r;

  const { data: contatos, error } = await admin
    .from("contacts")
    .select("id, organization_id, name, phone_number, email, nome_cifrado, telefone_cifrado, email_cifrado")
    .is("cifrado_em", null)
    .order("created_at")
    .limit(limites.contatos);
  if (error) throw new Error(`cifrarPendentes(contatos): ${error.message}`);

  for (const c of (contatos ?? []) as Contato[]) {
    const org = c.organization_id;
    const novo = {
      nome_cifrado: c.nome_cifrado ?? cifrar(c.name, { org, campo: "nome" }),
      telefone_cifrado: c.telefone_cifrado ?? cifrar(c.phone_number, { org, campo: "telefone" }),
      email_cifrado: c.email_cifrado ?? cifrar(c.email, { org, campo: "email" }),
      telefone_indice: c.phone_number ? indiceTelefone(org, c.phone_number) : null,
      email_indice: c.email ? indiceEmail(org, c.email) : null,
      cifrado_em: new Date().toISOString(),
    };
    // Só grava se o texto puro ainda é o que foi lido: se mudou no meio, a
    // linha continua na fila e o próximo tick cifra a versão nova.
    let q = admin.from("contacts").update(novo).eq("id", c.id).is("cifrado_em", null);
    q = c.name == null ? q.is("name", null) : q.eq("name", c.name);
    q = c.phone_number == null ? q.is("phone_number", null) : q.eq("phone_number", c.phone_number);
    q = c.email == null ? q.is("email", null) : q.eq("email", c.email);
    const { error: e } = await q;
    if (e) r.erros++;
    else r.contatos++;
  }

  const { data: mensagens, error: em } = await admin
    .from("messages")
    .select("id, organization_id, body, updated_at")
    .is("corpo_cifrado", null)
    .not("body", "is", null)
    .order("created_at")
    .limit(limites.mensagens);
  if (em) throw new Error(`cifrarPendentes(mensagens): ${em.message}`);

  for (const m of (mensagens ?? []) as Array<{ id: string; organization_id: string; body: string; updated_at: string }>) {
    const corpo = cifrar(m.body, { org: m.organization_id, campo: "mensagem" });
    const { error: e } = await admin
      .from("messages")
      .update({ corpo_cifrado: corpo })
      .eq("id", m.id)
      .is("corpo_cifrado", null)
      // updated_at muda a cada edição (trg_messages_updated_at): corpo editado no meio fica na fila.
      .eq("updated_at", m.updated_at);
    if (e) r.erros++;
    else r.mensagens++;
  }

  return r;
}
