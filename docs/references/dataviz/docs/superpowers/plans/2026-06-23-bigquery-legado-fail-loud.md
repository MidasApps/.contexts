# Caminho legado `/api/bigquery` fail-loud (G9) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O caminho legado `/api/bigquery` para de mascarar campo indisponível com `'0'` (números errados silenciosos) e passa a falhar alto: lança `FieldUnavailableError`, que a rota mapeia para 422 nomeando o campo.

**Architecture:** `FieldUnavailableError` + `resolveColumnOrThrow` em `schema-resolver.ts`; o helper privado `col()` de `queries.ts` delega para `resolveColumnOrThrow` (lança em vez de `?? '0'`); a rota distingue o erro e retorna 422.

**Tech Stack:** TypeScript, Next.js App Router, Vitest.

## Global Constraints

- TDD obrigatório: teste-primeiro, RED→GREEN→refactor.
- Só o caso `null`-explícito muda. Sem schema / sem mapping ⇒ nome canônico/real (inalterado) — **OM e clientes sem schema seguem funcionando**.
- Sem feature flag (decisão: pré-produção).
- Mensagem de erro segura (nomeia `table.field`, não vaza SQL/topologia).
- WHERE-clause builders NÃO mudam (já são fail-safe).
- Spec: `docs/superpowers/specs/2026-06-23-bigquery-legado-fail-loud-design.md`.

## File Structure

- `src/shared/lib/bigquery/schema-resolver.ts` — `FieldUnavailableError` + `resolveColumnOrThrow` (Task 1).
- `src/shared/lib/bigquery/queries.ts` — `col()` delega para `resolveColumnOrThrow` (Task 1).
- `app/api/bigquery/route.ts` — `catch` mapeia `FieldUnavailableError` → 422 (Task 2).
- Testes: `src/shared/lib/bigquery/__tests__/schema-resolver.test.ts` (criar, Task 1); `app/api/bigquery/__tests__/route.test.ts` (criar, Task 2).

---

## Task 1: `resolveColumnOrThrow` fail-loud + `col()` delega

**Files:**
- Modify: `src/shared/lib/bigquery/schema-resolver.ts` (add `FieldUnavailableError`, `resolveColumnOrThrow`)
- Modify: `src/shared/lib/bigquery/queries.ts` (`col()` delega)
- Test: `src/shared/lib/bigquery/__tests__/schema-resolver.test.ts` (criar)

**Interfaces:**
- Produces: `class FieldUnavailableError extends Error { table: string; field: string }`; `function resolveColumnOrThrow(schema, table, field): string` (lança `FieldUnavailableError` quando o campo é `null`-mapeado; senão retorna a coluna resolvida / canônico).

- [ ] **Step 1: Write the failing test** — criar `src/shared/lib/bigquery/__tests__/schema-resolver.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  resolveColumnOrThrow,
  FieldUnavailableError,
} from '../schema-resolver';

describe('resolveColumnOrThrow', () => {
  it('lança FieldUnavailableError quando o campo é null-mapeado', () => {
    const schema = { contratos: { saldo_devedor: null } };
    expect(() => resolveColumnOrThrow(schema, 'contratos', 'saldo_devedor'))
      .toThrow(FieldUnavailableError);
  });

  it('o erro nomeia table.field', () => {
    const schema = { contratos: { saldo_devedor: null } };
    try {
      resolveColumnOrThrow(schema, 'contratos', 'saldo_devedor');
      expect.unreachable('deveria ter lançado');
    } catch (e) {
      expect(e).toBeInstanceOf(FieldUnavailableError);
      expect((e as FieldUnavailableError).table).toBe('contratos');
      expect((e as FieldUnavailableError).field).toBe('saldo_devedor');
      expect((e as Error).message).toContain('contratos.saldo_devedor');
    }
  });

  it('retorna a coluna mapeada quando há mapping', () => {
    const schema = { contratos: { saldo_devedor: 'vl_saldo' } };
    expect(resolveColumnOrThrow(schema, 'contratos', 'saldo_devedor')).toBe('vl_saldo');
  });

  it('retorna o canônico quando não há schema (OM/sem-schema)', () => {
    expect(resolveColumnOrThrow(null, 'contratos', 'saldo_devedor')).toBe('saldo_devedor');
  });

  it('retorna o canônico quando o campo não está no mapping', () => {
    const schema = { contratos: { outro: 'x' } };
    expect(resolveColumnOrThrow(schema, 'contratos', 'saldo_devedor')).toBe('saldo_devedor');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/lib/bigquery/__tests__/schema-resolver.test.ts`
