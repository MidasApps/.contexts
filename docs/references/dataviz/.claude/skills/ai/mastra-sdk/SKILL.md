---
name: mastra-sdk
description: Use para Mastra SDK — agents, workflows, RAG. Keywords: mastra, agent framework.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Mastra (TS agent framework)

Framework TypeScript opinionado para agents, workflows, RAG, memory e evals. Construído sobre Vercel AI SDK; foco em produção (telemetry, deploy, eval pipelines).

## Essência
- **Agent:** classe com `instructions`, `model`, `tools`, `memory`. `agent.generate(prompt)` ou `agent.stream(prompt)`.
- **Tools:** definidas com Zod schema + `execute`. Compartilháveis entre agents.
- **Workflows:** orquestração explícita de steps (DAG). Cada step recebe input tipado, retorna output tipado. Branching, parallel, suspend/resume.
- **Memory:** `MemoryProcessor` (thread-based) persiste mensagens por `threadId`/`resourceId`. Adapters para Postgres, libsql, Upstash.
- **RAG:** `MDocument` + chunking + embeddings + vector store (Pinecone, pgvector, Chroma, etc) + `agent.tools.rag`.
- **Eval:** rodar testes com métricas (relevance, faithfulness, custom) em pipelines.
- **`Mastra` container:** registra agents/workflows/tools; expõe via API HTTP (`mastra dev`).
- **Deploy:** Cloudflare Workers, Vercel, Node — adapters prontos.

## Procedimento mínimo
1. `pnpm create mastra@latest` para scaffold.
2. Definir tools em `src/mastra/tools/` com Zod input/output.
3. Definir agent em `src/mastra/agents/` com `instructions`, `model`, `tools`, opcional `memory`.
4. Workflows complexos em `src/mastra/workflows/` (step-based, tipado).
5. Registrar no `Mastra` container; `mastra dev` para servir API.
6. Adicionar eval em CI para regressão de qualidade.

## Anti-patterns
- Lógica de orquestração em prompt em vez de workflow → indeterminismo; use workflow para fluxo previsível.
- Memory global sem `threadId` → mistura conversas entre usuários.
- Tool com side effects sem idempotência → retry duplica ação.

## Mini-exemplo
```ts
import { Agent } from "@mastra/core/agent";
import { openai } from "@ai-sdk/openai";
import { weatherTool } from "../tools/weather";

export const travelAgent = new Agent({
  name: "Travel",
  instructions: "Help users plan trips...",
  model: openai("gpt-4.1-mini"),
  tools: { weatherTool },
});

const res = await travelAgent.generate("Plan a trip to Lisbon");
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/mastra-sdk.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
