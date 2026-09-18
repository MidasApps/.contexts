---
name: openai-sdk
description: Use para o SDK OpenAI — chat, embeddings, tools, streaming. Keywords: openai sdk, openai client.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# OpenAI SDK (`openai` npm)

Cliente oficial Node/TS para OpenAI API: chat completions, responses API, embeddings, tools, streaming, batch, files, fine-tuning.

## Essência
- **Init:** `import OpenAI from "openai"; const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })`.
- **Chat completions** (`client.chat.completions.create`): API legada mas estável.
- **Responses API** (`client.responses.create`): nova API com tool use, structured output e state management.
- **Streaming:** `stream: true` → AsyncIterable de chunks (`for await`).
- **Tools:** `tools: [{ type: "function", function: { name, description, parameters: JSON_SCHEMA } }]`; resposta tem `tool_calls`; você executa e devolve `tool` role message no próximo turn.
- **Structured Outputs:** `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }` — ou helper `openai.beta.chat.completions.parse({ ..., response_format: zodResponseFormat(Z, "name") })` com Zod.
- **Embeddings:** `client.embeddings.create({ model: "text-embedding-3-small", input })`.
- **Cancelamento:** `{ signal: AbortController.signal }`.
- **Retry/timeout:** `new OpenAI({ maxRetries: 2, timeout: 60_000 })`. SDK faz retry com backoff em 5xx/429.
- **Erros:** `APIError`, `RateLimitError`, `APIConnectionTimeoutError` — instanceof checks.

## Procedimento mínimo
1. `OPENAI_API_KEY` em env; nunca client-side bundle.
2. Cliente singleton no módulo; reutilizar (mantém keep-alive).
3. Para output tipado: `zodResponseFormat` + `parse()` helper.
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
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

const Order = z.object({ id: z.string(), total: z.number() });
const client = new OpenAI();
const parsed = await client.beta.chat.completions.parse({
  model: "gpt-4.1-mini",
  messages: [{ role: "user", content: "Extract order..." }],
  response_format: zodResponseFormat(Order, "order"),
});
const order = parsed.choices[0].message.parsed!; // typed
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/openai-sdk.md`
