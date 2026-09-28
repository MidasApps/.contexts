# Agent Intelligence Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply best practices from Claude Code 5's agent architecture to improve the intelligence, resilience, and efficiency of the Liquid dataviz AI agents (both normal sidebar mode and immersive canvas mode).

**Architecture:** 7 focused improvements across the agent stack: retry with backoff on AI calls, result size limits on tools, thinking budget configuration, adaptive maxSteps per agent, orchestrator direct-response capability, context compaction for long conversations, and static prompt caching. All changes are backward-compatible — no UI or API contract changes needed.

**Tech Stack:** Vercel AI SDK, Google Vertex AI (Gemini), Zod, BigQuery, TypeScript

---

### Task 1: Retry with Exponential Backoff for Agent Calls

**Files:**
- Create: `src/features/ai-agents/lib/with-retry.ts`
- Modify: `src/features/ai-agents/create-agent-tool.ts:98`

This is the highest-impact improvement. Currently, any transient Vertex AI failure (429 rate limit, network timeout, 503) kills the agent with a generic error. Claude Code 5 retries up to 10 times with exponential backoff and error classification.

- [ ] **Step 1: Create the retry utility**

```typescript
// src/features/ai-agents/lib/with-retry.ts

const TRANSIENT_STATUS_CODES = [429, 503, 529];
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Network errors
    if (msg.includes('econnreset') || msg.includes('epipe') || msg.includes('etimedout') || msg.includes('fetch failed')) {
      return true;
    }
    // Rate limiting / overload from Vertex AI
    if (msg.includes('429') || msg.includes('503') || msg.includes('resource exhausted') || msg.includes('quota')) {
      return true;
    }
    // Check for status code in error object
    const statusCode = (error as any).status ?? (error as any).statusCode;
    if (typeof statusCode === 'number' && TRANSIENT_STATUS_CODES.includes(statusCode)) {
      return true;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wraps an async function with retry logic and exponential backoff.
 * Only retries on transient errors (network, rate limit, overload).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number; label?: string } = {},
): Promise<T> {
  const { maxRetries = MAX_RETRIES, baseDelay = BASE_DELAY_MS, label = 'operation' } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLast = attempt === maxRetries;
      if (isLast || !isTransientError(error)) {
        throw error;
      }
      const delay = baseDelay * Math.pow(2, attempt); // 500ms, 1s, 2s
      console.warn(`[withRetry] ${label} attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delay}ms`, error instanceof Error ? error.message : error);
      await sleep(delay);
    }
  }
  // Unreachable, but TypeScript needs it
  throw new Error('withRetry exhausted');
}
```

- [ ] **Step 2: Integrate retry into createAgentTool**

In `src/features/ai-agents/create-agent-tool.ts`, wrap the `generateText` call:

```typescript
// Add import at top:
import { withRetry } from './lib/with-retry';

// Replace the generateText call (line ~98) with:
const result = await withRetry(
  () => generateText({
    model: getModel(config.model),
    system,
    tools: toolsWithAskUser,
    stopWhen: stepCountIs(config.maxSteps),
    prompt: query,
    onStepFinish({ toolCalls, toolResults }) {
      for (const tc of toolCalls) {
        if (tc.toolName === 'ask_user') continue;
        const toolStatus = TOOL_STATUS_MAP[tc.toolName] ?? 'analyzing';
        pendingYields.push({
          status: toolStatus,
          agent: config.id,
          message: `Executando ${tc.toolName.replace(/_/g, ' ')}`,
        });
      }
      for (const tr of toolResults) {
        if (tr.toolName === 'ask_user' && typeof tr.output === 'object' && tr.output !== null) {
          const r = tr.output as Record<string, unknown>;
          if (r.type === 'clarification') {
            clarificationRef.data = {
              question: r.question as string,
              options: (r.options as ClarificationOption[]) ?? [],
            };
          }
        }
        if (tr.toolName === 'execute_sql' && typeof tr.output === 'object' && tr.output !== null) {
          const r = tr.output as Record<string, unknown>;
          if (r.success) {
            pendingYields.push({
              status: 'query_complete',
              agent: config.id,
              message: `Query executada`,
              rowCount: r.rowCount as number,
            });
          }
        }
      }
    },
  }),
  { label: config.id },
);
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`
Expected: Build succeeds with no type errors

