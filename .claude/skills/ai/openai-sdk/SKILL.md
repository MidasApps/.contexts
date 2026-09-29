---
name: openai-sdk
description: Use para o SDK OpenAI — chat, embeddings, tools, streaming. Keywords: openai sdk, openai client.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# OpenAI SDK (`openai` npm)

Cliente oficial Node/TS para OpenAI API (`openai@7.23.0`, pin exato): Responses API, chat completions, embeddings, tools, streaming, Realtime GA, batch, files, fine-tuning.

## Essência
- **Init:** `import OpenAI from "openai"; const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })`.
- **Responses API** (`client.responses.create`): caminho para código novo — tool use, structured output, `previous_response_id`, built-in tools (`web_search`, `file_search`, `computer`, `code_interpreter`).
- **Chat Completions** (`client.chat.completions.create`): legado, ainda suportado; não use em código novo.
- **Encerrados:** Assistants API (2026-08-26) e namespace `beta.realtime` (2026-05-12). Realtime GA: `OpenAIRealtimeWebSocket` de `openai/realtime/websocket`; chave efêmera via `client.realtime.clientSecrets.create()`.
- **Streaming:** `client.responses.create({ ..., stream: true })` → AsyncIterable de eventos (`for await`; texto em `response.output_text.delta`).
- **Tools:** `tools: [{ type: "function", name, description, parameters: JSON_SCHEMA, strict: true }]`; a resposta traz itens `function_call` (`call_id`, `arguments`); você executa e devolve `{ type: "function_call_output", call_id, output }` no `input` do próximo turn.
- **Structured Outputs:** `client.responses.parse({ ..., text: { format: zodTextFormat(Schema, "name") } })` → `output_parsed`; em Chat Completions, `client.chat.completions.parse({ ..., response_format: zodResponseFormat(Schema, "name") })`. Sem helper: `json_schema` com `strict: true`.
- **Embeddings:** `client.embeddings.create({ model: "text-embedding-3-small", input })`.
- **Cancelamento:** `{ signal: AbortController.signal }`.
- **Retry/timeout:** `new OpenAI({ maxRetries: 2, timeout: 60_000 })`. SDK faz retry com backoff em 5xx/429.
- **Erros:** `APIError`, `RateLimitError`, `APIConnectionTimeoutError` — instanceof checks.

## Procedimento mínimo
1. `OPENAI_API_KEY` em env; nunca client-side bundle.
2. Cliente singleton no módulo; reutilizar (mantém keep-alive).
3. Para output tipado: `zodTextFormat` + `responses.parse()` (ou `zodResponseFormat` + `chat.completions.parse()`).
4. Streaming → renderizar incremental (Vercel AI SDK ajuda se UI).
5. Wrappear chamadas com timeout + observability (latency, tokens, model).

## Anti-patterns
- API key no client → vazamento; sempre server-side.
- `JSON.parse(content)` em vez de Structured Outputs → frágil.
- Retry manual em cima do retry do SDK → backoff dobrado.
- Sem timeout → request fica pendurado em incidente do provider.

## Mini-exemplo
```ts
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

const OrderSchema = z.object({
  orderId: z.string().min(1),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/),
});
const client = new OpenAI();
const res = await client.responses.parse({
  model: config.openaiModelId, // ex. "gpt-6-luna"
  input: [{ role: "user", content: "Extract order..." }],
  text: { format: zodTextFormat(OrderSchema, "order") },
});
const order = res.output_parsed; // tipado; null se não conformou
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/openai-sdk.md`
