---
name: anthropic-sdk
description: Use para o SDK Anthropic — messages, tools, prompt caching, thinking. Keywords: anthropic sdk, claude api.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Anthropic SDK (`@anthropic-ai/sdk`)

Cliente oficial Node/TS para a Messages API: chat, tools, vision, streaming, prompt caching, extended thinking, batch.

## Essência
- **Init:** `import Anthropic from "@anthropic-ai/sdk"; const client = new Anthropic()` (lê `ANTHROPIC_API_KEY`).
- **Messages API** (`client.messages.create`): parâmetros `model`, `max_tokens` (obrigatório), `system`, `messages`, `tools`, `tool_choice`, `thinking`, `metadata`.
- **System prompt** é parâmetro top-level (não vai em `messages`).
- **`messages`:** alternância `user`/`assistant`. Content pode ser string ou array de content blocks (`text`, `image`, `tool_use`, `tool_result`).
- **Prompt caching:** adicione `cache_control: { type: "ephemeral" }` em blocos estáveis (system, tools, exemplos). Mínimo de tokens varia por modelo. TTL 5 min (ou 1h em beta).
- **Tool use:** declare `tools: [{ name, description, input_schema: JSON_SCHEMA }]`. Resposta vem com `tool_use` block; execute; envie `tool_result` no próximo turn.
- **Extended Thinking:** `thinking: { type: "enabled", budget_tokens: 8000 }` — resposta inclui `thinking` blocks antes do `text`.
- **Streaming:** `client.messages.stream(...)` ou `.create({ stream: true })`.
- **Batch:** `client.messages.batches.create(...)` para cargas async (50% off).
- **Erros:** `APIError`, `RateLimitError`, `OverloadedError` (529 — retry com backoff).

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

## Mini-exemplo
```ts
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

const res = await client.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 4096,
  system: [{ type: "text", text: BIG_PROMPT, cache_control: { type: "ephemeral" } }],
  messages: [{ role: "user", content: input }],
  tools: [{ name: "get_weather", description: "...", input_schema: WEATHER_SCHEMA }],
});

// Tool use loop
if (res.stop_reason === "tool_use") {
  const tu = res.content.find(b => b.type === "tool_use")!;
  const result = await runTool(tu.name, tu.input);
  // re-send with tool_result...
}
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/anthropic-sdk.md`
