import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_ADMIN,
  GOV_AGENT_A,
  GOV_AGENT_B,
  GOV_MANAGER,
  GOV_ORG,
  GOV_PIPELINE,
  GOV_SESSION,
  GOV_STAGE,
  countAs,
  seedGov,
  sql,
  writeCountAs,
} from "./gov-helpers";

/**
 * 0121 — brechas achadas depois de colocar o CRM no ar (01/11/2026).
 * Cada regra é tentada pelo caminho do PostgREST (papel authenticated com o JWT da
 * pessoa); o banco recusa quem não pode e deixa quem pode.
 */

const SESSAO_DO_COLEGA = "0121aaaa-8888-4000-8000-000000000001";
const SESSAO_DO_ADMIN = "0121aaaa-8888-4000-8000-000000000002";
const CONTATO = "0121aaaa-3333-4000-8000-000000000001";
const CONVERSA = "0121aaaa-4444-4000-8000-000000000001";
const MENSAGEM = "0121aaaa-7777-4000-8000-000000000001";
const MENSAGEM_PARA_ADMIN = "0121aaaa-7777-4000-8000-000000000002";
const LEAD_DO_CORRETOR = "0121aaaa-6666-4000-8000-000000000001";
const LEAD_PAGO = "0121aaaa-6666-4000-8000-000000000002";

const MIGRATION = join(__dirname, "../../supabase/migrations/20261101000000_0121_permissoes_numero_etiquetas_mensagens.sql");

beforeAll(() => {
  seedGov();
  sql(`
    do $t$ begin
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted, owner_user_id, phone_number)
        values ('${SESSAO_DO_COLEGA}', '${GOV_ORG}', 'opa-0121-colega', '\\x00'::bytea, '${GOV_AGENT_B}', '5512900000121');
      insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted)
        values ('${SESSAO_DO_ADMIN}', '${GOV_ORG}', 'opa-0121-admin', '\\x00'::bytea);
    exception when unique_violation then null; end $t$;
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTATO}', '${GOV_ORG}', 'Lead da 0121') on conflict do nothing;
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status, assigned_to_user_id, assigned_at)
      values ('${CONVERSA}', '${GOV_ORG}', '${CONTATO}', '${GOV_SESSION}', 'claimed', '${GOV_AGENT_A}', now());
    insert into public.messages (id, organization_id, conversation_id, contact_id, channel_session_id, type, direction, status, body, sent_at)
      values
        ('${MENSAGEM}', '${GOV_ORG}', '${CONVERSA}', '${CONTATO}', '${GOV_SESSION}', 'text', 'outbound', 'sending', 'Bom dia, tudo bem?', now()),
        ('${MENSAGEM_PARA_ADMIN}', '${GOV_ORG}', '${CONVERSA}', '${CONTATO}', '${GOV_SESSION}', 'text', 'outbound', 'sent', 'apagar', now());
    insert into public.crm_leads (id, organization_id, pipeline_id, stage_id, contact_id, title, owner_user_id, tags)
      values
        ('${LEAD_DO_CORRETOR}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', '${CONTATO}', 'Lead do corretor', '${GOV_AGENT_A}', '{}'),
        ('${LEAD_PAGO}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', null, 'Lead pago', '${GOV_AGENT_A}', '{pago}')
      on conflict do nothing;
  `);
});

const valor = (q: string) => sql(q);

