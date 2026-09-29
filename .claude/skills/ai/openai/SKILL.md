---
name: openai
description: Use para modelos OpenAI (GPT). Keywords: openai, gpt, chatgpt.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# OpenAI (modelos GPT)

Família de modelos OpenAI: linha `gpt-6` (`gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`); embeddings (`text-embedding-3-*`). Foco aqui é seleção de modelo, parâmetros, capabilities — não SDK (ver `openai-sdk`).

## Essência
- **Famílias:** chat/completion e reasoning (linha `gpt-6`; reasoning usa tokens internos), embeddings, image (`gpt-image-2.5-sunburst` / `gpt-image-2.5-flare`), transcrição (`gpt-transcribe`), TTS (`gpt-4o-mini-tts`), realtime (`gpt-realtime-2.1`).
- **API:** Responses API para código novo. Assistants API foi encerrada (2026-08-26); DALL-E desligado.
- **Reasoning models:** custo mais alto, latência maior, melhor em problem-solving multi-step. Não exigem chain-of-thought no prompt — eles fazem.
- **Tool calling (function calling):** modelo decide chamar funções declaradas via JSON Schema; response inclui `tool_calls`.
- **Structured Outputs:** `text.format` (Responses) ou `response_format: { type: "json_schema", json_schema: { strict: true, schema } }` (Chat Completions) garante saída conformante.
- **Vision:** os modelos `gpt-6` aceitam imagens via URL/base64 no content.
- **Context window:** varia por modelo (128k-1M). Token = ~4 chars em pt/en.
- **Parâmetros:** `temperature` (0-2, default 1), `top_p`, `max_tokens`, `seed`, `frequency_penalty`, `presence_penalty`.
- **Cache:** prompt caching automático para prefixos repetidos (>1024 tokens) — barato e rápido em retries.
- **Custos:** input vs output (output ~3-5x mais caro); cached input ~10% do preço normal.

## Procedimento mínimo
1. Escolher modelo por trade-off custo/qualidade/latência: tarefas simples/volume → `gpt-6-luna`; dia a dia → `gpt-6-sol`; trabalho difícil → `gpt-6-astra`.
2. Para output estruturado, usar Structured Outputs com JSON Schema — não regex em texto livre.
3. Tool calling para ações externas; sempre validar argumentos (Zod) antes de executar.
4. Prefixo estável (system + few-shots) para aproveitar prompt caching.
5. Telemetria: logar modelo, tokens in/out, latência, custo estimado.

## Anti-patterns
- Pedir JSON em prompt e fazer `JSON.parse(content)` sem Structured Outputs → falha intermitente.
- Usar modelo top em tarefa que mini resolve → 10x custo sem ganho.
- Temperature 0 esperando determinismo — ainda há ruído; combine com `seed`.
- Vazar conteúdo do user em prompt sem sanitizar → prompt injection.

## Mini-exemplo
```ts
const res = await openai.responses.create({
  model: config.openaiModelId, // ex. "gpt-6-luna"
  instructions: "...",
  input: content,
  text: { format: { type: "json_schema", name: "order", strict: true, schema: z.toJSONSchema(OrderSchema) } },
});
const order = OrderSchema.parse(JSON.parse(res.output_text));
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/openai.md`
