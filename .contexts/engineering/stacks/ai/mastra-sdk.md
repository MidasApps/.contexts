---
title: Mastra
type: stacks
version: "@mastra/core@1.71.0 / mastra@1.31.3"
last_updated: 2026-09-28
status: current
upstream:
  docs: https://mastra.ai/docs
  repo: https://github.com/mastra-ai/mastra
category: ai
---

# Mastra

Framework TypeScript para **AI agents**, **workflows tipados**, **RAG** e **evals**. Fica acima do AI SDK 7 (ver `@stacks/ai/vercel-ai-sdk`): o core recebe o modelo pronto e detecta a spec (`LanguageModelV4` é AI SDK 7, desde `@mastra/core@1.47.0`).

Pins de 2026-09-28: `@mastra/core@1.71.0`, CLI `mastra@1.31.3`. O peer de Zod é `^3.25 || ^4`; o projeto usa só Zod 4.6.5. Fixe core e CLI na mesma leva. Se o CLI puxar `@mastra/deployer` ou `@mastra/loggers` de um trem diferente do core, trave com `pnpm.overrides`. Sob TypeScript 7, o deployer que ainda importa a API programática precisa do pacote TS 6 ao lado (`@stacks/language/typescript@7`).

Mastra **não substitui** o AI SDK — usa AI SDK Core como primitiva de modelo. A escolha entre os dois é arquitetural, não competitiva (ver seção "Mastra vs Vercel AI SDK puro").

## Versão e instalação

Pin sempre a versão exata em `package.json`. Mastra ainda evolui rapidamente; minor versions trazem mudanças relevantes em APIs de workflow e memory.

```json
{
  "dependencies": {
    "@mastra/core": "1.71.0",
    "@mastra/memory": "1.32.1",
    "@mastra/rag": "2.6.4",
    "@mastra/mcp": "2.1.0",
    "@mastra/pg": "1.27.1",
    "@mastra/ai-sdk": "1.10.5",
    "@mastra/observability": "1.18.1"
  },
  "devDependencies": {
    "mastra": "1.31.3"
  }
}
```

Toda interface pública de Mastra usa **Zod** (ver `@stacks/validation/zod@4`) — schemas Zod são o contrato de fronteira para tools, inputs e outputs.

As majors não andam juntas: `rag` e `mcp` estão na 2.x com peer `@mastra/core >=1 <2`. Não force tudo para a major do core.

`@mastra/evals@1.10.3` declara peer `vitest >=3 <5`. O runner do projeto é Vitest 5.0.2, então esse pacote **não entra** no install até o peer aceitar a 5 (ADR 0004, E4). Métrica de eval do Mastra, quando voltar a ser instalável, continua sendo sinal estatístico, não substituto de teste.

## Componentes principais

### Agents

Unidade central de Mastra. Encapsula instruções (system prompt), modelo, ferramentas e memória.

```ts
import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';

export const supportAgent = new Agent({
  name: 'support-agent',
  instructions: 'Você responde dúvidas de suporte usando a base de conhecimento.',
  model: openai(config.openaiModelId),
  tools: { searchKnowledge, createTicket },
  memory,
});

const result = await supportAgent.generate('Como resetar minha senha?');
const stream = await supportAgent.stream('Como resetar minha senha?');
```

Agents executam **agent loop** com tool use multi-step automático: o modelo decide quando chamar tools, Mastra executa, devolve resultado, e o loop continua até resposta final ou limite. As opções de `generate`/`stream` aceitam `maxSteps` e `stopWhen` (a condição do AI SDK 7); defina um dos dois em todo agent com tools.

### Workflows

Orquestração tipada determinística. Use quando a sequência de passos é previsível e você quer observabilidade ponto a ponto, ao contrário do agent loop que é dirigido pelo LLM.

```ts
import { createWorkflow, createStep } from '@mastra/core/workflows';
import { z } from 'zod';

const extractStep = createStep({
  id: 'extract',
  inputSchema: z.object({ url: z.url() }),
  outputSchema: z.object({ text: z.string() }),
  execute: async ({ inputData }) => { /* ... */ },
});

const workflow = createWorkflow({ id: 'ingest-doc', inputSchema, outputSchema })
  .then(extractStep)
  .then(chunkStep)
  .parallel([embedStep, summarizeStep])
  .branch([
    [shouldNotify, notifyStep],
  ])
  .commit();
```

Suporta **retries**, **suspend/resume**, **snapshot** persistente — workflows longos podem pausar aguardando input humano e retomar do snapshot.

### Tools

Funções tipadas que agents invocam. Sempre definidas com `inputSchema` e `outputSchema` Zod.

```ts
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

export const searchKnowledge = createTool({
  id: 'search-knowledge',
  description: 'Busca semântica na base de conhecimento por similaridade de vetores.',
  inputSchema: z.object({ query: z.string(), topK: z.number().int().min(1).max(20).default(5) }),
  outputSchema: z.object({ results: z.array(z.object({ id: z.string(), text: z.string(), score: z.number() })) }),
  execute: async ({ query, topK }, { abortSignal }) => { /* ... */ },
});
```

