import { beforeAll, describe, expect, it } from "vitest";

import { GOV_ORG, seedGov, sql } from "./gov-helpers";

/**
 * 0124 · conversa em espera do contato a classificar (decisão do Allyson,
 * 02/11/2026). Só o servidor (service role) lê e grava: nem o dono do número pela
 * API. Contato que vira pessoal perde tudo; contato que não está a classificar não
 * recebe nada; no máximo 20 por contato; a mesma mensagem não entra duas vezes.
 */

const SESSAO = "0124aaaa-8888-4000-8000-000000000001";
const OUTRA_SESSAO = "0124aaaa-8888-4000-8000-000000000002";
// Corretores só deste arquivo (índice "um número ativo por dono", 0120).
const CORRETOR = "0124aaaa-1111-4000-8000-000000000001";
const OUTRO_CORRETOR = "0124aaaa-1111-4000-8000-000000000002";
const NOVO = "0124aaaa-9999-4000-8000-000000000001";
const LEAD = "0124aaaa-9999-4000-8000-000000000002";
const PESSOAL = "0124aaaa-9999-4000-8000-000000000003";
const VAI_VIRAR_PESSOAL = "0124aaaa-9999-4000-8000-000000000004";
const MUITAS = "0124aaaa-9999-4000-8000-000000000005";

const ESPERA = "public.whatsapp_mensagens_a_classificar";

/** Roda como `authenticated` (dono do número) ou `anon`; true se o banco recusou ou não afetou linha. */
function recusa(papel: "authenticated" | "anon", script: string, quem = CORRETOR): boolean {
  try {
    const out = sql(`
      set role ${papel};
      select set_config('request.jwt.claims', '{"sub":"${quem}"}', false);
      ${script}
    `);
    const ultima = out.split("\n").at(-1) ?? "";
    return ultima === "0" || ultima === "";
  } catch (e) {
    return /permission denied|row-level security/i.test(String(e));
  }
}

function inserir(contato: string, id: string, extra = ""): string {
  return `insert into ${ESPERA} (organization_id, channel_session_id, contato_numero_id, mensagem_wa_id, direcao, tipo, corpo_cifrado, mensagem_em${extra ? ", created_at" : ""})
    values ('${GOV_ORG}', '${SESSAO}', '${contato}', '${id}', 'entrada', 'text', 'pii1.v1.corpo', now()${extra ? `, ${extra}` : ""})`;
}

const contar = (onde: string) => Number(sql(`select count(*) from ${ESPERA} where ${onde};`));

beforeAll(() => {
  seedGov();
  sql(`
    insert into auth.users (id, email) values
      ('${CORRETOR}', 'corretor-0124@invariant.test'),
      ('${OUTRO_CORRETOR}', 'outro-0124@invariant.test')
      on conflict do nothing;
    insert into public.user_organizations (user_id, organization_id, role, accepted_at) values
      ('${CORRETOR}', '${GOV_ORG}', 'agent', now()),
      ('${OUTRO_CORRETOR}', '${GOV_ORG}', 'agent', now())
      on conflict do nothing;
    do $t$ begin
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted, owner_user_id, phone_number)
        values ('${SESSAO}', '${GOV_ORG}', 'opa-0124-a', '\\x00'::bytea, '${CORRETOR}', '5512900000125'),
               ('${OUTRA_SESSAO}', '${GOV_ORG}', 'opa-0124-b', '\\x00'::bytea, '${OUTRO_CORRETOR}', '5512900000126');
    exception when unique_violation then null; end $t$;
    insert into public.whatsapp_contatos_numero (id, organization_id, channel_session_id, chave, situacao, origem, telefone_cifrado) values
      ('${NOVO}', '${GOV_ORG}', '${SESSAO}', 'c0124-novo', 'a_classificar', 'novo', 'pii1.v1.t'),
      ('${LEAD}', '${GOV_ORG}', '${SESSAO}', 'c0124-lead', 'lead', 'corretor', 'pii1.v1.t'),
      ('${PESSOAL}', '${GOV_ORG}', '${SESSAO}', 'c0124-pessoal', 'pessoal', 'importacao', null),
      ('${VAI_VIRAR_PESSOAL}', '${GOV_ORG}', '${SESSAO}', 'c0124-vira', 'a_classificar', 'novo', 'pii1.v1.t'),
      ('${MUITAS}', '${GOV_ORG}', '${SESSAO}', 'c0124-muitas', 'a_classificar', 'novo', null)
      on conflict do nothing;
  `);
  sql(`${inserir(NOVO, "0124-m1")} on conflict do nothing;`);
});

describe("0124: só o servidor acessa a espera", () => {
  it("RLS ligada e nenhuma policy (nem para o dono)", () => {
    expect(sql(`select relrowsecurity from pg_class where oid = '${ESPERA}'::regclass;`)).toBe("t");
    expect(sql(`select count(*) from pg_policies where schemaname = 'public' and tablename = 'whatsapp_mensagens_a_classificar';`)).toBe("0");
  });

  it("authenticated (o próprio dono do número) não lê, não grava, não apaga", () => {
    expect(recusa("authenticated", `select count(*) from ${ESPERA};`)).toBe(true);
    expect(recusa("authenticated", `with w as (${inserir(NOVO, "0124-forjada")} returning 1) select count(*) from w;`)).toBe(true);
    expect(recusa("authenticated", `with w as (update ${ESPERA} set tipo = 'audio' returning 1) select count(*) from w;`)).toBe(true);
    expect(recusa("authenticated", `with w as (delete from ${ESPERA} returning 1) select count(*) from w;`)).toBe(true);
    expect(contar(`mensagem_wa_id = '0124-forjada'`)).toBe(0);
    expect(contar(`mensagem_wa_id = '0124-m1'`)).toBe(1);
  });

  it("anon não tem privilégio nenhum", () => {
    expect(sql(`select has_table_privilege('anon', '${ESPERA}', 'SELECT');`)).toBe("f");
    expect(sql(`select has_table_privilege('authenticated', '${ESPERA}', 'SELECT');`)).toBe("f");
    expect(recusa("anon", `select count(*) from ${ESPERA};`)).toBe(true);
  });

  it("o service role lê e grava", () => {
    expect(sql(`select has_table_privilege('service_role', '${ESPERA}', 'INSERT');`)).toBe("t");
    expect(sql(`select has_table_privilege('service_role', '${ESPERA}', 'DELETE');`)).toBe("t");
  });
});