Expected: FAIL — `resolveColumnOrThrow` / `FieldUnavailableError` não existem (erro de import).

- [ ] **Step 3: Write minimal implementation**

(a) Em `src/shared/lib/bigquery/schema-resolver.ts`, adicionar ao final:
```ts
/**
 * Erro fail-loud (G9): campo explicitamente marcado indisponível (mapping `null`)
 * foi requerido por uma agregação. Substitui o antigo fallback silencioso `'0'`.
 */
export class FieldUnavailableError extends Error {
  constructor(public readonly table: string, public readonly field: string) {
    super(`Campo indisponível para este cliente: ${table}.${field}`);
    this.name = 'FieldUnavailableError';
  }
}

/**
 * Como `resolveColumn`, mas lança `FieldUnavailableError` quando o campo está
 * mapeado para `null` (indisponível). Sem schema / sem mapping ⇒ nome canônico.
 */
export function resolveColumnOrThrow(
  schema: ClientSchema | null | undefined,
  table: string,
  field: string,
): string {
  const resolved = resolveColumn(schema, table, field);
  if (resolved === null) throw new FieldUnavailableError(table, field);
  return resolved;
}
```

(b) Em `src/shared/lib/bigquery/queries.ts`, trocar o import e o helper `col()`:
```ts
import { resolveColumn, resolveColumnOrThrow, safeColumnName, hasField } from './schema-resolver';
```
```ts
/** Resolve field, lançando FieldUnavailableError se o campo for indisponível (G9). */
function col(schema: Schema, table: string, field: string): string {
  return resolveColumnOrThrow(schema, table, field);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/lib/bigquery/__tests__/schema-resolver.test.ts`
Expected: PASS (5 casos).

- [ ] **Step 5: Verify no regression + commit**

Run: `pnpm exec tsc --noEmit` → 0 erros.
```bash
git add src/shared/lib/bigquery/schema-resolver.ts src/shared/lib/bigquery/queries.ts src/shared/lib/bigquery/__tests__/schema-resolver.test.ts
git commit -m "feat(bigquery): col() fail-loud em campo indisponível via resolveColumnOrThrow (G9)"
```

---

## Task 2: Route mapeia `FieldUnavailableError` → 422

**Files:**
- Modify: `app/api/bigquery/route.ts` (import + `catch`)
- Test: `app/api/bigquery/__tests__/route.test.ts` (criar)

**Interfaces:**
- Consumes: `FieldUnavailableError` (Task 1).
- Produces: POST retorna **422** `{ error: '<mensagem nomeando o campo>' }` quando uma query lança `FieldUnavailableError`; demais erros seguem 500 genérico.

- [ ] **Step 1: Write the failing test** — criar `app/api/bigquery/__tests__/route.test.ts`:

