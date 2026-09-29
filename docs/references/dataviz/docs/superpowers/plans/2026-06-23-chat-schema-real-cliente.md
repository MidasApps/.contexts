# Chat opera contra o schema real do cliente (G5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O chat escreve SQL contra as colunas físicas reais do cliente (do `schemaBindings`), não contra o schema hardcoded — surfaçando as colunas no prompt e substituindo o schema fixo quando há schema do cliente.

**Architecture:** `getClientSemanticContext` passa a anexar, por atributo, a coluna física bound (do `schemaBindings` por `contractRef`). `renderDataContractSection` rende essa coluna e omite atributos sem coluna. `buildCanvasOrchestratorPrompt` substitui `buildSchemaContext()` (hardcoded) pela seção do cliente quando há ≥1 coluna bound; sem isso, mantém o hardcoded (sem regressão).

**Tech Stack:** TypeScript, firebase-admin (Firestore), Vitest, Next.js.

## Global Constraints

- TDD obrigatório: teste-primeiro, RED→GREEN→refactor.
- Escopo só-BRZ: SEM portabilidade/templatização, SEM fallback de cliente legado, SEM tocar `get_table_schema` v2 (= G7), SEM unificar `EXPECTED_SCHEMA` (D1).
- Sem regressão: cliente sem contrato/colunas ⇒ prompt mantém `buildSchemaContext()` (comportamento atual).
- Atributo sem coluna bound ⇒ omitido da seção do cliente (o chat não inventa coluna).
- `getClientSemanticContext` permanece best-effort (degrada para null em erro inesperado).
- Spec: `docs/superpowers/specs/2026-06-23-chat-schema-real-cliente-design.md`.

## File Structure

- `src/shared/repositories/client-semantic-context.ts` — `column` por atributo + leitura dos `datasets[].schemaBindings`.
- `src/shared/config/agents/shared-context.ts` — `renderDataContractSection` rende a coluna.
- `src/shared/config/agents/canvas-orchestrator.ts` — `buildCanvasOrchestratorPrompt` gate `hasClientSchema`.
- Testes: `client-semantic-context.test.ts`, `semantic-context-prompt.test.ts`.

---

## Task 1: `getClientSemanticContext` anexa a coluna física

**Files:**
- Modify: `src/shared/repositories/client-semantic-context.ts` (interface `ClientSemanticContext`, `RawBinding`, loop de bindings, montagem de attributes)
- Test: `src/shared/repositories/__tests__/client-semantic-context.test.ts`

**Interfaces:**
- Produces: `ClientSemanticContext['dataContracts'][n]['entities'][n]['attributes'][n]` ganha `column?: string | null`.

- [ ] **Step 1: Write the failing test** (adicionar caso; o fixture `binding(productId)` já tem `datasets[].contractRef='canonical'` + `schemaBindings`)

```ts
it('anexa column do schemaBindings por atributo (null quando ausente)', async () => {
  mocks.state.clients['c'] = {
    productBindings: [
      {
        productId: 'prod',
        datasets: [
          {
            id: 'ds1', dataSourceId: 'src1', datasetId: 'dataset_x', contractRef: 'canonical',
            schemaBindings: { 'contratos.saldo_devedor': 'vl_saldo_dev' }, schema: {}, isPrimary: true,
          },
        ],
      },
    ],
  };
  (getProduct as ReturnType<typeof vi.fn>).mockResolvedValue(
    product({ entityRefs: ['contratos'], contractRefs: ['canonical'], metricRefs: [] }),
  );
  mocks.state.contracts['canonical'] = {
    contratos: {
      saldo_devedor: { type: 'float' },
      dias_atraso: { type: 'int' }, // sem binding → column null
    },
  };

  const sc = await getClientSemanticContext('c');
  const attrs = sc!.dataContracts[0].entities[0].attributes;
  const saldo = attrs.find((a) => a.attributeId === 'saldo_devedor');
  const atraso = attrs.find((a) => a.attributeId === 'dias_atraso');
  expect(saldo!.column).toBe('vl_saldo_dev');
  expect(atraso!.column).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/repositories/__tests__/client-semantic-context.test.ts`
Expected: FAIL — `column` é `undefined` (não setado).

- [ ] **Step 3: Write minimal implementation**

(a) Na interface `ClientSemanticContext`, no tipo dos attributes (dentro de `dataContracts`):
```ts
      attributes: Array<{ attributeId: string; type?: string; description?: string; column?: string | null }>;
```

(b) Estender `RawBinding` para ler os datasets:
```ts
interface RawBinding {
  productId?: unknown;
  enabledIndicators?: unknown;
  datasets?: unknown;
}
```

