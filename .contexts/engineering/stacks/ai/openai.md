---
title: OpenAI API
category: ai
kind: product-protocol
status: current
last_updated: 2026-09-28
upstream: https://platform.openai.com/docs
---

# OpenAI API

Plataforma HTTP/REST (e WebSocket/WebRTC para Realtime) que expõe os modelos da OpenAI. Este documento descreve **a API como produto e protocolo** — endpoints, modelos, request/response shapes, headers, limites e capacidades. Detalhes do SDK npm (`openai`) ficam em `@stacks/ai/openai-sdk`; integração via abstração unificada fica em `@stacks/ai/vercel-ai-sdk`.

Base URL: `https://api.openai.com/v1`.

---

## Endpoints principais

### Chat Completions — `POST /v1/chat/completions`

API legacy estável. Continua suportada e amplamente usada em produção. Para código novo voltado a multi-turn com state server-side ou built-in tools, prefira **Responses API**.

### Responses API — `POST /v1/responses`

API unificada introduzida em 2024-2025 que **substitui gradualmente Chat Completions e Assistants API**. Diferenciais:

- `previous_response_id`: continuidade de conversa server-side, sem reenviar o histórico inteiro a cada request.
- **Built-in tools** hospedados pela OpenAI: `web_search`, `file_search`, `computer_use`, `code_interpreter`.
- `input` aceita texto simples, array de messages ou content array multimodal.
- `instructions` substitui o role `system` do Chat Completions.
- Stream de eventos tipados (mais granular que SSE do Chat Completions).

Padrão para código novo no projeto.

### Assistants API — `POST /v1/assistants` (e correlatos)

**Deprecada** em favor da Responses API. Não usar em código novo. Migração documentada em platform.openai.com/docs/assistants/migration.

### Embeddings — `POST /v1/embeddings`

Modelos: `text-embedding-3-small` (1536 dims default), `text-embedding-3-large` (3072 dims default). Parâmetro `dimensions` permite truncar (Matryoshka) — use para reduzir custo de storage em pgvector mantendo qualidade aceitável. Referencie `@stacks/database/pgvector`.

### Images — `POST /v1/images/generations` (`/edits`, `/variations`)

Modelos: `gpt-image-1` (atual, melhor qualidade/instrução), `dall-e-3`, `dall-e-2` (legacy). `gpt-image-1` aceita `quality`, `size`, `background`, `output_format`.

### Audio

- **Transcrição**: `POST /v1/audio/transcriptions` — `whisper-1`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`.
- **TTS**: `POST /v1/audio/speech` — `tts-1`, `tts-1-hd`, `gpt-4o-mini-tts` (suporta instructions de estilo).
- **Translations**: `POST /v1/audio/translations` — apenas para EN.

### Moderations — `POST /v1/moderations`

`omni-moderation-latest` (multimodal, suporta texto e imagem). Gratuito. Use antes de persistir conteúdo de usuário.

### Files — `POST /v1/files`

Upload para uso em Batch, Fine-tuning, Assistants legacy, file_search da Responses API.

### Batch API — `POST /v1/batches`

Submissão assíncrona (até 24h de janela). **50% de desconto** vs requests síncronas. Aceita `chat/completions`, `embeddings`, `responses`. Use para backfills, evaluations offline, processamento em massa de embeddings.

### Fine-tuning — `POST /v1/fine_tuning/jobs`

Suporta SFT, DPO e reinforcement fine-tuning conforme modelo base. Resulta em model id custom (`ft:gpt-4o-mini:org::<id>`).

### Realtime API — WebSocket / WebRTC

`wss://api.openai.com/v1/realtime` ou WebRTC SDP exchange. Voice-to-voice low-latency (< 800ms typical). Sessions configuráveis: `input_audio_transcription`, `turn_detection` (server VAD ou client-controlled), `voice` (alloy, echo, shimmer, etc.), `instructions`, `tools`.

---

## Modelos (ficha de 2026-09-28)

O id de produção fica na config. Esta tabela é o default para código novo, lida em https://developers.openai.com/api/docs/models e na página de preço nessa data. O SDK é `openai@7.23.0`.

| Papel | Model id |
|---|---|
| Trabalho difícil | `gpt-6-astra` |
| Dia a dia | `gpt-6-sol` |
| Volume | `gpt-6-luna` |
| Imagem | `gpt-image-2.5-sunburst` (edição) ou `gpt-image-2.5-flare` (geração rápida) |
| Voz em tempo real | `gpt-realtime-2.1` |

