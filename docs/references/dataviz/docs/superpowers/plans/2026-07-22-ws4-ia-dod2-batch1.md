# WS-4 IA/DoD-2 — Batch 1 (config, tenant-guard, persistência) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fechar 4 achados DoD-2 limpos e auto-contidos da camada de IA — enum `ModelTier` divergente (`a6-ia-01`), guard multi-tenant opt-in do approve (`a6-ia-03`), evals/drift que nunca persistem (`a6-ia-05`) e allowlists de tenant divergentes que fazem o BQML crashar para `vila-rosa` (`a6-ia-04`).

**Architecture:** Quatro correções independentes, cada uma testável em isolamento (unit puro onde possível; fake-db injetado onde toca Firestore). Nenhuma toca BigQuery/Vertex reais nem roda seed/dev. Cada task é um commit próprio, revisável separadamente. Decisão de `a6-ia-04` (confirmada pelo usuário): o **id canônico do tenant permanece `vila-rosa`** (é o doc id do Firestore/`clientAccess` — renomear quebraria dados em produção); **só o segmento de nome de dataset BigQuery** normaliza hífen→underscore (`vila_rosa`), pois BQ não aceita hífen; a lista de tenants passa a ter **fonte única** no projeto.

**Tech Stack:** Next.js 16 App Router, Zod, Firebase Admin SDK (Firestore), Vitest, pnpm.

## Global Constraints

