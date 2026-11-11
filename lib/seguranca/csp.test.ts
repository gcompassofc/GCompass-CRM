// @vitest-environment node
import { describe, expect, it } from "vitest";

import { cabecalhoHsts, montarCsp } from "./csp";

const base = { supabaseUrl: "https://abc.supabase.co", appUrl: "https://crm.opailhabela.com.br", dev: false };

function diretiva(csp: string, nome: string): string[] {
  const d = csp.split("; ").find((p) => p.startsWith(`${nome} `));
  return d ? d.split(" ").slice(1) : [];
}

describe("montarCsp", () => {
  it("fetch e WebSocket só para o app e o Supabase", () => {
    const csp = montarCsp(base);
    expect(diretiva(csp, "connect-src")).toEqual(["'self'", "https://abc.supabase.co", "wss://abc.supabase.co"]);
  });

  it("trava moldura, base, formulário e plugin", () => {
    const csp = montarCsp(base);
    expect(diretiva(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(diretiva(csp, "base-uri")).toEqual(["'self'"]);
    expect(diretiva(csp, "form-action")).toEqual(["'self'"]);
    expect(diretiva(csp, "object-src")).toEqual(["'none'"]);
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("sem eval em produção e com eval no dev", () => {
    expect(diretiva(montarCsp(base), "script-src")).not.toContain("'unsafe-eval'");
    expect(diretiva(montarCsp({ ...base, dev: true }), "script-src")).toContain("'unsafe-eval'");
  });

  it("imagem extra só entra se for origem https válida", () => {
    const csp = montarCsp({ ...base, imagensExtras: "https://cdn.exemplo.com.br javascript:alert(1) http://x.com https://a.b/c" });
    const img = diretiva(csp, "img-src");
    expect(img).toContain("https://cdn.exemplo.com.br");
    expect(img.join(" ")).not.toMatch(/javascript|http:\/\/x\.com|a\.b\/c/);
  });

  it("sem CAPTCHA, script e moldura só do próprio domínio", () => {
    const csp = montarCsp(base);
    expect(diretiva(csp, "script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(diretiva(csp, "frame-src")).toEqual(["'self'"]);
    expect(csp).not.toContain("challenges.cloudflare.com");
  });

  it("com CAPTCHA, libera só a Cloudflare em script e moldura", () => {
    const csp = montarCsp({ ...base, captcha: true });
    expect(diretiva(csp, "script-src")).toEqual(["'self'", "'unsafe-inline'", "https://challenges.cloudflare.com"]);
    expect(diretiva(csp, "frame-src")).toEqual(["'self'", "https://challenges.cloudflare.com"]);
    expect(diretiva(csp, "connect-src")).toEqual(["'self'", "https://abc.supabase.co", "wss://abc.supabase.co"]);
  });

  it("HSTS só em https", () => {
    expect(cabecalhoHsts("https://crm.opailhabela.com.br")).toMatch(/max-age=31536000/);
    expect(cabecalhoHsts("http://localhost:3000")).toBeNull();
  });
});
