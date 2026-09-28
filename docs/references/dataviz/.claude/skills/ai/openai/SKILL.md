---
name: openai
description: Use para modelos OpenAI (GPT). Keywords: openai, gpt, chatgpt.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# OpenAI (modelos GPT)

Família de modelos OpenAI: GPT-5, GPT-4.1, GPT-4o e variantes mini/nano; modelos de reasoning (o-series); embeddings (`text-embedding-3-*`). Foco aqui é seleção de modelo, parâmetros, capabilities — não SDK (ver `openai-sdk`).

## Essência
- **Famílias:** chat/completion (GPT-4.1/4o/5), reasoning (o3, o4-mini — usam tokens internos), embeddings, image (DALL-E/gpt-image), audio (whisper/tts), realtime.
- **Reasoning models:** custo mais alto, latência maior, melhor em problem-solving multi-step. Não exigem chain-of-thought no prompt — eles fazem.
- **Tool calling (function calling):** modelo decide chamar funções declaradas via JSON Schema; response inclui `tool_calls`.
- **Structured Outputs:** `response_format: { type: "json_schema", json_schema: { strict: true, schema } }` garante saída conformante.
- **Vision:** GPT-4o/5 aceitam imagens via URL/base64 no content.
- **Context window:** varia por modelo (128k-1M). Token = ~4 chars em pt/en.
- **Parâmetros:** `temperature` (0-2, default 1), `top_p`, `max_tokens`, `seed`, `frequency_penalty`, `presence_penalty`.
- **Cache:** prompt caching automático para prefixos repetidos (>1024 tokens) — barato e rápido em retries.
- **Custos:** input vs output (output ~3-5x mais caro); cached input ~10% do preço normal.

## Procedimento mínimo
1. Escolher modelo por trade-off custo/qualidade/latência: tarefas simples → mini; reasoning pesado → o-series.
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
const res = await openai.chat.completions.create({
  model: "gpt-4.1-mini",
  messages: [{ role: "system", content: "..." }, { role: "user", content }],
  response_format: { type: "json_schema", json_schema: { name: "Order", strict: true, schema: ORDER_SCHEMA } },
});
const data = JSON.parse(res.choices[0].message.content!);
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/openai.md`