describe("A1: número de WhatsApp só o administrador grava", () => {
  it("o corretor ainda vê os números da empresa", () => {
    expect(countAs(GOV_AGENT_A, `select count(*) from public.channel_sessions where id = '${SESSAO_DO_COLEGA}'`)).toBe(1);
  });

  it("corretor não toma o número do colega (dono) nem troca o telefone", () => {
    expect(writeCountAs(GOV_AGENT_A, `update public.channel_sessions set owner_user_id = '${GOV_AGENT_A}' where id = '${SESSAO_DO_COLEGA}'`)).toBe(0);
    expect(writeCountAs(GOV_AGENT_A, `update public.channel_sessions set phone_number = '5512999999999' where id = '${SESSAO_DO_COLEGA}'`)).toBe(0);
    expect(valor(`select owner_user_id from public.channel_sessions where id = '${SESSAO_DO_COLEGA}';`)).toBe(GOV_AGENT_B);
  });

  it("gerente não arquiva nem apaga número (o OPA Lembretes não se cala por aqui)", () => {
    expect(writeCountAs(GOV_MANAGER, `update public.channel_sessions set archived_at = now() where id = '${SESSAO_DO_COLEGA}'`)).toBe(0);
    expect(writeCountAs(GOV_MANAGER, `delete from public.channel_sessions where id = '${SESSAO_DO_COLEGA}'`)).toBe(0);
    expect(valor(`select archived_at is null from public.channel_sessions where id = '${SESSAO_DO_COLEGA}';`)).toBe("t");
  });

  it("corretor não cria número pela API (nem em nome de outra pessoa)", () => {
    expect(() =>
      writeCountAs(
        GOV_AGENT_A,
        `insert into public.channel_sessions (organization_id, waha_session_name, webhook_secret_encrypted, owner_user_id, phone_number)
           values ('${GOV_ORG}', 'opa-0121-falso', '\\x00'::bytea, '${GOV_MANAGER}', '5512988887777')`,
      ),
    ).toThrow(/administrador/);
  });

  it("o administrador muda o dono e o telefone", () => {
    expect(writeCountAs(GOV_ADMIN, `update public.channel_sessions set owner_user_id = '${GOV_MANAGER}', phone_number = '5512977776666' where id = '${SESSAO_DO_ADMIN}'`)).toBe(1);
  });

  it("o servidor (service role) segue gravando", () => {
    sql(`update public.channel_sessions set last_health_check_at = now(), phone_number = '5512966665555' where id = '${SESSAO_DO_ADMIN}';`);
    expect(valor(`select phone_number from public.channel_sessions where id = '${SESSAO_DO_ADMIN}';`)).toBe("5512966665555");
  });
});

describe("A3: nenhuma SECURITY DEFINER executável pela anon key", () => {
  const CINCO = [
    "public.fn_decrypt_oauth(bytea)",
    "public.fn_encrypt_oauth(text)",
    "public.fn_lgpd_cascade_redact_contact(uuid,uuid,uuid)",
    "public.activate_kb_version(uuid,uuid)",
    "public.fn_update_budget_consumption()",
  ];
  const pode = (papel: string, f: string) => valor(`select has_function_privilege('${papel}', '${f}', 'EXECUTE');`);

  it("varredura: zero definer de public executável por anon", () => {
    expect(
      valor(`select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.prosecdef and has_function_privilege('anon', p.oid, 'EXECUTE');`),
    ).toBe("0");
  });

  it.each(CINCO)("%s: só o servidor executa", (f) => {
    expect(pode("anon", f)).toBe("f");
    expect(pode("authenticated", f)).toBe("f");
    expect(pode("service_role", f)).toBe("t");
  });

  it("helpers de RLS seguem executáveis por quem está logado (senão toda leitura quebra)", () => {
    expect(pode("authenticated", "public.fn_user_org_ids()")).toBe("t");
    expect(pode("authenticated", "public.fn_role_at_least(uuid,text)")).toBe("t");
  });

  it("como no Supabase hospedado: grant direto a anon é desfeito ao reaplicar a 0121", () => {
    // A plataforma dá EXECUTE direto a anon em toda função do postgres; o Postgres
    // local dos testes não. Simula e reaplica a migration (ela é idempotente).
    sql(CINCO.map((f) => `grant execute on function ${f} to anon, authenticated;`).join("\n"));
    expect(pode("anon", CINCO[0]!)).toBe("t");
    // Numa transação: as regras são recriadas e outros arquivos rodam no mesmo banco.
    sql(`begin;\n${readFileSync(MIGRATION, "utf8")}\ncommit;`);
    for (const f of CINCO) {
      expect(pode("anon", f)).toBe("f");
      expect(pode("authenticated", f)).toBe("f");
    }
  });

  it("função nova do postgres em public não nasce executável por anon, mas sim por quem está logado", () => {
    sql(`create or replace function public.fn_teste_0121_nova() returns int language sql as 'select 1';`);
    expect(pode("anon", "public.fn_teste_0121_nova()")).toBe("f");
    expect(pode("authenticated", "public.fn_teste_0121_nova()")).toBe("t");
    sql(`drop function public.fn_teste_0121_nova();`);
  });
});

