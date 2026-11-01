import { beforeAll, describe, expect, it } from "vitest";

import { GOV_ORG, GOV_PIPELINE, GOV_SESSION, GOV_STAGE, GOV_AGENT_A, seedGov, sql } from "./gov-helpers";

/**
 * 0119 (OPA, 31/10/2026): a rotina de lembretes.
 *  - fn_opa_reservar_lembretes entrega cada lembrete vencido a uma rodada só;
 *  - opa_avisos impede o mesmo aviso duas vezes e fica fechada ao app;
 *  - fn_opa_resposta_do_lead acha o início da espera e a primeira resposta por lead
 *    (mensagem, ligação ou "Respondi").
 */

const id = (n: number) => `0119aaaa-0000-4000-8000-${String(n).padStart(12, "0")}`;
const L_VENCIDO = id(1);
const L_FUTURO = id(2);
const L_VELHO = id(3);

// leads de teste da conta da resposta: um contato e uma conversa para cada
const LEAD = { mensagem: 10, ligacao: 11, respondi: 12, nada: 13, antigo: 14 } as const;
const contato = (n: number) => id(n + 100);
const conversa = (n: number) => id(n + 200);
const lead = (n: number) => id(n + 300);

beforeAll(() => {
  seedGov();
  const contatos = Object.values(LEAD)
    .map((n) => `('${contato(n)}', '${GOV_ORG}', 'Lead ${n} da rotina')`)
    .join(",");
  const conversas = Object.values(LEAD)
    .map((n) => `('${conversa(n)}', '${GOV_ORG}', '${contato(n)}', '${GOV_SESSION}', 'open')`)
    .join(",");
  sql(`
    insert into public.contacts (id, organization_id, display_name) values ${contatos} on conflict do nothing;
    insert into public.conversations (id, organization_id, contact_id, channel_session_id, status) values ${conversas} on conflict do nothing;

    -- Todos criados "há 3 horas".
    insert into public.crm_leads (id, organization_id, pipeline_id, stage_id, contact_id, title, owner_user_id, created_at, custom_fields)
    values
      ('${lead(LEAD.mensagem)}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', '${contato(LEAD.mensagem)}', 'Mensagem', '${GOV_AGENT_A}', now() - interval '3 hours', '{}'),
      ('${lead(LEAD.ligacao)}',  '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', '${contato(LEAD.ligacao)}',  'Ligação',  '${GOV_AGENT_A}', now() - interval '3 hours', '{}'),
      ('${lead(LEAD.respondi)}', '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', '${contato(LEAD.respondi)}', 'Respondi', '${GOV_AGENT_A}', now() - interval '3 hours',
        jsonb_build_object('respondido_em', to_char((now() - interval '2 hours 15 minutes') at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))),
      ('${lead(LEAD.nada)}',     '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', '${contato(LEAD.nada)}',     'Nada',     '${GOV_AGENT_A}', now() - interval '3 hours', '{}'),
      ('${lead(LEAD.antigo)}',   '${GOV_ORG}', '${GOV_PIPELINE}', '${GOV_STAGE}', '${contato(LEAD.antigo)}',   'Antigo',   '${GOV_AGENT_A}', now() - interval '3 hours', '{}')
    on conflict do nothing;

    -- Mensagem: o cliente escreveu 10 min antes de virar lead; o corretor respondeu 30 min depois da criação.
    insert into public.messages (organization_id, conversation_id, contact_id, channel_session_id, type, direction, status, body, sent_at)
    values
      ('${GOV_ORG}', '${conversa(LEAD.mensagem)}', '${contato(LEAD.mensagem)}', '${GOV_SESSION}', 'text', 'inbound',  'received', 'oi',    now() - interval '3 hours 10 minutes'),
      ('${GOV_ORG}', '${conversa(LEAD.mensagem)}', '${contato(LEAD.mensagem)}', '${GOV_SESSION}', 'text', 'outbound', 'sent',     'olá',   now() - interval '2 hours 30 minutes'),
      -- Antigo: o cliente escreveu 3 dias antes de o lead existir, e ninguém respondeu depois.
      ('${GOV_ORG}', '${conversa(LEAD.antigo)}', '${contato(LEAD.antigo)}', '${GOV_SESSION}', 'text', 'inbound', 'received', 'faz tempo', now() - interval '3 days');

    -- Ligação 20 min depois de criado.
    insert into public.crm_lead_activities (organization_id, lead_id, source_module, type, payload, performed_at)
    values ('${GOV_ORG}', '${lead(LEAD.ligacao)}', 'opa', 'ligacao', '{"resultado":"atendeu"}', now() - interval '2 hours 40 minutes');

    -- Lembretes agendados.
    insert into public.lembretes_agendados (id, organization_id, para_user_id, quando, mensagem, origem)
    values
      ('${L_VENCIDO}', '${GOV_ORG}', '${GOV_AGENT_A}', now() - interval '5 minutes', 'vencido', 'manual'),
      ('${L_FUTURO}',  '${GOV_ORG}', '${GOV_AGENT_A}', now() + interval '1 day',     'futuro',  'manual'),
      ('${L_VELHO}',   '${GOV_ORG}', '${GOV_AGENT_A}', now() - interval '3 days',    'velho',   'manual')
    on conflict do nothing;
  `);
});