- Package manager: **pnpm** (v10.32.1). Testes via `pnpm vitest run <path>`. Nunca npm/yarn.
- Branch de trabalho: **`feat/ws4-ia-dod2-batch1`**, criada **a partir de `develop`** (WS-4 toca arquivos de IA disjuntos dos PRs #45/#46 abertos — não empilhar).
- `git add` **apenas** dos arquivos de cada task. NUNCA commitar `secrets/`, `.env*`, `docker-compose.yml`, `.dockerignore`, `.gitignore`, `.claude/agent-memory/`, PNG/CSV/JSON de `docs/bases/`, nem qualquer working-tree change não relacionado.
- Nenhum script de seed/bq/rag/eval/cron/migrate; nenhuma init real de BigQuery/Firestore/Vertex; nenhum `pnpm dev`. Os testes isolam a lógica.
- Trailer de commit: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Commit/push só quando o usuário pedir. Este plano cobre até os commits locais; PR é passo separado sob autorização.
- Fonte dos achados: `docs/auditoria/2026-07-21-registro-achados.md` (ids `a6-ia-01`, `a6-ia-03`, `a6-ia-04`, `a6-ia-05`).

---

### Task 1: a6-ia-01 — Unificar enum `ModelTier` e validar `model` no PATCH

Enum Zod (`agent.ts`) tem `'slow'` e **rejeita `'flash'`**; runtime/registry/UI usam `'flash'` e ignoram `'slow'`. Resultado: criar agente com `model:'flash'` (opção real do dropdown) faz o POST→`upsert`→`AiAgentDoc.parse` lançar → 500 "Erro ao salvar". Além disso o PATCH (`repo.patch`) copia `editableOnPatch` **sem revalidar o schema**, então editar para um tier inválido grava sem validação.

**Files:**
- Modify: `src/shared/schemas/ai-studio/agent.ts:5` (enum canônico)
- Modify: `src/features/ai-studio/repo.ts:137-152` (validar subset editável no `patch`)
- Modify: `app/api/ai-studio/route-factory.ts:9-15` (mapear `ZodError` → 400)
- Test: `src/shared/schemas/ai-studio/__tests__/agent.test.ts` (novo — unit puro)
- Test: `src/features/ai-studio/__tests__/repo-patch-validation.test.ts` (novo — fake db injetado)

**Interfaces:**
- Consumes: `AiAgentDoc`, `ModelTier` de `src/shared/schemas/ai-studio/agent.ts`; `AiStudioRepo(type, db?)` de `src/features/ai-studio/repo.ts` (o construtor já aceita `db?` injetável).
- Produces: `ModelTier.options === ['router','fast','flash','reasoning']`; `AiStudioRepo.patch` rejeita (lança `ZodError`) quando um campo editável viola o schema; `route-factory` retorna 400 em `ZodError`.

- [ ] **Step 1: Escrever o teste de schema que falha**

Criar `src/shared/schemas/ai-studio/__tests__/agent.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { AiAgentDoc, ModelTier } from '../agent';

describe('AiAgentDoc — enum ModelTier (a6-ia-01)', () => {
  it('enum canônico = router|fast|flash|reasoning (sem slow)', () => {
    expect(ModelTier.options).toEqual(['router', 'fast', 'flash', 'reasoning']);
  });

  it("aceita model:'flash' (tier oferecido no dropdown e no model-registry)", () => {
    const doc = AiAgentDoc.parse({ name: 'Agente X', model: 'flash' });
    expect(doc.model).toBe('flash');
  });

  it("rejeita model:'slow' (removido; inexistente no runtime/registry)", () => {
    expect(() => AiAgentDoc.parse({ name: 'Agente X', model: 'slow' })).toThrow();
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/shared/schemas/ai-studio/__tests__/agent.test.ts`
Expected: FAIL — `ModelTier.options` é `['router','fast','slow','reasoning']` e `'flash'` é rejeitado.

- [ ] **Step 3: Corrigir o enum**

Em `src/shared/schemas/ai-studio/agent.ts:5`, trocar:

```ts
export const ModelTier = z.enum(['router', 'fast', 'slow', 'reasoning']);
```

por:

```ts
export const ModelTier = z.enum(['router', 'fast', 'flash', 'reasoning']);
```

(Alinha com `src/shared/config/agents/types.ts:51`, `src/features/ai-agents/model-registry.ts:10-18`, `src/features/ai-agents/mastra/create-mastra-agent-from-config.ts:39` e `src/features/ai-studio/admin/ui/AiAgentsTab.tsx:14`, que já usam `flash`.)

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm vitest run src/shared/schemas/ai-studio/__tests__/agent.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirmar que o teste de fallback de tier continua verde**

`src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts:53-54` usa `'slow'` como exemplo de **tier inválido** que deve cair no `defaultModelTier`. Com a mudança, `'slow'` continua inválido → o teste segue válido e verde.

Run: `pnpm vitest run src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`
Expected: PASS (sem alteração de código no teste).

- [ ] **Step 6: Escrever o teste de validação do PATCH que falha (fake db injetado)**

Criar `src/features/ai-studio/__tests__/repo-patch-validation.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { AiStudioRepo } from '../repo';

/** Fake Firestore mínimo p/ um doc de agente user-origin. Captura o update. */
function makeFakeDb(captured: { value?: Record<string, unknown> }) {
  const docApi = {
    get: async () => ({
      exists: true,
      id: 'agente-x',
      data: () => ({ origin: 'user', name: 'Agente X', model: 'fast' }),
    }),
    update: async (v: Record<string, unknown>) => {
      captured.value = v;
    },
  };
  return {
    collection: () => ({ doc: () => docApi }),
    batch: () => ({ update: vi.fn(), commit: vi.fn() }),
  } as unknown as FirebaseFirestore.Firestore;
}

describe('AiStudioRepo.patch — valida model contra o schema (a6-ia-01)', () => {
  it("rejeita PATCH com model:'slow' (tier inválido)", async () => {
    const captured: { value?: Record<string, unknown> } = {};
    const repo = new AiStudioRepo('agent', makeFakeDb(captured));
    await expect(repo.patch('agente-x', { model: 'slow' })).rejects.toThrow();
    expect(captured.value).toBeUndefined(); // nada persistido
  });

  it("aceita PATCH com model:'flash' e persiste", async () => {
    const captured: { value?: Record<string, unknown> } = {};
    const repo = new AiStudioRepo('agent', makeFakeDb(captured));
    await repo.patch('agente-x', { model: 'flash' });
    expect(captured.value?.model).toBe('flash');
  });
});
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `pnpm vitest run src/features/ai-studio/__tests__/repo-patch-validation.test.ts`
Expected: FAIL — hoje `patch` copia `model:'slow'` sem validar → não lança, e persiste o valor inválido.

Nota: se o RED revelar que `model` **não** está em `editableOnPatch` do agente (`src/features/ai-studio/entity-config.ts`), pare e reporte — o achado afirma que é patchável ("editar agente existente para 'flash' via PATCH grava"); confirmar antes de prosseguir.

- [ ] **Step 8: Adicionar validação de schema no `patch`**

Em `src/features/ai-studio/repo.ts`, no método `patch` (linhas ~137-152), após `assertPatchAllowed(...)` e `enforceWorkflowDefault(...)`, montar o candidato editável, **validar com `docSchema.partial()`** e só então escrever:

```ts
  async patch(id: string, updates: Record<string, unknown>): Promise<void> {
    const snap = await this.col().doc(id).get();
    if (!snap.exists) throw new Error('Registro não encontrado');
    const origin = (snap.data()!.origin as 'system' | 'user') ?? 'user';
    assertPatchAllowed(this.cfg.type, origin, updates);
    await this.enforceWorkflowDefault(
      id,
      updates.isDefault as boolean | undefined,
      snap.data()!.isDefault === true,
    );

    // Paridade com upsert: valida os campos editáveis contra o schema da
    // entidade (a6-ia-01 — antes o PATCH gravava sem validar, permitindo
    // tiers inválidos). partial() só valida os campos presentes.
    const candidate: Record<string, unknown> = {};
    for (const key of this.cfg.editableOnPatch) {
      if (updates[key] !== undefined) candidate[key] = updates[key];
    }
    const validated = this.cfg.docSchema.partial().parse(candidate) as Record<string, unknown>;

    const clean: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    for (const key of Object.keys(candidate)) {
      clean[key] = validated[key];
    }
    await this.col().doc(id).update(clean);
  }
```

- [ ] **Step 9: Rodar e confirmar verde**

Run: `pnpm vitest run src/features/ai-studio/__tests__/repo-patch-validation.test.ts`
Expected: PASS.

- [ ] **Step 10: Mapear `ZodError` → 400 no route-factory**

Hoje `errStatus` devolve 500 para tudo que não é `ProtectionError`; um `ZodError` do `upsert`/`patch` vira 500 genérico. Em `app/api/ai-studio/route-factory.ts`, ajustar `errStatus`/`msg`:

```ts
import { ZodError } from 'zod';
// ...
function errStatus(e: unknown): number {
  if (e instanceof ProtectionError) return e.status;
  if (e instanceof ZodError) return 400;
  return 500;
}
function msg(e: unknown, fallback: string): string {
  if (e instanceof ZodError) return e.issues.map((i) => i.message).join('; ') || 'Payload inválido';
  return e instanceof Error ? e.message : fallback;
}
```

- [ ] **Step 11: Verificar a suíte adjacente e commitar**

Run: `pnpm vitest run src/shared/schemas/ai-studio src/features/ai-studio`
Expected: PASS (sem regressões).

```bash
git add src/shared/schemas/ai-studio/agent.ts \
        src/features/ai-studio/repo.ts \
        app/api/ai-studio/route-factory.ts \
        src/shared/schemas/ai-studio/__tests__/agent.test.ts \
        src/features/ai-studio/__tests__/repo-patch-validation.test.ts
git commit
```

Mensagem: `fix(ai-studio): unifica enum ModelTier (flash, sem slow) e valida model no PATCH (a6-ia-01)` + trailer.

---

### Task 2: a6-ia-03 — Approve do sql-catalog exige `clientId` (400 ausente / 403 mismatch)

O guard multi-tenant do approve só dispara se `body.clientId` for string não-vazia; omitindo o campo, a checagem é pulada. DoD-2 item 4 exige enforcement: **400 quando ausente + 403 em mismatch**. É admin-only (`requireAdmin` global), então o vetor é defense-in-depth (admin aprovando query para o tenant errado), não exposição externa — mas o enforcement é requisito de DoD.

**Files:**
- Modify: `app/api/admin/sql-catalog/[id]/approve/route.ts:57-62`
- Test: `app/api/admin/sql-catalog/__tests__/approve.test.ts` (estender)

**Interfaces:**
- Consumes: `repo.getById(id)` retorna `{ id, client_id, sql, ... }` (shape já usado nos testes existentes).
- Produces: `POST approve` → 400 se `clientId` ausente/vazio; 403 se presente e `!== existing.client_id`; 200 no match. A ordem passa a exigir `clientId` **antes** do dry-run.

- [ ] **Step 1: Estender o teste — RED**

Em `app/api/admin/sql-catalog/__tests__/approve.test.ts`, dentro do `describe('admin sql-catalog approve/reject/revalidate', ...)`, adicionar:

```ts
  it('approve 400 quando clientId ausente (enforce, não opt-in)', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.getById.mockResolvedValueOnce({ id: 'a', client_id: 'OM', sql: 'SELECT 1' });
    const res = await APPROVE(reqJson({ qualityScore: 0.9 }), makeParams('a'));
    expect(res.status).toBe(400);
    const j = await res.json();
    expect(j.error).toMatch(/clientId/);
  });

  it('approve 400 quando clientId string vazia', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.getById.mockResolvedValueOnce({ id: 'a', client_id: 'OM', sql: 'SELECT 1' });
    const res = await APPROVE(reqJson({ qualityScore: 0.9, clientId: '  ' }), makeParams('a'));
    expect(res.status).toBe(400);
  });

  it('approve 200 quando clientId bate com o row alvo', async () => {
    requireAdminMock.mockResolvedValueOnce({ uid: 'admin' });
    repoState.getById.mockResolvedValueOnce({ id: 'a', client_id: 'OM', sql: 'SELECT 1' });
    performDryRunMock.mockResolvedValueOnce({ valid: true, bytesProcessed: 1024 });
    const res = await APPROVE(reqJson({ qualityScore: 0.9, clientId: 'OM' }), makeParams('a'));
    expect(res.status).toBe(200);
  });
