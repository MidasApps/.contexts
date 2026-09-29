---
name: playwright
description: "Use para testes E2E com Playwright (@playwright/test@1.63.0) — config, locators role-first, storage state, network mock, a11y, visual regression, CI. Keywords: playwright, e2e, browser test, .spec.ts, axe, trace."
---
# Playwright

Test runner E2E multi-browser (Chromium, Firefox, WebKit) com auto-wait, trace viewer, codegen e parallelismo nativo. Baseline **@playwright/test@1.63.0**. Capabilities: web, API testing, mobile emulation, network mocking. **Component testing (`@playwright/experimental-ct-react`) não é adotado (E5, ADR 0004):** teste de componente roda no Vitest browser mode (skill `vitest`).

## Essência
- **Test runner:** `@playwright/test`. Config em `playwright.config.ts` (projects, baseURL, retries, reporter).
- **Fixtures (`test.extend`)** e helpers de página para tests grandes — encapsulam seletores e setup; prefira funções/fixtures a hierarquias de classes.
- **Locators:** preferir **role-based** (`page.getByRole("button", { name: /save/i })`), `getByLabel`, `getByText`. CSS/xpath em último caso.
- **Auto-wait:** locators esperam por visibilidade/enabled automaticamente — sem `sleep`.
- **Assertions web-first:** `await expect(locator).toBeVisible()`, `toHaveText()`, `toHaveURL()`. Retry built-in.
- **Storage state:** `e2e/global.setup.ts` faz login uma vez; testes reusam via `storageState`.
- **Trace viewer:** `--trace on` captura snapshots, network, console. `npx playwright show-trace trace.zip`.
- **Codegen:** `npx playwright codegen <url>` grava ações em código.
- **Network:** `page.route(...)` mocka requests; `page.waitForResponse` espera resposta.
- **API testing:** `request.post(url, { data })` sem browser.
- **Parallel:** workers por projeto; tests independentes.
- **CI:** `--reporter=html,github`; tracing on first retry; `pnpm build` antes (webServer usa `pnpm start`). Smoke pós-deploy: project `smoke` (tag `@smoke`) com `PLAYWRIGHT_BASE_URL`.

## Procedimento mínimo
1. `pnpm add -D @playwright/test@1.63.0` + `pnpm exec playwright install --with-deps` (ou `pnpm create playwright` para gerar config + workflow).
2. Testes e2e em `e2e/` (`testDir: './e2e'`, arquivos `*.spec.ts`). Setup login uma vez (`e2e/global.setup.ts`) → salva storage em `e2e/.auth/` (gitignored); demais tests reusam.
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