describe("A4: etiquetas de regra (proprio, pago, organico)", () => {
  it("corretor não marca o próprio lead como lead próprio", () => {
    expect(() => writeCountAs(GOV_AGENT_A, `update public.crm_leads set tags = array['proprio'] where id = '${LEAD_DO_CORRETOR}'`)).toThrow(/etiquetas/);
  });

  it("corretor não tira a etiqueta pago (o prazo do lead pago é mais curto)", () => {
    expect(() => writeCountAs(GOV_AGENT_A, `update public.crm_leads set tags = '{}' where id = '${LEAD_PAGO}'`)).toThrow(/etiquetas/);
  });

  it("corretor não cria lead já com etiqueta de regra", () => {
    expect(() =>
      writeCountAs(
        GOV_AGENT_A,
        `insert into public.crm_leads (organization_id, pipeline_id, stage_id, title, owner_user_id, tags)
           values ('${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', 'Lead forjado', '${GOV_AGENT_A}', array['organico'])`,
      ),
    ).toThrow(/etiquetas/);
  });

  it("corretor mexe à vontade nas outras etiquetas, e as de regra ficam", () => {
    expect(writeCountAs(GOV_AGENT_A, `update public.crm_leads set tags = array['pago', 'quente'] where id = '${LEAD_PAGO}'`)).toBe(1);
    expect(valor(`select array_to_string(tags, ',') from public.crm_leads where id = '${LEAD_PAGO}';`)).toBe("pago,quente");
  });

  it("gerente marca lead próprio", () => {
    expect(writeCountAs(GOV_MANAGER, `update public.crm_leads set tags = array['proprio'] where id = '${LEAD_DO_CORRETOR}'`)).toBe(1);
  });
});

describe("A5: lembrete de lead vai para quem agenda ou para o dono do lead", () => {
  const agendar = (quem: string, para: string, lead = LEAD_DO_CORRETOR) =>
    writeCountAs(
      quem,
      `insert into public.lembretes_agendados (organization_id, lead_id, para_user_id, quando, mensagem, criado_por)
         values ('${GOV_ORG}', '${lead}', '${para}', now() + interval '1 hour', 'Ficha: http://exemplo.test', '${quem}')`,
    );

  it("corretor não manda texto do número oficial para o administrador", () => {
    expect(agendar(GOV_AGENT_A, GOV_ADMIN)).toBe(0);
  });

  it("corretor agenda para si mesmo no próprio lead", () => {
    expect(agendar(GOV_AGENT_A, GOV_AGENT_A)).toBe(1);
  });

  it("gerente agenda para qualquer pessoa da equipe", () => {
    expect(agendar(GOV_MANAGER, GOV_AGENT_B)).toBe(1);
  });
});

describe("C5: mensagens, o histórico fica", () => {
  it("corretor não reescreve o corpo da mensagem", () => {
    expect(() => writeCountAs(GOV_AGENT_A, `update public.messages set body = 'texto trocado' where id = '${MENSAGEM}'`)).toThrow(/conteúdo/);
    expect(valor(`select body from public.messages where id = '${MENSAGEM}';`)).toBe("Bom dia, tudo bem?");
  });

  it("corretor atualiza o andamento do envio (status, erro)", () => {
    expect(writeCountAs(GOV_AGENT_A, `update public.messages set status = 'failed', error_code = 'x', error_message = 'y' where id = '${MENSAGEM}'`)).toBe(1);
  });

  it("gerente não apaga mensagem", () => {
    expect(writeCountAs(GOV_MANAGER, `delete from public.messages where id = '${MENSAGEM}'`)).toBe(0);
    expect(valor(`select count(*) from public.messages where id = '${MENSAGEM}';`)).toBe("1");
  });

  it("o administrador apaga", () => {
    expect(writeCountAs(GOV_ADMIN, `delete from public.messages where id = '${MENSAGEM_PARA_ADMIN}'`)).toBe(1);
  });
});
