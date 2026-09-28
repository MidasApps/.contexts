# Sub-agentes operam contra o schema real do cliente (G5-sub-agentes) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar a substituição do schema hardcoded pelo schema real do cliente (gate `hasClientSchema`, feito no G5 só no canvas) aos prompts dos 8 sub-agentes que rodam `execute_sql` (caminho legado `build*AgentPrompt`) e ao baseline de código do runtime Mastra (`composeCodeBaseline`).

**Architecture:** Promove `hasClientSchema` para `shared-context.ts` (exportado, único). Cada `build*AgentPrompt` renderiza a seção semântica do cliente (`renderSemanticContextSections`, que já mostra as colunas físicas reais) e gateia o hardcoded (`hasClientSchema(sc) ? '' : buildSchemaContext()`). O `composeCodeBaseline` do Mastra recebe o `semanticContext` e aplica o mesmo gate (a seção do cliente já é anexada por `buildAgentDynamicContext`).

**Tech Stack:** TypeScript, Vitest, Next.js, Mastra (`@mastra/core`).

## Global Constraints

- TDD obrigatório: teste-primeiro, RED→GREEN→refactor.
- Sem regressão: cliente sem `semanticContext`/sem coluna bound ⇒ prompt mantém `buildSchemaContext()` (comportamento atual).
- Marcador único do schema hardcoded para asserções: `## Schema: Tabela contratos`.
- Atributo sem coluna bound continua omitido da seção do cliente (regra herdada do T2 do G5).
- DRY: uma única definição de `hasClientSchema` (em `shared-context.ts`); o canvas passa a importá-la (remove a cópia local criada no G5).
- Spec: `docs/superpowers/specs/2026-06-23-chat-schema-real-sub-agentes-design.md`.

## File Structure

- `src/shared/config/agents/shared-context.ts` — exporta `hasClientSchema`.
- `src/shared/config/agents/index.ts` — re-exporta `hasClientSchema`.
- `src/shared/config/agents/canvas-orchestrator.ts` — importa `hasClientSchema` (remove cópia local).
- `src/shared/config/agents/{descriptive,diagnostic,predictive,simulation,prescriptive,monitoring,cashflow,external}-agent.ts` — gate + injeção da seção semântica.
- `src/features/ai-agents/mastra/create-mastra-agent-from-config.ts` — gate no `composeCodeBaseline`.
- Testes: `src/shared/config/agents/semantic-context-prompt.test.ts`, `src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`.

---

## Task 1: `hasClientSchema` compartilhado em `shared-context.ts` + refactor do canvas

**Files:**
- Modify: `src/shared/config/agents/shared-context.ts` (exporta `hasClientSchema`)
- Modify: `src/shared/config/agents/index.ts` (re-export)
- Modify: `src/shared/config/agents/canvas-orchestrator.ts` (importa helper, remove cópia local)
- Test: `src/shared/config/agents/semantic-context-prompt.test.ts`

**Interfaces:**
- Produces: `export function hasClientSchema(sc: ClientSemanticContext | null | undefined): boolean` em `shared-context.ts`, re-exportado por `@/shared/config/agents`.

- [ ] **Step 1: Write the failing test** — adicionar ao topo do `semantic-context-prompt.test.ts`, junto dos imports, trocar a linha de import de `./shared-context` e adicionar o describe:

Trocar:
```ts
import { renderSemanticContextSections } from './shared-context';
```
por:
```ts
import { renderSemanticContextSections, hasClientSchema } from './shared-context';
```

Adicionar (após o bloco `describe('renderSemanticContextSections', ...)`):
```ts
describe('hasClientSchema', () => {
  it('true quando há ≥1 atributo com column', () => {
    expect(hasClientSchema(semanticContextFull)).toBe(true);
  });
  it('false quando nenhum atributo tem column', () => {
    const sc = {
      clientId: 'X', metrics: [],
      dataContracts: [{ contractId: 'c', entities: [{ entityId: 'e', attributes: [{ attributeId: 'a', type: 'int' }] }] }],
    } as unknown as ClientSemanticContext;
    expect(hasClientSchema(sc)).toBe(false);
  });
  it('false para null / undefined / sem dataContracts', () => {
    expect(hasClientSchema(null)).toBe(false);
    expect(hasClientSchema(undefined)).toBe(false);
    expect(hasClientSchema({ clientId: 'X', metrics: [], dataContracts: [] } as unknown as ClientSemanticContext)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/config/agents/semantic-context-prompt.test.ts`
Expected: FAIL — `hasClientSchema` não é exportado por `./shared-context` (erro de import/binding).

- [ ] **Step 3: Write minimal implementation**

