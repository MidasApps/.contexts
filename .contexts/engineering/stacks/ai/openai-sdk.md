---
title: OpenAI SDK (Node)
type: stacks
category: ai
package: openai
version: 7.23.0
language: TypeScript
runtime: Node 26
last_updated: 2026-09-28
status: current
upstream: https://github.com/openai/openai-node
related:
  - "@stacks/ai/openai"
  - "@stacks/ai/vercel-ai-sdk"
  - "@stacks/validation/zod@4"
  - "@stacks/language/typescript@7"
  - "@stacks/frontend/next@16"
  - "@rules/security"
  - "@rules/observability"
  - "@rules/error-handling"
  - "@rules/caching"
  - "@contracts/secrets"
---

# OpenAI SDK (Node)

Manual de uso do **SDK oficial TypeScript da OpenAI** (`openai` no npm). Este documento foca em **instalação, instanciação, superfície do client, idioms TS, retry/streaming/cancelamento**. As **capacidades da API** (modelos, parâmetros, comportamentos de endpoints, pricing, rate limits) estão em `@stacks/ai/openai`.

> Regra de separação: se a pergunta é "que campo passar no `chat.completions.create`?" — consultar `@stacks/ai/openai`. Se a pergunta é "como instanciar e tratar erros do SDK?" — está aqui.

---

## O que é

`openai` é o **SDK oficial TypeScript/JavaScript** mantido pela OpenAI. Cobre todos os endpoints REST da plataforma com tipagem first-class, streaming helpers, retry automático e suporte a Azure OpenAI. É o cliente canônico quando a integração precisa de features não cobertas pelo Vercel AI SDK (Realtime, Batches, Files, Fine-tuning, Moderations).

---

## Versão

- **Linha alvo**: `7.23.0` (medido em 2026-09-28). A linha 4 ficou para trás.
- **Pin obrigatório**: versão exata em `package.json`. O id de modelo não é pin deste SDK: vive na config e na ficha atual da OpenAI.
- **Breaking changes recentes** (consultar CHANGELOG upstream antes de upgrade):
  - 4.0: reorganização de módulos (`chat.completions` em vez de `createChatCompletion`)
  - Streaming helper `.stream()` separado de `.create({ stream: true })`
  - Responses API (`client.responses`) introduzida como sucessora unificada de Chat Completions + Assistants (encerrada em 2026-08-26)

---

## Instalação e instanciação

```bash
pnpm add openai@7.23.0 --save-exact
```

### Cliente padrão (OpenAI)

```ts
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // padrão: lê OPENAI_API_KEY automaticamente
  organization: process.env.OPENAI_ORG_ID, // opcional
  project: process.env.OPENAI_PROJECT_ID, // opcional, recomendado em multi-projeto
  maxRetries: 2, // default: 2
  timeout: 60_000, // default: 10 minutos (ajustar para fluxos curtos)
});
```

### Azure OpenAI

```ts
import { AzureOpenAI } from "openai";

const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: process.env.AZURE_OPENAI_ENDPOINT,
  apiVersion: "2025-03-01-preview",
  deployment: "gpt-6-sol-prod", // nome do deployment no Azure, não o model id
});
```

### OpenAI-compatible providers (Groq, Ollama, LM Studio, vLLM)

```ts
const client = new OpenAI({
  baseURL: "https://api.groq.com/openai/v1",
  apiKey: process.env.GROQ_API_KEY,
});
```

> **Preferir** `@ai-sdk/openai-compatible` (do `@stacks/ai/vercel-ai-sdk`) quando o consumo for cross-provider. Custom `baseURL` no SDK direto só se justifica quando dependendo de endpoints OpenAI-specific (Realtime, Batches) que o provider compatível replica.

### Singleton no projeto

Instancie **uma única vez** por processo (módulo singleton). Não recrie o client por request — perde-se cache de keep-alive HTTP e configurações.

```ts
// src/services/shared/openai-client.ts
import OpenAI from "openai";

export const openai = new OpenAI({
  maxRetries: 3,
  timeout: 30_000,
});
```

Segredos: ver `@contracts/secrets` e `@rules/security`. **Nunca** em código client-side.

---

## Organização de módulos (API surface)