`gpt-4o`, `gpt-5` e `dall-e-3` não são default. Reasoning tokens continuam cobrados à parte. Defina teto de saída. Não use alias `latest` em produção.

### Moderation

`omni-moderation-latest`.

---

## Request shape — Chat Completions

Campos relevantes (visão de protocolo, sem sintaxe de SDK):

- `model` (string, obrigatório).
- `messages`: array com roles `system | user | assistant | tool`. Mensagens `tool` carregam `tool_call_id` e `content` com resultado.
- `temperature` (0-2), `top_p` (0-1) — usar um ou outro, não ambos.
- `max_tokens` (legacy) ou `max_completion_tokens` (obrigatório em reasoning models — inclui reasoning tokens).
- `stream: true` ativa SSE.
- `n` (samples — evitar em produção; multiplica custo).
- `stop` (até 4 sequences).
- `tools`: array `[{ type: "function", function: { name, description, parameters, strict: true } }]`. `parameters` é JSON Schema. `strict: true` garante shape exato — sempre usar.
- `tool_choice`: `"auto" | "required" | "none" | { type: "function", function: { name } }`.
- `parallel_tool_calls` (boolean, default true).
- `response_format`: `{ type: "text" }`, `{ type: "json_object" }` (modo JSON livre) ou `{ type: "json_schema", json_schema: { name, schema, strict: true } }` (recomendado).
- `seed` (int) para reprodutibilidade best-effort; resposta inclui `system_fingerprint`.
- `presence_penalty`, `frequency_penalty` (-2.0 a 2.0).
- `logit_bias` (map token-id → bias -100..100).
- `logprobs: true` + `top_logprobs` para análise.
- `user` (id de end-user para abuse detection upstream).
- `reasoning_effort` (apenas reasoning models).
- `prediction` (predicted outputs — ver abaixo).

---

## Request shape — Responses API

- `model`.
- `input`: string, array de messages, ou content array (multimodal).
- `instructions`: equivalente a `system` (string).
- `tools`: mistura functions custom + built-in (`{ type: "web_search" }`, `{ type: "file_search", vector_store_ids: [...] }`, `{ type: "computer_use_preview" }`, `{ type: "code_interpreter" }`).
- `tool_choice`, `parallel_tool_calls`.
- `previous_response_id`: continuidade de turn anterior sem reenviar histórico.
- `stream`: stream de eventos tipados (`response.created`, `response.output_text.delta`, `response.tool_call.delta`, `response.completed`, etc.).
- `reasoning`: `{ effort: "low" | "medium" | "high" }` em reasoning models.
- `text.format`: `{ type: "json_schema", ... }` equivalente ao `response_format` do Chat Completions.
- `metadata`, `store` (boolean — controla se a response fica disponível para `previous_response_id`).

---

## Structured outputs

`response_format: { type: "json_schema", json_schema: { strict: true, schema } }` (Chat Completions) ou `text.format` (Responses API).

`strict: true` garante que o output **conforma ao schema**. Sem `strict`, o modelo pode quebrar o shape sob carga ou em edge cases — não confiável para parsing downstream.

Padrão do projeto: definir schema em Zod 4 e converter via `z.toJSONSchema(schema)`. Referencie `@stacks/validation/zod@4`. Para texto livre, use `{ type: "text" }` explícito (mais legível que default implícito).

---

## Tool / function calling

- Declarar via `tools` com JSON Schema em `function.parameters`.
- `strict: true` na function spec garante que `arguments` retornados conformam ao schema — sempre usar.
- `tool_choice: "required"` força o modelo a chamar pelo menos uma tool; `{ type: "function", function: { name } }` força uma específica.
- `parallel_tool_calls: false` desabilita paralelismo quando ordem importa.
- Em Chat Completions, response traz `choices[0].message.tool_calls[]`; cada item tem `id`, `function.name`, `function.arguments` (string JSON — parsear). Reenviar como mensagem `tool` com mesmo `tool_call_id`.
- Em Responses API, tool calls aparecem como itens tipados no output stream.

---

## Streaming

- **Chat Completions**: SSE com `stream: true`. Chunks no formato `data: {...}\n\n`, terminam com `data: [DONE]`. Deltas em `choices[0].delta.content` e `choices[0].delta.tool_calls[*].function.arguments` (que chegam em fragmentos — concatenar por `tool_call.index`).
- **Responses API**: stream de eventos tipados com nomes (`response.output_text.delta`, `response.function_call_arguments.delta`, etc.). Mais fácil de roteamento client-side.
- `stream_options: { include_usage: true }` (Chat Completions) inclui bloco `usage` no chunk final.

