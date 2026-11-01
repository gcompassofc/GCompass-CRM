import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it } from "vitest";

import { sql } from "./gov-helpers";

/**
 * 0118 (E1): fn_opa_mesclar_campos grava só as chaves do patch em
 * crm_leads.custom_fields, num único UPDATE. Antes, cada ação lia o objeto
 * inteiro e o gravava de volta, e a segunda apagava o que a primeira gravou
 * (o "Respondi" da fila contra o copiloto, uma ligação no meio de um salvar).
 */

const ORG = "0118aaaa-0000-4000-8000-000000000001";
const OUTRA_ORG = "0118aaaa-0000-4000-8000-000000000002";
const USER = "0118aaaa-1111-4000-8000-000000000001";
const FORASTEIRO = "0118aaaa-1111-4000-8000-000000000002";
const PIPELINE = "0118aaaa-3333-4000-8000-000000000001";
const STAGE = "0118aaaa-4444-4000-8000-000000000001";
const LEAD = "0118aaaa-5555-4000-8000-000000000001";

const container = process.env.TEST_DB_CONTAINER;
if (!container) throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:db` (scripts/test-db.sh)");
const execFileAsync = promisify(execFile);

/** Mesma chamada de sql(), mas assíncrona: várias sessões psql ao mesmo tempo. */
function sqlAsync(script: string): Promise<string> {
  const p = execFileAsync("docker", ["exec", "-i", container!, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-tA", "-f", "-"]);
  p.child.stdin?.end(script);
  return p.then((r) => r.stdout.trim());
}

const guardar = (cf: string) => sql(`update crm_leads set custom_fields = '${cf}'::jsonb where id = '${LEAD}';`);
const ler = () => JSON.parse(sql(`select custom_fields from crm_leads where id = '${LEAD}';`)) as Record<string, unknown>;
const chamar = (args: string) => sql(`select public.fn_opa_mesclar_campos('${LEAD}', ${args});`);

beforeAll(() => {
  sql(`
    insert into auth.users (id) values ('${USER}'), ('${FORASTEIRO}') on conflict do nothing;
    insert into organizations (id, slug, legal_name, display_name) values
      ('${ORG}', 'org-0118', 'Org 0118', 'Org 0118'),
      ('${OUTRA_ORG}', 'org-0118-b', 'Org 0118 B', 'Org 0118 B') on conflict (id) do nothing;
    insert into user_organizations (user_id, organization_id, role, accepted_at)
      values ('${USER}', '${ORG}', 'admin', now()) on conflict do nothing;
    insert into crm_pipelines (id, organization_id, name, slug)
      values ('${PIPELINE}', '${ORG}', 'Pipeline 0118', 'pipeline-0118') on conflict (id) do nothing;
    insert into crm_stages (id, organization_id, pipeline_id, name, slug, position)
      values ('${STAGE}', '${ORG}', '${PIPELINE}', 'Etapa', 'etapa', 1000) on conflict (id) do nothing;
    insert into crm_leads (id, organization_id, pipeline_id, stage_id, title)
      values ('${LEAD}', '${ORG}', '${PIPELINE}', '${STAGE}', 'Lead 0118') on conflict (id) do nothing;
  `);
});

describe("0118: fn_opa_mesclar_campos", () => {
  it("grava só a chave do patch e deixa as outras como estão", () => {
    guardar('{"respondido_em":"2026-10-31T10:00:00Z","copiloto":{"resumo":"velho"}}');
    chamar(`'{"ultima_ligacao":{"resultado":"atendeu"}}'::jsonb`);
    expect(ler()).toEqual({
      respondido_em: "2026-10-31T10:00:00Z",
      copiloto: { resumo: "velho" },
      ultima_ligacao: { resultado: "atendeu" },
    });
  });

  it("p_mesclar junta um nível abaixo; sem ele o objeto novo substitui o antigo", () => {
    guardar('{"opa":{"finalidade":"Moradia"},"copiloto":{"resumo":"velho","mensagem":"rascunho"}}');
    chamar(`'{"opa":{"regiao":"Sul"},"copiloto":{"resumo":"novo"}}'::jsonb, p_mesclar => '{opa}'`);
    expect(ler()).toEqual({
      opa: { finalidade: "Moradia", regiao: "Sul" },
      copiloto: { resumo: "novo" },
    });
  });

  it("p_remover tira as chaves e atualiza last_activity_at só quando pedido", () => {
    guardar('{"lembretes_desligados":true,"lembretes_desligados_em":"2026-10-30","opa":{"a":"b"}}');
    sql(`update crm_leads set last_activity_at = '2020-01-01' where id = '${LEAD}';`);
    chamar(`'{}'::jsonb, p_remover => '{lembretes_desligados,lembretes_desligados_em}'`);
    expect(ler()).toEqual({ opa: { a: "b" } });
    expect(sql(`select last_activity_at::date from crm_leads where id = '${LEAD}';`)).toBe("2020-01-01");
    chamar(`'{}'::jsonb, p_atividade => '2026-10-31T12:00:00Z'`);
    expect(sql(`select last_activity_at::date from crm_leads where id = '${LEAD}';`)).toBe("2026-10-31");
  });

  it("lead com custom_fields vazio recebe o patch, e patch que não é objeto é recusado", () => {
    guardar("{}");
    chamar(`'{"a":1}'::jsonb`);
    expect(ler()).toEqual({ a: 1 });
    expect(() => chamar(`'[1]'::jsonb`)).toThrow();
    expect(ler()).toEqual({ a: 1 });
  });

  it("p_org de outra organização não encontra o lead", () => {
    guardar('{"a":1}');
    expect(chamar(`'{"b":2}'::jsonb, p_org => '${OUTRA_ORG}'`)).toBe("");
    expect(ler()).toEqual({ a: 1 });
    expect(chamar(`'{"b":2}'::jsonb, p_org => '${ORG}'`)).toContain('"b": 2');
  });

  it("8 gravações simultâneas de chaves diferentes: nenhuma se perde", async () => {
    guardar("{}");
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        sqlAsync(`select public.fn_opa_mesclar_campos('${LEAD}', '{"k${i}": ${i}}'::jsonb);`),
      ),
    );
    const cf = ler();
    expect(Object.keys(cf).sort()).toEqual(Array.from({ length: 8 }, (_, i) => `k${i}`).sort());
  });

  it("quem não vê o lead (RLS) não grava, e anônimo nem executa", () => {
    guardar('{"a":1}');
    const comoMembro = sql(`
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${USER}"}', false);
      select public.fn_opa_mesclar_campos('${LEAD}', '{"b":2}'::jsonb);
    `);
    expect(comoMembro.split("\n").at(-1)).toContain('"b": 2');
    const comoForasteiro = sql(`
      set role authenticated;
      select set_config('request.jwt.claims', '{"sub":"${FORASTEIRO}"}', false);
      select coalesce(public.fn_opa_mesclar_campos('${LEAD}', '{"c":3}'::jsonb)::text, 'NULO');
    `);
    expect(comoForasteiro.split("\n").at(-1)).toBe("NULO");
    expect(ler()).toEqual({ a: 1, b: 2 });
    expect(() => sql(`set role anon; select public.fn_opa_mesclar_campos('${LEAD}', '{"d":4}'::jsonb);`)).toThrow();
  });
});