Espelha endpoints REST. Detalhes de parâmetros/comportamento de cada um em `@stacks/ai/openai`.

| Caminho no client | Endpoint coberto |
|---|---|
| `client.chat.completions.create / stream` | Chat Completions (legado mas vivo) |
| `client.responses.create / stream` | **Responses API** (sucessora unificada — preferir em código novo) |
| `client.embeddings.create` | Embeddings |
| `client.images.generate / edit / createVariation` | Imagens |
| `client.audio.transcriptions.create` | Transcrição (STT, ex. `gpt-transcribe`) |
| `client.audio.translations.create` | Tradução de áudio |
| `client.audio.speech.create` | TTS |
| `client.moderations.create` | Moderation |
| `client.files.create / list / retrieve / delete / content` | Files |
| `client.batches.create / retrieve / list / cancel` | Batch API |
| `client.fineTuning.jobs.*` | Fine-tuning |
| `OpenAIRealtimeWebSocket` (`openai/realtime/websocket`), `client.realtime.clientSecrets.create` | Realtime API GA (WebSocket/WebRTC) |
| `client.models.list / retrieve` | Catálogo de modelos |
| `client.vectorStores.*` | Vector Stores (usadas pela Responses API com `file_search`) |

---

## Helpers de tipos

O SDK exporta tipos para todas as estruturas. Use-os em vez de redeclarar shapes:

```ts
import type {
  ChatCompletion,
  ChatCompletionMessageParam,
  ChatCompletionTool,
  ChatCompletionChunk,
  Embedding,
  CreateEmbeddingResponse,
  Response, // Responses API
  ResponseInputItem,
} from "openai/resources";

const messages: ChatCompletionMessageParam[] = [
  { role: "system", content: "..." },
  { role: "user", content: "..." },
];
```

Para tools, `FunctionTool` (Responses API, de `openai/resources/responses/responses`) ou `ChatCompletionTool` (Chat Completions legado) carrega o JSON Schema completo. Combinar com `z.toJSONSchema` do Zod 4 (ver `@stacks/validation/zod@4`).

---

## Idioms recomendados

### Resposta simples (Responses API)

Código novo usa `client.responses.create`. Chat Completions (`client.chat.completions.*`) continua suportado para código legado; os dois exemplos de streaming com `chat.completions` logo abaixo valem para esse caso. Streaming na Responses API: `stream: true` e eventos `response.output_text.delta` (ver Integração com Next.js 16).

```ts
const response = await openai.responses.create({
  model: "gpt-6-sol",
  instructions: "...", // system prompt
  input: "...", // string ou ResponseInputItem[]
});

const text = response.output_text; // helper do SDK: concatena os itens `output_text`
const status = response.status; // sempre inspecionar: "incomplete" traz o motivo em response.incomplete_details
```

### Streaming via async iterator

```ts
const stream = await openai.chat.completions.create({
  model: "gpt-6-sol",
  messages,
  stream: true,
});

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta?.content;
  if (delta) process.stdout.write(delta);
}
```

### Streaming via helper com eventos

```ts
const stream = openai.chat.completions.stream({
  model: "gpt-6-sol",
  messages,
});

stream.on("content", (delta, snapshot) => {
  // delta: incremento atual
  // snapshot: texto acumulado até agora
});
stream.on("finalChatCompletion", (completion) => {
  // completion shape igual ao retorno de .create()
});
stream.on("error", (err) => { /* tratar */ });

const final = await stream.finalChatCompletion();
```

Use `.stream()` (helper) quando precisar de snapshot acumulado ou eventos nomeados. Use `for await` quando o consumidor quer apenas deltas.

### Structured outputs (JSON Schema)

Com Responses API e helper Zod (o SDK aceita `zod ^3.25 || ^4.0`):

```ts
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

const ArticleSchema = z.object({
  title: z.string(),
  tags: z.array(z.string()),
});

const response = await openai.responses.parse({
  model: "gpt-6-sol",
  input: messages,
  text: { format: zodTextFormat(ArticleSchema, "article") },
});

const article = response.output_parsed; // null se o modelo recusou ou não conformou
```

Sem helper, em Chat Completions:

```ts
const completion = await openai.chat.completions.create({
  model: "gpt-6-sol",
  messages,
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "Article",
      strict: true, // OBRIGATÓRIO — sem isso a garantia some
      schema: z.toJSONSchema(ArticleSchema),
    },
  },
});

const raw = completion.choices[0]?.message.content;
const data = ArticleSchema.parse(JSON.parse(raw ?? "{}"));
```

Sempre re-validar com Zod no client — `strict: true` reduz drift mas a defesa em profundidade é regra (ver `@rules/error-handling`).

### Tool use

Na Responses API a tool é um `FunctionTool` achatado (`name`, `parameters`, `strict` no topo, sem o objeto `function` do Chat Completions). A chamada chega como item `function_call` em `response.output`; o resultado volta como item `function_call_output` com o mesmo `call_id`.

```ts
import type { FunctionTool, ResponseInputItem } from "openai/resources/responses/responses";

const LookupOrderArgsSchema = z.strictObject({ orderId: z.string().min(1) });

const tools: FunctionTool[] = [
  {
    type: "function",
    name: "lookup_order",
    description: "Fetch order by id",
    strict: true,
    parameters: z.toJSONSchema(LookupOrderArgsSchema),
  },
];

const input: ResponseInputItem[] = [{ role: "user", content: "Status do pedido 42?" }];

const first = await openai.responses.create({
  model: "gpt-6-sol",
  input,
  tools,
  tool_choice: { type: "function", name: "lookup_order" }, // forçar
  parallel_tool_calls: false,
});

for (const item of first.output) {
  if (item.type !== "function_call") continue;
  const args = LookupOrderArgsSchema.parse(JSON.parse(item.arguments)); // output do modelo é input externo
  const order = await lookupOrder(args.orderId);
  input.push(item, { type: "function_call_output", call_id: item.call_id, output: JSON.stringify(order) });
}

const final = await openai.responses.create({ model: "gpt-6-sol", input, tools });
const text = final.output_text;
```

`tool_choice`:
- `"auto"` (default): modelo decide
- `"none"`: proíbe tool calls
- `"required"`: força alguma tool
- `{ type: "function", name }`: força tool específica (no Chat Completions legado: `{ type: "function", function: { name } }`)

### Cancelamento via AbortSignal

```ts
const ac = new AbortController();
setTimeout(() => ac.abort(), 5_000);

try {
  const stream = await openai.chat.completions.create(
    { model: "gpt-6-sol", messages, stream: true },
    { signal: ac.signal },
  );
  for await (const chunk of stream) { /* ... */ }
} catch (err) {
  if (err instanceof OpenAI.APIUserAbortError) {
    // cancelado intencionalmente
  } else {
    throw err;
  }
}
```

Streams **sem** `AbortSignal` permitem request hang quando o cliente desiste. Em Next.js Route Handlers, propagar `request.signal`.

### Embeddings em lote

```ts
const res = await openai.embeddings.create({
  model: "text-embedding-3-large",
  input: chunks, // array de strings em uma única request
});
const vectors = res.data.map((d) => d.embedding);
```

---

## Retry e timeouts

- Retry automático: `maxRetries` (default `2`) com exponential backoff em `429`, `408`, `409`, `5xx` e erros de conexão.
- Override por request:
  ```ts
  openai.chat.completions.create({ ... }, { maxRetries: 5, timeout: 90_000 });
  ```
- `timeout` é tempo total da request (incluindo retries de conexão; **não** inclui streaming aberto após primeiro byte).
- Para fluxos críticos curtos, baixar `timeout` para 15–30s; para streaming longo, usar `signal` em vez de timeout.

---

## Auth

- Padrão: `apiKey` lido de `process.env.OPENAI_API_KEY` se omitido.
- Headers `organization` e `project` no constructor — recomendado em workspaces multi-projeto para isolamento de billing/limits.
- **Azure**: tenant/endpoint/`apiVersion`/`deployment` no `AzureOpenAI`.
- **Server-only**: `apiKey` **nunca** sai do servidor. Em Next.js, sempre Route Handler/Server Action. Ver `@rules/security` e `@contracts/secrets`.

---

## Errors

Hierarquia exportada em `OpenAI`:

```ts
import OpenAI from "openai";

try {
  await openai.chat.completions.create({ ... });
} catch (err) {
  if (err instanceof OpenAI.APIError) {
    err.status;     // HTTP status
    err.code;       // string code da API
    err.type;       // "invalid_request_error" etc.
    err.headers;    // inclui x-request-id
  }
}
```

Subclasses (sempre `instanceof OpenAI.APIError`):

| Classe | Quando |
|---|---|
| `APIConnectionError` | Falha de rede antes de resposta |
| `APIConnectionTimeoutError` | Timeout de conexão/leitura |
| `APIUserAbortError` | Cliente abortou via `AbortSignal` |
| `BadRequestError` (400) | Payload inválido |
| `AuthenticationError` (401) | Key inválida/ausente |
| `PermissionDeniedError` (403) | Sem acesso ao recurso |
| `NotFoundError` (404) | Recurso/modelo inexistente |
| `ConflictError` (409) | Conflito de estado |
| `UnprocessableEntityError` (422) | Validação semântica |
| `RateLimitError` (429) | Rate limit / quota |
| `InternalServerError` (500/5xx) | Erro do servidor OpenAI |

Tratamento canônico em `@rules/error-handling`.

---

## Logging

O constructor aceita `logLevel` (`"debug" | "info" | "warn" | "error" | "off"`) e `logger` (objeto compatível):

```ts
// logger do projeto na forma (message, fields) (ADR 0003); a assinatura do SDK já é (msg, meta)
const openai = new OpenAI({
  logLevel: "warn",
  logger: {
    debug: (msg, meta) => logger.debug(msg, meta),
    info: (msg, meta) => logger.info(msg, meta),
    warn: (msg, meta) => logger.warn(msg, meta),
    error: (msg, meta) => logger.error(msg, meta),
  },
});
```

Não logar mensagens/respostas inteiras com PII. Ver `@rules/observability`.

---

## TypeScript

Ver `@stacks/language/typescript@7`. Configuração mínima:

- `strict: true`
- `moduleResolution: "bundler"` ou `"node16"`
- Não usar `any` para retornos do SDK — todos os shapes têm tipos exportados em `openai/resources`.
- Generics são raros; preferir `ChatCompletion`, `Response`, `Embedding` etc. diretamente.

---

## Realtime API

Conexão de baixa latência para áudio bidirecional.

```ts
import { OpenAIRealtimeWebSocket } from "openai/realtime/websocket";

// Lê OPENAI_API_KEY do ambiente. O namespace `beta.realtime` foi desligado em 2026-05-12.
const rt = new OpenAIRealtimeWebSocket({ model: "gpt-realtime-2.1" });

rt.on("session.created", (event) => { /* ... */ });
rt.on("response.output_audio.delta", (event) => { /* PCM chunk */ });

rt.send({
  type: "session.update",
  session: { type: "realtime", instructions: "...", audio: { output: { voice: "marin" } } },
});
```

Restrições:
- **Node runtime obrigatório** (não Edge — depende de WebSocket/streaming binário).
- WebRTC variant exige negociação SDP com token efêmero emitido por `client.realtime.clientSecrets.create()` servido ao browser; browser conecta sozinho. Server **nunca** repassa o `apiKey` raiz.

---

## Quando usar `openai` SDK direto vs Vercel AI SDK

**Default do projeto: Vercel AI SDK** (`@stacks/ai/vercel-ai-sdk`). Use SDK direto apenas quando:

| Caso | SDK direto? |
|---|---|
| Chat completion + tools cross-provider | Não — Vercel AI SDK |
| Structured outputs com Zod | Não — Vercel AI SDK (`Output.object`) |
| UI streaming (RSC, `useChat`) | Não — Vercel AI SDK |
| **Realtime API (voz)** | **Sim** |
| **Batches API** (jobs offline) | **Sim** |
| **Files API** | **Sim** |
| **Fine-tuning** | **Sim** |
| **Moderations** dedicada | **Sim** |
| Assistants API (encerrada em 2026-08-26) | Migrar para Responses |
| Features OpenAI-specific recém-lançadas | Sim, até cobertura no AI SDK |

Não misturar SDK direto e Vercel AI SDK no mesmo fluxo sem motivo arquitetural — escolha um por caminho de execução.

