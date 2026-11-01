import { expect, test, type Page } from "@playwright/test";

/**
 * Ficha do lead aguenta ações seguidas sem recarregar (falha aberta do teste
 * completo de 01/11/2026: depois de registrar ligação, agendar mensagem e
 * confirmar sugestão em sequência, o React quebrava com `insertBefore` e os
 * botões "Ligar" e "Registrar ligação" sumiam até recarregar a página).
 *
 * Repete a sequência várias vezes na MESMA ficha e exige: nenhum erro de página,
 * nenhum `insertBefore`/`removeChild` no console, e os botões de ação no lugar.
 *
 * Precisa do CRM local com o seed da OPA e build de produção (`next start`):
 * E2E_OPA=1 liga. FICHA_REPETICOES muda o número de voltas (padrão 20).
 */
test.skip(process.env.E2E_OPA !== "1", "rode com E2E_OPA=1 sobre o seed da OPA");

const SENHA = process.env.E2E_OPA_SENHA ?? "OpaCrm2026!";
const VOLTAS = Number(process.env.FICHA_REPETICOES ?? 20);
const CELULAR = process.env.FICHA_CELULAR === "1";

async function entrar(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(SENHA);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app\//);
}

/**
 * Faz a ação e espera a Server Action responder e a tela se atualizar. Esperar só
 * pelo aviso não serve: o aviso da volta anterior ainda está na tela.
 */
async function comAcao(page: Page, fazer: () => Promise<void>, rapido: boolean) {
  const resposta = page.waitForResponse(
    (r) => r.request().method() === "POST" && Boolean(r.request().headers()["next-action"]),
    { timeout: 20_000 },
  );
  await fazer();
  // No modo rápido a próxima ação sai com a atualização da tela ainda em andamento,
  // que é como o corretor usa (e como a falha aparecia).
  if (rapido) return;
  await resposta;
  await page.waitForLoadState("networkidle");
}

for (const rapido of [false, true]) {
  test(`ficha do lead: ações seguidas não quebram a tela (${rapido ? "rápido" : "esperando"})`, async ({ page }) => {
    test.setTimeout(VOLTAS * 45_000 + 60_000);
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && !/favicon|Failed to load resource/i.test(m.text())) erros.push(`console: ${m.text()}`);
    });

    await page.setViewportSize(CELULAR ? { width: 390, height: 844 } : { width: 1366, height: 900 });
    await entrar(page, "luana@opa.local");

    // Um lead com anotação do copiloto para confirmar (é a ação que mais quebrava).
    await page.goto("/app/leads");
    const links = await page.locator('a[href^="/app/leads/"]').evaluateAll((as) =>
      [...new Set(as.map((a) => (a as HTMLAnchorElement).getAttribute("href")!).filter((h) => /\/app\/leads\/[0-9a-f-]{36}$/.test(h)))],
    );
    let achou = false;
    for (const href of links.slice(0, 15)) {
      await page.goto(href);
      if ((await page.getByRole("button", { name: /confirmar anotação/i }).count()) > 0) {
        achou = true;
        break;
      }
    }
    if (!achou && links[0]) await page.goto(links[0]);
    // FICHA_LEAD força um lead (ex.: um com conversa, para o selo "Lendo a conversa" atualizar a tela junto).
    if (process.env.FICHA_LEAD) await page.goto(`/app/leads/${process.env.FICHA_LEAD}`);
    await page.keyboard.press("Escape");

    console.log(`ficha ${page.url()} · selo "Lendo": ${await page.getByText("Lendo a conversa", { exact: true }).count()}`);
    const registrar = page.getByRole("button", { name: /registrar ligação/i });
    const ligar = page.getByRole("link", { name: /^ligar para/i });

    for (let i = 0; i < VOLTAS; i++) {
      await registrar.click();
      await comAcao(page, () => page.getByRole("menuitem", { name: /não atendeu/i }).click(), rapido);

      await page.getByRole("button", { name: /agendar mensagem/i }).click();
      await comAcao(page, () => page.getByRole("dialog").getByRole("button", { name: /^agendar$/i }).click(), rapido);
      await expect(page.getByRole("dialog")).toHaveCount(0);

      const confirmar = page.getByRole("button", { name: /confirmar anotação/i }).first();
      if (await confirmar.isVisible().catch(() => false)) {
        await comAcao(page, () => confirmar.click(), rapido);
      }

      await expect(registrar, `volta ${i + 1}: Registrar ligação no lugar`).toBeVisible();
      await expect(ligar, `volta ${i + 1}: Ligar no lugar`).toBeVisible();
      expect(erros, `volta ${i + 1}`).toEqual([]);
    }
    await page.waitForLoadState("networkidle");
    await expect(registrar).toBeVisible();
    expect(erros).toEqual([]);
  });
}
