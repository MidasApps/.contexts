---
title: Anthropic API (Claude)
type: stacks
category: ai
version: anthropic-version 2023-06-01 (SDK @anthropic-ai/sdk 0.129.0)
status: current
last_updated: 2026-09-28
upstream: https://platform.claude.com/docs
---

# Anthropic API (Claude)

Provider de LLMs da Anthropic — **API/protocolo**, não SDK. Este documento cobre o
contrato HTTP, modelos, features distintivas e como o projeto consome a API. Para
o cliente TypeScript oficial, ver `@stacks/ai/anthropic-sdk`. Para o caminho
padrão de integração no projeto via Vercel AI SDK, ver `@stacks/ai/vercel-ai-sdk`.

## Plataformas

Três superfícies expõem os modelos Claude. Escolha por requisito de governança,
não por preferência pessoal.

| Plataforma | Endpoint base | Auth |
|---|---|---|
| **Anthropic API direta** | `https://api.anthropic.com` | header `x-api-key` |
| **AWS Bedrock** | `bedrock-runtime.<region>.amazonaws.com` | AWS SigV4 / IAM |
| **GCP Vertex AI** | `<region>-aiplatform.googleapis.com` | OAuth / ADC |

A API direta é o caminho padrão. Bedrock e Vertex existem quando contrato/regulação
exige residência de dados em conta da cloud (ver `@rules/governance`).

## Modelos (ficha de 2026-09-28)

| Papel | Model id | Context / saída |
|---|---|---|
| Trabalho diário | `claude-sonnet-5-5` | 1M / 128K |
| Raciocínio | `claude-opus-5-5` | 1M / 128K |
| Agente longo | `claude-fable-5-1` | 1M / 128K |
| Latência | `claude-haiku-4-5` | 200K / 64K |

`claude-opus-4-7` e `claude-sonnet-4-6` continuam Active, mas não são o default. No Bedrock, a geração 4.6 em diante não usa sufixo `-v1:0`: `anthropic.claude-sonnet-5-5`. Haiku 4.5 ainda é datado.

Thinking atual é adaptativo. `thinking: { type: "enabled", budget_tokens }` devolve 400 no Sonnet 5 e posteriores. No `claude-opus-5-5` o thinking não desliga (`disabled` → 400) e o `effort` default é `medium`: declare o `effort` explícito. No `claude-sonnet-5-5`, desligar é `thinking: { type: "between_tools" }` (effort `high` ou menor). O id de produção vive na config, nunca em alias `latest`.

Nos 5.x (`claude-sonnet-5-5`, `claude-opus-5-5`, `claude-fable-5-1`): `tool_choice` `any`/`tool` devolve 400, `temperature`/`top_p`/`top_k` não são aceitos (Sonnet 5.5 só aceita o default) e prefill de assistant devolve 400. Verifique `stop_reason === "refusal"` antes de ler `content`.

## Endpoints principais

| Endpoint | Uso |
|---|---|
| `POST /v1/messages` | Chat (sync ou streaming SSE) |
| `POST /v1/messages` + header `anthropic-beta` | Features beta (ex. `compact-2026-01-12`, `task-budgets-2026-03-13`) |
| `POST /v1/messages/batches` | Batch async (50% desconto, até 100k requests) |
| `GET  /v1/messages/batches/{id}` | Status do batch |
| `POST /v1/files` | Upload de arquivos reutilizáveis |
| `GET  /v1/models` | Lista modelos disponíveis na org |

## Request shape

```jsonc
{
  "model": "claude-sonnet-5-5",
  "max_tokens": 4096,              // obrigatório
  "system": "You are ...",         // string OU array de blocks (com cache_control)
  "messages": [
    { "role": "user", "content": "..." }
    // ou content como array de blocks: text, image, document, tool_use, tool_result
  ],
  "tools": [
    {
      "name": "get_weather",
      "description": "...",
      "input_schema": { /* JSON Schema */ }
    }
  ],
  "tool_choice": { "type": "auto" },   // "auto" | "none"; "any"/"tool" devolvem 400 nos 5.x
  "thinking": { "type": "adaptive" },
  "output_config": { "effort": "high" },   // low | medium | high | xhigh | max
  "stop_sequences": ["</answer>"],
  "stream": true,
  "metadata": { "user_id": "<opaque-hash>" }  // ver @rules/security: nunca PII
}
```

Campos obrigatórios mínimos: `model`, `max_tokens`, `messages`.

## Response shape