(a) Em `src/shared/config/agents/shared-context.ts`, adicionar (logo após o bloco de imports, antes de `_buildBusinessContext`):
```ts
/**
 * True quando o contexto semântico do cliente traz ≥1 coluna física bound
 * (`attributes[].column`). Nesse caso o prompt usa as colunas reais do cliente e
 * omite o schema hardcoded (G5); senão mantém o hardcoded (sem regressão).
 */
export function hasClientSchema(sc: ClientSemanticContext | null | undefined): boolean {
  return !!sc?.dataContracts?.some((c) =>
    c.entities.some((e) =>
      e.attributes.some((a) => typeof a.column === 'string' && a.column.length > 0),
    ),
  );
}
```

(b) Em `src/shared/config/agents/index.ts`, trocar:
```ts
export { SQL_RULES, RESPONSE_GUIDELINES, buildSchemaContext, buildBusinessContext } from './shared-context';
```
por:
```ts
export { SQL_RULES, RESPONSE_GUIDELINES, buildSchemaContext, buildBusinessContext, hasClientSchema } from './shared-context';
```

(c) Em `src/shared/config/agents/canvas-orchestrator.ts`, trocar a linha de import:
```ts
import { buildBusinessContext, buildSchemaContext, renderSemanticContextSections, SQL_RULES } from './shared-context';
```
por:
```ts
import { buildBusinessContext, buildSchemaContext, renderSemanticContextSections, hasClientSchema, SQL_RULES } from './shared-context';
```
e **remover** a função local (o bloco inteiro do comentário + a `function hasClientSchema(...) { ... }` privada, logo acima de `export function buildCanvasOrchestratorPrompt`). O acesso `hasClientSchema(ctx.semanticContext)` dentro de `buildCanvasOrchestratorPrompt` permanece igual (agora resolve para o import).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/config/agents/semantic-context-prompt.test.ts`
Expected: PASS (todos — `hasClientSchema` + os testes do canvas do G5 seguem verdes).

- [ ] **Step 5: Commit**

```bash
git add src/shared/config/agents/shared-context.ts src/shared/config/agents/index.ts src/shared/config/agents/canvas-orchestrator.ts src/shared/config/agents/semantic-context-prompt.test.ts
git commit -m "refactor(agents): hasClientSchema compartilhado em shared-context (G5-sub-agentes)"
```

---

## Task 2: Os 8 `build*AgentPrompt` gateiam o hardcoded e injetam a seção do cliente

**Files:**
- Modify: `src/shared/config/agents/descriptive-agent.ts`
- Modify: `src/shared/config/agents/diagnostic-agent.ts`
- Modify: `src/shared/config/agents/predictive-agent.ts`
- Modify: `src/shared/config/agents/simulation-agent.ts`
- Modify: `src/shared/config/agents/prescriptive-agent.ts`
- Modify: `src/shared/config/agents/monitoring-agent.ts`
- Modify: `src/shared/config/agents/cashflow-agent.ts`
- Modify: `src/shared/config/agents/external-agent.ts`
- Test: `src/shared/config/agents/semantic-context-prompt.test.ts`

**Interfaces:**
- Consumes: `hasClientSchema` (Task 1), `renderSemanticContextSections` (já existe).
- Produces: cada `build*AgentPrompt(ctx)` omite o hardcoded quando `hasClientSchema(ctx.semanticContext)` e renderiza a seção semântica do cliente; senão mantém o hardcoded.

- [ ] **Step 1: Write the failing test** — adicionar ao `semantic-context-prompt.test.ts`.

Adicionar os imports dos 7 builders restantes (o `buildDescriptiveAgentPrompt` já é importado de `./descriptive-agent`):
```ts
import {
  buildDiagnosticAgentPrompt,
  buildPredictiveAgentPrompt,
  buildSimulationAgentPrompt,
  buildPrescriptiveAgentPrompt,
  buildMonitoringAgentPrompt,
  buildCashflowAgentPrompt,
  buildExternalAgentPrompt,
} from '@/shared/config/agents';
```

Adicionar o describe parametrizado (no fim do arquivo):
```ts
describe('build*AgentPrompt — schema real do cliente (G5-sub-agentes)', () => {
  const SUB_AGENT_BUILDERS: Record<string, (ctx: AgentDynamicContext) => string> = {
    descriptive: buildDescriptiveAgentPrompt,
    diagnostic: buildDiagnosticAgentPrompt,
    predictive: buildPredictiveAgentPrompt,
    simulation: buildSimulationAgentPrompt,
    prescriptive: buildPrescriptiveAgentPrompt,
    monitoring: buildMonitoringAgentPrompt,
    cashflow: buildCashflowAgentPrompt,
    external: buildExternalAgentPrompt,
  };

  for (const [name, build] of Object.entries(SUB_AGENT_BUILDERS)) {
    it(`${name}: omite o hardcoded e usa as colunas reais quando o cliente tem schema`, () => {
      const out = build({ ...baseDescriptiveCtx, semanticContext: semanticContextFull });
      expect(out).not.toContain('## Schema: Tabela contratos');
      expect(out).toContain('saldo_devedor → coluna `saldo_devedor`');
    });
    it(`${name}: mantém o hardcoded sem schema do cliente (sem regressão)`, () => {
      const out = build(baseDescriptiveCtx);
      expect(out).toContain('## Schema: Tabela contratos');
    });
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/shared/config/agents/semantic-context-prompt.test.ts`
Expected: FAIL — todos os 8 builders ainda incluem o marcador hardcoded mesmo com schema do cliente; os 7 não-descriptive nem contêm a coluna real.

- [ ] **Step 3a: Implementar o `descriptive-agent.ts`**

Trocar a linha de import (linha 2):
```ts
import { buildBusinessContext, buildSchemaContext, buildDynamicFilterContext, renderSemanticContextSections, SQL_RULES, RESPONSE_GUIDELINES } from './shared-context';
```
por:
```ts
import { buildBusinessContext, buildSchemaContext, buildDynamicFilterContext, renderSemanticContextSections, hasClientSchema, SQL_RULES, RESPONSE_GUIDELINES } from './shared-context';
```

No corpo de `buildDescriptiveAgentPrompt`, após a linha `const semanticContextSection = ...`, adicionar:
```ts
  const schemaSection = hasClientSchema(ctx.semanticContext) ? '' : buildSchemaContext();
```
e, no template, trocar `${buildSchemaContext()}` por `${schemaSection}`.

- [ ] **Step 3b: Implementar os 7 restantes (transform idêntico)**

Para CADA arquivo abaixo, com `X` = nome do agente em PascalCase:
- `diagnostic-agent.ts` → `X = Diagnostic`
- `predictive-agent.ts` → `X = Predictive`
- `simulation-agent.ts` → `X = Simulation`
- `prescriptive-agent.ts` → `X = Prescriptive`
- `monitoring-agent.ts` → `X = Monitoring`
- `cashflow-agent.ts` → `X = Cashflow`
- `external-agent.ts` → `X = External`

(i) Trocar a linha de import (linha 2):
```ts
import { buildBusinessContext, buildSchemaContext, buildDynamicFilterContext, SQL_RULES, RESPONSE_GUIDELINES } from './shared-context';
```
por:
```ts
import { buildBusinessContext, buildSchemaContext, buildDynamicFilterContext, renderSemanticContextSections, hasClientSchema, SQL_RULES, RESPONSE_GUIDELINES } from './shared-context';
```

(ii) Trocar a função `buildXAgentPrompt` inteira:
```ts
export function buildXAgentPrompt(ctx: AgentDynamicContext): string {
  return `${buildXStatic()}

${SQL_RULES}

${buildSchemaContext()}

${buildBusinessContext()}

${buildDynamicFilterContext(ctx)}

${RESPONSE_GUIDELINES}`;
}
```
por:
```ts
export function buildXAgentPrompt(ctx: AgentDynamicContext): string {
  const semantic = renderSemanticContextSections(ctx.semanticContext);
  const semanticSection = semantic ? `\n${semantic}\n` : '';
  const schemaSection = hasClientSchema(ctx.semanticContext) ? '' : buildSchemaContext();
  return `${buildXStatic()}

${SQL_RULES}

${schemaSection}

${buildBusinessContext()}

${buildDynamicFilterContext(ctx)}
${semanticSection}
${RESPONSE_GUIDELINES}`;
}
```

> Nota: quando não há schema do cliente, `semanticSection === ''` e `schemaSection === buildSchemaContext()` — a saída fica textualmente equivalente à atual (sem regressão; só o segmento de schema agora vem de uma variável e a injeção semântica vazia não adiciona conteúdo). O `${buildDynamicFilterContext(ctx)}` é seguido por `\n${semanticSection}\n` para espelhar o `descriptive-agent.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/shared/config/agents/semantic-context-prompt.test.ts`
Expected: PASS (16 novos casos + todos os existentes).

- [ ] **Step 5: Commit**

```bash
git add src/shared/config/agents/descriptive-agent.ts src/shared/config/agents/diagnostic-agent.ts src/shared/config/agents/predictive-agent.ts src/shared/config/agents/simulation-agent.ts src/shared/config/agents/prescriptive-agent.ts src/shared/config/agents/monitoring-agent.ts src/shared/config/agents/cashflow-agent.ts src/shared/config/agents/external-agent.ts src/shared/config/agents/semantic-context-prompt.test.ts
git commit -m "feat(agents): 8 sub-agentes substituem schema hardcoded pelo real do cliente (G5-sub-agentes)"
```

---

## Task 3: `composeCodeBaseline` do Mastra gateia o hardcoded

**Files:**
- Modify: `src/features/ai-agents/mastra/create-mastra-agent-from-config.ts`
- Test: `src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`

**Interfaces:**
- Consumes: `hasClientSchema` re-exportado por `@/shared/config/agents` (Task 1).
- Produces: o baseline de código passado a `resolveAgentInstructions` omite o hardcoded quando `hasClientSchema(ctx.semanticContext)`.

- [ ] **Step 1: Write the failing test** — adicionar ao `create-mastra-agent-from-config.test.ts`, dentro do `describe('createMastraAgentFromConfig', ...)`:

```ts
  it('com schema do cliente: baseline de código omite o hardcoded', async () => {
    const scCtx = {
      clientId: 'OM', personaId: 'p', dataset: 'om', filters: {}, sessionId: 's',
      semanticContext: {
        clientId: 'OM', metrics: [],
        dataContracts: [{ contractId: 'c', entities: [{ entityId: 'contratos', attributes: [{ attributeId: 'saldo_devedor', type: 'float', column: 'vl_saldo_dev' }] }] }],
      },
    } as never;
    await createMastraAgentFromConfig(input({ ctx: scCtx }));
    const baseline = h.resolveInstrMock.mock.calls.at(-1)![1] as string;
    expect(baseline).not.toContain('## Schema: Tabela contratos');
  });

  it('sem schema do cliente: baseline de código mantém o hardcoded', async () => {
    await createMastraAgentFromConfig(input());
    const baseline = h.resolveInstrMock.mock.calls.at(-1)![1] as string;
    expect(baseline).toContain('## Schema: Tabela contratos');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`
Expected: FAIL — "com schema do cliente" falha; `composeCodeBaseline` sempre inclui `buildSchemaContext()`.

- [ ] **Step 3: Write minimal implementation** — em `src/features/ai-agents/mastra/create-mastra-agent-from-config.ts`:

(a) Trocar a linha de import:
```ts
import { SQL_RULES, RESPONSE_GUIDELINES, buildSchemaContext, buildBusinessContext } from '@/shared/config/agents';
```
por:
```ts
import { SQL_RULES, RESPONSE_GUIDELINES, buildSchemaContext, buildBusinessContext, hasClientSchema } from '@/shared/config/agents';
```

(b) Trocar a função `composeCodeBaseline`:
```ts
function composeCodeBaseline(buildStatic: () => string): string {
  return [buildStatic(), RESPONSE_GUIDELINES, SQL_RULES, buildSchemaContext(), buildBusinessContext()].join('\n\n');
}
```
por:
```ts
function composeCodeBaseline(buildStatic: () => string, sc: AgentDynamicContext['semanticContext']): string {
  const schema = hasClientSchema(sc) ? '' : buildSchemaContext();
  return [buildStatic(), RESPONSE_GUIDELINES, SQL_RULES, schema, buildBusinessContext()].filter(Boolean).join('\n\n');
}
```

(c) Na chamada dentro de `createMastraAgentFromConfig`, trocar:
```ts
    await resolveAgentInstructions(systemKey, composeCodeBaseline(buildStatic)),
```
por:
```ts
    await resolveAgentInstructions(systemKey, composeCodeBaseline(buildStatic, ctx.semanticContext)),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts`
Expected: PASS (os 2 novos + os 9 existentes).

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-agents/mastra/create-mastra-agent-from-config.ts src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts
git commit -m "feat(mastra): composeCodeBaseline gateia schema hardcoded pelo real do cliente (G5-sub-agentes)"
```

---

## Verificação final (após Task 3)

- [ ] Suíte do escopo: `pnpm exec vitest run src/shared/config/agents/semantic-context-prompt.test.ts src/features/ai-agents/mastra/create-mastra-agent-from-config.test.ts` → tudo verde.
- [ ] `npx eslint` nos arquivos tocados → 0 erros.
- [ ] `pnpm exec tsc --noEmit` → 0 erros.
- [ ] Suíte completa `pnpm exec vitest run` → sem regressão.
- [ ] Finalizar com `superpowers:finishing-a-development-branch`.

## Fora deste plano
- Schema entregue via skill-playbook de config (Mastra) — dado de config, não código.
- **G7** — alinhar `get_table_schema` v2 ao binding.
- Popular os dados da BRZ; unificar `EXPECTED_SCHEMA` (D1); portabilidade/templatização (B).