describe("0124: o que entra na espera", () => {
  it("a mesma mensagem do mesmo número não entra duas vezes", () => {
    expect(() => sql(`${inserir(NOVO, "0124-m1")};`)).toThrow(/whatsapp_mensagens_a_classificar_unica/);
  });

  it("contato lead ou pessoal não recebe nada (a linha é descartada)", () => {
    sql(`${inserir(LEAD, "0124-lead-1")}; ${inserir(PESSOAL, "0124-pessoal-1")};`);
    expect(contar(`contato_numero_id in ('${LEAD}', '${PESSOAL}')`)).toBe(0);
  });

  it("texto puro e mensagem de outro número são recusados", () => {
    expect(() =>
      sql(`insert into ${ESPERA} (organization_id, channel_session_id, contato_numero_id, mensagem_wa_id, direcao, tipo, corpo_cifrado, mensagem_em)
             values ('${GOV_ORG}', '${SESSAO}', '${NOVO}', '0124-claro', 'entrada', 'text', 'Oi, tudo bem?', now());`),
    ).toThrow(/corpo_formato/);
    expect(() =>
      sql(`insert into ${ESPERA} (organization_id, channel_session_id, contato_numero_id, mensagem_wa_id, direcao, tipo, corpo_cifrado, mensagem_em)
             values ('${GOV_ORG}', '${OUTRA_SESSAO}', '${NOVO}', '0124-outro', 'entrada', 'text', 'pii1.v1.c', now());`),
    ).toThrow(/outro número/);
    expect(() =>
      sql(`insert into ${ESPERA} (organization_id, channel_session_id, contato_numero_id, mensagem_wa_id, direcao, tipo, corpo_cifrado, mensagem_em)
             values ('${GOV_ORG}', '${SESSAO}', '${NOVO}', '0124-vazio', 'entrada', 'text', null, now());`),
    ).toThrow(/tem_conteudo/);
  });

  it("mídia sem legenda entra só com o tipo", () => {
    sql(`insert into ${ESPERA} (organization_id, channel_session_id, contato_numero_id, mensagem_wa_id, direcao, tipo, corpo_cifrado, mensagem_em)
           values ('${GOV_ORG}', '${SESSAO}', '${NOVO}', '0124-audio', 'entrada', 'audio', null, now()) on conflict do nothing;`);
    expect(contar(`mensagem_wa_id = '0124-audio'`)).toBe(1);
  });

  it("ficam no máximo as 20 mais recentes por contato", () => {
    const linhas = Array.from(
      { length: 25 },
      (_, i) =>
        `('${GOV_ORG}', '${SESSAO}', '${MUITAS}', '0124-lote-${i}', 'entrada', 'text', 'pii1.v1.c${i}', now() - interval '${25 - i} minutes')`,
    ).join(",\n");
    sql(`insert into ${ESPERA} (organization_id, channel_session_id, contato_numero_id, mensagem_wa_id, direcao, tipo, corpo_cifrado, mensagem_em) values ${linhas};`);
    expect(contar(`contato_numero_id = '${MUITAS}'`)).toBe(20);
    // Saíram as 5 mais velhas (0 a 4).
    expect(contar(`contato_numero_id = '${MUITAS}' and mensagem_wa_id in ('0124-lote-0','0124-lote-4')`)).toBe(0);
    expect(contar(`contato_numero_id = '${MUITAS}' and mensagem_wa_id = '0124-lote-24'`)).toBe(1);
  });
});

describe("0124: decisão apaga", () => {
  it("contato que vira pessoal perde tudo o que estava em espera (venha de onde vier)", () => {
    sql(`${inserir(VAI_VIRAR_PESSOAL, "0124-v1")}; ${inserir(VAI_VIRAR_PESSOAL, "0124-v2")};`);
    expect(contar(`contato_numero_id = '${VAI_VIRAR_PESSOAL}'`)).toBe(2);
    sql(`update public.whatsapp_contatos_numero
            set situacao = 'pessoal', telefone_cifrado = null, nome_cifrado = null, chat_cifrado = null
          where id = '${VAI_VIRAR_PESSOAL}';`);
    expect(contar(`contato_numero_id = '${VAI_VIRAR_PESSOAL}'`)).toBe(0);
  });

  it("apagar a linha do contato leva a espera junto (cascade)", () => {
    sql(`${inserir(NOVO, "0124-cascata")} on conflict do nothing;`);
    expect(contar(`contato_numero_id = '${NOVO}'`)).toBeGreaterThan(0);
    sql(`delete from public.whatsapp_contatos_numero where id = '${NOVO}';`);
    expect(contar(`contato_numero_id = '${NOVO}'`)).toBe(0);
  });
});
