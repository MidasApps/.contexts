# ADR: Firecrawl + Vercel AI SDK + Vertex AI (Gemini 2.5 Flash)

**A integração de Firecrawl como ferramenta de web scraping, orquestrada pelo Vercel AI SDK v6 com Google Vertex AI (Gemini 2.5 Flash), oferece a melhor relação custo-benefício e developer experience para pipelines de análise de conteúdo web com IA.** Esta arquitetura permite que o modelo Gemini decida autonomamente quando buscar dados da web via tool calling, com streaming nativo para a UI React via `useChat`. O pacote oficial `firecrawl-aisdk` elimina boilerplate e funciona com qualquer provider do AI SDK — basta trocar uma linha para alternar entre Gemini, Claude ou GPT.

---

## 1. Contexto e motivação da decisão

Esta ADR documenta a decisão arquitetural de integrar quatro tecnologias em uma stack coesa para construir aplicações de IA com capacidade de acesso e análise de conteúdo web em tempo real. O fluxo completo é: **usuário interage na UI React → Next.js API route processa via Vercel AI SDK → Gemini 2.5 Flash decide quando chamar ferramentas Firecrawl → conteúdo web é extraído e sintetizado → resposta é streamed de volta para a UI**.

A escolha de cada componente segue critérios de **custo operacional**, **developer experience em TypeScript/React**, **qualidade de output para LLMs**, e **flexibilidade para trocar providers** sem reescrever código. As seções a seguir detalham cada tecnologia, seus trade-offs, e os padrões de integração validados.

---

## 2. Firecrawl: web scraping otimizado para LLMs

### API e endpoints principais (v2)

Firecrawl (v2.8.0, API base `https://api.firecrawl.dev/v2/`) é um serviço gerenciado que transforma websites em dados prontos para LLMs. O repositório open-source possui **~78.7K stars** no GitHub sob licença AGPL-3.0, permitindo self-hosting via Docker.

Os endpoints fundamentais cobrem todo o espectro de necessidades de extração web:

**`POST /v2/scrape`** — Extrai conteúdo de uma única URL de forma síncrona. Aceita parâmetros como `formats` (array com `markdown`, `html`, `rawHtml`, `screenshot`, `links`, `json`, `summary`), `onlyMainContent` (booleano, default true), `waitFor` (ms para conteúdo dinâmico), `actions` (automações de browser como click, scroll, JavaScript), e `location` para geo-targeting. A resposta inclui o conteúdo nos formatos solicitados mais metadata rica (title, description, OG tags, statusCode). O formato `json` permite extração estruturada com LLM embutido, usando schema JSON ou prompt em linguagem natural: `formats: [{type: "json", schema: {...}, prompt: "..."}]`.

**`POST /v2/crawl`** — Inicia um crawl assíncrono de um site inteiro. Retorna um `job ID` para polling via `GET /v2/crawl/{id}`. Parâmetros incluem `limit` (máximo de páginas), `maxDepth`, `includePaths`/`excludePaths` (glob patterns), e notavelmente um campo `prompt` para descrever em linguagem natural o que crawlear. Suporta webhooks para notificações em tempo real (`started`, `page`, `completed`) e WebSocket para monitoramento live.

**`POST /v2/map`** — Descobre rapidamente todas as URLs de um site (até **100K resultados**) sem extrair conteúdo. Ideal para planejamento de crawls.

**`POST /v2/extract`** — Extração estruturada multi-página com IA. Aceita URLs com wildcards (e.g., `"https://example.com/*"`), um `prompt` e um `schema` JSON. O LLM processa múltiplas páginas simultaneamente para extrair dados estruturados.

**`POST /v2/search`** — Combina busca web com scraping, retornando conteúdo completo das páginas encontradas. **`POST /v2/agent`** — O mais recente endpoint, onde um agente autônomo navega, busca e extrai dados sem necessidade de URLs — apenas uma descrição em linguagem natural. Powered pela família de modelos Spark.