```ts
/* @vitest-environment node */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FieldUnavailableError } from '@/shared/lib/bigquery/schema-resolver';

const h = vi.hoisted(() => ({ aggMock: vi.fn(), filterMock: vi.fn() }));

vi.mock('@/shared/lib/bigquery/queries', () => ({
  queryContratosAggregated: h.aggMock,
  queryFilterOptions: h.filterMock,
  // demais exports não são chamados nestes testes
  queryTable: vi.fn(), queryPagamentosEvolucao: vi.fn(), queryFluxoCaixa: vi.fn(),
  comparePeriods: vi.fn(), queryContratosPage: vi.fn(), queryElegibilidadePage: vi.fn(),
  queryPricingPage: vi.fn(), queryPddPage: vi.fn(), querySimulacaoPage: vi.fn(),
  queryRepassePage: vi.fn(), queryDashboardFaixaAtraso: vi.fn(), queryDetalhamento: vi.fn(),
  queryKpiHistory: vi.fn(), queryInadimplenciaDetalhe: vi.fn(),
}));
vi.mock('@/shared/lib/firebase/admin', () => ({
  getDb: () => ({
    collection: () => ({
      get: async () => ({ docs: [{ id: 'c', data: () => ({ dataset: 'ds', schema: { contratos: { saldo_devedor: null } } }) }] }),
    }),
  }),
}));
vi.mock('@/shared/lib/runtime-config', () => ({ isAdminEmail: () => true }));
vi.mock('@/shared/lib/api-auth', () => ({
  verifyAuthToken: async () => 'a@b.com',
  verifyRouteAccess: async () => ({ allowed: true }),
}));
vi.mock('@/shared/lib/permissions/bigquery-action-routes', () => ({ routeForBigQueryAction: () => null }));

import { POST } from '../route';

function req(body: unknown) {
  return { json: async () => body } as never;
}

beforeEach(() => {
  h.aggMock.mockReset(); h.filterMock.mockReset();
});

describe('POST /api/bigquery — fail-loud (G9)', () => {
  it('FieldUnavailableError → 422 nomeando o campo', async () => {
    h.aggMock.mockImplementation(() => { throw new FieldUnavailableError('contratos', 'saldo_devedor'); });
    const res = await POST(req({ action: 'contratos_aggregated', dataset: 'ds', dataBase: '2026-01-31' }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toContain('contratos.saldo_devedor');
  });

  it('ação normal → 200', async () => {
    h.filterMock.mockResolvedValue({ projetos: [] });
    const res = await POST(req({ action: 'filter_options', dataset: 'ds' }));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run app/api/bigquery/__tests__/route.test.ts`
Expected: FAIL — o `catch` atual devolve 500 genérico; o teste do 422 falha (recebe 500).

- [ ] **Step 3: Write minimal implementation** — em `app/api/bigquery/route.ts`:

(a) Adicionar o import (junto aos demais imports do topo):
```ts
import { FieldUnavailableError } from '@/shared/lib/bigquery/schema-resolver';
```

(b) Trocar o bloco `catch`:
```ts
  } catch (error) {
    if (error instanceof FieldUnavailableError) {
      // Fail-loud (G9): campo indisponível para este cliente. Mensagem segura
      // (nomeia table.field, sem vazar SQL/topologia).
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    // Log detalhado fica no servidor; ao cliente vai apenas uma mensagem genérica.
    // Mensagens cruas de ApiError do BigQuery/Firestore expõem SQL gerado,
    // project/dataset/tabela e colunas (topologia interna) — não repassar.
    console.error('[BigQuery API Error]', error);
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run app/api/bigquery/__tests__/route.test.ts`
Expected: PASS (2 casos).

- [ ] **Step 5: Commit**

```bash
git add app/api/bigquery/route.ts app/api/bigquery/__tests__/route.test.ts
git commit -m "feat(bigquery): route mapeia FieldUnavailableError para 422 (G9)"
```

---

## Verificação final (após Task 2)

- [ ] Suíte do escopo: `pnpm exec vitest run src/shared/lib/bigquery app/api/bigquery` → verde.
- [ ] `npx eslint` nos arquivos tocados → 0 erros.
- [ ] `pnpm exec tsc --noEmit` → 0 erros.
- [ ] Suíte completa `pnpm exec vitest run` → só as 6 falhas ambientais pré-existentes (`invalid_rapt`), zero regressão nova.
- [ ] Finalizar com `superpowers:finishing-a-development-branch`.

## Fora deste plano (o track de "matar o legado")
- **G9-B:** endpoint semântico bulk (N métricas/página por chamada).
- **G9-C…N:** migrar páginas fixas para o bulk semântico (lendo `schemaBindings`).
- **G9-final:** remover `/api/bigquery`, `queries.ts`, `schema-resolver.ts`, `ClientSchema`/`client.schema`/`client.dataset`.
