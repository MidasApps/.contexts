---
name: vitest
description: Use para testes unitários/integração com Vitest. Keywords: vitest, unit test, mock.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Vitest

Test runner Vite-native, API compatível com Jest, mais rápido, ESM-first, TS de fábrica. Watch mode, UI, coverage v8/istanbul, browser mode opcional.

## Essência
- **API Jest-like:** `describe`, `it`/`test`, `expect`, `beforeEach`, `afterAll`. Importar de `"vitest"` (ou globals via config).
- **Config:** `vitest.config.ts` ou seção `test:` em `vite.config.ts`. `environment: "node" | "jsdom" | "happy-dom"`.
- **Mocks:** `vi.fn()`, `vi.spyOn()`, `vi.mock("module", factory)`. Auto-mock via `__mocks__` ou explicit factory.
- **Fake timers:** `vi.useFakeTimers()`, `vi.advanceTimersByTime`, `vi.setSystemTime`.
- **Snapshots:** `toMatchSnapshot()`, `toMatchInlineSnapshot()`. Inline preferido para legibilidade.
- **Async:** `expect(promise).resolves.toBe(x)` ou `await expect(...).rejects.toThrow(...)`.
- **Setup/teardown:** `setupFiles` para globals (jsdom polyfills, MSW handlers).
- **Coverage:** `--coverage` com v8 (rápido) ou istanbul (maduro); thresholds em config.
- **Watch:** `vitest` (sem `run`) entra em watch; só re-roda testes afetados.
- **UI:** `vitest --ui` abre dashboard local.
- **Test files:** `*.test.ts`, `*.spec.ts` por convenção, co-located ou em `__tests__`.
- **`vi.hoisted()`** para variáveis usadas dentro de `vi.mock` (mock factories são içadas).

## Procedimento mínimo
1. Instalar: `pnpm add -D vitest @vitest/coverage-v8`.
2. Config mínima em `vitest.config.ts` com environment correto.
3. Escrever teste `*.test.ts` co-located ou em `__tests__/`.
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
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrder } from "./orders";

vi.mock("./payments", () => ({
  charge: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("createOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects empty items", async () => {
    await expect(createOrder({ items: [] })).rejects.toThrow(/items/);
  });
});
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/testing/vitest.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