const campo = (tabela: string, linha: string, coluna: string) => sql(`select ${coluna} from public.${tabela} where id = '${linha}';`);

describe("0119: lembretes agendados são reservados uma vez", () => {
  it("o vencido sai uma vez, com tentativa e hora do envio; o futuro espera; o de 3 dias atrás falha", () => {
    const reservados = sql(`select id from public.fn_opa_reservar_lembretes(50);`).split("\n");
    expect(reservados).toContain(L_VENCIDO);
    expect(reservados).not.toContain(L_FUTURO);
    expect(reservados).not.toContain(L_VELHO);

    expect(campo("lembretes_agendados", L_VENCIDO, "status || '|' || tentativas || '|' || (enviado_em is not null)")).toBe("enviado|1|true");
    expect(campo("lembretes_agendados", L_FUTURO, "status")).toBe("pendente");
    expect(campo("lembretes_agendados", L_VELHO, "status")).toBe("falhou");
  });

  it("uma segunda rodada não pega o mesmo lembrete de novo", () => {
    const segunda = sql(`select id from public.fn_opa_reservar_lembretes(50);`).split("\n");
    expect(segunda).not.toContain(L_VENCIDO);
  });

  it("o app (authenticated) não consegue reservar lembrete", () => {
    expect(() => sql(`set role authenticated; select * from public.fn_opa_reservar_lembretes(1);`)).toThrow();
  });
});

describe("0119: opa_avisos", () => {
  const chave = `insert into public.opa_avisos (organization_id, lead_id, user_id, tipo, marca)
                 values ('${GOV_ORG}', '${lead(LEAD.nada)}', '${GOV_AGENT_A}', 'aviso_20', '2026-11-02T10:00:00.000Z')`;

  it("o mesmo aviso (lead, tipo, marca, pessoa) não entra duas vezes", () => {
    sql(`${chave};`);
    expect(() => sql(`${chave};`)).toThrow();
    // outra espera do mesmo lead (outra marca) pode avisar de novo
    sql(`insert into public.opa_avisos (organization_id, lead_id, user_id, tipo, marca)
         values ('${GOV_ORG}', '${lead(LEAD.nada)}', '${GOV_AGENT_A}', 'aviso_20', '2026-11-02T14:00:00.000Z');`);
    expect(sql(`select count(*) from public.opa_avisos where lead_id = '${lead(LEAD.nada)}';`)).toBe("2");
  });

  it("o app não lê nem escreve a tabela", () => {
    expect(() => sql(`set role authenticated; select count(*) from public.opa_avisos;`)).toThrow();
    expect(() => sql(`set role anon; select count(*) from public.opa_avisos;`)).toThrow();
  });
});

describe("0119: início e primeira resposta por lead", () => {
  const ids = Object.values(LEAD).map((n) => `'${lead(n)}'::uuid`).join(",");
  const consulta = (n: number, expr: string) =>
    sql(`select ${expr} from (select public.fn_opa_resposta_do_lead('${GOV_ORG}', array[${ids}]) as r) x;`.replaceAll("$ID", lead(n)));
  const minutos = (n: number) =>
    Number(
      consulta(
        n,
        `round(extract(epoch from ((r -> '$ID' ->> 'resposta')::timestamptz - (r -> '$ID' ->> 'inicio')::timestamptz)) / 60)`,
      ),
    );

  it("mensagem: a espera começa na mensagem do cliente (10 min antes do lead) e termina na resposta do corretor", () => {
    expect(minutos(LEAD.mensagem)).toBe(40);
  });

  it("ligação conta como resposta, a contar da criação do lead", () => {
    expect(minutos(LEAD.ligacao)).toBe(20);
  });

  it("'Respondi' conta como resposta, a contar da criação do lead", () => {
    expect(minutos(LEAD.respondi)).toBe(45);
  });

  it("sem mensagem, ligação nem 'Respondi', não há resposta", () => {
    expect(consulta(LEAD.nada, `(r -> '$ID' ->> 'resposta') is null`)).toBe("t");
  });

  it("mensagem de cliente de mais de um dia antes do lead não puxa o início para trás", () => {
    expect(consulta(LEAD.antigo, `(r -> '$ID' ->> 'resposta') is null and abs(extract(epoch from now() - (r -> '$ID' ->> 'inicio')::timestamptz) / 3600 - 3) < 0.1`)).toBe("t");
  });
});