```jsonc
{
  "id": "msg_01...",
  "type": "message",
  "role": "assistant",
  "model": "claude-sonnet-5-5",
  "content": [
    { "type": "thinking", "thinking": "..." },        // se extended thinking
    { "type": "text", "text": "..." },
    { "type": "tool_use", "id": "toolu_01...", "name": "get_weather", "input": { "city": "SP" } }
  ],
  "stop_reason": "tool_use",                          // end_turn | max_tokens | tool_use | stop_sequence | pause_turn | refusal
  "stop_sequence": null,
  "usage": {
    "input_tokens": 1234,
    "output_tokens": 567,
    "cache_creation_input_tokens": 800,
    "cache_read_input_tokens": 400
  }
}
```

Sempre inspecionar `stop_reason`. `max_tokens` indica truncamento silencioso e é
um bug em produção se não tratado (ver `@rules/error-handling`).

## Streaming (SSE)

Quando `stream: true`, a resposta é um stream de eventos `text/event-stream`:

```
message_start          → metadata inicial + usage parcial
content_block_start    → começo de um block (text, tool_use, thinking)
content_block_delta    → deltas (text_delta, input_json_delta, thinking_delta, signature_delta)
content_block_stop     → fim do block
message_delta          → stop_reason + usage final (output_tokens)
message_stop           → fim
ping                   → keepalive
```

Tool calls em streaming chegam como `input_json_delta` — acumular e parsear ao
final do `content_block_stop`.

## Prompt caching

Feature distintiva. Marca blocks estáveis com `cache_control: { type: "ephemeral" }`
para reduzir custo de input em até 90% e latência em ~85% em prompts repetidos.

```jsonc
{
  "system": [
    { "type": "text", "text": "<persona estática>" },
    { "type": "text", "text": "<RAG context grande>", "cache_control": { "type": "ephemeral" } }
  ]
}
```

Regras operacionais:

- **TTL**: 5 minutos por padrão (refresh em cada hit). `cache_control: { type: "ephemeral", ttl: "1h" }` para 1 hora (escrita cobra a mais).
- **4 breakpoints máximos** por request (system + messages + tools combinados).
- **Mínimo cacheable**: depende do modelo (512 a 4096 tokens de prefixo; Haiku 4.5 pede 4096). Prefixo menor não cacheia e não dá erro.
- **Cache key**: hash exato do conteúdo até o breakpoint — qualquer caractere diferente invalida.
- Verificar adoção via `usage.cache_read_input_tokens` > 0.

Estratégia opinativa do projeto: ver `@rules/caching`.

## Tool use

Tools são a forma canônica de obter saída estruturada confiável. Sempre via
`input_schema` JSON Schema — preferencialmente derivado de Zod (`@stacks/validation/zod@4`):

```ts
import { z } from "zod";

const GetWeather = z.object({
  city: z.string(),
  unit: z.enum(["celsius", "fahrenheit"]).default("celsius"),
});

const tool = {
  name: "get_weather",
  description: "Get current weather for a city",
  input_schema: z.toJSONSchema(GetWeather),  // Zod 4 nativo
};
```

Multi-turn com tools: o `tool_use` retornado pelo modelo entra no histórico como
parte do `assistant` turn, e a resposta vai em um `user` turn como `tool_result`:

```jsonc
{ "role": "assistant", "content": [{ "type": "tool_use", "id": "toolu_01", "name": "get_weather", "input": { "city": "SP" } }] },
{ "role": "user",      "content": [{ "type": "tool_result", "tool_use_id": "toolu_01", "content": "23°C, sunny" }] }
```

**Parallel tool calls** são suportados — múltiplos `tool_use` blocks em um único
`assistant` turn. Forçar serial com `disable_parallel_tool_use: true` no `tool_choice`.

**Structured output**: `output_config: { format: ... }` (no SDK TS,
`client.messages.parse` + `zodOutputFormat(Schema)`). Para argumentos de tool
conformes ao schema, `strict: true` na definição da tool. Forçar uma tool dummy com
`tool_choice: { type: "tool" }` devolve 400 nos modelos 5.x.

## Vision e documentos

- **Imagens**: block `{ "type": "image", "source": { "type": "base64" | "url", ... } }`. JPEG/PNG/GIF/WebP, até ~5MB cada.
- **PDFs nativos**: block `{ "type": "document", "source": { ... } }`. Até 32MB por request e 600 páginas (100 nos modelos de 200K). Modelo enxerga texto + layout + imagens das páginas.
- **Citations**: passar `{ "citations": { "enabled": true } }` no document block. Resposta inclui `citations` apontando spans (`start_char_index`, `end_char_index`) no source. Não confundir com citações de busca web.

## Extended thinking

Reasoning explícito, adaptativo: o modelo decide quanto pensar e o `effort` (`low` | `medium` | `high` | `xhigh` | `max`) orienta o esforço:

```jsonc
{ "thinking": { "type": "adaptive" }, "output_config": { "effort": "high" } }
```

- `thinking: { type: "enabled", budget_tokens }` (modo manual) não é aceito nos modelos atuais (400). Use `adaptive` + `effort`.
- O block `thinking` retornado conta como output tokens (cobra como output).
- **Sempre** defina `max_tokens` e `effort` em produção — thinking conta como output e o custo escala de forma não-óbvia.
- Thinking blocks voltam ao histórico **inalterados** em multi-turn com tool use. Editar turnos anteriores invalida os blocks (histórico append-only).
- Nos 5.x o texto do thinking vem vazio por padrão (`display: "omitted"`). Para mostrar resumo, `thinking: { type: "adaptive", display: "summarized" }`.

## Batch API

Async, 50% desconto, SLA de até 24h:

```
POST /v1/messages/batches
{
  "requests": [
    { "custom_id": "req-1", "params": { /* mesmos campos de /messages */ } },
    ...
  ]
}
```

Até 100k requests por batch. Resultados via `results_url` (JSONL). Ideal para
classificação massiva, backfill, eval offline. Não usar para latência interativa.

## Files API

Upload reutilizável:

```
POST /v1/files       (multipart)
→ { "id": "file_01...", ... }
```

Referenciar em messages: `{ "type": "document", "source": { "type": "file", "file_id": "file_01..." } }`.

Útil quando o mesmo PDF/imagem aparece em muitas requests — evita reupload e
combina bem com prompt caching.

## Auth

| Plataforma | Como |
|---|---|
| Direct | header `x-api-key: $ANTHROPIC_API_KEY` + `anthropic-version: 2023-06-01` |
| Bedrock | AWS SigV4 / IAM. Código novo usa o cliente Mantle (`AnthropicBedrockMantle`); `bedrock-runtime:InvokeModel` é o caminho legado |
| Vertex | OAuth bearer via ADC; endpoint regional Vertex |

Headers obrigatórios na API direta:

```
x-api-key: <key>
anthropic-version: 2023-06-01
content-type: application/json
anthropic-beta: <feature1>,<feature2>   // quando aplicável
```

Regras de chave (ver `@rules/security` e `@contracts/secrets`):

- API key **nunca** em browser, mobile, repo, log, mensagem de erro.
- Sempre via secret manager (`@contracts/secrets`); rotação periódica.
- Em edge/server use env var injetado pelo runtime, nunca hardcoded.

## Rate limits

Por organização, tier-based (RPM, ITPM, OTPM separados por modelo). Cada response
inclui:

```
anthropic-ratelimit-requests-limit
anthropic-ratelimit-requests-remaining
anthropic-ratelimit-requests-reset
anthropic-ratelimit-input-tokens-limit
anthropic-ratelimit-input-tokens-remaining
anthropic-ratelimit-input-tokens-reset
anthropic-ratelimit-output-tokens-*
```

Em 429: ler `retry-after` (segundos) e fazer backoff. Em 529 (overloaded):
exponential backoff com jitter. Política consolidada em `@rules/error-handling`.

## Erros

| Status | `type` | Significado |
|---|---|---|
| 400 | `invalid_request_error` | Schema/parâmetros inválidos — corrigir, não retry |
| 401 | `authentication_error` | Key inválida — falhar fast, alertar |
| 403 | `permission_error` | Org sem acesso ao modelo/feature |
| 404 | `not_found_error` | Model ID errado ou recurso (batch/file) inexistente |
| 413 | `request_too_large` | Reduzir input ou paginar |
| 429 | `rate_limit_error` | Backoff com `retry-after` |
| 500 | `api_error` | Retry com backoff curto |
| 529 | `overloaded_error` | Backoff exponencial + jitter |

Body sempre traz `{ "type": "error", "error": { "type": "...", "message": "..." } }`.
Nunca mostrar `message` raw em UI — pode vazar contexto interno.

## Quando usar a API Anthropic

- Tarefas onde Claude tem vantagem mensurada: writing longo, análise de documento, código de engenharia, agentes complexos com tool use, raciocínio multi-step.
- Prompt caching é game-changer: RAG, chatbots com persona grande, code review com codebase no contexto.
- Computer use (`computer_toolset_20260801` nos 5.x, GA na API direta e no Google Cloud; o Bedrock ainda usa `computer_20251124` com beta header).
- 1M de context (padrão nos 5.x) para codebases inteiros ou corpora grandes.
- Extended thinking quando o problema é genuinamente "reasoning hard".
- Bedrock/Vertex quando há requisito de residência/compliance (LGPD/HIPAA) — ver `@rules/governance`.

