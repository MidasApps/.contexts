---
name: vercel-ai-sdk
description: "Use para Vercel AI SDK — streaming UI, providers, tools, agents. Keywords: vercel ai, ai sdk, useChat."
---
# Vercel AI SDK (`ai`)

Camada provider-agnóstica para LLMs em TypeScript (`ai@7.0.120`; providers `@ai-sdk/*` em majors próprias, ver `@.contexts/engineering/stacks/VERSIONS.md`): API unificada (`generateText`, `streamText` com `Output`, `embed`), UI hooks (`useChat` de `@ai-sdk/react@4`), tools, agent loop.

## Essência
- **Core (`ai`):** funções server-side. Provider plugin (`@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`) para escolher modelo: `openai(config.openaiModelId)` (ids atuais em `@.contexts/engineering/stacks/ai/openai.md`, ex. `gpt-6-luna`).
- **`generateText({ model, instructions, messages, tools? })`** retorna `{ text, toolCalls, usage }`. O campo de system é `instructions` (`system` está `@deprecated`).
- **`streamText`** retorna stream; integra com `Response` via `createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) })`. `result.toUIMessageStreamResponse()` e `toDataStreamResponse()` não são o caminho atual.
- **Saída estruturada:** `generateText`/`streamText` com `output: Output.object({ schema: z.object(...) })` → `result.output` validado pelo schema. `generateObject`/`streamObject` não são a API atual.
- **Tools:** `tools: { weather: tool({ description, inputSchema: z..., execute: async (args) => ... }) }` — SDK executa em loop até parar.
- **Multi-step:** `stopWhen` controla quando parar agent loop (`isStepCount(5)`, `hasToolCall("done")`).
- **UI (`@ai-sdk/react`):** `useChat()` gerencia mensagens, streaming, tool calls do lado cliente.
- **Provider switch sem mudar código:** trocar `openai(...)` por `anthropic(...)` em um lugar.
- **Telemetria:** `telemetry: { isEnabled: true, recordInputs: false }` (`experimental_telemetry` é alias `@deprecated`). Não grave prompt com PII.
- **Testes:** `MockLanguageModelV4` de `ai/test`.

## Procedimento mínimo
1. Instalar core + provider: `pnpm add ai @ai-sdk/openai zod`.
2. Server route (Next App Router): `streamText({ model, messages })` → retornar `createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) })`.
3. UI com `useChat()` para renderizar mensagens, input, status de loading.
4. Tools: declarar com Zod schema; SDK invoca `execute` automaticamente.
5. Output estruturado: `generateText` com `output: Output.object({ schema })`.

## Anti-patterns
- Chamar provider SDK direto quando precisa de UI streaming → use AI SDK para integração com `useChat`.
- Tool sem validação Zod no `inputSchema` → SDK confia no LLM.
- Não setar `stopWhen` em agent loop → loop infinito potencial.

## Mini-exemplo
```ts
// src/app/v1/chat/route.ts (no client: useChat({ transport: new DefaultChatTransport({ api: "/v1/chat" }) }))
import { convertToModelMessages, createUIMessageStreamResponse, isStepCount, streamText, toUIMessageStream, tool } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";

export async function POST(req: Request) {
  const { messages } = await req.json(); // valide com schema na borda
  const result = streamText({
    model: openai(config.openaiModelId),
    instructions: "Você responde com o que está no contexto.",
    messages: await convertToModelMessages(messages),
    abortSignal: req.signal,
    stopWhen: isStepCount(5),
    tools: {
      weather: tool({
        description: "Get weather",
        inputSchema: z.object({ city: z.string() }),
        execute: async ({ city }) => fetchWeather(city),
      }),
    },
  });
  return createUIMessageStreamResponse({ stream: toUIMessageStream({ stream: result.stream }) });
}

// app/chat/page.tsx
"use client";
const { messages, sendMessage, status } = useChat(); // @ai-sdk/react@4
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/vercel-ai-sdk.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