- [ ] **Step 4: Commit**

```bash
git add src/features/ai-agents/lib/with-retry.ts src/features/ai-agents/create-agent-tool.ts
git commit -m "feat(agents): add retry with exponential backoff for agent calls"
```

---

### Task 2: Result Size Limits on SQL Tools

**Files:**
- Modify: `src/features/ai-agents/tools/execute-sql.ts`

Currently `execute_sql` returns unlimited rows. A query returning 50k rows wastes tokens and can exceed context limits. Claude Code 5 enforces `maxResultSizeChars` per tool.

- [ ] **Step 1: Add row and character limits to execute-sql**

In `src/features/ai-agents/tools/execute-sql.ts`, add constants and truncation logic:

```typescript
// Add after ALLOWED_STARTS constant (line ~7):
const MAX_ROWS = 500;
const MAX_RESULT_CHARS = 50_000;
```

Replace the success return block (around lines 40-47) with:

```typescript
const totalRows = rows.length;
const truncatedRows = rows.slice(0, MAX_ROWS);

// Serialize and check character limit
let serialized = JSON.stringify(truncatedRows);
let charTruncated = false;
if (serialized.length > MAX_RESULT_CHARS) {
  // Binary search for max rows that fit in char budget
  let lo = 0, hi = truncatedRows.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (JSON.stringify(truncatedRows.slice(0, mid)).length <= MAX_RESULT_CHARS) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  truncatedRows.length = lo;
  serialized = JSON.stringify(truncatedRows);
  charTruncated = true;
}

return {
  success: true,
  rowCount: totalRows,
  returnedRows: truncatedRows.length,
  truncated: totalRows > truncatedRows.length || charTruncated,
  truncationNote: totalRows > truncatedRows.length
    ? `Retornadas ${truncatedRows.length} de ${totalRows} linhas. Use LIMIT ou filtros mais específicos para reduzir.`
    : undefined,
  data: truncatedRows,
};
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/features/ai-agents/tools/execute-sql.ts
git commit -m "feat(agents): add row/char limits to execute_sql tool results"
```

---

### Task 3: Thinking Budget Configuration per Model Tier

**Files:**
- Modify: `src/features/ai-agents/model-registry.ts`

Currently Vertex AI models are instantiated without thinking configuration. Claude Code 5 sets thinking budgets per model to balance quality vs speed.

- [ ] **Step 1: Add providerOptions with thinking budgets**

Replace the full content of `src/features/ai-agents/model-registry.ts`:

```typescript
import { customProvider } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import type { ModelTier } from '@/shared/config/agents/types';

// Lazy initialization — vertex() validates env vars eagerly,
// so we defer provider creation until first use
let _models: ReturnType<typeof customProvider> | null = null;

function getModels() {
  if (!_models) {
    _models = customProvider({
      languageModels: {
        router: vertex('gemini-2.5-flash-lite'),
        fast: vertex('gemini-2.5-flash'),
        reasoning: vertex('gemini-2.5-pro'),
      },
    });
  }
  return _models;
}

/**
 * Thinking budget tokens per model tier.
 * - router: no thinking (pure routing, needs speed)
 * - fast: light thinking (descriptive analysis, simple queries)
 * - reasoning: deep thinking (predictions, simulations, diagnostics)
 */
const THINKING_BUDGET: Record<ModelTier, number | undefined> = {
  router: undefined,
  fast: 2048,
  reasoning: 8192,
};

export function getModel(tier: ModelTier) {
  return getModels().languageModel(tier);
}

/**
 * Returns providerOptions to pass to generateText/streamText for thinking budget.
 * Vertex AI Gemini uses `google.thinkingConfig.thinkingBudget`.
 */
export function getProviderOptions(tier: ModelTier): Record<string, unknown> | undefined {
  const budget = THINKING_BUDGET[tier];
  if (budget === undefined) return undefined;
  return {
    google: {
      thinkingConfig: {
        thinkingBudget: budget,
      },
    },
  };
}
```

