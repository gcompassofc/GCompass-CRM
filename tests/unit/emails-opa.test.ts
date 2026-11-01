/**
 * E-mails utilitários da OPA (docs/EMAILS-OPA.md): convite, senha alterada,
 * modelos do Supabase Auth e a estrutura do relatório mensal (desligado).
 *
 * @vitest-environment node
 *
 * Ambiente node: os e-mails são montados no servidor, e a marca/papel leem
 * process.env (no jsdom leriam window.__PUBLIC_ENV__, caminho que a produção
 * nunca percorre).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MODELOS_SUPABASE_OPA } from "@/lib/email/modelos-supabase-opa";
import { buildInviteEmail } from "@/lib/email/templates/invite";
import { buildRelatorioMensalEmail } from "@/lib/email/templates/relatorio-mensal";
import { buildSenhaAlteradaEmail } from "@/lib/email/templates/senha-alterada";
import { PADRAO } from "@/lib/opa/config";
import { mesAnterior, montarRelatorio, querRelatorio, rotuloDaOrigem, type DadosDoMes, type LeadDoMes } from "@/lib/opa/relatorio-mensal";

const TRAVESSAO = /[–—]/;

beforeEach(() => {
  vi.stubEnv("APP_PALETTE", "opa");
  vi.stubEnv("APP_PROFILE", "imobiliaria");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("modelos do Supabase Auth (supabase/templates/opa)", () => {
  const tipos: Record<string, string> = {
    "recovery.html": "recovery",
    "invite.html": "invite",
    "magic_link.html": "magiclink",
    "email_change.html": "email_change",
    "confirmation.html": "signup",
  };

  it.each(MODELOS_SUPABASE_OPA.map((m) => [m.arquivo, m] as const))("%s está igual ao que o script gera", (arquivo, m) => {
    const noDisco = readFileSync(join(process.cwd(), "supabase/templates/opa", arquivo), "utf8");
    // Se falhar: npx tsx scripts/gerar-modelos-email-opa.ts e cole de novo no painel.
    expect(noDisco.replace(/\r\n/g, "\n")).toBe(m.html());
  });

  it.each(Object.entries(tipos))("%s leva o link para /auth/confirm com type=%s", (arquivo, tipo) => {
    const html = MODELOS_SUPABASE_OPA.find((m) => m.arquivo === arquivo)!.html();
    expect(html).toContain(`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${tipo}`);
  });

  it("reautenticação mostra o código e não tem link", () => {
    const html = MODELOS_SUPABASE_OPA.find((m) => m.arquivo === "reauthentication.html")!.html();
    expect(html).toContain("{{ .Token }}");
    expect(html).not.toContain("/auth/confirm");
  });

  it("todos na marca da OPA, em português, sem travessão e sem a marca original", () => {
    for (const m of MODELOS_SUPABASE_OPA) {
      const html = m.html();
      expect(html).toContain("{{ .SiteURL }}/opa/opa-logo-email.png");
      expect(html).toContain('lang="pt-BR"');
      expect(m.assunto).toContain("CRM da OPA");
      expect(TRAVESSAO.test(html + m.assunto)).toBe(false);
      expect(html).not.toMatch(/Deskcomm|GCompass/);
    }
  });
});

describe("convite da equipe na marca da OPA", () => {
  const base = {
    inviterName: "Marco",
    orgName: "OPA Imóveis Ilhabela",
    acceptUrl: "https://crm.opailhabela.com.br/team/accept-invite/tok123",
    role: "agent",
    expiresAt: new Date("2026-11-02T18:00:00Z"),
  };

  it("diz o papel como a equipe fala, a validade em Brasília e traz o botão", () => {
    const { subject, html, text } = buildInviteEmail(base);
    expect(subject).toBe("Marco convidou você para o CRM da OPA");
    expect(html).toContain("<strong>Corretor</strong>");
    expect(html).toContain("Aceitar convite");
    expect(html).toContain("02/11, 15:00");
    expect(html).toContain("https://crm.opailhabela.com.br/opa/opa-logo-email.png");
    expect(text).toContain(base.acceptUrl);
    expect(TRAVESSAO.test(subject + html + text)).toBe(false);
  });

  it("gestor aparece como Gestor", () => {
    expect(buildInviteEmail({ ...base, role: "manager" }).html).toContain("<strong>Gestor</strong>");
  });

  it("escapa nome hostil de quem convida", () => {
    const { html } = buildInviteEmail({ ...base, inviterName: '<img src=x onerror="x">' });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });

  it("sem a paleta da OPA, continua o convite genérico", () => {
    vi.stubEnv("APP_PALETTE", "");
    vi.stubEnv("APP_NAME", "GCompass");
    expect(buildInviteEmail(base).subject).toContain("GCompass");
  });
});

describe("aviso de senha alterada", () => {
  it("diz quando foi, o que fazer se não foi você e não leva senha nem dado de lead", () => {
    const { subject, html, text } = buildSenhaAlteradaEmail({ urlBase: "https://crm.opailhabela.com.br/", quando: new Date("2026-11-01T20:30:00Z") });
    expect(subject).toBe("Sua senha do CRM da OPA foi alterada");
    expect(html).toContain("01/11/2026, 17:30");
    expect(html).toContain("https://crm.opailhabela.com.br/login");
    expect(text).toContain("avise agora o administrador");
    expect(TRAVESSAO.test(subject + html + text)).toBe(false);
  });
});

describe("relatório mensal (estrutura, desligado)", () => {
  it("mês anterior no horário de São Paulo, inclusive na virada do ano", () => {
    // 1º de novembro, 00:30 em São Paulo (03:30 UTC): o mês anterior é outubro.
    const out = mesAnterior(Date.parse("2026-11-01T03:30:00Z"));
    expect(out.rotulo).toBe("outubro de 2026");
    expect(new Date(out.de).toISOString()).toBe("2026-10-01T03:00:00.000Z");
    expect(new Date(out.ate).toISOString()).toBe("2026-11-01T03:00:00.000Z");
    // 31 de outubro, 23:30 em São Paulo ainda é outubro (já é novembro em UTC).
    expect(mesAnterior(Date.parse("2026-11-01T02:30:00Z")).rotulo).toBe("setembro de 2026");
    expect(mesAnterior(Date.parse("2027-01-10T12:00:00Z")).rotulo).toBe("dezembro de 2026");
  });

  const terca10h = Date.parse("2026-10-06T13:00:00Z"); // terça, 10:00 em São Paulo
  const min = 60_000;
  const lead = (id: string, extra: Partial<LeadDoMes> = {}): LeadDoMes => ({
    id,
    criadoEm: terca10h,
    origem: "site",
    tags: [],
    donoId: "u-luana",
    etapa: "primeiro-contato",
    status: "open",
    ...extra,
  });

  function dados(extra: Partial<DadosDoMes> = {}): DadosDoMes {
    return {
      mes: mesAnterior(Date.parse("2026-11-01T12:00:00Z")),
      leads: [
        lead("a", { origem: "meta" }),
        lead("b", { tags: ["pago"], etapa: "proposta" }),
        lead("c", { origem: "whatsapp", donoId: "u-diego", etapa: "negociacao" }),
        lead("d", { origem: null, donoId: null, etapa: "visita-agendada" }),
      ],
      respostas: new Map([
        ["a", { inicio: terca10h, resposta: terca10h + 30 * min }],
        ["b", { inicio: terca10h, resposta: terca10h + 120 * min }],
        ["c", { inicio: terca10h, resposta: null }],
      ]),
      perdidos: ["Comprou com outra imobiliária", null, "Comprou com outra imobiliária"],
      vendas: [150_000_000, 90_000_000],
      visitas: ["feita", "feita", "agendada", "cancelada"],
      equipe: new Map([
        ["u-luana", "Luana Machado"],
        ["u-diego", "Diego Matsuda"],
      ]),
      config: PADRAO,
      mostrarValor: false,
      ...extra,
    };
  }

  it("conta origem, prazo por corretor, funil, propostas, vendas e perdas", () => {
    const r = montarRelatorio(dados());
    expect(r.mes).toBe("outubro de 2026");
    expect(r.leadsNovos).toBe(4);
    expect(r.porOrigem).toEqual([
      { rotulo: "Anúncio", total: 2 },
      { rotulo: "Outros", total: 1 },
      { rotulo: "WhatsApp", total: 1 },
    ]);
    // a: no prazo (30 de 60); b: fora (120 de 60); c: orgânico sem resposta até o fim do mês, fora; d: sem resposta, fora.
    expect(r.prazo).toEqual({ avaliados: 4, noPrazo: 1, pct: 25 });
    expect(r.porCorretor).toEqual([
      { nome: "Luana", leads: 2, avaliados: 2, noPrazo: 1, pct: 50 },
      { nome: "Diego", leads: 1, avaliados: 1, noPrazo: 0, pct: 0 },
    ]);
    expect(r.funil.map((f) => f.rotulo)).toEqual(["Primeiro contato", "Visita agendada", "Proposta feita", "Negociação"]);
    expect(r.propostas).toBe(2);
    expect(r.visitas).toEqual({ feitas: 2, agendadas: 1, canceladas: 1 });
    expect(r.vendas).toEqual({ total: 2, valorCents: null });
    expect(r.perdidos).toEqual({ total: 3, motivos: [{ rotulo: "Comprou com outra imobiliária", total: 2 }, { rotulo: "Sem motivo", total: 1 }] });
  });

  it("valor das vendas só aparece quando o gestor vê receita", () => {
    expect(montarRelatorio(dados({ mostrarValor: true })).vendas.valorCents).toBe(240_000_000);
  });

  it("mês sem lead não divide por zero", () => {
    const r = montarRelatorio(dados({ leads: [], respostas: new Map() }));
    expect(r.prazo.pct).toBeNull();
    expect(r.porCorretor).toEqual([]);
  });

  it("origem: pago vale como anúncio mesmo vindo do site", () => {
    expect(rotuloDaOrigem({ origem: "site", tags: ["pago"] })).toBe("Anúncio");
    expect(rotuloDaOrigem({ origem: "indicacao", tags: [] })).toBe("Indicação");
  });

  it("quem pediu para sair não recebe", () => {
    expect(querRelatorio({ emails_opa: { relatorio_mensal: false } })).toBe(false);
    expect(querRelatorio({})).toBe(true);
    expect(querRelatorio(null)).toBe(true);
  });

  it("o e-mail leva só o primeiro nome do corretor e nenhum dado de lead", () => {
    const { subject, html, text } = buildRelatorioMensalEmail(montarRelatorio(dados({ mostrarValor: true })), "https://crm.opailhabela.com.br");
    expect(subject).toBe("Relatório de outubro de 2026: 4 leads novos e 2 vendas");
    expect(html).toContain("Luana");
    expect(html).not.toContain("Machado");
    expect(html).toMatch(/R\$\s?2\.400\.000/);
    expect(TRAVESSAO.test(subject + html + text)).toBe(false);
  });
});
