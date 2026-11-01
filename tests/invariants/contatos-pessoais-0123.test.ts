import { beforeAll, describe, expect, it } from "vitest";

import { GOV_ADMIN, GOV_MANAGER, GOV_ORG, countAs, seedGov, sql, writeCountAs } from "./gov-helpers";

/**
 * 0123 — contatos do WhatsApp do corretor (01/11/2026). Contato pessoal não guarda
 * dado e não aparece nem para o dono; lead e a classificar só o dono do número vê;
 * ninguém grava pela API (só o servidor).
 */

const SESSAO_A = "0123aaaa-8888-4000-8000-000000000001";
const SESSAO_B = "0123aaaa-8888-4000-8000-000000000002";
// Corretores só deste arquivo: os do seedGov já são donos de números em outros
// testes, e o índice "um número ativo por dono" (0120) não deixa dar outro.
const CORRETOR_A = "0123aaaa-1111-4000-8000-000000000001";
const CORRETOR_B = "0123aaaa-1111-4000-8000-000000000002";

/** Escrita pela API não pode passar: ou o banco recusa (erro), ou não afeta linha nenhuma. */
function naoGrava(quem: string, dml: string): boolean {
  try {
    return writeCountAs(quem, dml) === 0;
  } catch {
    return true;
  }
}

beforeAll(() => {
  seedGov();
  sql(`
    insert into auth.users (id, email) values
      ('${CORRETOR_A}', 'corretor-a-0123@invariant.test'),
      ('${CORRETOR_B}', 'corretor-b-0123@invariant.test')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${CORRETOR_A}', '${GOV_ORG}', 'agent', now()),
      ('${CORRETOR_B}', '${GOV_ORG}', 'agent', now())
      on conflict do nothing;
    do $t$ begin
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted, owner_user_id, phone_number)
        values ('${SESSAO_A}', '${GOV_ORG}', 'opa-0123-a', '\\x00'::bytea, '${CORRETOR_A}', '5512900000123'),
               ('${SESSAO_B}', '${GOV_ORG}', 'opa-0123-b', '\\x00'::bytea, '${CORRETOR_B}', '5512900000124');
    exception when unique_violation then null; end $t$;
    insert into public.whatsapp_contatos_numero (organization_id, channel_session_id, chave, situacao, origem, telefone_cifrado)
      values
        ('${GOV_ORG}', '${SESSAO_A}', 'chave-pessoal', 'pessoal', 'importacao', null),
        ('${GOV_ORG}', '${SESSAO_A}', 'chave-novo', 'a_classificar', 'novo', 'pii1.v1.xxx'),
        ('${GOV_ORG}', '${SESSAO_A}', 'chave-lead', 'lead', 'etiqueta', 'pii1.v1.yyy'),
        ('${GOV_ORG}', '${SESSAO_B}', 'chave-do-b', 'a_classificar', 'novo', 'pii1.v1.zzz')
      on conflict do nothing;
  `);
});

const contar = (quem: string, sessao: string) =>
  countAs(quem, `select count(*) from public.whatsapp_contatos_numero where channel_session_id = '${sessao}'`);

describe("0123: quem vê os contatos do número", () => {
  it("o dono vê os seus a classificar e leads, nunca os pessoais", () => {
    expect(contar(CORRETOR_A, SESSAO_A)).toBe(2);
    expect(countAs(CORRETOR_A, `select count(*) from public.whatsapp_contatos_numero where situacao = 'pessoal'`)).toBe(0);
  });

  it("outro corretor, o gestor e o administrador não veem o número de ninguém", () => {
    expect(contar(CORRETOR_B, SESSAO_A)).toBe(0);
    expect(contar(GOV_MANAGER, SESSAO_A)).toBe(0);
    expect(contar(GOV_ADMIN, SESSAO_A)).toBe(0);
    expect(contar(CORRETOR_B, SESSAO_B)).toBe(1);
  });

  it("ninguém grava pela API: nem o dono (decisão passa pelo servidor)", () => {
    expect(naoGrava(CORRETOR_A, `update public.whatsapp_contatos_numero set situacao = 'lead' where chave = 'chave-novo'`)).toBe(true);
    expect(
      naoGrava(
        CORRETOR_A,
        `insert into public.whatsapp_contatos_numero (organization_id, channel_session_id, chave, situacao, origem)
           values ('${GOV_ORG}', '${SESSAO_A}', 'forjada', 'lead', 'corretor')`,
      ),
    ).toBe(true);
    expect(naoGrava(CORRETOR_A, `delete from public.whatsapp_contatos_numero where chave = 'chave-lead'`)).toBe(true);
    // E nada mudou de fato.
    expect(sql(`select situacao from public.whatsapp_contatos_numero where chave = 'chave-novo';`)).toBe("a_classificar");
    expect(sql(`select count(*) from public.whatsapp_contatos_numero where chave in ('forjada', 'chave-lead');`)).toBe("1");
  });
});

describe("0123: contato pessoal não guarda dado", () => {
  it("o banco recusa pessoal com telefone, nome ou chat", () => {
    expect(() =>
      sql(`insert into public.whatsapp_contatos_numero (organization_id, channel_session_id, chave, situacao, origem, telefone_cifrado)
             values ('${GOV_ORG}', '${SESSAO_A}', 'vazou', 'pessoal', 'importacao', 'pii1.v1.aaa');`),
    ).toThrow(/pessoal_sem_dado/);
  });

  it("a mesma pessoa aparece uma vez por número (chave única por sessão)", () => {
    expect(() =>
      sql(`insert into public.whatsapp_contatos_numero (organization_id, channel_session_id, chave, situacao, origem)
             values ('${GOV_ORG}', '${SESSAO_A}', 'chave-novo', 'pessoal', 'importacao');`),
    ).toThrow(/whatsapp_contatos_numero_unico/);
  });

  it("anon não lê nada", () => {
    expect(sql(`select has_table_privilege('anon', 'public.whatsapp_contatos_numero', 'SELECT');`)).toBe("f");
  });
});
