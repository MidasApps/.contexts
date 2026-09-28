---
name: vercel-ai-sdk
description: Use para Vercel AI SDK — streaming UI, providers, tools, agents. Keywords: vercel ai, ai sdk, useChat.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Vercel AI SDK (`ai`)

Camada provider-agnóstica para LLMs em TypeScript: API unificada (`generateText`, `streamText`, `generateObject`, `streamObject`, `embed`), UI hooks (`useChat`, `useCompletion`), tools, agent loop.

## Essência
- **Core (`ai`):** funções server-side. Provider plugin (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`) para escolher modelo: `openai("gpt-4.1-mini")`.
- **`generateText({ model, messages, tools? })`** retorna `{ text, toolCalls, usage }`.
- **`streamText`** retorna stream; integra com `Response` (`result.toDataStreamResponse()`).
- **`generateObject`/`streamObject`** + `schema: z.object(...)` → output Zod-tipado garantido.
- **Tools:** `tools: { weather: tool({ description, inputSchema: z..., execute: async (args) => ... }) }` — SDK executa em loop até parar.
- **Multi-step:** `stopWhen` controla quando parar agent loop (`stepCountIs(5)`, `hasToolCall("done")`).
- **UI (`@ai-sdk/react`):** `useChat({ api: "/api/chat" })` gerencia mensagens, streaming, tool calls do lado cliente.
- **Provider switch sem mudar código:** trocar `openai(...)` por `anthropic(...)` em um lugar.
- **Telemetria:** `experimental_telemetry: { isEnabled: true }` integra OTel.

## Procedimento mínimo
1. Instalar core + provider: `pnpm add ai @ai-sdk/openai zod`.
2. Server route (Next App Router): `streamText({ model, messages })` → retornar `result.toDataStreamResponse()`.
3. UI com `useChat()` para renderizar mensagens, input, status de loading.
4. Tools: declarar com Zod schema; SDK invoca `execute` automaticamente.
5. Output estruturado: `generateObject` com `schema: z.object(...)`.

## Anti-patterns
- Chamar provider SDK direto quando precisa de UI streaming → use AI SDK para integração com `useChat`.
- Tool sem validação Zod no `inputSchema` → SDK confia no LLM.
- Não setar `stopWhen` em agent loop → loop infinito potencial.

## Mini-exemplo
```ts
// app/api/chat/route.ts
import { streamText, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: openai("gpt-4.1-mini"),
    messages,
    tools: {
      weather: tool({
        description: "Get weather",
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => fetchWeather(city),
      }),
    },
  });
  return result.toDataStreamResponse();
}

// app/chat/page.tsx
"use client";
const { messages, input, handleInputChange, handleSubmit } = useChat();
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/vercel-ai-sdk.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
