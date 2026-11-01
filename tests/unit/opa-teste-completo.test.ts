/**
 * Regressões achadas no teste completo de 01/11/2026 (corretor, gestor e
 * administrador no navegador). Cada caso trava o padrão que o defeito quebrou:
 *
 *  - depois do login todos caíam na Inbox genérica, e não no Hoje da OPA: o
 *    destino padrão estava fixo em "/app/inbox" em 8 lugares; "/app" escolhe pelo
 *    perfil (app/app/page.tsx);
 *  - o tutorial de boas-vindas nunca abria: ele perguntava a sessão ao navegador,
 *    mas o cookie é HttpOnly e o getSession() volta vazio; a marca agora vem do
 *    servidor (loadAuthUser);
 *  - a ficha não tinha "Ligar": o corretor no celular precisava copiar o número;
 *  - "Salvar prazos", "Salvar captação" e "Salvar horário" não davam retorno.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { deveAbrirSozinho } from "@/lib/opa/tutorial";

const raiz = process.cwd();
const ler = (arq: string) => readFileSync(join(raiz, arq), "utf8");

describe("destino depois do login", () => {
  const arquivos = [
    "app/actions/auth/signInWithPassword.ts",
    "app/actions/auth/verifyMfa.ts",
    "app/actions/onboarding/finishOnboarding.ts",
    "app/actions/team/acceptInvite.ts",
    "app/(public)/login/mfa/page.tsx",
    "components/auth/LoginForm.tsx",
  ];
  it.each(arquivos)("%s não fixa a Inbox como destino padrão", (arq) => {
    expect(ler(arq)).not.toContain('"/app/inbox"');
  });
  it("a raiz /app escolhe o Hoje no perfil imobiliária", () => {
    expect(ler("app/app/page.tsx")).toMatch(/imobiliaria" \? "\/app\/hoje"/);
  });
});

describe("tutorial no primeiro acesso", () => {
  it("não depende da sessão lida no navegador (cookie HttpOnly)", () => {
    const fonte = ler("app/app/_opa/tutorial.tsx");
    expect(fonte).not.toMatch(/getSession\(\)\s*\.then/);
    expect(fonte).toContain("user.tutorial_opa");
  });
  it("o servidor entrega a marca do tutorial junto com o usuário", () => {
    expect(ler("lib/auth/server.ts")).toMatch(/tutorial_opa: user\.user_metadata\?\.tutorial_opa/);
  });
  it("abre para quem nunca viu e não abre para quem já viu, com a marca vinda do servidor", () => {
    expect(deveAbrirSozinho("agent", false, { tutorial_opa: null })).toBe("corretor");
    expect(deveAbrirSozinho("agent", false, { tutorial_opa: { corretor: "2026-11-01T17:00:00Z" } })).toBeNull();
    expect(deveAbrirSozinho("manager", false, { tutorial_opa: { corretor: "2026-11-01T17:00:00Z" } })).toBe("gestor");
  });
});

describe("ficha do lead", () => {
  it("tem Ligar em um toque (tel:) ao lado de Registrar ligação", () => {
    const fonte = ler("app/app/leads/[id]/page.tsx");
    expect(fonte).toMatch(/href=\{`tel:\+\$\{lead\.telefone\.replace/);
  });
});

describe("Configurações", () => {
  it.each(["salvarPrazos", "salvarCaptacao", "salvarHorario"])("%s mostra retorno ao salvar", (acao) => {
    const fonte = ler("app/app/configuracoes/page.tsx");
    expect(fonte).toMatch(new RegExp(`<FormComRetorno action=\\{${acao}\\} sucesso="`));
    expect(fonte).not.toContain(`<form action={${acao}}`);
  });
});