### SDK JavaScript e padrões de uso

```typescript
import Firecrawl from '@mendable/firecrawl-js';
const app = new Firecrawl({ apiKey: process.env.FIRECRAWL_API_KEY });

// Scrape síncrono
const result = await app.scrape('https://example.com', {
  formats: ['markdown', 'html'],
  onlyMainContent: true,
});

// Crawl assíncrono com polling automático
const crawl = await app.crawl('https://docs.example.com', {
  limit: 100,
  scrapeOptions: { formats: ['markdown'] },
});

// Extração estruturada com Zod
import { z } from 'zod';
const extracted = await app.extract({
  urls: ['https://example.com/*'],
  prompt: 'Extract product names and prices',
  schema: z.object({
    products: z.array(z.object({ name: z.string(), price: z.number() })),
  }),
});
```

### Pricing e rate limits

| Plano | Preço/mês | Créditos/mês | Browsers simultâneos | Rate limit /scrape |
|---|---|---|---|---|
| **Free** | $0 | 500 (one-time) | 2 | 10 req/min |
| **Hobby** | $16 | 3.000 | 5 | 100 req/min |
| **Standard** | $83 | 100.000 | 50 | 500 req/min |
| **Growth** | $333 | 500.000 | 100 | 5.000 req/min |
| **Scale** | $599 | 1.000.000 | 150 | 7.500 req/min |

Cada scrape ou crawl page consome **1 crédito**. Search consome **2 créditos por 10 resultados**. Créditos **não acumulam** entre meses. Requisições com falha geralmente não são cobradas. O SDK suporta autenticação via header `Authorization: Bearer fc-...` ou variável de ambiente `FIRECRAWL_API_KEY`.

---

## 3. Vercel AI SDK v6: a camada de orquestração

### Arquitetura em três camadas

O AI SDK 6 (lançado em 22 de dezembro de 2025, **20M+ downloads mensais** no npm) organiza-se em três camadas independentes:

**AI SDK Core (`ai`)** fornece a API server-side unificada. As duas funções centrais são `generateText` (não-streaming, ideal para agentes e automações) e `streamText` (streaming, ideal para UIs de chat). No v6, `generateObject` e `streamObject` foram **depreciados** — structured output agora usa `Output.object({ schema })` como parâmetro de `generateText`/`streamText`. O sistema de `tool()` define ferramentas com schema Zod, função `execute`, e novos recursos como `needsApproval` para human-in-the-loop e `strict` mode.

**AI SDK UI (`@ai-sdk/react`)** fornece hooks React para construir interfaces de IA. O hook principal `useChat` gerencia todo o ciclo de vida de uma conversa: envio de mensagens via `sendMessage()`, recebimento de stream via SSE, gerenciamento de estado (`status`: `ready` → `submitted` → `streaming` → `ready`), e renderização de tool calls como parts tipadas. O hook `useCompletion` serve para completions single-turn, e `useObject` para streaming de objetos JSON estruturados.

**Providers (`@ai-sdk/*`)** implementam a interface `LanguageModelV2`. O SDK suporta **25+ providers** incluindo `@ai-sdk/google-vertex` para Vertex AI. A troca de modelo é feita em uma única linha — todo o código de tools, streaming e UI permanece idêntico.

### Tool calling e multi-step execution

```typescript
import { tool, generateText, stepCountIs } from 'ai';
import { z } from 'zod';

const webScraper = tool({
  description: 'Scrape content from a URL',
  inputSchema: z.object({  // v6 usa inputSchema; v5 usava parameters
    url: z.string().url(),
  }),
  execute: async ({ url }) => {
    // Firecrawl call aqui
    return { content: '...' };
  },
});

const { text, steps } = await generateText({
  model: vertex('gemini-2.5-flash'),
  tools: { webScraper },
  stopWhen: stepCountIs(5),  // v6; substitui maxSteps do v5
  prompt: 'Research the topic and summarize',
});
```