- [ ] **Step 2: Apply providerOptions in createAgentTool**

In `src/features/ai-agents/create-agent-tool.ts`, add the import and pass providerOptions:

```typescript
// Add import:
import { getModel, getProviderOptions } from './model-registry';

// In the generateText call, add providerOptions:
const result = await withRetry(
  () => generateText({
    model: getModel(config.model),
    providerOptions: getProviderOptions(config.model),
    system,
    // ... rest unchanged
  }),
  { label: config.id },
);
```

- [ ] **Step 3: Apply providerOptions in orchestrator**

In `src/features/ai-agents/orchestrator.ts`:

```typescript
// Add import:
import { getModel, getProviderOptions } from './model-registry';

// In streamText call, add providerOptions:
return streamText({
  model: getModel('router'),
  providerOptions: getProviderOptions('router'),
  system: buildOrchestratorPrompt(ctx),
  // ... rest unchanged
});
```

- [ ] **Step 4: Apply providerOptions in canvas orchestrator**

In `src/features/canvas-orchestrator/orchestrator.ts`:

```typescript
// Add import:
import { getModel, getProviderOptions } from '@/features/ai-agents/model-registry';

// In streamText call, add providerOptions:
return streamText({
  model: getModel('reasoning'),
  providerOptions: getProviderOptions('reasoning'),
  system: buildCanvasOrchestratorPrompt({
  // ... rest unchanged
});
```

- [ ] **Step 5: Verify build passes**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/features/ai-agents/model-registry.ts src/features/ai-agents/create-agent-tool.ts src/features/ai-agents/orchestrator.ts src/features/canvas-orchestrator/orchestrator.ts
git commit -m "feat(agents): configure thinking budgets per model tier"
```

---

### Task 4: Adaptive maxSteps per Agent Complexity

**Files:**
- Modify: `src/features/ai-agents/agents/descriptive-agent.ts`
- Modify: `src/features/ai-agents/agents/diagnostic-agent.ts`
- Modify: `src/features/ai-agents/agents/predictive-agent.ts`
- Modify: `src/features/ai-agents/agents/simulation-agent.ts`
- Modify: `src/features/ai-agents/agents/prescriptive-agent.ts`
- Modify: `src/features/ai-agents/agents/monitoring-agent.ts`
- Modify: `src/features/ai-agents/agents/cashflow-agent.ts`
- Modify: `src/features/ai-agents/agents/external-agent.ts`

Currently all agents have `maxSteps: 4`. A simulation agent doing Monte Carlo needs more steps than a descriptive agent doing a single SELECT. Claude Code 5 configures `maxTurns` per agent based on expected complexity.

- [ ] **Step 1: Update maxSteps in each agent file**

Apply these changes (only the `maxSteps` line in each file's config object):

| Agent | Current | New | Rationale |
|-------|---------|-----|-----------|
| `descriptive-agent.ts` | 4 | 5 | schema + sample + SQL + interpret + follow-up |
| `diagnostic-agent.ts` | 4 | 6 | multiple comparative queries + correlation |
| `predictive-agent.ts` | 4 | 6 | historical data + forecast + interpret |
| `simulation-agent.ts` | 4 | 8 | baseline + multiple scenarios + Monte Carlo |
| `prescriptive-agent.ts` | 4 | 6 | clustering + causal + ranking |
| `monitoring-agent.ts` | 4 | 6 | multiple compliance checks + report |
| `cashflow-agent.ts` | 4 | 6 | WAL + spread + coverage + comparison |
| `external-agent.ts` | 4 | 4 | web search is naturally bounded (no change) |

In each file, change `maxSteps: 4` to the new value. Example for `simulation-agent.ts`:
```typescript
maxSteps: 8,
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/features/ai-agents/agents/
git commit -m "feat(agents): adaptive maxSteps per agent complexity"
```

---

### Task 5: Orchestrator Can Respond Directly for Non-Data Questions

**Files:**
- Modify: `src/shared/config/agents/orchestrator.ts`

Currently the orchestrator prompt says "Nunca responda diretamente". This forces agent calls even for "Obrigado" or "O que você pode fazer?". Claude Code 5's coordinator answers directly when possible — no trivial delegations.

- [ ] **Step 1: Update the orchestrator prompt**

In `src/shared/config/agents/orchestrator.ts`, replace the existing rule #4 (line ~179):

```
4. **Nunca responda diretamente** com análises, dados ou explicações. Delegue sempre para o(s) agente(s) especializado(s).
```

With:

```
4. **Responda diretamente** (sem chamar agentes) APENAS quando:
   - O usuário está cumprimentando ("oi", "olá"), agradecendo ("obrigado", "valeu") ou confirmando ("ok", "entendi")
   - A pergunta é sobre suas capacidades ("o que você pode fazer?", "quais agentes existem?", "como funciona?")
   - A mensagem não requer dados ou análise (ex: "pode repetir?", "não entendi")
   Para QUALQUER pergunta que envolva dados, métricas, análises ou a carteira, delegue ao(s) agente(s) especializado(s).
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 3: Commit**