```

Ajustar os testes existentes que chamam approve **sem** `clientId` e esperavam 200/422 pós-guard, adicionando `clientId` correto ao body para refletir o novo contrato:
- "approve 422 when dry_run fails" → `reqJson({ qualityScore: 0.9, clientId: 'OM' })`
- "approve 422 when bytes_processed exceeds 5GB" → `reqJson({ qualityScore: 0.9, clientId: 'OM' })`
- "approve 200 happy path ..." → `reqJson({ qualityScore: 0.9, clientId: 'OM' })`

O teste "approve 422 when qualityScore below threshold" NÃO precisa de `clientId` (o gate de qualityScore vem antes e não busca o row). O teste "approve 403 when clientId mismatch" já passa `clientId: 'BRZ'` → segue 403.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run app/api/admin/sql-catalog/__tests__/approve.test.ts`
Expected: FAIL nos 3 casos novos (hoje approve sem `clientId` prossegue ao dry-run e retorna 200/422, não 400).

- [ ] **Step 3: Tornar o guard obrigatório**

Em `app/api/admin/sql-catalog/[id]/approve/route.ts`, substituir o bloco atual (linhas ~57-62):

```ts
  if (typeof body.clientId === 'string' && body.clientId.trim() !== '' && body.clientId !== existing.client_id) {
    return NextResponse.json(
      { error: 'clientId mismatch (multi-tenant guard)' },
      { status: 403 },
    );
  }
```

