---
title: Vercel AI SDK
version: ai@7.0.120
last_updated: 2026-09-28
status: current
upstream: https://ai-sdk.dev
repository: https://github.com/vercel/ai
type: stack
---

# Vercel AI SDK

Camada de abstração de IA do projeto na linha **7**. Padroniza chamadas entre provedores, saída estruturada via Zod 4, tool use e o stream de UI message. É a primitiva de baixo nível. Agents, memória, workflow e eval ficam no `@stacks/ai/mastra-sdk`.

Pins medidos em 2026-09-28. A major de `@ai-sdk/*` **não** é a major de `ai`. Não assuma alinhamento 1:1; meça de novo em `stacks/VERSIONS.md` antes de subir.

| Pacote | Versão |
|---|---|
| `ai` | 7.0.120 |
| `@ai-sdk/react` | 4.0.123 |
| `@ai-sdk/openai` | 4.0.79 |
| `@ai-sdk/anthropic` | 4.0.67 |
| `@ai-sdk/google` | 4.0.84 |
| `@ai-sdk/google-vertex` | 5.0.97 |

Exige Node >= 22. O projeto está no Node 24.21. Peer de Zod: `^3.25.76 || ^4.1.8`. O bundle usa só Zod 4.6.5. ESM obrigatório.

`@mastra/core@1.71.0` aceita `LanguageModelV4` (a spec da v7) desde o 1.47. Quando o loop é do Mastra, não aplique renome de tool do AI SDK por conta própria: quem lê o gate humano é o Mastra.

Codemod da v6 para a v7: `npx @ai-sdk/codemod v7`. A referência de API é https://ai-sdk.dev (seletor v7).

## O que não copiar de guia antigo

- `toDataStreamResponse()` e `result.toUIMessageStreamResponse()`.
- `generateObject` / `streamObject` como API atual. Saída estruturada é `generateText` / `streamText` com `Output`.
- `system:`. O campo é `instructions:`.
- `tool({ parameters })`. O campo é `inputSchema`.
- `maxSteps`. O limite do loop é `stopWhen: isStepCount(n)`.
- `useChat` devolvendo `input` e `handleInputChange`. Esse formato é da linha 4.

## Provider

A chave fica no servidor. O id do modelo vem de config validada, não de literal espalhado no feature.

```ts
import { createOpenAI } from "@ai-sdk/openai";

export const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });
```

## Texto e saída estruturada

Prosa e objeto usam a mesma função. O objeto passa por `Output.object({ schema })` e o SDK valida com o schema.

```ts
import { generateText, Output, isStepCount, tool } from "ai";
import { z } from "zod";

const { output } = await generateText({
  model: openai(config.openaiModelId),
  instructions: "Extraia somente o que o schema pede.",
  prompt: input,
  output: Output.object({
    schema: z.object({
      title: z.string(),
      tags: z.array(z.string()).max(5),
    }),
  }),
  abortSignal: AbortSignal.timeout(30_000),
});
```

`Output.array`, `Output.choice` e `Output.json` cobrem os outros formatos. `Output.json` não valida shape: não use quando o contrato importa.

Falha de parse/validação rejeita com `NoObjectGeneratedError`. Se o step termina em tool call e não há output, ler `result.output` lança `NoOutputGeneratedError`.

Para stream do objeto: `streamText` + `output` e itere `partialOutputStream`. O parcial não está validado; o elemento completo de um `Output.array` sai em `elementStream`.

Defina timeout em toda chamada de borda. Não trate resposta cortada por limite de tokens como sucesso: confira `finishReason`.

## Tools

```ts
const result = await generateText({
  model: openai(config.openaiModelId),
  instructions: "Use a busca antes de responder.",
  prompt,
  tools: {
    searchDocs: tool({
      description: "Busca documentos da base por similaridade.",
      inputSchema: z.object({
        query: z.string(),
        topK: z.number().int().min(1).max(20).default(5),
      }),
      execute: async ({ query, topK }) => vectorSearch(query, topK),
    }),
  },
  stopWhen: isStepCount(5),
  abortSignal: AbortSignal.timeout(30_000),
});
```

Gerar o objeto estruturado conta como step. Se houver tool e `Output`, o `stopWhen` precisa caber os dois. Mais de ~10 tools no mesmo prompt degrada a escolha: classifique a intenção antes e entregue um toolset menor. `execute` que precisa comunicar erro de negócio retorna `{ error: "..." }`, não deixa a exception virar raciocínio do modelo.

## Chat no Next 16

Route Handler é o caminho de streaming. Server Action serve para `generateText` sem stream.

```ts
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from "ai";

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: openai(config.openaiModelId),
    instructions: "Você responde com o que está no contexto.",
    messages: await convertToModelMessages(messages),
    abortSignal: req.signal,
  });
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
```

No cliente, `useChat` vem de `@ai-sdk/react@4`. Siga o guia v7 em https://ai-sdk.dev/docs/ai-sdk-ui/chatbot. O `id` do chat é estável quando há mais de uma conversa na página. Persista `message.id`; regenerar id a cada render quebra o dedupe.

## Embeddings, imagem, telemetria

`embed` e `embedMany` continuam no core. A dimensão gravada no pgvector é a do modelo escolhido, fixada no contrato `@contracts/pgvector`.

Imagem, vídeo, realtime e transcrição têm página própria na doc v7. Não reutilize amostra da linha 4 (`experimental_generateImage` com `dall-e-3`) sem conferir o nome da função na versão instalada.

Telemetria: https://ai-sdk.dev/docs/ai-sdk-core/telemetry. Não grave prompt nem completion quando puder haver PII (`@rules/observability`, `@rules/governance`).

## Quando não usar este SDK direto

| Caso | Onde |
|---|---|
| Completion ou objeto único | este documento |
| Chat sem memória longa | este documento + `useChat` |
| Agent com memória, workflow, RAG, eval | `@stacks/ai/mastra-sdk` |
| Feature que só existe no SDK oficial | `@stacks/ai/openai-sdk`, `anthropic-sdk` ou `google-genai-sdk` |
