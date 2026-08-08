/**
 * O e-mail de convite é a primeira coisa que um convidado vê da instalação.
 * Antes destes testes ele cravava "DeskcommCRM" mesmo com a interface já
 * personalizada por APP_NAME — quem instala para cliente mandava convite com a
 * marca errada e só descobria pelo reclamo do convidado.
 *
 * @vitest-environment node
 *
 * O ambiente importa: `branding()` lê `process.env` no servidor e
 * `window.__PUBLIC_ENV__` no navegador. Este e-mail só é montado no servidor, e
 * sob o jsdom padrão da suíte o resolvedor pegaria o caminho do navegador —
 * o teste passaria a exercitar um caminho que a produção nunca percorre.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildInviteEmail, type InviteEmailOptions } from "@/lib/email/templates/invite";

const base: InviteEmailOptions = {
  inviterName: "Ana",
  orgName: "Clínica Nova",
  acceptUrl: "https://crm.exemplo.com.br/team/accept-invite/tok123",
  role: "agent",
  expiresAt: new Date("2026-08-09T15:00:00Z"),
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildInviteEmail — marca da instalação", () => {
  it("usa APP_NAME no assunto, no corpo e na versão texto", () => {
    vi.stubEnv("APP_NAME", "GCompass");

    const { subject, html, text } = buildInviteEmail(base);

    expect(subject).toContain("GCompass");
    expect(html).toContain("GCompass");
    expect(text).toContain("GCompass");
  });

  it("não vaza a marca padrão quando APP_NAME está definida", () => {
    vi.stubEnv("APP_NAME", "GCompass");

    const { subject, html, text } = buildInviteEmail(base);

    // O bug original: "DeskcommCRM" cravado no template, ignorando o .env.
    expect(subject).not.toContain("DeskcommCRM");
    expect(html).not.toContain("DeskcommCRM");
    expect(text).not.toContain("DeskcommCRM");
  });

  it("cai na marca padrão quando APP_NAME está vazia", () => {
    vi.stubEnv("APP_NAME", "");

    const { subject } = buildInviteEmail(base);

    expect(subject).toContain("DeskcommCRM");
  });

  it("escapa marca hostil em vez de injetar HTML", () => {
    vi.stubEnv("APP_NAME", '<script>alert(1)</script>');

    const { html } = buildInviteEmail(base);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("mantém o link de aceite intacto e o prazo visível", () => {
    vi.stubEnv("APP_NAME", "GCompass");

    const { html, text } = buildInviteEmail(base);

    expect(html).toContain(base.acceptUrl);
    expect(text).toContain(base.acceptUrl);
    // Sem o prazo o convidado não sabe que o link morre em 24h.
    expect(html).toContain("expira em");
  });
});