**Description** é parte do prompt — o LLM lê esse texto para decidir invocar a tool. Seja preciso, escreva em primeira-pessoa-de-ferramenta, descreva inputs.

### Memory

Camada de persistência conversacional. Três modos coexistentes:

- **Thread context** (short-term): últimas N mensagens da thread, injetadas no prompt.
- **Semantic recall** (long-term): busca vetorial em histórico completo da thread/usuário.
- **Working memory**: bloco mutável e estruturado que o agent mantém entre turnos (perfil do usuário, estado da tarefa).

```ts
import { Memory } from '@mastra/memory';
import { PostgresStore, PgVector } from '@mastra/pg';
import { env } from '@/env'; // src/env.ts validado por Zod (@contracts/secrets §5.4)

export const memory = new Memory({
  storage: new PostgresStore({ connectionString: env.DATABASE_URL }),
  vector: new PgVector({ connectionString: env.DATABASE_URL }),
  options: {
    lastMessages: 20,
    semanticRecall: { topK: 5, messageRange: 2 },
    workingMemory: { enabled: true, template: '...' },
  },
});
```

Postgres + pgvector é o backend recomendado para este projeto (ver `@stacks/database/pgvector`). Sempre defina **TTL/limite** em `lastMessages` e cap em working memory — contexto cresce sem bound se você não fechar.

### RAG

Pipeline completo: documentos → chunks → embeddings → store vetorial → retrieval → reranking.

```ts
import { MDocument } from '@mastra/rag';

const doc = MDocument.fromMarkdown(content);
const chunks = await doc.chunk({ strategy: 'recursive', size: 512, overlap: 50 });
const embeddings = await embed(chunks);
await vectorStore.upsert({ vectors: embeddings, metadata: chunks.map(c => c.metadata) });
```

Vector stores suportados: **pgvector** (preferido aqui), Pinecone, Qdrant, Chroma, Astra. Use `MDocument.fromMarkdown` / `.fromHTML` / `.fromText` / `.fromJSON` para fontes diferentes. Strategies de chunking: `recursive`, `character`, `token`, `markdown`, `html`, `json`, `latex`.

### Evals

`@mastra/evals@1.10.3` não instala ao lado de Vitest 5 (peer `<5`). Até o peer abrir, eval de LLM fica fora do `package.json`. Quando voltar, as métricas abaixo são sinal estatístico, não teste.

Métricas built-in para qualidade de output de LLM. Roda em CI ou no Mastra Dev playground.

Métricas nativas: `faithfulness`, `answer-relevance`, `context-relevance`, `toxicity`, `bias`, `hallucination`, `summarization`, `prompt-alignment`, `tone-consistency`, `completeness`. Use `createEval()` para métricas custom (LLM-as-judge ou determinísticas).

Evals **não** substituem testes unitários — são proxies estatísticos. Trate scores como sinal, não verdade.

### Voice

STT/TTS via providers (OpenAI, ElevenLabs, Deepgram, Google). API uniforme: `agent.voice.speak(text)` e `agent.voice.listen(audio)`. Use apenas quando a UX exige áudio — para texto puro, é overhead.

### MCP

Cliente e servidor do Model Context Protocol.

- `MCPClient`: agent consome tools/resources expostos por servidores MCP externos.
- `MCPServer`: expõe agents/tools/workflows Mastra como servidor MCP para consumidores externos (Claude Desktop, IDEs).

### Deployment

Deployers oficiais empacotam Mastra para a plataforma alvo:

- `@mastra/deployer-vercel@1.2.30` — preferido neste projeto (alinhado com `@stacks/frontend/next@16`).
- `@mastra/deployer-cloudflare` — workers/edge.
- `@mastra/deployer-netlify`.
- Standalone Node — para containers, Cloud Run, ECS.

O deployer entra no construtor `new Mastra({ deployer })`, no entry point `src/mastra/index.ts` (o arquivo que o CLI `mastra` procura; não existe `mastra.config.ts`). O deployer compila workflows, registra rotas e injeta storage adapters.

### Mastra Dev

CLI `mastra dev` sobe playground local em `http://localhost:4111` com:

- Chat UI por agent, com inspetor de tool calls.
- Visualização de workflows com estado por step.
- Runner de evals com diff por iteração.
- Traces OpenTelemetry navegáveis.

Use durante desenvolvimento de agents/workflows — encurta drasticamente o loop de iteração.

## Mastra vs Vercel AI SDK puro

Decisão arquitetural por caso de uso:

| Caso | Use |
|---|---|
| Single completion / structured output único | `@stacks/ai/vercel-ai-sdk` puro |
| Chat simples sem persistência longa | `@stacks/ai/vercel-ai-sdk` + `useChat` |
| Agent com tools e memória entre sessões | **Mastra** |
| Workflow multi-step com observabilidade e retries | **Mastra** |
| RAG estruturado com chunking + retrieval + reranking | **Mastra** |
| Evals em CI | adiar `@mastra/evals` até o peer aceitar Vitest 5 |
| Ingestão batch sem decisão dirigida pelo LLM | AI SDK puro (`embedMany`) |

Mastra **usa** AI SDK por baixo (`model: openai(...)`, `model: google(...)`) — providers do AI SDK funcionam transparentemente. Ver `@stacks/ai/openai` e `@stacks/ai/gemini` para configuração de providers.

## Integrações deste projeto

### Next.js 16

Em Route Handlers App Router (ver `@stacks/frontend/next@16`):

O handler usa `@mastra/ai-sdk@1.10.5` para adaptar `agent.stream(...)` ao UI message stream do AI SDK 7 (`createUIMessageStreamResponse`). Não chame `toDataStreamResponse`: isso é da linha 4 do `ai`. A assinatura do helper está na doc do pacote instalado. O cliente usa `useChat` de `@ai-sdk/react@4`.

### Postgres / pgvector

Store de memory e vetores. Ver `@stacks/database/pgvector`. Configure `DATABASE_URL` em secrets (ver `@rules/security`), nunca inline.

### TypeScript 7

Ver `@stacks/language/typescript@7`. Toda fronteira pública tipa com Zod e infere com `z.infer<typeof SearchInputSchema>`. Nunca use `any` em `execute` de tools — derive o tipo do `inputSchema`.

### Observability

Tracing vem de `@mastra/observability@1.18.1`, passado em `new Mastra({ observability })` no `src/mastra/index.ts`. A chave `telemetry` da linha 0.x não existe no `Config` do `@mastra/core@1.71.0`. Exporters para Langfuse, Braintrust, Datadog ou OTLP genérico são pacotes à parte; confira o nome na doc da versão instalada. Ver `@rules/observability`.

```ts
// src/mastra/index.ts
import { Mastra } from '@mastra/core';
import { Observability } from '@mastra/observability';

export const mastra = new Mastra({
  agents: { supportAgent },
  observability: new Observability({
    configs: { default: { serviceName: 'support-service', exporters: [otlpExporter] } },
  }),
});
```

`Observability` aplica `SensitiveDataFilter` por padrão. Não desligue sem motivo registrado: é a redação de PII dos spans.

### Error handling

Ver `@rules/error-handling`. Tools devem lançar erros tipados — Mastra captura, envia ao agent loop como tool error, e o LLM decide retry/fallback. Não swallow exceptions dentro de `execute`. Workflows definem retry por step (`retries: { attempts, delay }`).

## Anti-patterns

- **Usar Mastra para single completion** — overhead de agent loop, memory, telemetria. Use `generateText` do AI SDK 7 (`Output.object` quando a saída é estruturada).
- **Agent sem `instructions` claros** — system prompt vago produz tool selection errática. Escreva instructions com persona, escopo e regras de invocação de tools.
- **Tools sem schema Zod completo** — LLM alucina inputs se `inputSchema` for permissivo. Use `z.strictObject()`, enums, `min`/`max`, `.describe()` em cada campo.
- **Memory sem TTL/limite** — `lastMessages` sem cap explode o contexto e a fatura. Sempre defina `lastMessages` numérico e revise working memory periodicamente.
- **Workflows sem observabilidade** — workflows sem telemetria são pior que código imperativo. Se desligou OTEL, não use workflows; use funções TS.
- **Misturar agent loop com workflow para o mesmo passo** — se a sequência é determinística, é workflow. Se depende de decisão do LLM, é agent. Não force agent a executar pipeline ETL.
- **Evals como gate booleano** — métricas são distribuições, não passa/falha. Use thresholds com banda de tolerância.
- **Embedar `apiKey` em config de provider** — sempre via env. Ver `@rules/security`.

## Roadmap de upgrade

Antes de subir minor version: leia o changelog em `github.com/mastra-ai/mastra/releases`, rode o eval set do harness próprio (`@stacks/ai/harness-engineering`; `@mastra/evals` está fora pela E4) contra a nova versão, compare scores. APIs marcadas como experimental (workflow `.suspend`, working memory templates) podem mudar entre minors.

## Referências cruzadas

- `@stacks/ai/vercel-ai-sdk` — primitiva de modelo usada por baixo
- `@stacks/ai/openai` — provider OpenAI
- `@stacks/ai/gemini` — provider Google
- `@stacks/validation/zod@4` — schemas de fronteira
- `@stacks/language/typescript@7` — tipos inferidos
- `@stacks/frontend/next@16` — integração Route Handlers
- `@stacks/database/pgvector` — backend de memory e vetores
- `@rules/observability` — telemetria OpenTelemetry
- `@rules/security` — secrets e API keys
- `@rules/error-handling` — erros em tools e workflows
