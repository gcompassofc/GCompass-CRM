import { expect, test, type Page } from "@playwright/test";

/**
 * Tour guiado do CRM da OPA (01/11/2026): abre o tour da Fila pelo endereço,
 * confere que o recorte está em volta do elemento real, que a seta avança e
 * que Esc fecha.
 *
 * Precisa do CRM local com o seed da OPA (`npx tsx scripts/seed-opa.ts`) e
 * `APP_PROFILE=imobiliaria`. Fora disso, pula: E2E_OPA=1 liga.
 */
test.skip(process.env.E2E_OPA !== "1", "rode com E2E_OPA=1 sobre o seed da OPA");

const SENHA = process.env.E2E_OPA_SENHA ?? "OpaCrm2026!";

async function entrar(page: Page, email: string) {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(SENHA);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app\//);
}

/** O recorte contém o elemento (com a folga de 8 px, e preso à tela). */
async function recorteEnvolve(page: Page, alvo: string) {
  const recorte = await page.locator("[data-tour-recorte]").boundingBox();
  const el = await page.locator(`[data-tour="${alvo}"]`).first().boundingBox();
  expect(recorte, "recorte na tela").not.toBeNull();
  expect(el, `elemento ${alvo} na tela`).not.toBeNull();
  const vp = page.viewportSize()!;
  expect(recorte!.x).toBeLessThanOrEqual(Math.max(4, el!.x) + 1);
  expect(recorte!.y).toBeLessThanOrEqual(Math.max(4, el!.y) + 1);
  expect(recorte!.x + recorte!.width).toBeGreaterThanOrEqual(Math.min(vp.width - 4, el!.x + el!.width) - 1);
  expect(recorte!.y + recorte!.height).toBeGreaterThanOrEqual(Math.min(vp.height - 4, el!.y + el!.height) - 1);
}

test("tour da Fila: recorte no elemento, avança com a seta e fecha com Esc", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 860 });
  await entrar(page, "luana@opa.local");
  await page.goto("/app/fila?tour=fila&como=corretor");

  const balao = page.getByRole("dialog", { name: /responda primeiro este/i });
  await expect(balao).toBeVisible({ timeout: 10_000 });
  // Espera a transição do recorte assentar.
  await page.waitForTimeout(600);
  await recorteEnvolve(page, "fila-proximo");
  await expect(page.getByText(/1 de \d/)).toBeVisible();

  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("dialog", { name: /prazo do primeiro atendimento/i })).toBeVisible();
  await page.waitForTimeout(600);
  await recorteEnvolve(page, "fila-prazo");

  await page.keyboard.press("Escape");
  await expect(page.locator("[data-tour-ativo]")).toHaveCount(0);
});
