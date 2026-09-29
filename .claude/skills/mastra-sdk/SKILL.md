---
name: mastra-sdk
description: "Use para Mastra SDK — agents, workflows, RAG. Keywords: mastra, agent framework."
---
# Mastra (TS agent framework)

Framework TypeScript opinionado para agents, workflows, RAG e memory. Construído sobre o AI SDK 7 (`LanguageModelV4`). Pins: `@mastra/core@1.71.0` + CLI `mastra@1.31.3` (mesma leva); `rag@2`, `mcp@2`. **`@mastra/evals` fica fora** (peer `vitest <5`, ADR 0004 E4): eval roda no harness próprio.

## Essência
- **Agent:** classe com `instructions`, `model`, `tools`, `memory`. `agent.generate(prompt)` ou `agent.stream(prompt)`.
- **Tools:** definidas com Zod schema + `execute`. Compartilháveis entre agents.
- **Workflows:** orquestração explícita de steps (DAG). Cada step recebe input tipado, retorna output tipado. Branching, parallel, suspend/resume.
- **Memory:** `new Memory({ storage, vector, options })` de `@mastra/memory`; persiste por `threadId`/`resourceId`. Backend do projeto: `@mastra/pg` (`PostgresStore` + `PgVector`). Sempre com `lastMessages` limitado.
- **RAG:** `MDocument` (`@mastra/rag`) + chunking + embeddings + vector store (pgvector preferido).
- **Loop:** `maxSteps` ou `stopWhen` em todo agent com tools.
- **`Mastra` container:** `new Mastra({ agents, workflows, observability, deployer })` em `src/mastra/index.ts` (entry que o CLI procura; não existe `mastra.config.ts`). `mastra dev` serve o playground.
- **Observability:** `@mastra/observability@1.18.1` (`new Observability({ configs })`); a chave `telemetry` da 0.x não existe mais.
- **Deploy:** Cloudflare Workers, Vercel, Node — adapters prontos.

## Procedimento mínimo
1. Scaffold com `pnpm create mastra` e depois fixe versões exatas (core e CLI na mesma leva).
2. Definir tools em `src/mastra/tools/` com Zod input/output.
3. Definir agent em `src/mastra/agents/` com `instructions`, `model`, `tools`, opcional `memory`.
4. Workflows complexos em `src/mastra/workflows/` (step-based, tipado).
5. Registrar no `Mastra` container; `mastra dev` para servir API.
6. Eval de regressão no harness do projeto (`@.contexts/engineering/stacks/ai/harness-engineering.md`), não em `@mastra/evals`.

## Anti-patterns
- Lógica de orquestração em prompt em vez de workflow → indeterminismo; use workflow para fluxo previsível.
- Memory global sem `threadId` → mistura conversas entre usuários.
- Tool com side effects sem idempotência → retry duplica ação.

## Mini-exemplo
```ts
// src/mastra/agents/travel-agent.ts
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { weatherTool } from "@/mastra/tools/weather-tool";

export const travelAgent = new Agent({
  name: "travel-agent",
  instructions: "Help users plan trips...",
  model: openai(config.openaiModelId), // ex. "gpt-6-luna"
  tools: { weatherTool },
});

const res = await travelAgent.generate("Plan a trip to Lisbon", { maxSteps: 5 });
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/mastra-sdk.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