(c) No início da função (após `const rawBindings = ...`), construir o mapa `contractId.entity.attr → coluna`:
```ts
    // Mapa coluna física por ref 3-part, a partir dos schemaBindings dos datasets
    // bound (G5). Mesma fonte que resolveColumn usa.
    const columnByRef = new Map<string, string | null>();
    for (const binding of rawBindings) {
      const datasets = Array.isArray(binding.datasets) ? binding.datasets : [];
      for (const ds of datasets) {
        const d = ds as { contractRef?: unknown; schemaBindings?: unknown };
        const contractRef = typeof d.contractRef === 'string' ? d.contractRef : null;
        const sb = d.schemaBindings && typeof d.schemaBindings === 'object' ? (d.schemaBindings as Record<string, unknown>) : null;
        if (!contractRef || !sb) continue;
        for (const [entityAttr, col] of Object.entries(sb)) {
          columnByRef.set(`${contractRef}.${entityAttr}`, typeof col === 'string' ? col : null);
        }
      }
    }
```

(d) Na montagem de `attributes` (step 4), anexar `column`:
```ts
        const attributes = attrsSnap.docs
          .filter((d) => d.data()?.deprecated !== true)
          .map((d) => {
            const a = d.data() ?? {};
            return {
              attributeId: d.id,
              type: typeof a.type === 'string' ? a.type : undefined,
              description: typeof a.description === 'string' ? a.description : undefined,
              column: columnByRef.get(`${contractId}.${entityId}.${d.id}`) ?? null,
            };
          });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/repositories/__tests__/client-semantic-context.test.ts`
Expected: PASS (todos — os casos existentes não checam `column`, seguem verdes).

- [ ] **Step 5: Commit**

```bash
git add src/shared/repositories/client-semantic-context.ts src/shared/repositories/__tests__/client-semantic-context.test.ts
git commit -m "feat(semantic): getClientSemanticContext anexa coluna física por atributo (G5)"
```

---

## Task 2: `renderDataContractSection` rende a coluna física

**Files:**
- Modify: `src/shared/config/agents/shared-context.ts` (`renderDataContractSection`)
- Test: `src/shared/config/agents/semantic-context-prompt.test.ts`

**Interfaces:**
- Consumes: `attributes[].column` (Task 1).
- Produces: render com coluna real por atributo; atributos sem `column` omitidos; entidade sem atributos bound é omitida.

- [ ] **Step 1: Write the failing test** (adicionar; o arquivo já importa `renderSemanticContextSections` e tem `semanticContextFull`)

```ts
it('renderiza a coluna física e omite atributos sem column (G5)', () => {
  const sc = {
    clientId: 'BRZ',
    metrics: [],
    dataContracts: [
      {
        contractId: 'liquid-play',
        entities: [
          {
            entityId: 'contratos',
            attributes: [
              { attributeId: 'saldo_devedor', type: 'float', column: 'vl_saldo_dev' },
              { attributeId: 'sem_bind', type: 'int', column: null },
            ],
          },
        ],
      },
    ],
  } as unknown as import('@/shared/repositories/client-semantic-context').ClientSemanticContext;
  const out = renderSemanticContextSections(sc);
  expect(out).toContain('vl_saldo_dev');
  expect(out).toContain('saldo_devedor');
  expect(out).not.toContain('sem_bind'); // omitido (sem column)
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/config/agents/semantic-context-prompt.test.ts`
Expected: FAIL — formato atual não renderiza a coluna e não omite `sem_bind`.

- [ ] **Step 3: Write minimal implementation** — substituir o corpo de `renderDataContractSection`:

```ts
function renderDataContractSection(dataContracts: ClientSemanticContext['dataContracts']): string {
  const blocks = dataContracts
    .map((contract) => {
      const entityLines = contract.entities
        .map((entity) => {
          const bound = entity.attributes.filter(
            (a) => typeof a.column === 'string' && a.column.length > 0,
          );
          if (bound.length === 0) return null;
          const attrLines = bound
            .map((a) => `  - ${a.attributeId} → coluna \`${a.column}\`${a.type ? ` (${a.type})` : ''}`)
            .join('\n');
          return `- Entidade \`${entity.entityId}\`:\n${attrLines}`;
        })
        .filter((l): l is string => l !== null);
      if (entityLines.length === 0) return null;
      return `### Contrato \`${contract.contractId}\`\n${entityLines.join('\n')}`;
    })
    .filter((b): b is string => b !== null);

  if (blocks.length === 0) return '';

  return `## Data contract do cliente (colunas físicas reais)

Escreva SQL usando EXATAMENTE estas colunas físicas. NÃO use nomes de coluna de outros schemas.

${blocks.join('\n\n')}`;
}
```

> Note que `renderDataContractSection` agora retorna `''` quando nenhum atributo tem coluna; `renderSemanticContextSections` já só inclui a seção quando `dataContracts.length > 0` — adicione um guard para não emitir cabeçalho vazio: na função `renderSemanticContextSections`, troque `if (sc.dataContracts.length > 0) sections.push(renderDataContractSection(sc.dataContracts));` por:
> ```ts
>   if (sc.dataContracts.length > 0) {
>     const dc = renderDataContractSection(sc.dataContracts);
>     if (dc) sections.push(dc);
>   }
> ```

> **Ajuste de testes existentes:** casos em `semantic-context-prompt.test.ts` que dependem do formato ANTIGO de `renderDataContractSection` (ex.: `- contratos: saldo_devedor`) precisam ser atualizados para o novo formato (`- Entidade \`contratos\`:` + `saldo_devedor → coluna ...`) OU para incluir `column` nos atributos das fixtures. Atualize as asserções afetadas para refletir o novo formato/omitir attrs sem column.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/config/agents/semantic-context-prompt.test.ts`
Expected: PASS (todos, após atualizar asserções antigas).

- [ ] **Step 5: Commit**

```bash
git add src/shared/config/agents/shared-context.ts src/shared/config/agents/semantic-context-prompt.test.ts
git commit -m "feat(agents): renderDataContractSection rende coluna física, omite attrs sem bind (G5)"
```

---

## Task 3: `buildCanvasOrchestratorPrompt` substitui o schema hardcoded

**Files:**
- Modify: `src/shared/config/agents/canvas-orchestrator.ts` (`buildCanvasOrchestratorPrompt`)
- Test: `src/shared/config/agents/semantic-context-prompt.test.ts`

**Interfaces:**
- Consumes: `ctx.semanticContext` com `attributes[].column` (Task 1) e a seção render (Task 2).
- Produces: prompt OMITE `buildSchemaContext()` quando o cliente tem ≥1 coluna bound; senão inclui (sem regressão).

- [ ] **Step 1: Write the failing test** (adicionar ao `semantic-context-prompt.test.ts`)

```ts
const HARDCODED_MARKER = '## Schema: Tabela contratos';

it('canvas: omite o schema hardcoded quando o cliente tem colunas bound (G5)', () => {
  const sc = {
    clientId: 'BRZ', metrics: [],
    dataContracts: [{
      contractId: 'liquid-play',
      entities: [{ entityId: 'contratos', attributes: [{ attributeId: 'saldo_devedor', type: 'float', column: 'vl_saldo_dev' }] }],
    }],
  } as unknown as ClientSemanticContext;
  const out = buildCanvasOrchestratorPrompt({ ...baseCanvasCtx, semanticContext: sc } as never);
  expect(out).not.toContain(HARDCODED_MARKER);
  expect(out).toContain('vl_saldo_dev');
});

it('canvas: mantém o schema hardcoded quando não há colunas bound (sem regressão)', () => {
  const out = buildCanvasOrchestratorPrompt(baseCanvasCtx as never);
  expect(out).toContain(HARDCODED_MARKER);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/config/agents/semantic-context-prompt.test.ts`
Expected: FAIL — o prompt sempre inclui `buildSchemaContext()` (marker presente mesmo com schema do cliente).

- [ ] **Step 3: Write minimal implementation** — em `canvas-orchestrator.ts`:

(a) Adicionar helper (topo do arquivo, após imports):
```ts
function hasClientSchema(sc: CanvasOrchestratorContext['semanticContext']): boolean {
  return !!sc?.dataContracts?.some((c) =>
    c.entities.some((e) => e.attributes.some((a) => typeof a.column === 'string' && a.column.length > 0)),
  );
}
```

(b) Em `buildCanvasOrchestratorPrompt`, trocar a linha fixa `${buildSchemaContext()}` por uma variável condicional. Antes do `return`/template, declare:
```ts
  const schemaSection = hasClientSchema(ctx.semanticContext) ? '' : buildSchemaContext();
```
e no template, substitua `${buildSchemaContext()}` por `${schemaSection}`.

> Se `CanvasOrchestratorContext` não declarar `semanticContext`, use o tipo já existente (o arquivo já referencia `semanticContext` ao montar `semanticContextSection`); reutilize o mesmo acesso. Não altere o tipo se já existir.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/config/agents/semantic-context-prompt.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add src/shared/config/agents/canvas-orchestrator.ts src/shared/config/agents/semantic-context-prompt.test.ts
git commit -m "feat(agents): canvas substitui schema hardcoded pelo schema real do cliente (G5)"
```

---

## Verificação final (após Task 3)

- [ ] Suíte do escopo: `pnpm exec vitest run src/shared/repositories/__tests__/client-semantic-context.test.ts src/shared/config/agents/semantic-context-prompt.test.ts` → tudo verde.
- [ ] `npx eslint <arquivos>` → 0 erros.
- [ ] `pnpm exec tsc --noEmit` → 0 erros.
- [ ] Suíte completa `pnpm exec vitest run` → sem regressão.
- [ ] Finalizar com `superpowers:finishing-a-development-branch`.

## Fora deste plano
- **G7** — alinhar `get_table_schema` v2 ao binding (aposentar `expectedTables`).
- Portabilidade/templatização (B); clientes legado; unificar `EXPECTED_SCHEMA` (D1).
- Popular os dados da BRZ (contrato/entities/attributes/bindings) — configuração.
