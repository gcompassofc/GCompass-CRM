import { beforeAll, describe, expect, it } from "vitest";

import {
  GOV_ADMIN,
  GOV_AGENT_A,
  GOV_CONTACT_PROBE,
  GOV_MANAGER,
  GOV_ORG,
  GOV_PIPELINE,
  GOV_SESSION,
  GOV_STAGE,
  seedGov,
  sql,
  writeCountAs,
} from "./gov-helpers";

/**
 * 0120 — lead, contato e conversa só se apagam pelo administrador (OPA, 01/11/2026).
 * O corretor e o gerente tentam pelo mesmo caminho do PostgREST (papel authenticated
 * com o JWT da pessoa) e o banco recusa; o administrador consegue. O lead do corretor
 * continua de pé, com o contato e o histórico.
 */

const LEAD_DO_CORRETOR = "0120aaaa-6666-4000-8000-000000000001";
const LEAD_PARA_ADMIN = "0120aaaa-6666-4000-8000-000000000002";
const CONTATO = "0120aaaa-3333-4000-8000-000000000001";
const CONVERSA = "0120aaaa-4444-4000-8000-000000000001";
const MENSAGEM = "0120aaaa-7777-4000-8000-000000000001";

beforeAll(() => {
  seedGov();
  sql(`
    insert into public.contacts (id, organization_id, display_name)
      values ('${CONTATO}', '${GOV_ORG}', 'Lead da exclusão');
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status, assigned_to_user_id, assigned_at)
      values ('${CONVERSA}', '${GOV_ORG}', '${CONTATO}', '${GOV_SESSION}', 'claimed', '${GOV_AGENT_A}', now())
     ;
    insert into public.messages (id, organization_id, conversation_id, contact_id, channel_session_id, type, direction, status, body, sent_at)
      values ('${MENSAGEM}', '${GOV_ORG}', '${CONVERSA}', '${CONTATO}', '${GOV_SESSION}', 'text', 'inbound', 'delivered', 'oi', now())
     ;
    insert into public.crm_leads (id, organization_id, pipeline_id, stage_id, contact_id, title, owner_user_id)
      values
        ('${LEAD_DO_CORRETOR}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', '${CONTATO}', 'Lead do corretor', '${GOV_AGENT_A}'),
        ('${LEAD_PARA_ADMIN}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', null, 'Lead para o admin', '${GOV_AGENT_A}')
     ;
  `);
});

const existe = (tabela: string, id: string) => sql(`select count(*) from public.${tabela} where id = '${id}';`) === "1";

describe("0120: exclusão só pelo administrador (o banco recusa, não só a tela)", () => {
  it("corretor não apaga nem o próprio lead", () => {
    expect(writeCountAs(GOV_AGENT_A, `delete from public.crm_leads where id = '${LEAD_DO_CORRETOR}'`)).toBe(0);
    expect(existe("crm_leads", LEAD_DO_CORRETOR)).toBe(true);
  });

  it("gerente não apaga lead", () => {
    expect(writeCountAs(GOV_MANAGER, `delete from public.crm_leads where id = '${LEAD_DO_CORRETOR}'`)).toBe(0);
    expect(existe("crm_leads", LEAD_DO_CORRETOR)).toBe(true);
  });

  it("corretor e gerente não apagam o contato do lead (o número fica)", () => {
    expect(writeCountAs(GOV_AGENT_A, `delete from public.contacts where id = '${CONTATO}'`)).toBe(0);
    expect(writeCountAs(GOV_MANAGER, `delete from public.contacts where id = '${CONTATO}'`)).toBe(0);
    expect(existe("contacts", CONTATO)).toBe(true);
  });

  it("corretor e gerente não apagam a conversa nem as mensagens (o histórico fica)", () => {
    expect(writeCountAs(GOV_AGENT_A, `delete from public.conversations where id = '${CONVERSA}'`)).toBe(0);
    expect(writeCountAs(GOV_MANAGER, `delete from public.conversations where id = '${CONVERSA}'`)).toBe(0);
    expect(writeCountAs(GOV_AGENT_A, `delete from public.messages where id = '${MENSAGEM}'`)).toBe(0);
    expect(existe("conversations", CONVERSA)).toBe(true);
    expect(existe("messages", MENSAGEM)).toBe(true);
  });

  it("o administrador apaga o lead", () => {
    expect(writeCountAs(GOV_ADMIN, `delete from public.crm_leads where id = '${LEAD_PARA_ADMIN}'`)).toBe(1);
    expect(existe("crm_leads", LEAD_PARA_ADMIN)).toBe(false);
  });

  it("apagar a conversa pelo servidor (como a limpeza interna) não leva o lead nem o contato", () => {
    // Service role / postgres ignoram a RLS: é o caminho da limpeza interna e da LGPD.
    sql(`delete from public.conversations where id = '${CONVERSA}';`);
    expect(existe("crm_leads", LEAD_DO_CORRETOR)).toBe(true);
    expect(existe("contacts", CONTATO)).toBe(true);
  });

  it("o contato de prova do seed segue intacto", () => {
    expect(existe("contacts", GOV_CONTACT_PROBE)).toBe(true);
  });
});

describe("0120: um número de WhatsApp ativo por corretor", () => {
  const nova = (id: string, nome: string) =>
    `insert into public.channel_sessions (id, organization_id, waha_session_name, webhook_secret_encrypted, owner_user_id)
       values ('${id}', '${GOV_ORG}', '${nome}', '\\x00'::bytea, '${GOV_AGENT_A}');`;

  it("a segunda sessão ativa do mesmo corretor é recusada pelo banco", () => {
    sql(nova("0120aaaa-8888-4000-8000-000000000001", "opa-dono-1"));
    expect(() => sql(nova("0120aaaa-8888-4000-8000-000000000002", "opa-dono-2"))).toThrow(/channel_sessions_um_ativo_por_dono/);
  });

  it("sessão arquivada não conta: o corretor pode ligar de novo depois de excluir", () => {
    sql(`update public.channel_sessions set archived_at = now() where id = '0120aaaa-8888-4000-8000-000000000001';`);
    sql(nova("0120aaaa-8888-4000-8000-000000000003", "opa-dono-3"));
    expect(sql(`select count(*) from public.channel_sessions where owner_user_id = '${GOV_AGENT_A}' and archived_at is null;`)).toBe("1");
  });
});