Quando **não** usar diretamente: ver "Acesso no projeto" abaixo.

## Acesso no projeto

Ordem de preferência:

1. **`@stacks/ai/vercel-ai-sdk` + `@ai-sdk/anthropic@4`** — caminho padrão. Cobre chat, tool use, structured output via `Output.object`, streaming e multimodal. Provider-agnostic, fácil trocar Anthropic, OpenAI e Gemini sem reescrever a feature.
2. **`@anthropic-ai/sdk` direto** (`@stacks/ai/anthropic-sdk`) — quando precisar de features que o AI SDK não expõe ainda:
   - Computer use (`computer_toolset_20260801`)
   - Message Batches
   - Files API
   - Prompt caching com controle fino de breakpoints / TTL custom
   - Citations
3. **HTTP raw** — apenas em edge runtimes onde nem o SDK roda. Justificar.

Regra: nunca inventar wrapper próprio sobre `fetch` se um dos dois acima resolve.

## Observabilidade

Ver `@rules/observability`. Specificamente para Anthropic:

- Spans com attributes `gen_ai.system="anthropic"`, `gen_ai.request.model`, `gen_ai.response.id`.
- Logar `usage` completo incluindo `cache_creation_input_tokens` e `cache_read_input_tokens` — único jeito de auditar hit rate de cache.
- Logar `stop_reason` em todo request.
- **Nunca** logar `messages.content` cru — redação obrigatória (PII). Ver `@rules/security`.
- Métrica de cache hit rate: `cache_read / (cache_read + cache_creation + input_tokens_uncached)`. Alvo: > 60% em fluxos repetitivos.

## Anti-patterns

- API key em código client-side (browser, app mobile, extension).
- Ignorar prompt caching em system prompts > 1K tokens reutilizados — desperdício direto de custo.
- Tool sem `input_schema` completo — modelo improvisa JSON e quebra parse.
- Extended thinking sem `max_tokens`/`effort` definidos em produção — custo de output escala silenciosamente.
- Logar `messages` ou `content` sem redaction — vaza PII e prompts proprietários (ver `@rules/security`).
- Tratar texto livre quando `tool_use` com schema resolve o problema com determinismo.
- Misturar versão de `@ai-sdk/anthropic` incompatível com a versão de `ai` core.
- Não inspecionar `stop_reason` — `max_tokens` cortado silencioso vira bug em prod.
- Usar `@anthropic-ai/sdk` direto quando `@stacks/ai/vercel-ai-sdk` já cobre — duplica conhecimento de provider no codebase.
- Hardcode de `claude-sonnet-5-5` espalhado no código — model ID deve ser config (env var ou arquivo de modelos).
- Retry agressivo em 400/401/403 — são erros determinísticos, retry só piora.
- Mandar `temperature`/`top_p`/`top_k` para os modelos 5.x — devolve 400. Controle por `effort` e prompt; não espere determinismo.

## Comparação rápida com outros providers

- vs **OpenAI** (ver `@stacks/ai/openai`): Anthropic tem prompt caching explícito com breakpoints; os dois têm tool use com `strict: true` e saída estruturada por schema. Valide com Zod dos dois lados.
- vs **Gemini** (ver `@stacks/ai/gemini`): Anthropic tem computer use e thinking adaptativo com `effort`; Gemini tem grounding com Google Search e custo mais baixo em Flash.
- Em agentes complexos, ver `@stacks/ai/harness-engineering` para padrões de orquestração.

## Referências

- Modelos: https://platform.claude.com/docs/en/about-claude/models/overview
- Migração entre modelos: https://platform.claude.com/docs/en/about-claude/models/migration-guide
- Prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Tool use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
- Adaptive thinking: https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking
- Effort: https://platform.claude.com/docs/en/build-with-claude/effort
- Structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Computer use: https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool

## Referências cruzadas

- `@stacks/ai/anthropic-sdk` — cliente TypeScript oficial
- `@stacks/ai/vercel-ai-sdk` — caminho padrão de integração no projeto
- `@stacks/ai/openai` — provider alternativo
- `@stacks/ai/gemini` — provider alternativo
- `@stacks/ai/harness-engineering` — padrões de orquestração de agentes
- `@stacks/validation/zod@4` — schemas para tool `input_schema`
- `@rules/security` — handling de API key, redaction de logs
- `@rules/caching` — política de prompt caching
- `@rules/observability` — spans, métricas e logs de LLM
- `@rules/error-handling` — retry/backoff em 429/529, tratamento de `stop_reason`
- `@rules/governance` — quando exigir Bedrock/Vertex por compliance
- `@contracts/secrets` — convenções de naming e storage da API key