---

## Prompt caching

**Automático** em Chat Completions e Responses API. Sem opt-in, sem header, sem campo de request.

- Aplica a prompts com **≥ 1024 tokens** (prefixo cacheado em incrementos de 128).
- Cache expira após **~5-10 min de inatividade**.
- Desconto: **50% no custo dos tokens cacheados** (varia por modelo — checar pricing atual).
- Observabilidade: `usage.prompt_tokens_details.cached_tokens` no response. Logar **sempre** — sem isso, perde-se oportunidade de custo silenciosamente. Referencie `@rules/caching` e `@rules/observability`.
- Estratégia: manter prefixo estável (system prompt + few-shot + tools) no início; dados variáveis (user input) no fim. Reordenar messages quebra o cache.

---

## Predicted outputs (distillation)

Campo `prediction: { type: "content", content: "<draft>" }` em Chat Completions. Reduz latência quando o output esperado é similar a um draft conhecido (ex: edição de arquivo com poucas mudanças, refactor mecânico). Tokens "previstos corretamente" são cobrados normalmente; tokens rejeitados também (não é desconto, é speedup). Útil para code editing flows.

---

## Auth e headers

- `Authorization: Bearer <OPENAI_API_KEY>` (obrigatório).
- `OpenAI-Organization: org_...` (opcional — fixa qual org cobra).
- `OpenAI-Project: proj_...` (opcional — fixa qual project; restringe escopo da key).
- `OpenAI-Beta: assistants=v2` (apenas Assistants legacy).

**NUNCA** expor a API key em browser, mobile bundle, ou qualquer client. Sempre proxy server-side. Referencie `@rules/security` e `@contracts/secrets`.

---

## Rate limits

- Limites por **organização**, por **modelo**, por **tipo de request** (RPM, TPM, IPM para images, batch queue limits).
- Headers de resposta: `x-ratelimit-limit-requests`, `x-ratelimit-limit-tokens`, `x-ratelimit-remaining-requests`, `x-ratelimit-remaining-tokens`, `x-ratelimit-reset-requests`, `x-ratelimit-reset-tokens`.
- Tiers de uso (Tier 1-5) escalam automaticamente conforme spend histórico. Tier baixo em modelo novo é a causa mais comum de 429 em projetos novos — checar antes de assumir bug.

---

## Errors

Status codes:

- `400` — invalid_request_error (schema inválido, model inexistente, parâmetros incompatíveis).
- `401` — authentication_error (key inválida/revogada).
- `403` — permission_error (key sem acesso ao modelo/feature, ou região bloqueada).
- `404` — not_found_error (response_id/file_id inexistente).
- `429` — rate_limit_error **ou** insufficient_quota (saldo zerado — não retry resolve).
- `500 / 502 / 503` — server_error / service_unavailable.

Body: `{ error: { code, type, message, param } }`. Sempre logar `code` e `type` — `message` muda. **Exponential backoff com jitter** em 429 (que não seja quota) e 5xx; max ~5 tentativas. Diferenciar `insufficient_quota` (não retry) de `rate_limit_exceeded` (retry com backoff). Referencie `@rules/error-handling`.

---

## Usage e custo

Bloco `usage` em toda response:

- `prompt_tokens`, `completion_tokens`, `total_tokens`.
- `prompt_tokens_details.cached_tokens` — tokens servidos do cache (cobrados com desconto).
- `prompt_tokens_details.audio_tokens` — tokens de áudio em entrada multimodal.
- `completion_tokens_details.reasoning_tokens` — reasoning tokens invisíveis (reasoning models). **Cobrados**.
- `completion_tokens_details.accepted_prediction_tokens`, `rejected_prediction_tokens` (predicted outputs).

Controle de custo:

- `max_completion_tokens` em reasoning models é **obrigatório na prática** — sem isso, o modelo pode gastar 10k+ reasoning tokens.
- Logar `usage` em todo request para observabilidade de custo. Referencie `@rules/observability` e `@rules/performance`.

---

## Realtime API

Dois transportes:

- **WebSocket**: `wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview`. Auth via header. Server-to-server ou backend → relay → client.
- **WebRTC**: SDP exchange via `POST /v1/realtime/sessions` retorna ephemeral key + ICE config. Permite conexão **client ↔ OpenAI** direta sem expor API key (usa ephemeral token de curta duração). Padrão para voice apps em browser/mobile.

Configuração de session:

- `voice`: `alloy`, `ash`, `ballad`, `coral`, `echo`, `sage`, `shimmer`, `verse`.
- `input_audio_transcription`: `{ model: "whisper-1" | "gpt-4o-transcribe" }`.
- `turn_detection`: `{ type: "server_vad", threshold, silence_duration_ms }` ou `null` (push-to-talk client-controlled).
- `instructions`, `tools`, `temperature`, `max_response_output_tokens`.

Eventos bidirecionais tipados (`session.update`, `input_audio_buffer.append`, `response.create`, `response.audio.delta`, etc.).

---

## Quando usar a OpenAI API

Capacidades únicas que justificam OpenAI sobre alternativas:

- **Reasoning models** (o1/o3/o4-mini): math, code, planning multi-step rigoroso.
- **Realtime voice** (voice-to-voice nativo com latência < 1s).
- **Built-in tools** via Responses API: `web_search`, `computer_use`, `code_interpreter` sem precisar implementar a infra.
- **Whisper / gpt-4o-transcribe**: estado-da-arte em transcrição multilíngue.
- **gpt-image-1**: image gen com aderência a instrução superior a competidores.
- **Batch 50% off**: backfills em massa, embeddings offline.

Para tarefas genéricas de chat onde Anthropic / Gemini empatam, escolha por preço/latência/contexto — não por default. Compare com `@stacks/ai/anthropic` e `@stacks/ai/gemini`.

---

## Acesso no projeto

- **Padrão**: Vercel AI SDK + provider `@ai-sdk/openai`. Cobre Chat Completions, Responses, embeddings, structured outputs, tool calling, streaming. Referencie `@stacks/ai/vercel-ai-sdk`.
- **SDK direto** (`openai` npm): usar **apenas** para features que o AI SDK não cobre — Realtime, Batch, Files, Fine-tuning, Moderations, Assistants legacy em migração. Detalhes em `@stacks/ai/openai-sdk`.
- **Avaliação / evals**: pode usar Batch API direto independentemente de qual SDK roda em produção. Referencie `@stacks/ai/harness-engineering`.

---

## Observabilidade

Atributos OpenTelemetry GenAI semantic conventions:

- `gen_ai.system = "openai"`.
- `gen_ai.request.model`, `gen_ai.response.model`, `gen_ai.response.id`.
- `gen_ai.usage.input_tokens`, `gen_ai.usage.output_tokens`.
- Atributos custom: `cached_tokens`, `reasoning_tokens`, `cache_hit_rate`.

Spans: um span por request; eventos por tool call e por chunk de stream quando relevante. Referencie `@rules/observability`.

---

## Anti-patterns

- API key em client (browser/mobile bundle). Sempre proxy server-side.
- Adotar **Assistants API** em código novo — está deprecada. Use Responses API.
- `response_format: json_schema` sem `strict: true` — perde a garantia de shape; parsing downstream fica frágil.
- Tools sem `strict: true` — arguments podem vir malformados.
- Reasoning model sem `max_completion_tokens` — risco de gastar milhares de reasoning tokens silenciosamente.
- Ignorar `prompt_tokens_details.cached_tokens` na telemetria — perde oportunidade de tunar prompt para maximizar cache hit.
- Reordenar messages dinamicamente (ex: shuffling few-shots) — quebra prompt caching.
- Confiar em texto livre quando structured outputs com `json_schema strict` resolveria.
- Logar `messages` cru sem redact de PII. Referencie `@rules/security`.
- Retry em `insufficient_quota` (429 por saldo zerado) — não é transitório; falha rápido e alerta.
- Usar `n > 1` em produção — multiplica custo; gere múltiplas calls explícitas se realmente precisar de samples.
- `temperature` + `top_p` ao mesmo tempo — escolha um.
- Polling síncrono em workloads que cabem em Batch API — 50% mais caro sem ganho.

---

## Referências

- platform.openai.com/docs
- platform.openai.com/docs/api-reference
- platform.openai.com/docs/guides/structured-outputs
- platform.openai.com/docs/guides/prompt-caching
- platform.openai.com/docs/guides/realtime

Stacks relacionados: `@stacks/ai/openai-sdk`, `@stacks/ai/vercel-ai-sdk`, `@stacks/ai/anthropic`, `@stacks/ai/gemini`, `@stacks/ai/harness-engineering`, `@stacks/validation/zod@4`.

Regras e contratos relacionados: `@rules/security`, `@rules/observability`, `@rules/caching`, `@rules/performance`, `@rules/error-handling`, `@contracts/secrets`.