```bash
git add src/shared/config/agents/orchestrator.ts
git commit -m "feat(agents): allow orchestrator direct responses for non-data queries"
```

---

### Task 6: Context Compaction for Long Conversations

**Files:**
- Create: `src/features/ai-agents/lib/compact-messages.ts`
- Modify: `src/features/ai-agents/orchestrator.ts`
- Modify: `src/features/canvas-orchestrator/orchestrator.ts`

Currently the full message history is sent every request via `convertToModelMessages(input.messages)`. Long conversations waste tokens and can exceed context limits. Claude Code 5 has multi-layer compaction (micro, auto, snip).

- [ ] **Step 1: Create the compaction utility**

```typescript
// src/features/ai-agents/lib/compact-messages.ts

import type { UIMessage } from 'ai';

/**
 * Max recent turns to preserve in full detail.
 * Older turns get summarized to reduce token usage.
 */
const MAX_RECENT_TURNS = 20;

/**
 * Max tool result parts to preserve per assistant message in old turns.
 * Tool results are the heaviest part of messages.
 */
const MAX_TOOL_PARTS_IN_SUMMARY = 0;

/**
 * Compacts a conversation by trimming old messages.
 * - Keeps the last MAX_RECENT_TURNS messages in full.
 * - For older messages: keeps user messages as-is, strips tool result data
 *   from assistant messages (keeping only the text summary).
 * - Prepends a system note about omitted context.
 *
 * This is a simple approach (vs Claude Code 5's full compaction) but effective
 * for keeping token usage manageable.
 */
export function compactMessages(messages: UIMessage[]): UIMessage[] {
  if (messages.length <= MAX_RECENT_TURNS) {
    return messages;
  }

  const oldMessages = messages.slice(0, -MAX_RECENT_TURNS);
  const recentMessages = messages.slice(-MAX_RECENT_TURNS);

  // Strip tool-heavy parts from old assistant messages
  const compactedOld: UIMessage[] = oldMessages.map(msg => {
    if (msg.role !== 'assistant') return msg;

    // Keep only text parts from old assistant messages
    const textParts = (msg.parts ?? []).filter(p => p.type === 'text');
    if (textParts.length === 0) {
      // If no text parts, create a summary placeholder
      return {
        ...msg,
        parts: [{ type: 'text' as const, text: '[Resposta anterior com dados — detalhes omitidos para economia de contexto]' }],
      };
    }

    return { ...msg, parts: textParts };
  });

  return [...compactedOld, ...recentMessages];
}
```

- [ ] **Step 2: Apply compaction in the chat orchestrator**

In `src/features/ai-agents/orchestrator.ts`, add import and use:

```typescript
// Add import:
import { compactMessages } from './lib/compact-messages';

// In createOrchestrator, change:
//   messages: await convertToModelMessages(input.messages),
// To:
    messages: await convertToModelMessages(compactMessages(input.messages)),
```