---

## Integração com Next.js 16

Ver `@stacks/frontend/next@16`. Padrões:

```ts
// src/services/chat/adapters/driving/chat-route-handler.ts
// (src/app/v1/chat/route.ts só faz `export { POST } from "@/services/chat/adapters/driving/chat-route-handler"`)
import { openai } from "@/services/shared/openai-client";

export async function POST(req: Request) {
  const { input } = await req.json(); // validar com Zod na borda (@rules/validation)

  const stream = await openai.responses.create(
    { model: "gpt-6-sol", input, stream: true },
    { signal: req.signal }, // propagar cancelamento do cliente
  );

  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (event.type === "response.output_text.delta") controller.enqueue(encoder.encode(event.delta));
          }
        } finally {
          controller.close();
        }
      },
    }),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}
```

Em Server Actions: usar `client.responses.create` sem stream e retornar só campos serializáveis (`output_text`, dados já validados), nunca o objeto `Response` inteiro. Realtime: **Node runtime apenas**.

---

## Observabilidade

Ver `@rules/observability`. Padrões esperados:

- **OTel spans** com atributos do GenAI semantic convention:
  - `gen_ai.system = "openai"`
  - `gen_ai.request.model`, `gen_ai.response.model`
  - `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`
  - `gen_ai.response.finish_reasons`
- **Request ID** via `completion._request_id` ou header `x-request-id` da resposta — logar sempre para correlacionar com support tickets.
- **Usage**: inspecionar `completion.usage`:
  - `prompt_tokens`, `completion_tokens`, `total_tokens`
  - `prompt_tokens_details.cached_tokens` (prompt caching — ver `@rules/caching`)
  - `completion_tokens_details.reasoning_tokens` (modelos de raciocínio)
- Para streaming, `usage` aparece apenas no chunk final quando `stream_options: { include_usage: true }` for passado.

---

## Anti-patterns

- **`apiKey` em código client-side / browser** — catástrofe de segurança; SDK detecta `dangerouslyAllowBrowser` e exige flag explícito por isso.
- Recriar `new OpenAI()` por request em vez de singleton (perde keep-alive).
- Misturar SDK direto e Vercel AI SDK no mesmo fluxo sem justificativa.
- Tools sem `parameters` definido ou sem `strict: true`.
- `response_format: { type: "json_schema" }` **sem** `strict: true` — perde a garantia estrutural; vira hint.
- Streams sem `AbortSignal` — request fica pendurada quando o consumidor desiste.
- Logar `messages` ou `choices` inteiros com PII — viola `@rules/observability`.
- Custom `baseURL` para Groq/Ollama/LM Studio sem motivo, quando `@ai-sdk/openai-compatible` resolve melhor (cross-provider).
- Realtime API em Edge runtime — quebra silenciosamente; precisa de Node.
- Reasoning models sem `max_completion_tokens` — custo de raciocínio escala sem limite.
- Usar a **Assistants API** — encerrada em 2026-08-26; usar Responses API.
- Ignorar `finish_reason` / `stop_reason` — perde-se detecção de truncamento, `tool_calls`, `content_filter`.
- Tipos `any` em retornos quando `ChatCompletion`/`Response` existem.
- Esquecer `stream_options: { include_usage: true }` em streaming e perder visibilidade de custo.
- Não tratar `OpenAI.APIUserAbortError` separadamente de erros reais — gera ruído de alerta.
- Confiar em `maxRetries` para erros 4xx semânticos — só `429`/`5xx`/conexão são retentados; `BadRequestError` precisa correção, não retry.

---

## Referências cruzadas

- API da OpenAI (modelos, parâmetros, comportamentos): `@stacks/ai/openai`
- Camada de abstração preferida cross-provider: `@stacks/ai/vercel-ai-sdk`
- Validação e geração de JSON Schema: `@stacks/validation/zod@4`
- Linguagem: `@stacks/language/typescript@7`
- Framework de aplicação: `@stacks/frontend/next@16`
- Segurança de credenciais: `@rules/security`, `@contracts/secrets`
- Telemetria/logs: `@rules/observability`
- Tratamento de erros: `@rules/error-handling`
- Prompt caching e estratégias de cache: `@rules/caching`