por (enforce, não opt-in — DoD-2 item 4):

```ts
  const clientId = typeof body.clientId === 'string' ? body.clientId.trim() : '';
  if (clientId === '') {
    return NextResponse.json(
      { error: 'clientId obrigatório (multi-tenant guard)' },
      { status: 400 },
    );
  }
  if (clientId !== existing.client_id) {
    return NextResponse.json(
      { error: 'clientId mismatch (multi-tenant guard)' },
      { status: 403 },
    );
  }
```

Atualizar o docstring do gate no topo do arquivo (linha ~11): "4. clientId **obrigatório** e igual ao clientId do row alvo (400 ausente / 403 mismatch)".

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm vitest run app/api/admin/sql-catalog/__tests__/approve.test.ts`
Expected: PASS (todos, incl. os ajustados).

- [ ] **Step 5: Commit**

```bash
git add app/api/admin/sql-catalog/[id]/approve/route.ts \
        app/api/admin/sql-catalog/__tests__/approve.test.ts
git commit
```

Mensagem: `fix(sql-catalog): approve exige clientId — 400 ausente, 403 mismatch (a6-ia-03, DoD-2 #4)` + trailer.

---

### Task 3: a6-ia-05 — Evals/drift persistem via flag (`--persist`)

`runEvals` tem `dryRun=true` default e o `parseArgs` só ativa `--dry-run` (nunca desativa) → o CLI **nunca** persiste em `evalRuns`. `detect-drift` `main()` fixa `persist:false`. Como as rotas admin só LEEM `evalRuns`/`judgeDrift`, os painéis ficam vazios. Este batch entrega o **mecanismo** de persistência (flag + dep injetável) e um aviso alto de que o CLI ainda avalia contra o `DEFAULT_AGENT_OUTPUT` (stub); wire do agentOutput real (orquestrador) é follow-up documentado (fora deste batch — exige runtime de IA).

**Files:**
- Modify: `src/features/evals/runner/run-evals.ts` (dep `persist` injetável; `parseArgs` exportado + `--persist`; aviso de stub)
- Modify: `src/features/evals/drift/detect-drift.ts` (`shouldPersistFromEnv` exportado + wire no `main`)
- Test: `src/features/evals/runner/__tests__/run-evals.test.ts` (estender)
- Test: `src/features/evals/drift/__tests__/detect-drift.test.ts` (estender)

**Interfaces:**
- Consumes: `runEvals(options, deps)` — `RunEvalsDeps` já existe (`{ agentOutput? }`); `EvalRun` de `../scorers/types`.
- Produces: `parseArgs(argv): RunOptions` (exportado); `RunEvalsDeps.persist?: (args: { run: EvalRun }) => Promise<void>`; `shouldPersistFromEnv(argv, env): boolean` (exportado de `detect-drift.ts`).

- [ ] **Step 1: Escrever os testes de run-evals que falham — RED**

Em `src/features/evals/runner/__tests__/run-evals.test.ts`, ajustar o import e adicionar casos:

```ts
import { runEvals, percentile, parseArgs } from '../run-evals';
import type { EvalRun } from '../../scorers/types';
```

```ts
describe('runner/parseArgs (a6-ia-05)', () => {
  it('--persist desativa dryRun; --dry-run ativa; default indefinido', () => {
    expect(parseArgs(['--suite=smoke']).dryRun).toBeUndefined();
    expect(parseArgs(['--persist']).dryRun).toBe(false);
    expect(parseArgs(['--dry-run']).dryRun).toBe(true);
  });
});

describe('runner/persistência (a6-ia-05)', () => {
  beforeEach(() => clearCache());

  it('persiste via dep injetada quando dryRun=false', async () => {
    const runs: EvalRun[] = [];
    await runEvals(
      { suite: 'smoke', loadDataset: () => fixtures, scorers: { x: makeStubScorer('x', [0.5]) }, dryRun: false, glossaryVersion: 'gv', regulatoryPackVersion: 'rv', judgeModelVersion: 'jv' },
      { persist: async ({ run }) => { runs.push(run); } },
    );
    expect(runs).toHaveLength(1);
    expect(runs[0].results).toHaveLength(3);
  });

  it('NÃO persiste quando dryRun=true', async () => {
    const runs: EvalRun[] = [];
    await runEvals(
      { suite: 'smoke', loadDataset: () => fixtures, scorers: { x: makeStubScorer('x', [0.5]) }, dryRun: true },
      { persist: async ({ run }) => { runs.push(run); } },
    );
    expect(runs).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/features/evals/runner/__tests__/run-evals.test.ts`
Expected: FAIL — `parseArgs` não é exportado e `RunEvalsDeps` não tem `persist`.

- [ ] **Step 3: Implementar dep `persist` + `--persist` + aviso de stub**

Em `src/features/evals/runner/run-evals.ts`:

(a) Estender `RunEvalsDeps` (linhas ~70-72):

```ts
export interface RunEvalsDeps {
  agentOutput?: AgentOutput;
  /** Persistência injetável (default: persistEvalRun). Facilita teste e wire alternativo. */
  persist?: (args: { run: EvalRun }) => Promise<void>;
}
```

(b) No corpo de `runEvals`, trocar o bloco final de persistência (linhas ~194-196):

```ts
  if (!dryRun) {
    await persistEvalRun({ run });
  }
```

por:

```ts
  if (!dryRun) {
    const persist = deps.persist ?? persistEvalRun;
    await persist({ run });
  }
```

(c) Em `parseArgs`, adicionar o flag e **exportar** a função (linhas ~206-222):

```ts
export function parseArgs(argv: string[]): RunOptions {
  const opts: Partial<RunOptions> & { suite: SuiteName } = { suite: 'smoke' };
  for (const arg of argv) {
    if (arg.startsWith('--suite=')) {
      const v = arg.slice('--suite='.length);
      if (v !== 'smoke' && v !== 'full' && v !== 'gold') {
        throw new Error(`invalid suite: ${v}`);
      }
      opts.suite = v;
    } else if (arg === '--dry-run') {
      opts.dryRun = true;
    } else if (arg === '--persist') {
      opts.dryRun = false;
    } else if (arg.startsWith('--concurrency=')) {
      opts.concurrency = Number.parseInt(arg.slice('--concurrency='.length), 10);
    }
  }
  return opts as RunOptions;
}
```

(d) Em `main()`, avisar alto quando persistir com o output stub (o CLI ainda não faz wire do agente real):

```ts
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.dryRun === false) {
    console.warn(
      '[run-evals] PERSISTINDO com DEFAULT_AGENT_OUTPUT (stub). ' +
        'Os scores refletem o stub, não o agente real — faça o wire de agentOutput antes de confiar nos painéis (a6-ia-05, follow-up).',
    );
  }
  const summary = await runEvals(opts);
  console.log(JSON.stringify({
    runId: summary.runId,
    suite: summary.suite,
    totalFixtures: summary.totalFixtures,
    totalScorers: summary.totalScorers,
    p50: summary.totals.p50,
    p95: summary.totals.p95,
    costUsd: summary.totals.costUsd,
  }, null, 2));
}
```

- [ ] **Step 4: Rodar e confirmar verde**

Run: `pnpm vitest run src/features/evals/runner/__tests__/run-evals.test.ts`
Expected: PASS.

- [ ] **Step 5: Escrever o teste de detect-drift que falha — RED**

Em `src/features/evals/drift/__tests__/detect-drift.test.ts`, ajustar o import e adicionar:

```ts
import { detectDrift, shouldPersistFromEnv } from '../detect-drift';
```

```ts
describe('drift/shouldPersistFromEnv (a6-ia-05)', () => {
  it('default false; --persist ou EVAL_DRIFT_PERSIST habilita', () => {
    expect(shouldPersistFromEnv([], {})).toBe(false);
    expect(shouldPersistFromEnv(['--persist'], {})).toBe(true);
    expect(shouldPersistFromEnv([], { EVAL_DRIFT_PERSIST: '1' })).toBe(true);
    expect(shouldPersistFromEnv([], { EVAL_DRIFT_PERSIST: 'true' })).toBe(true);
    expect(shouldPersistFromEnv([], { EVAL_DRIFT_PERSIST: '0' })).toBe(false);
  });
});
```

- [ ] **Step 6: Rodar e confirmar que falha**

Run: `pnpm vitest run src/features/evals/drift/__tests__/detect-drift.test.ts`
Expected: FAIL — `shouldPersistFromEnv` não existe.

- [ ] **Step 7: Implementar `shouldPersistFromEnv` + wire no `main`**

Em `src/features/evals/drift/detect-drift.ts`, adicionar antes de `main()` (seção "CLI entrypoint", ~linha 159):

```ts
/** Resolve persistência do CLI de drift: `--persist` ou EVAL_DRIFT_PERSIST=1|true. */
export function shouldPersistFromEnv(argv: string[], env: NodeJS.ProcessEnv): boolean {
  if (argv.includes('--persist')) return true;
  const v = env.EVAL_DRIFT_PERSIST;
  return v === '1' || v === 'true';
}
```

E em `main()`, trocar a chamada hardcoded (linha ~174):

```ts
  const result = await detectDrift({ judgeRun: summary, persist: false });
```

por:

```ts
  const persist = shouldPersistFromEnv(process.argv.slice(2), process.env);
  const result = await detectDrift({ judgeRun: summary, persist });
```

- [ ] **Step 8: Rodar e confirmar verde**

Run: `pnpm vitest run src/features/evals/drift/__tests__/detect-drift.test.ts`
Expected: PASS.

- [ ] **Step 9: Suíte de evals + commit**

Run: `pnpm vitest run src/features/evals`
Expected: PASS.

```bash
git add src/features/evals/runner/run-evals.ts \
        src/features/evals/drift/detect-drift.ts \
        src/features/evals/runner/__tests__/run-evals.test.ts \
        src/features/evals/drift/__tests__/detect-drift.test.ts
git commit
```

Mensagem: `fix(evals): CLI de evals/drift persiste via --persist (a6-ia-05, DoD-2 #7)` + trailer.

---

### Task 4: a6-ia-04 — Fonte única de tenants + BQML aceita `vila-rosa` (dataset com underscore)

Três allowlists de clientId divergem: `ClientId` (`agents/types.ts:6`, sem `vila-rosa`), `CLIENT_IDS` (`business-context/schemas.ts:3`, com `vila-rosa`) e `KNOWN_CLIENTS` do BQML (`bqml/multi-tenancy.ts:3`, hardcoded lowercase, sem `vila-rosa`). Qualquer tool BQML com `clientId='vila-rosa'` faz `normalizeClient` lançar `Invalid client id: vila-rosa` → BQML quebrado para o cliente em onboarding. Além disso, `vila-rosa` tem hífen, que o BigQuery **não aceita** em nome de dataset. Fix: fonte única de tenants; BQML deriva sua allowlist dela; o segmento de dataset normaliza hífen→underscore.

**Files:**
- Create: `src/shared/config/tenants.ts`
- Modify: `src/shared/config/business-context/schemas.ts:3` (`CLIENT_IDS` deriva de `TENANT_IDS`)
- Modify: `src/shared/config/agents/types.ts:1-6` (`ClientId = TenantId`, import type)
- Modify: `src/features/ai-agents/tools/bqml/multi-tenancy.ts` (deriva `KNOWN_CLIENTS`; segmento com underscore)
- Modify: `src/features/ai-studio/runtime/tool-registry.ts:139-143` (comentário)
- Test: `src/shared/config/__tests__/tenants.test.ts` (novo)
- Test: `src/features/ai-agents/tools/bqml/multi-tenancy.test.ts` (estender)

**Interfaces:**
- Produces: `TENANT_IDS: readonly ['OM','BRZ','CONX','IMCASA','vila-rosa']`; `type TenantId`; `tenantDatasetSegment(id): string` (lowercase + hífen→underscore). `ClientId === TenantId`. `CLIENT_IDS === TENANT_IDS`. `deriveBqmlDataset('vila-rosa') === 'liquid_bqml_vila_rosa'`.
- Consumes: `recordSpan` (inalterado), `CLIENT_IDS`/`ClientId` já importados por ~50 módulos (só o conjunto de valores aumenta — widening, não breaking).

- [ ] **Step 1: Escrever o teste da fonte única — RED**

Criar `src/shared/config/__tests__/tenants.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { TENANT_IDS, tenantDatasetSegment } from '../tenants';

describe('tenants — fonte única de tenants (a6-ia-04)', () => {
  it('inclui os 4 legados + vila-rosa, nesta ordem', () => {
    expect(TENANT_IDS).toEqual(['OM', 'BRZ', 'CONX', 'IMCASA', 'vila-rosa']);
  });

  it('tenantDatasetSegment: lowercase + hífen→underscore (BQ não aceita hífen)', () => {
    expect(tenantDatasetSegment('OM')).toBe('om');
    expect(tenantDatasetSegment('vila-rosa')).toBe('vila_rosa');
    expect(tenantDatasetSegment('VILA-ROSA')).toBe('vila_rosa');
  });

  it('CLIENT_IDS (business-context) deriva de TENANT_IDS', async () => {
    const { CLIENT_IDS } = await import('@/shared/config/business-context/schemas');
    expect(CLIENT_IDS).toEqual(TENANT_IDS);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `pnpm vitest run src/shared/config/__tests__/tenants.test.ts`
Expected: FAIL — `../tenants` não existe.

- [ ] **Step 3: Criar a fonte única**

Criar `src/shared/config/tenants.ts`:

```ts
/**
 * Fonte única de tenants do produto (ADR-0006/0007). Ids canônicos EXATOS como
 * usados no Firestore/`clientAccess`: acrônimos legados em maiúsculas + slug
 * kebab-case para clientes novos. NÃO renomear `vila-rosa` — é doc id em prod.
 */
export const TENANT_IDS = ['OM', 'BRZ', 'CONX', 'IMCASA', 'vila-rosa'] as const;
export type TenantId = (typeof TENANT_IDS)[number];

/**
 * Segmento de nome de dataset BigQuery derivado de um tenant id. BQ não aceita
 * hífen em nome de dataset → normaliza para underscore (ex.: `vila-rosa` →
 * `vila_rosa`); lowercase por convenção dos datasets (`liquid_bqml_<segmento>`).
 */
export function tenantDatasetSegment(id: string): string {
  return id.trim().toLowerCase().replace(/-/g, '_');
}
```

- [ ] **Step 4: Ligar CLIENT_IDS e ClientId à fonte única**

Em `src/shared/config/business-context/schemas.ts`, trocar a linha 3:

```ts
export const CLIENT_IDS = ['OM', 'BRZ', 'CONX', 'IMCASA', 'vila-rosa'] as const;
```

por (mantém `z.enum(CLIENT_IDS)` na linha seguinte funcionando — `TENANT_IDS` é readonly tuple):

```ts
import { TENANT_IDS } from '@/shared/config/tenants';

export const CLIENT_IDS = TENANT_IDS;
```

Em `src/shared/config/agents/types.ts`, adicionar o import type (junto aos imports de tipo existentes, linhas 1-4) e trocar a linha 6:

```ts
import type { TenantId } from '@/shared/config/tenants';
```

```ts
export type ClientId = TenantId;
```

(`import type` é apagado no runtime → zero custo de bundle nos ~50 consumidores.)

- [ ] **Step 5: Typecheck do widening de ClientId**

Widening `ClientId` de 4 → 5 membros pode quebrar algum `switch`/`Record<ClientId, …>` exaustivo.

Run: `pnpm exec tsc --noEmit`
Expected: sem erros. Se algum ponto exaustivo sobre `ClientId` acusar `vila-rosa` faltando, adicionar o caso `vila-rosa` (tornando o tenant first-class), consistente com o objetivo. Rodar `pnpm vitest run src/shared/config/__tests__/tenants.test.ts` → PASS.

- [ ] **Step 6: Escrever os testes de vila-rosa no BQML — RED**

Em `src/features/ai-agents/tools/bqml/multi-tenancy.test.ts`, adicionar ao `describe('deriveBqmlDataset', …)`:

```ts
  it('vila-rosa: normaliza hífen p/ underscore no dataset (BQ não aceita hífen)', async () => {
    const { deriveBqmlDataset } = await import('./multi-tenancy');
    expect(deriveBqmlDataset('vila-rosa')).toBe('liquid_bqml_vila_rosa');
    expect(deriveBqmlDataset('VILA-ROSA')).toBe('liquid_bqml_vila_rosa');
  });
```

e ao `describe('assertClientMatchesDataset', …)`:

```ts
  it('vila-rosa casa com o segmento underscore e barra cross-tenant', async () => {
    const { assertClientMatchesDataset } = await import('./multi-tenancy');
    expect(() => assertClientMatchesDataset('vila-rosa', 'liquid_bqml_vila_rosa.bqml_x')).not.toThrow();
    expect(() => assertClientMatchesDataset('vila-rosa', 'liquid_bqml_om.bqml_x')).toThrow(
      /Cross-tenant model access denied/,
    );
  });
```

- [ ] **Step 7: Rodar e confirmar que falha**

Run: `pnpm vitest run src/features/ai-agents/tools/bqml/multi-tenancy.test.ts`
Expected: FAIL — hoje `deriveBqmlDataset('vila-rosa')` lança `Invalid client id`.

- [ ] **Step 8: Reescrever o multi-tenancy do BQML**

Substituir o topo de `src/features/ai-agents/tools/bqml/multi-tenancy.ts` (linhas 1-20) por:

```ts
import { recordSpan } from '@/shared/lib/telemetry/record-span';
import { TENANT_IDS, tenantDatasetSegment } from '@/shared/config/tenants';

/** Tenants habilitados p/ BQML = todos os canônicos (id lowercased). Fonte única. */
export const KNOWN_CLIENTS = TENANT_IDS.map((t) => t.toLowerCase());
export type BqmlClient = (typeof KNOWN_CLIENTS)[number];

const CLIENT_ALLOW = new Set<string>(KNOWN_CLIENTS);

function normalizeClient(clientId: string): string {
  // String(... ?? '') evita TypeError quando recebe undefined/non-string —
  // cai na mensagem clara "Invalid client id" em vez de quebrar antes do check.
  const id = String(clientId ?? '').trim().toLowerCase();
  if (!CLIENT_ALLOW.has(id)) {
    throw new Error(`Invalid client id: ${clientId}`);
  }
  // BQ não aceita hífen em dataset → segmento normalizado (ex.: vila-rosa → vila_rosa).
  return tenantDatasetSegment(id);
}

export function deriveBqmlDataset(clientId: string): string {
  return `liquid_bqml_${normalizeClient(clientId)}`;
}
```

O restante do arquivo (`MODEL_REF_RE`, `assertClientMatchesDataset`) fica **inalterado** — `normalizeClient` agora devolve o segmento underscore, que é exatamente o que o regex `liquid_bqml_(\w+)` captura.

- [ ] **Step 9: Rodar e confirmar verde**

Run: `pnpm vitest run src/features/ai-agents/tools/bqml/multi-tenancy.test.ts`
Expected: PASS (incl. os 4 legados, que não têm hífen e seguem idênticos).

- [ ] **Step 10: Atualizar o comentário do tool-registry**

Em `src/features/ai-studio/runtime/tool-registry.ts:139-143`, atualizar o comentário para refletir a fonte única e o underscore:

```ts
  // clientId DEVE ser um tenant canônico (TENANT_IDS: om|brz|conx|imcasa|vila-rosa)
  // — deriveBqmlDataset/normalizeClient o exige e normaliza hífen→underscore no
  // nome de dataset (vila-rosa → liquid_bqml_vila_rosa). ctx.clientId é o campo
  // correto (tenant); passar ctx.dataset (string de dataset BQ) fazia
  // normalizeClient lançar "Invalid client id". Fallback p/ ctx.dataset só no
  // caminho legado sem clientId resolvido (comportamento inalterado nesse caso).
```

- [ ] **Step 11: Suíte relevante + commit**

Run: `pnpm vitest run src/shared/config src/features/ai-agents/tools/bqml`
Expected: PASS.

```bash
git add src/shared/config/tenants.ts \
        src/shared/config/business-context/schemas.ts \
        src/shared/config/agents/types.ts \
        src/features/ai-agents/tools/bqml/multi-tenancy.ts \
        src/features/ai-studio/runtime/tool-registry.ts \
        src/shared/config/__tests__/tenants.test.ts \
        src/features/ai-agents/tools/bqml/multi-tenancy.test.ts
git commit
```

Mensagem: `fix(ai): fonte única de tenants; BQML aceita vila-rosa com dataset underscore (a6-ia-04)` + trailer.

**Caveat documentado (não bloqueia):** `list-models.ts:51` deriva `clientIdNormalized = dataset.replace('liquid_bqml_', '')` (= segmento underscore) e o usa como `client_id` na query de `liquid_meta.bqml_model_registry`. Para `vila-rosa` isso vira `vila_rosa`; a consistência com o que grava o registry só importa **quando BQML for provisionado** para o tenant (hoje não é). Registrar como follow-up junto do provisionamento de BQML por tenant (relacionado a `a6-ia-31`).

---

## Self-Review

**Spec coverage:**
- `a6-ia-01` → Task 1 (enum unificado + validação PATCH + 400 no route). ✅
- `a6-ia-03` → Task 2 (400 ausente / 403 mismatch). ✅
- `a6-ia-05` → Task 3 (mecanismo de persistência + aviso de stub). ✅ (wire do agentOutput real = follow-up explícito, fora de escopo)
- `a6-ia-04` → Task 4 (fonte única de tenants + BQML underscore para vila-rosa). ✅ (consistência do `client_id` no registry BQML = follow-up com provisionamento)
- Fora deste batch (documentado): `a6-ia-02` (stream do chat — `systematic-debugging`), `a6-ia-09`/`31`/`32`/`33` (batch 2).

**Placeholder scan:** todo step de código tem código real. Sem TODO/TBD.

**Type consistency:** `ModelTier.options` (Task 1) usado igual no teste e no enum. `RunEvalsDeps.persist` (Task 3) assinatura `(args: { run: EvalRun }) => Promise<void>` idêntica ao uso `deps.persist ?? persistEvalRun` (`persistEvalRun` já é `(args: { run: EvalRun }) => Promise<void>`). `shouldPersistFromEnv(argv, env)` idêntico entre teste e implementação. `TENANT_IDS`/`tenantDatasetSegment`/`TenantId` (Task 4) idênticos entre `tenants.ts`, os consumidores (`CLIENT_IDS`, `ClientId`, `multi-tenancy.ts`) e os testes.

**Risco anotado (Task 1, Step 7):** se `model` não estiver em `editableOnPatch` do agente, parar e reportar antes de prosseguir — o achado indica que é patchável.
**Risco anotado (Task 4, Step 5):** widening de `ClientId` pode quebrar `switch`/`Record` exaustivo — o `tsc --noEmit` acusa; adicionar o caso `vila-rosa` onde faltar.

## Execution Handoff

Plano salvo em `docs/superpowers/plans/2026-07-22-ws4-ia-dod2-batch1.md`. Execução: **Subagent-Driven** (fresh subagent por task + two-stage review), consistente com PRs #45/#46.