- [ ] **Step 3: Apply compaction in the canvas orchestrator**

In `src/features/canvas-orchestrator/orchestrator.ts`, add import and use:

```typescript
// Add import:
import { compactMessages } from '@/features/ai-agents/lib/compact-messages';

// In createCanvasOrchestrator, change:
//   messages: await convertToModelMessages(input.messages),
// To:
    messages: await convertToModelMessages(compactMessages(input.messages)),
```

- [ ] **Step 4: Verify build passes**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 5: Commit**

```bash
git add src/features/ai-agents/lib/compact-messages.ts src/features/ai-agents/orchestrator.ts src/features/canvas-orchestrator/orchestrator.ts
git commit -m "feat(agents): add context compaction for long conversations"
```

---

### Task 7: Static Prompt Caching

**Files:**
- Create: `src/features/ai-agents/lib/prompt-cache.ts`
- Modify: `src/shared/config/agents/shared-context.ts`

Currently `buildSchemaContext()` and `buildBusinessContext()` rebuild the same static strings every API call. Claude Code 5 memoizes static prompt parts via `CacheSafeParams`. This saves CPU and enables potential Vertex AI prompt caching.

- [ ] **Step 1: Create the prompt cache utility**

```typescript
// src/features/ai-agents/lib/prompt-cache.ts

/**
 * Simple memoization for static prompt sections.
 * Keys are function names or dataset identifiers.
 * Values are the computed string results.
 *
 * This is a process-level cache (lives for the lifetime of the server process).
 * Safe because the cached content is truly static (schema docs, glossary, benchmarks).
 */
const cache = new Map<string, string>();

export function getCachedOrCompute(key: string, compute: () => string): string {
  const existing = cache.get(key);
  if (existing !== undefined) return existing;
  const result = compute();
  cache.set(key, result);
  return result;
}

/** Clear all cached prompts. Useful if you ever hot-reload config. */
export function clearPromptCache(): void {
  cache.clear();
}
```

- [ ] **Step 2: Apply caching to shared-context.ts**

In `src/shared/config/agents/shared-context.ts`, wrap the static functions:

```typescript
// Add import at top:
import { getCachedOrCompute } from '@/features/ai-agents/lib/prompt-cache';

// Rename the existing functions to _uncached versions and wrap:

// Replace `export function buildBusinessContext()` with:
function _buildBusinessContext(): string {
  // ... existing implementation unchanged ...
}

export function buildBusinessContext(): string {
  return getCachedOrCompute('businessContext', _buildBusinessContext);
}

// Replace `export function buildSchemaContext()` with:
function _buildSchemaContext(): string {
  // ... existing implementation unchanged ...
}

export function buildSchemaContext(): string {
  return getCachedOrCompute('schemaContext', _buildSchemaContext);
}
```

Keep `buildDynamicFilterContext`, `SQL_RULES`, and `RESPONSE_GUIDELINES` unchanged — they are either dynamic or already constants.

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/features/ai-agents/lib/prompt-cache.ts src/shared/config/agents/shared-context.ts
git commit -m "feat(agents): cache static prompt sections for efficiency"
```

---

## File Map Summary

| File | Action | Task |
|------|--------|------|
| `src/features/ai-agents/lib/with-retry.ts` | Create | 1 |
| `src/features/ai-agents/lib/compact-messages.ts` | Create | 6 |
| `src/features/ai-agents/lib/prompt-cache.ts` | Create | 7 |
| `src/features/ai-agents/create-agent-tool.ts` | Modify | 1, 3 |
| `src/features/ai-agents/model-registry.ts` | Modify | 3 |
| `src/features/ai-agents/orchestrator.ts` | Modify | 3, 6 |
| `src/features/ai-agents/tools/execute-sql.ts` | Modify | 2 |
| `src/features/ai-agents/agents/*.ts` (7 files) | Modify | 4 |
| `src/shared/config/agents/orchestrator.ts` | Modify | 5 |
| `src/shared/config/agents/shared-context.ts` | Modify | 7 |
| `src/features/canvas-orchestrator/orchestrator.ts` | Modify | 3, 6 |