O fluxo multi-step funciona assim: o modelo gera um tool call → o SDK executa a ferramenta → o resultado é adicionado ao contexto → o modelo recebe o resultado e pode gerar outro tool call ou texto final. O `stopWhen: stepCountIs(5)` limita o loop a **5 iterações**, prevenindo loops infinitos. Cada step é acessível em `result.steps` com `toolCalls`, `toolResults`, `text` e `usage`.

### Streaming protocol e integração com UI

O SDK usa o **UI Message Stream Protocol** (SSE com header `x-vercel-ai-ui-message-stream: v1`) para comunicação entre server e client. O stream transmite partes tipadas: `text-delta` para texto incremental, `tool-input-start`/`tool-input-delta`/`tool-output-available` para tool calls em tempo real, `reasoning-delta` para chain-of-thought, e `source-url` para citações. No server, `result.toUIMessageStreamResponse()` serializa o stream; no client, `useChat` com `DefaultChatTransport` deserializa automaticamente.

Mensagens no UI seguem a estrutura `UIMessage` com `parts` tipados — cada message contém um array de parts (`text`, `tool-*`, `reasoning`, `source-url`, `file`, `data-*`, `error`). Isso permite renderização granular de cada componente da resposta do modelo.

---

## 4. Google Vertex AI e Gemini 2.5 Flash

### Capacidades do modelo

O Gemini 2.5 Flash (`gemini-2.5-flash`, GA desde junho 2025) é o **primeiro modelo Flash com capacidade de raciocínio** (thinking mode). Suas especificações principais:

- **Context window**: **1.048.576 tokens** de input (1M), **65.535 tokens** de output máximo
- **Velocidade**: ~**220 tokens/seg**, TTFT ~0.48s
- **Multimodal**: Aceita texto, código, imagem, áudio e vídeo como input; gera texto como output
- **Thinking mode**: Configurável via `thinkingBudget` — ajusta o número de tokens de raciocínio interno. Com `thinkingBudget: 0`, desativa o thinking para máxima velocidade; com valores altos, melhora accuracy em tarefas complexas
- **Knowledge cutoff**: Janeiro 2025
- **Features**: Function calling, structured output (JSON mode com schema), grounding com Google Search, code execution, context caching, URL context

O 2.5 Flash supera significativamente o 2.0 Flash (deprecated, shutdown em junho 2026) em raciocínio, coding e tarefas científicas, mantendo a mesma janela de contexto de 1M tokens.

### Pricing no Vertex AI

| Métrica | Preço por 1M tokens |
|---|---|
| Input (texto/imagem/vídeo) | **$0.30** |
| Input (áudio) | **$1.00** |
| Output (texto) | **$2.50** |
| Thinking tokens | **~$3.50** |
| Batch API | **50% desconto** |

Vertex AI cobra apenas por **requisições HTTP 200** (sucesso). Context caching reduz custo de input para $0.018/M tokens. Grounding com Google Search custa $35/1.000 prompts após cota gratuita diária.

### Autenticação e configuração do provider

O `@ai-sdk/google-vertex` (v4.0.80) suporta três modos de autenticação:

**Application Default Credentials (ADC)** — Recomendado para desenvolvimento local e GCP:
```bash
gcloud auth application-default login
# Ou: export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"
```

**Service Account** — Para produção server-side:
```typescript
import { createVertex } from '@ai-sdk/google-vertex';
const vertex = createVertex({
  project: 'my-project-id',
  location: 'us-central1',
  googleAuthOptions: {
    credentials: {
      client_email: 'sa@project.iam.gserviceaccount.com',
      private_key: process.env.GOOGLE_PRIVATE_KEY,
    },
  },
});
```

**Express Mode (API Key)** — Simplificado, sem necessidade de projeto GCP:
```typescript
const vertex = createVertex({
  apiKey: process.env.GOOGLE_VERTEX_API_KEY,
});
```

Para **Edge Runtime** (Vercel Edge Functions), use o import `/edge`:
```typescript
import { vertex } from '@ai-sdk/google-vertex/edge';
```

