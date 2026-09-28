---
name: playwright
description: Use para testes E2E com Playwright. Keywords: playwright, e2e, browser test.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Playwright

Test runner E2E multi-browser (Chromium, Firefox, WebKit) com auto-wait, trace viewer, codegen e parallelismo nativo. Capabilities: web, API testing, mobile emulation, network mocking.

## Essência
- **Test runner:** `@playwright/test`. Config em `playwright.config.ts` (projects, baseURL, retries, reporter).
- **Page object pattern** recomendado para tests grandes — encapsula seletores em classes.
- **Locators:** preferir **role-based** (`page.getByRole("button", { name: /save/i })`), `getByLabel`, `getByText`. CSS/xpath em último caso.
- **Auto-wait:** locators esperam por visibilidade/enabled automaticamente — sem `sleep`.
- **Assertions web-first:** `await expect(locator).toBeVisible()`, `toHaveText()`, `toHaveURL()`. Retry built-in.
- **Storage state:** `auth.setup.ts` faz login uma vez; testes reusam via `storageState`.
- **Trace viewer:** `--trace on` captura snapshots, network, console. `npx playwright show-trace trace.zip`.
- **Codegen:** `npx playwright codegen <url>` grava ações em código.
- **Network:** `page.route(...)` mocka requests; `page.waitForResponse` espera resposta.
- **API testing:** `request.post(url, { data })` sem browser.
- **Parallel:** workers por projeto; tests independentes.
- **CI:** `--reporter=html,github`; tracing on first retry.

## Procedimento mínimo
1. `npm init playwright@latest` — gera config + workflows.
2. Setup login uma vez (`auth.setup.ts`) → salva storage; demais tests reusam.
3. Escrever tests com locators role-based; `expect(locator)` para assertions.
4. Mock external API com `page.route` quando flakiness/lentidão.
5. CI: rodar headless, trace on retry, upload HTML report como artifact.
6. Local debug: `npx playwright test --debug` ou `--ui` mode.

## Anti-patterns
- `page.locator(".btn-primary")` em vez de `getByRole("button", { name: ... })` → quebra com CSS refactor e ignora accessibility.
- `await page.waitForTimeout(1000)` → use locator wait ou `waitForResponse`.
- Tests dependentes de ordem → cada test isolado, com setup próprio ou storage state.
- Testar UI lib (Radix, shadcn) → testar SEU fluxo.

## Mini-exemplo
```ts
import { test, expect } from "@playwright/test";

test.describe("checkout", () => {
  test("user completes purchase", async ({ page }) => {
    await page.goto("/cart");
    await page.getByRole("button", { name: /checkout/i }).click();
    await page.getByLabel("Card number").fill("4242 4242 4242 4242");
    await page.getByRole("button", { name: /pay/i }).click();
    await expect(page).toHaveURL(/\/orders\/[a-z0-9-]+$/);
    await expect(page.getByRole("heading", { name: /success/i })).toBeVisible();
  });
});
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/testing/playwright.md`
