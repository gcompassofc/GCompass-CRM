import { beforeAll, describe, expect, it } from "vitest";

import { GOV_AGENT_A, GOV_AGENT_B, GOV_ORG, GOV_PIPELINE, GOV_SESSION, GOV_STAGE, seedGov, sql } from "./gov-helpers";

/**
 * 0122 (OPA, pendências de 01/11/2026):
 *  - C2: quem recebeu o lead depois (repasse ou troca) conta o prazo a partir de
 *    quando recebeu; o "Respondi" gravado como atividade guarda a primeira resposta
 *    mesmo que o custom_fields.respondido_em seja sobrescrito por um segundo toque;
 *  - C3: a reserva marca 'enviando'; reserva sem confirmação há mais de 10 min vira
 *    'falhou' e não é reenviada;
 *  - C8: fn_opa_anexar_etiquetas acrescenta sem apagar e respeita a org.
 */

const id = (n: number) => `0122aaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const LEAD_REPASSADO = id(1);
const LEAD_DOIS_TOQUES = id(2);
const LEAD_ETIQUETAS = id(3);
const CONTATO = id(10);
const CONVERSA = id(11);
const CONTATO_2 = id(12);
const L_TRAVADO = id(20);
const L_RECENTE = id(21);

beforeAll(() => {
  seedGov();
  sql(`
    insert into public.contacts (id, organization_id, display_name) values
      ('${CONTATO}', '${GOV_ORG}', 'Lead repassado'),
      ('${CONTATO_2}', '${GOV_ORG}', 'Lead de dois toques')
    on conflict do nothing;
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status)
    values ('${CONVERSA}', '${GOV_ORG}', '${CONTATO}', '${GOV_SESSION}', 'open') on conflict do nothing;

    -- Criado há 3 h com A; repassado para B há 1 h; B respondeu há 30 min.
    insert into public.crm_leads (id, organization_id, pipeline_id, stage_id, contact_id, title, owner_user_id, created_at, assigned_at, custom_fields, tags)
    values
      ('${LEAD_REPASSADO}',   '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', '${CONTATO}',   'Repassado',    '${GOV_AGENT_B}', now() - interval '3 hours', now() - interval '1 hour', '{}', '{}'),
      -- "Respondi" 20 min depois de criado; um segundo toque há 10 min sobrescreveu respondido_em.
      ('${LEAD_DOIS_TOQUES}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', '${CONTATO_2}', 'Dois toques',  '${GOV_AGENT_A}', now() - interval '3 hours', now() - interval '3 hours',
        jsonb_build_object('respondido_em', to_char((now() - interval '10 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')), '{}'),
      ('${LEAD_ETIQUETAS}',   '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', null,           'Etiquetas',    '${GOV_AGENT_A}', now() - interval '1 hour', now() - interval '1 hour', '{}', array['a'])
    on conflict do nothing;

    insert into public.messages (organization_id, conversation_id, contact_id, channel_session_id, type, direction, status, body, sent_at)
    values ('${GOV_ORG}', '${CONVERSA}', '${CONTATO}', '${GOV_SESSION}', 'text', 'outbound', 'sent', 'olá', now() - interval '30 minutes');

    insert into public.crm_lead_activities (organization_id, lead_id, source_module, type, payload, performed_at)
    values ('${GOV_ORG}', '${LEAD_DOIS_TOQUES}', 'opa', 'respondido', '{}', now() - interval '2 hours 40 minutes');

    insert into public.lembretes_agendados (id, organization_id, para_user_id, quando, mensagem, origem, status, enviado_em, tentativas)
    values
      ('${L_TRAVADO}', '${GOV_ORG}', '${GOV_AGENT_A}', now() - interval '30 minutes', 'travado', 'manual', 'enviando', now() - interval '20 minutes', 1),
      ('${L_RECENTE}', '${GOV_ORG}', '${GOV_AGENT_A}', now() - interval '5 minutes',  'recente', 'manual', 'enviando', now() - interval '2 minutes', 1)
    on conflict do nothing;
  `);
});

const resposta = (leadId: string, expr: string) =>
  sql(`select ${expr} from (select public.fn_opa_resposta_do_lead('${GOV_ORG}', array['${leadId}'::uuid]) -> '${leadId}' as r) x;`);
const minutosAteResposta = (leadId: string) =>
  Number(resposta(leadId, `round(extract(epoch from ((r ->> 'resposta')::timestamptz - (r ->> 'inicio')::timestamptz)) / 60)`));

describe("0122: início e primeira resposta", () => {
  it("lead repassado conta o prazo de quem recebeu, a partir do repasse", () => {
    expect(minutosAteResposta(LEAD_REPASSADO)).toBe(30);
  });

  it("um segundo 'Respondi' não apaga o primeiro: vale a atividade", () => {
    expect(minutosAteResposta(LEAD_DOIS_TOQUES)).toBe(20);
  });
});

describe("0122: lembrete reservado sem confirmação", () => {
  it("'enviando' há mais de 10 min vira falhou e não volta para a fila; o recente fica", () => {
    const reservados = sql(`select id from public.fn_opa_reservar_lembretes(50);`).split("\n");
    expect(reservados).not.toContain(L_TRAVADO);
    expect(reservados).not.toContain(L_RECENTE);
    expect(sql(`select status from public.lembretes_agendados where id = '${L_TRAVADO}';`)).toBe("falhou");
    expect(sql(`select erro is not null from public.lembretes_agendados where id = '${L_TRAVADO}';`)).toBe("t");
    expect(sql(`select status from public.lembretes_agendados where id = '${L_RECENTE}';`)).toBe("enviando");
  });

  it("o status 'enviando' é aceito pela tabela", () => {
    expect(sql(`select count(*) from public.lembretes_agendados where status = 'enviando';`)).not.toBe("0");
  });
});

describe("0122: etiquetas acrescentadas sem perda", () => {
  it("acrescenta sem duplicar e sem apagar as que já estavam", () => {
    expect(sql(`select public.fn_opa_anexar_etiquetas('${LEAD_ETIQUETAS}', array['b', 'a'], '${GOV_ORG}');`)).toBe("{a,b}");
    expect(sql(`select tags from public.crm_leads where id = '${LEAD_ETIQUETAS}';`)).toBe("{a,b}");
  });

  it("org errada não mexe no lead", () => {
    sql(`select public.fn_opa_anexar_etiquetas('${LEAD_ETIQUETAS}', array['c'], '00000000-0000-4000-8000-000000000000');`);
    expect(sql(`select tags from public.crm_leads where id = '${LEAD_ETIQUETAS}';`)).toBe("{a,b}");
  });

  it("visitante anônimo não executa", () => {
    expect(() => sql(`set role anon; select public.fn_opa_anexar_etiquetas('${LEAD_ETIQUETAS}', array['x'], null);`)).toThrow();
  });
});