Variáveis de ambiente necessárias: `GOOGLE_VERTEX_PROJECT`, `GOOGLE_VERTEX_LOCATION`, e credenciais (ADC, service account JSON, ou API key).

### Google AI Studio vs Vertex AI

A diferença fundamental é **prototyping vs produção**. Google AI Studio (`@ai-sdk/google`) oferece setup simples com API key, free tier generoso, e pricing potencialmente mais barato (~50% menos por token segundo relatos da comunidade). Vertex AI (`@ai-sdk/google-vertex`) oferece **SLAs enterprise**, **VPC Service Controls**, **data residency**, dados nunca usados para treinar modelos, cotas aumentáveis, e acesso a modelos third-party (Claude, Llama via Model Garden). Para produção com requisitos de compliance, Vertex AI é a escolha clara. Para prototipação rápida, AI Studio é mais ágil.

---

## 5. Padrões de integração entre as tecnologias

### O pacote firecrawl-aisdk: integração oficial

A integração mais direta usa o pacote oficial `firecrawl-aisdk`, listado no tools registry do AI SDK:

```bash
npm install firecrawl-aisdk ai @ai-sdk/google-vertex @ai-sdk/react
```

Este pacote exporta ferramentas pré-construídas que plugam diretamente no `generateText`/`streamText`:

```typescript
import { scrape, search, FirecrawlTools } from 'firecrawl-aisdk';

// Opção 1: Ferramentas individuais
const result = streamText({
  model: vertex('gemini-2.5-flash'),
  tools: { scrape, search },
  stopWhen: stepCountIs(5),
  prompt: 'Search and analyze...',
});

// Opção 2: Bundle completo com system prompt auto-gerado
const result = streamText({
  model: vertex('gemini-2.5-flash'),
  tools: FirecrawlTools(),
  prompt: 'Research this topic...',
});
```

Ferramentas disponíveis: `scrape`, `search`, `map`, `crawl`, `batchScrape`, `agent`, `extract`, `poll`, `status`, `cancel`, `browser`. Todas leem `FIRECRAWL_API_KEY` do environment automaticamente. Importante: **as tools são provider-agnostic** — funcionam identicamente com Gemini, Claude, GPT ou qualquer provider do AI SDK.

### Implementação completa: API Route + React UI

**Server (app/api/chat/route.ts):**
```typescript
import { streamText, UIMessage, stepCountIs, convertToModelMessages } from 'ai';
import { vertex } from '@ai-sdk/google-vertex';
import { scrape, search } from 'firecrawl-aisdk';

export const maxDuration = 300; // 5 min para Vercel Pro

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();
  const result = streamText({
    model: vertex('gemini-2.5-flash'),
    messages: await convertToModelMessages(messages),
    system: `You are a research assistant. Use search to find information,
             then scrape specific URLs for detailed content. Cite sources.`,
    tools: { scrape, search },
    stopWhen: stepCountIs(5),
    toolChoice: 'auto',
  });
  return result.toUIMessageStreamResponse({ sendSources: true, sendReasoning: true });
}
```

**Client (app/page.tsx):**
```typescript
'use client';
import { useChat } from '@ai-sdk/react';

export default function Chat() {
  const { messages, sendMessage, status } = useChat();
  return (
    <div>
      {messages.map((msg) => (
        <div key={msg.id}>
          {msg.parts.map((part, i) => {
            if (part.type === 'text') return <p key={i}>{part.text}</p>;
            if (part.type.startsWith('tool-'))
              return <ToolCallIndicator key={i} part={part} />;
            return null;
          })}
        </div>
      ))}
      <ChatInput onSend={(text) => sendMessage({ text })}
                 disabled={status === 'streaming'} />
    </div>
  );
}
```

### Fluxo de dados completo

O fluxo percorre cinco camadas em sequência:

1. **React UI** → `useChat.sendMessage()` envia POST para `/api/chat` com `UIMessage[]`
2. **API Route** → `convertToModelMessages()` converte para formato do modelo, `streamText()` inicia a geração
3. **Vertex AI (Gemini)** → Modelo analisa o prompt e decide chamar `search` ou `scrape` via function calling
4. **Firecrawl API** → Tool é executada server-side, retorna markdown/dados estruturados
5. **Resposta** → Resultado da tool é alimentado de volta ao Gemini → modelo sintetiza resposta final → stream SSE volta para `useChat` → UI atualiza em tempo real

O `stopWhen: stepCountIs(5)` permite até 5 rounds deste loop. Um padrão típico de pesquisa: Step 1 (search) → Step 2 (scrape URL 1) → Step 3 (scrape URL 2) → Step 4 (síntese final em texto).

### Padrões RAG com Firecrawl + Gemini

**RAG em tempo real via tool calling** (recomendado): O modelo decide quando buscar dados. É o padrão mais natural com o AI SDK — o Gemini chama `search`, analisa resultados, chama `scrape` em URLs específicas, e sintetiza com o conteúdo coletado.

**RAG com pre-fetch**: Para bases de conhecimento, crawl antecipado com Firecrawl, armazenamento em vector store (e.g., Upstash Vector), retrieval semântico na hora da query, e uso do conteúdo como contexto para Gemini. O template **Firestarter** do Firecrawl implementa exatamente este padrão.

### Error handling e retry

Erros do Firecrawl devem ser classificados: **401/404** → não repetir; **429 (rate limit)** → retry com exponential backoff; **408/500/502/503** → retry com backoff. Dentro da função `execute` da tool, retorne informação de erro em vez de lançar exceções — isso permite que o Gemini reaja inteligentemente (tentando outra URL ou abordagem). O `stopWhen` previne loops infinitos. Para timeouts em Vercel, configure `maxDuration` adequadamente (até 300s no plano Pro).

```typescript
execute: async ({ url }) => {
  try {
    const result = await firecrawl.scrape(url, { formats: ['markdown'], timeout: 30000 });
    if (!result.success) return { success: false, error: result.error };
    return { success: true, content: result.markdown?.substring(0, 10000) };
  } catch (error) {
    return { success: false, error: error.message };
  }
},
```

---

## 6. Trade-offs e alternativas avaliadas

### Web scraping: por que Firecrawl

Firecrawl vence para pipelines LLM por gerar **Markdown limpo nativamente**, eliminar necessidade de infraestrutura, e oferecer integração oficial com AI SDK. Puppeteer/Playwright oferecem controle granular de browser mas exigem infraestrutura própria e código de extração manual. Cheerio é ultrarrápido para HTML estático mas não renderiza JavaScript. Crawlee (Apify) oferece controle total open-source (Apache-2.0) mas requer self-hosting e não gera Markdown nativo. Jina Reader API é uma alternativa leve baseada em ML (ReaderLM-v2) com pricing por tokens, competitiva para conversões simples URL→Markdown. O diferencial do Firecrawl está na **integração end-to-end**: de search a crawl a extração estruturada, tudo via API com SDKs para múltiplas linguagens e integrações nativas com frameworks AI.

### AI SDK: por que Vercel AI SDK sobre LangChain.js

Vercel AI SDK oferece a **melhor developer experience** para aplicações TypeScript/React com streaming. Bundle ~67.5 kB (vs ~101.2 kB do LangChain), suporte nativo a Edge runtime, hooks React prontos para uso, e latência p99 ~30ms (vs ~45-50ms do LangChain). LangChain.js é superior em orquestração complexa de agentes (LangGraph), RAG pipelines completos (document loaders, vector stores integrados), e observabilidade (LangSmith). Para o caso de uso desta ADR — chat com web scraping e streaming UI — o Vercel AI SDK é a escolha mais ergonômica. Para pipelines RAG complexos com múltiplos vector stores, LangChain pode complementar.

### Modelo: por que Gemini 2.5 Flash para esta stack

