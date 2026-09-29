---
name: vitest
description: Use para testes unitários, de integração e de componente com Vitest 5 (vitest@5.0.2) — config, fakes, mocks, coverage, browser mode, projects. Keywords: vitest, unit test, integration test, mock, fake, coverage, .test.ts.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Vitest

Test runner Vite-native, API compatível com Jest, ESM-first, TS de fábrica. Baseline **vitest@5.0.2** (pacotes `@vitest/*` na mesma versão; Node `^22.12 || ^24 || >=26`, Vite `^6.4 || ^7 || ^8` como peer). Watch mode, UI, coverage v8/istanbul, browser mode estável (`@vitest/browser-playwright`). Teste de componente fica aqui: o CT do Playwright não é adotado (E5).

## Essência
- **API Jest-like:** `describe`, `it`/`test`, `expect`, `beforeEach`, `afterAll`. Importar de `"vitest"` (ou globals via config).
- **Config:** `vitest.config.ts` ou seção `test:` em `vite.config.ts`. `environment: "node" | "jsdom" | "happy-dom"`.
- **Mocks:** fakes em memória para ports driven; `vi.fn()`/`vi.mock("module", factory)` só em boundaries externas (HTTP, clock). Evite `expect(spy).toHaveBeenCalledWith` quando dá para assertar o resultado.
- **Fake timers:** `vi.useFakeTimers()`, `vi.advanceTimersByTime`, `vi.setSystemTime`.
- **Snapshots:** `toMatchSnapshot()`, `toMatchInlineSnapshot()`. Inline preferido para legibilidade.
- **Async:** `expect(promise).resolves.toBe(x)` ou `await expect(...).rejects.toThrow(...)`.
- **Setup/teardown:** `setupFiles` para globals (jsdom polyfills, MSW handlers).
- **Vitest 5:** `clearMocks` é `true` por padrão; `vi.mock`/`vi.hoisted` fora do topo lançam erro; `test.sequential` saiu (use `{ concurrent: false }`). Desde o 4: `poolOptions` removido (opções top-level: `maxWorkers`, `isolate`), `workspace` virou `projects`, provider de browser é objeto (`playwright()`), locators de `vitest/browser`.
- **Coverage:** `--coverage` com v8 (rápido) ou istanbul (maduro); thresholds em config.
- **Watch:** `vitest` (sem `run`) entra em watch; só re-roda testes afetados.
- **UI:** `vitest --ui` abre dashboard local.
- **Test files:** `foo.test.ts(x)` co-located ao lado do código (include `src/**/*.test.{ts,tsx}`); `.spec.ts` é reservado a e2e (Playwright, `e2e/`); sem `__tests__/`.
- **`vi.hoisted()`** para variáveis usadas dentro de `vi.mock` (mock factories são içadas).

## Procedimento mínimo
1. Instalar: `pnpm add -D vitest @vitest/coverage-v8`.
2. Config mínima em `vitest.config.ts` com environment correto.
3. Escrever teste `*.test.ts(x)` co-located, ao lado do código (sem `__tests__/`).
4. Para mock de dependência externa: `vi.mock("./api")` no topo + factory.
5. CI: `vitest run --coverage` (sem watch).
6. Watch local: `vitest` durante desenvolvimento.

## Anti-patterns
- `vi.mock` dentro de `beforeEach` → não funciona; precisa ser top-level.
- Snapshot gigante de 500 linhas → assertar shape específico em vez.
- `setTimeout` real em teste → use fake timers.
- Mockar tudo → teste verifica mocks; teste de comportamento, não de chamadas.
- Compartilhar estado entre testes via variável de módulo → ordem-dependente.

## Mini-exemplo
```ts
// src/services/orders/application/use-cases/place-order.test.ts
import { describe, it, expect } from "vitest";
import { makePlaceOrder } from "@/services/orders/application/use-cases/place-order";
import { makeInMemoryOrderRepository } from "@/services/orders/adapters/driven/in-memory-order-repository";

const tenantId = "01926f3a-8c1e-7b2a-9f4d-3e5b6c7d8e9f"; // uuidv7

describe("placeOrder", () => {
  it("persists the order with its total in minor units", async () => {
    const orders = makeInMemoryOrderRepository();
    const placeOrder = makePlaceOrder({ orders });

    const result = await placeOrder({ tenantId, items: [{ sku: "A1", quantity: 2, unitAmountMinor: 1500 }], currency: "BRL" });

    expect(result).toMatchObject({ ok: true, data: { totalMinor: 3000, currency: "BRL" } });
    expect(await orders.list({ tenantId })).toEqual([expect.objectContaining({ totalMinor: 3000, currency: "BRL" })]);
  });

  it("rejects empty items", async () => {
    const placeOrder = makePlaceOrder({ orders: makeInMemoryOrderRepository() });
    await expect(placeOrder({ tenantId, items: [], currency: "BRL" })).resolves.toMatchObject({ ok: false, error: { code: "ORDER_WITHOUT_ITEMS" } });
  });
});
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/testing/vitest.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
