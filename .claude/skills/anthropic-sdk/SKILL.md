---
name: anthropic-sdk
description: "Use para o SDK Anthropic — messages, tools, prompt caching, thinking. Keywords: anthropic sdk, claude api."
---
# Anthropic SDK (`@anthropic-ai/sdk`)

Cliente oficial Node/TS para a Messages API: chat, tools, vision, streaming, prompt caching, extended thinking, batch.

## Essência
- **Init:** `import Anthropic from "@anthropic-ai/sdk"; const client = new Anthropic()` (lê `ANTHROPIC_API_KEY`).
- **Messages API** (`client.messages.create`): parâmetros `model`, `max_tokens` (obrigatório), `system`, `messages`, `tools`, `tool_choice`, `thinking`, `metadata`.
- **System prompt** é parâmetro top-level (não vai em `messages`).
- **`messages`:** alternância `user`/`assistant`. Content pode ser string ou array de content blocks (`text`, `image`, `tool_use`, `tool_result`).
- **Prompt caching:** adicione `cache_control: { type: "ephemeral" }` em blocos estáveis (system, tools, exemplos). Mínimo de tokens varia por modelo. TTL 5 min (ou `ttl: "1h"`).
- **Tool use:** declare `tools: [{ name, description, input_schema: JSON_SCHEMA }]` (`strict: true` para argumentos conformes). Resposta vem com `tool_use` block; execute; envie `tool_result` no próximo turn. `tool_choice` `any`/`tool` devolve 400 nos 5.x: use `auto`.
- **Structured output:** `client.messages.parse({ ..., output_config: { format: zodOutputFormat(Schema) } })` → `parsed_output`.
- **Extended Thinking:** `thinking: { type: "adaptive" }` + `output_config: { effort }` (o modo `enabled` com `budget_tokens` devolve 400 nos modelos atuais; no `claude-opus-5-5` o `effort` default é `medium`) — resposta inclui `thinking` blocks antes do `text`.
- **Files API** saiu de beta: `client.files.upload(...)`. **Computer use** nos 5.x: `{ type: "computer_toolset_20260801" }`, sem beta header.
- **Streaming:** `client.messages.stream(...)` ou `.create({ stream: true })`.
- **Batch:** `client.messages.batches.create(...)` para cargas async (50% off).
- **Erros:** `APIConnectionError` (teste antes, é subclasse de `APIError`), `RateLimitError`, `APIError` (529 = `err.type === "overloaded_error"`, retry com backoff). Cheque `stop_reason === "refusal"`.

## Procedimento mínimo
1. Chave em env server-side. Cliente singleton.
2. Mover instruções/exemplos grandes para `system` com `cache_control`.
3. Tools com `input_schema` (JSON Schema); validar com Zod antes de executar.
4. Loop de tool use: enquanto `stop_reason === "tool_use"`, execute tools e re-envie como `tool_result`.
5. Telemetria: logar `usage` (`input_tokens`, `output_tokens`, `cache_creation_input_tokens`, `cache_read_input_tokens`).

## Anti-patterns
- `max_tokens` muito baixo → resposta truncada com `stop_reason: "max_tokens"`.
- Cache em conteúdo que muda a cada request → criação de cache pura, sem hit.
- `messages[0].role === "system"` → mover para parâmetro `system`.
- Ignorar `thinking` block como resposta → use último `text` block.
- `temperature`/`top_p` ou prefill de assistant nos 5.x → 400.

## Mini-exemplo
```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

const res = await client.messages.create({
  model: config.anthropicModelId, // ex. "claude-sonnet-5-5"; id vem da config
  max_tokens: 4096,
  thinking: { type: "adaptive" },
  output_config: { effort: "medium" },
  system: [{ type: "text", text: BIG_PROMPT, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: input }],
  tools: [{ name: "get_weather", description: "...", input_schema: WEATHER_SCHEMA }],
});

// Tool use loop
if (res.stop_reason === "tool_use") {
  const tu = res.content.find((b) => b.type === "tool_use")!;
  const result = await runTool(tu.name, tu.input);
  // re-send with tool_result...
}
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/anthropic-sdk.md`