Para análise e extração de conteúdo web, Gemini 2.5 Flash oferece a melhor relação custo-performance:

| Modelo | Input/1M | Output/1M | Context | Vantagem |
|---|---|---|---|---|
| **Gemini 2.5 Flash** | $0.30 | $2.50 | **1M tokens** | Melhor custo-benefício, thinking controlável |
| Gemini 2.5 Pro | $1.25 | $10.00 | 1M | Raciocínio profundo, ~4x mais caro |
| GPT-4o | $2.50 | $10.00 | 128K | Ecossistema OpenAI, ~8x mais caro |
| Claude Sonnet 4.5 | $3.00 | $15.00 | 200K | Precisão em coding, ~10x mais caro |

O **context window de 1M tokens** é crucial — permite processar páginas web extensas sem truncation. O **thinking mode controlável** permite optimizar: `thinkingBudget: 0` para extrações simples e rápidas, budget alto para análises complexas. A velocidade de **~220 tokens/seg** viabiliza processamento em tempo real.

---

## 7. Decisões e recomendações

### Stack recomendada

| Camada | Tecnologia | Package |
|---|---|---|
| **Web Scraping** | Firecrawl | `firecrawl-aisdk` + `@mendable/firecrawl-js` |
| **Orquestração AI** | Vercel AI SDK v6 | `ai` |
| **UI** | AI SDK React | `@ai-sdk/react` |
| **Modelo** | Gemini 2.5 Flash via Vertex AI | `@ai-sdk/google-vertex` |
| **Framework** | Next.js App Router | Route Handlers para API |

### Variáveis de ambiente necessárias

```bash
FIRECRAWL_API_KEY=fc-your-key
GOOGLE_VERTEX_PROJECT=your-gcp-project
GOOGLE_VERTEX_LOCATION=us-central1
GOOGLE_APPLICATION_CREDENTIALS=./service-account.json
# Ou para Express Mode: GOOGLE_VERTEX_API_KEY=your-key
```

### Riscos e mitigações

**Risco 1: Custos de Firecrawl em escala.** Mitigação: Monitorar uso de créditos, implementar cache de scrapes recentes (Firecrawl's Semantic Index com `maxAge`), usar `onlyMainContent: true` e limitar tamanho de resposta.

**Risco 2: Latência acumulada em multi-step tool calling.** Cada step adiciona latência de Firecrawl (~2-5s/scrape) + Gemini (~0.5s TTFT). Um fluxo de 4 steps pode levar 15-25s. Mitigação: Configurar `maxDuration: 300` no Vercel, usar streaming para feedback progressivo na UI, e `thinkingBudget: 0` quando speed é prioridade.

**Risco 3: Lock-in no provider.** Mitigação mínima — o Vercel AI SDK abstrai providers, permitindo trocar Gemini por Claude ou GPT-4o alterando apenas a linha do modelo. Firecrawl pode ser substituído por tools customizados com Puppeteer/Playwright se necessário.

**Risco 4: Vertex AI auth complexity.** Mitigação: Usar Express Mode (API key) para desenvolvimento e protótipos; Service Account + ADC para produção. O Express Mode simplifica significativamente o setup inicial.

## Conclusão

Esta arquitetura explora o padrão emergente de **AI-driven web research** onde o modelo LLM orquestra suas próprias fontes de dados. A combinação de Firecrawl (web→markdown de alta qualidade), Vercel AI SDK v6 (orquestração type-safe com streaming nativo), `useChat` (UI React com estado gerenciado), e Gemini 2.5 Flash (1M context, thinking controlável, pricing agressivo) forma uma stack coesa onde cada componente é o melhor da categoria para seu papel específico. O ponto arquitetural mais relevante é que a integração oficial `firecrawl-aisdk` é **provider-agnostic** — toda a lógica de tools, UI e streaming permanece idêntica ao trocar o modelo, tornando a migração entre Gemini, Claude e GPT uma mudança de uma única linha de código.