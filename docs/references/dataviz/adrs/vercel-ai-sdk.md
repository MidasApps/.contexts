# ADR-001: Adoção do Vercel AI SDK v6 para Integração com LLMs

**Data:** 2025-02-03  
**Status:** Aceita  
**Versão SDK:** 6.x (6.0.68+)  
**Decisores:** Equipe de Arquitetura  
**Categoria:** Infraestrutura de IA / SDK

---

## Sumário Executivo

Este documento registra a decisão arquitetural de adotar o **Vercel AI SDK v6** como camada de abstração para integração com Large Language Models (LLMs) em um projeto TypeScript com backend **Next.js** e frontend **React**.

O AI SDK v6 oferece uma arquitetura unificada para:
- **AI SDK Core**: Funções fundamentais (`generateText`, `streamText`, `generateObject`, etc.)
- **AI SDK UI**: Hooks React para interfaces de chat (`useChat`, `useCompletion`, `useObject`)
- **AI SDK RSC**: Integração com React Server Components
- **Multi-Provider Support**: OpenAI, Anthropic, Google, Mistral, Cohere, e mais

---

## 1. Contexto

### 1.1 Cenário do Projeto

O projeto requer:
- Integração com múltiplos provedores de LLM (OpenAI, Anthropic, Google, etc.)
- Backend em **Next.js 14+** com App Router
- Frontend em **React 18+** com TypeScript
- Experiência de usuário com **streaming em tempo real**
- Suporte a múltiplos casos de uso: chat, completions, geração estruturada, tools, embeddings, imagens

### 1.2 Mudanças Significativas na v6

A versão 6 do AI SDK introduz mudanças arquiteturais importantes:

| Aspecto | v3.x (Antiga) | v6.x (Atual) |
|---------|---------------|--------------|
| Import React hooks | `ai/react` | `@ai-sdk/react` |
| Configuração de API | `api: '/api/chat'` | `transport: new DefaultChatTransport({ api })` |
| Conteúdo das mensagens | `message.content` (string) | `message.parts` (array tipado) |
| Enviar mensagem | `handleSubmit()` | `sendMessage({ text })` |
| Estado de loading | `isLoading: boolean` | `status: 'ready' \| 'submitted' \| 'streaming' \| 'error'` |
| Regenerar resposta | `reload()` | `regenerate()` |
| Response do backend | `toDataStreamResponse()` | `toUIMessageStreamResponse()` |
| Conversão de mensagens | `convertToCoreMessages()` | `convertToModelMessages()` |
| Tipo de mensagens | `Message` | `UIMessage` |
| Structured Output | `generateObject()` | `generateText()` + `Output.object()` |
| Multi-step tools | `maxToolRoundtrips` | `stopWhen: stepCountIs(n)` |
| Global Provider | N/A | `gateway('provider/model')` |

---

## 2. Decisão

**Adotamos o Vercel AI SDK v6 (`ai` package) como solução principal para integração com LLMs.**

### 2.1 Pacotes Necessários

```bash
# Core SDK (v6.x)
npm install ai@^6.0.0

# React hooks (separado na v6)
npm install @ai-sdk/react

# Providers (instale conforme necessidade)
npm install @ai-sdk/openai      # OpenAI / Azure OpenAI
npm install @ai-sdk/anthropic   # Anthropic Claude
npm install @ai-sdk/google      # Google AI (Gemini)
npm install @ai-sdk/mistral     # Mistral AI
npm install @ai-sdk/cohere      # Cohere
npm install @ai-sdk/groq        # Groq
npm install @ai-sdk/xai         # xAI (Grok)

# Validação de schema (para structured output e tools)
npm install zod

# Opcional: MCP (Model Context Protocol)
npm install @modelcontextprotocol/sdk
```

### 2.2 Modelos Recomendados por Provider

| Provider | Modelo | Caso de Uso |
|----------|--------|-------------|
| **OpenAI** | `gpt-4o` | Tarefas complexas, multimodal |
| | `gpt-4o-mini` | Alto volume, custo-efetivo |
| | `gpt-4-turbo` | Contexto longo (128k) |
| | `o1`, `o1-mini` | Reasoning avançado |
| **Anthropic** | `claude-opus-4.1` | Máxima capacidade |
| | `claude-sonnet-4.5` | Balance performance/custo |
| | `claude-haiku-4.5` | Velocidade, baixo custo |
| **Google** | `gemini-2.5-flash` | Rápido, multimodal |
| | `gemini-2.5-pro` | Mais capaz |
| **Mistral** | `mistral-large` | Tarefas complexas |
| | `mistral-small` | Eficiente |

### 2.3 Global Provider (Gateway)

O AI SDK v6 inclui um provider global que simplifica o acesso aos modelos:

```typescript
import { streamText, gateway } from 'ai';

const result = streamText({
  model: gateway('openai/gpt-4o-mini'), // Usa o gateway global
  prompt: 'Hello!',
});
```

Você pode customizar o provider global:

```typescript
// setup.ts - Execute uma vez na inicialização
import { openai } from '@ai-sdk/openai';
globalThis.AI_SDK_DEFAULT_PROVIDER = openai;

// app.ts - Use sem prefixo
const result = await streamText({
  model: 'gpt-4o-mini', // Usa OpenAI diretamente
  prompt: 'Hello!',
});
```

---

## 3. Arquitetura da Solução

### 3.1 Visão Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                useChat() Hook (@ai-sdk/react)            │   │
│  │  • messages: UIMessage[]                                 │   │
│  │  • sendMessage({ text }): void                           │   │
│  │  • status: 'ready' | 'submitted' | 'streaming' | 'error' │   │
│  │  • regenerate(): void                                    │   │
│  │  • stop(): void                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              │ DefaultChatTransport             │
│                              ▼                                  │
├─────────────────────────────────────────────────────────────────┤
│                      BACKEND (Next.js API)                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Route Handler (App Router)                  │   │
│  │  • POST /api/chat                                        │   │
│  │  • streamText() + toUIMessageStreamResponse()            │   │
│  │  • convertToModelMessages()                              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
├─────────────────────────────────────────────────────────────────┤
│                    VERCEL AI SDK CORE                           │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  @ai-sdk/openai Provider                                 │   │
│  │  • Abstração do modelo                                   │   │
│  │  • UI Message Stream Protocol                            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │               OpenAI API (api.openai.com)                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Estrutura de Diretórios

```
src/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # API Route Handler
│   ├── layout.tsx
│   └── page.tsx
├── components/
│   ├── chat/
│   │   ├── ChatContainer.tsx     # Container principal
│   │   ├── ChatMessages.tsx      # Lista de mensagens
│   │   ├── ChatInput.tsx         # Input do usuário
│   │   └── MessageParts.tsx      # Renderização de parts
│   └── ui/
├── lib/
│   ├── ai/
│   │   ├── config.ts             # Configuração do provider
│   │   ├── tools.ts              # Definição de tools
│   │   └── schemas.ts            # Zod schemas
│   └── utils/
└── types/
    └── chat.ts                   # Tipos customizados
```

---

## 4. AI SDK Core - Funções Fundamentais

O AI SDK Core fornece as funções fundamentais para interação com LLMs. Esta seção documenta todas as capacidades disponíveis.

### 4.1 Geração de Texto

#### `generateText` - Geração Não-Streaming

Para casos não-interativos como redação de emails, resumos, ou agentes com tools:

```typescript
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

const { text } = await generateText({
  model: openai('gpt-4o-mini'),
  prompt: 'Escreva uma receita de lasanha vegetariana.',
});
```

**Prompts Avançados:**

```typescript
const { text } = await generateText({
  model: openai('gpt-4o'),
  system: 'Você é um escritor profissional. Escreva de forma simples e clara.',
  prompt: `Resuma o seguinte artigo em 3-5 frases: ${article}`,
});
```

**Propriedades do Resultado:**

```typescript
const result = await generateText({ ... });

// Conteúdo
result.text;                  // Texto gerado
result.content;               // Conteúdo completo (incluindo tool calls)
result.reasoning;             // Raciocínio do modelo (se disponível)
result.reasoningText;         // Texto de reasoning
result.files;                 // Arquivos gerados
result.sources;               // Fontes usadas (RAG)

// Tool calls
result.toolCalls;             // Tool calls feitas
result.toolResults;           // Resultados das tools

// Metadata
result.finishReason;          // Razão do término ('stop', 'tool-calls', etc.)
result.usage;                 // Uso de tokens (final step)
result.totalUsage;            // Uso total (multi-step)
result.warnings;              // Avisos do provider
result.steps;                 // Detalhes de cada step

// Response
result.response.headers;      // Headers HTTP
result.response.body;         // Body da resposta
result.response.messages;     // Mensagens geradas

// Provider
result.providerMetadata;      // Metadata específica do provider
```

**Callback `onFinish`:**

```typescript
const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Invente um feriado.',
  onFinish({ text, finishReason, usage, response, steps, totalUsage }) {
    // Log, save to database, etc.
    const messages = response.messages;
  },
});
```

#### `streamText` - Streaming em Tempo Real

Para interfaces interativas como chatbots:

```typescript
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

const result = streamText({
  model: openai('gpt-4o-mini'),
  prompt: 'Invente um feriado e descreva suas tradições.',
});

// textStream é ReadableStream E AsyncIterable
for await (const textPart of result.textStream) {
  process.stdout.write(textPart);
}
```

> **Nota:** `streamText` inicia streaming imediatamente e suprime erros para evitar crashes. Use o callback `onError` para logging.

**Métodos de Response:**

```typescript
// Para Next.js App Router
return result.toUIMessageStreamResponse();

// Para Node.js response-like objects
result.pipeUIMessageStreamToResponse(res);

// Stream de texto simples
return result.toTextStreamResponse();
result.pipeTextStreamToResponse(res);
```

**Callbacks Disponíveis:**

```typescript
const result = streamText({
  model: openai('gpt-4o'),
  prompt: '...',
  
  // Erro durante streaming
  onError({ error }) {
    console.error(error);
  },
  
  // A cada chunk recebido
  onChunk({ chunk }) {
    // chunk.type: 'text', 'reasoning', 'source', 'tool-call', 
    //             'tool-input-start', 'tool-input-delta', 'tool-result', 'raw'
    if (chunk.type === 'text') {
      console.log(chunk.text);
    }
  },
  
  // Quando streaming termina
  onFinish({ text, finishReason, usage, response, steps, totalUsage }) {
    const messages = response.messages;
  },
  
  // Quando stream é abortado
  onAbort({ steps }) {
    console.log('Stream abortado após', steps.length, 'steps');
  },
});
```

**fullStream - Stream Completo com Todos os Eventos:**

```typescript
for await (const part of result.fullStream) {
  switch (part.type) {
    case 'start':              // Início do stream
    case 'start-step':         // Início de um step
    case 'text-start':         // Início de texto
    case 'text-delta':         // Delta de texto
    case 'text-end':           // Fim de texto
    case 'reasoning-start':    // Início de reasoning
    case 'reasoning-delta':    // Delta de reasoning
    case 'reasoning-end':      // Fim de reasoning
    case 'source':             // Fonte (RAG)
    case 'file':               // Arquivo gerado
    case 'tool-call':          // Tool call
    case 'tool-input-start':   // Início de input de tool
    case 'tool-input-delta':   // Delta de input de tool
    case 'tool-input-end':     // Fim de input de tool
    case 'tool-result':        // Resultado de tool
    case 'tool-error':         // Erro de tool
    case 'finish-step':        // Fim de step
    case 'finish':             // Fim do stream
    case 'error':              // Erro
    case 'abort':              // Stream abortado
    case 'raw':                // Valor raw do provider
      break;
  }
}
```

**Transformação de Stream:**

```typescript
import { smoothStream, streamText } from 'ai';

// Suavização integrada
const result = streamText({
  model: openai('gpt-4o'),
  prompt: '...',
  experimental_transform: smoothStream(),
});

// Transformação customizada
const upperCaseTransform = () => 
  (options) => 
    new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(
          chunk.type === 'text-delta'
            ? { ...chunk, text: chunk.text.toUpperCase() }
            : chunk,
        );
      },
    });

// Múltiplas transformações (aplicadas em ordem)
const result = streamText({
  model,
  prompt,
  experimental_transform: [firstTransform, secondTransform],
});
```

### 4.2 Geração de Dados Estruturados

#### Usando `Output.object()`

```typescript
import { generateText, Output } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';

const { output } = await generateText({
  model: openai('gpt-4o'),
  output: Output.object({
    schema: z.object({
      recipe: z.object({
        name: z.string(),
        ingredients: z.array(
          z.object({ name: z.string(), amount: z.string() }),
        ),
        steps: z.array(z.string()),
      }),
    }),
  }),
  prompt: 'Gere uma receita de lasanha.',
});
```

#### Tipos de Output

**`Output.text()`** - Texto simples (default):
```typescript
const { output } = await generateText({
  output: Output.text(),
  prompt: 'Conte uma piada.',
});
```

**`Output.object({ schema })`** - Objeto estruturado:
```typescript
const { output } = await generateText({
  output: Output.object({
    name: 'Recipe',
    description: 'Uma receita culinária',
    schema: z.object({
      name: z.string().describe('Nome da receita'),
      ingredients: z.array(z.string()).describe('Lista de ingredientes'),
    }),
  }),
  prompt: 'Gere uma receita.',
});
```

**`Output.array({ element })`** - Array de objetos:
```typescript
const { output } = await generateText({
  output: Output.array({
    element: z.object({
      location: z.string(),
      temperature: z.number(),
    }),
  }),
  prompt: 'Liste o clima de 3 cidades.',
});
```

**`Output.choice({ options })`** - Escolha entre opções (classificação):
```typescript
const { output } = await generateText({
  output: Output.choice({
    options: ['sunny', 'rainy', 'snowy'],
  }),
  prompt: 'Como está o tempo hoje?',
});
// output será: 'sunny' | 'rainy' | 'snowy'
```

**`Output.json()`** - JSON não estruturado:
```typescript
const { output } = await generateText({
  output: Output.json(),
  prompt: 'Retorne dados sobre cidades como JSON.',
});
```

#### Streaming de Objetos Estruturados

```typescript
import { streamText, Output } from 'ai';

const { partialOutputStream } = streamText({
  model: openai('gpt-4o'),
  output: Output.object({
    schema: z.object({
      recipe: z.object({
        name: z.string(),
        ingredients: z.array(z.object({ name: z.string(), amount: z.string() })),
        steps: z.array(z.string()),
      }),
    }),
  }),
  prompt: 'Gere uma receita.',
});

for await (const partialObject of partialOutputStream) {
  console.log(partialObject); // Objeto parcial à medida que é gerado
}
```

**Streaming de Arrays com Elementos Completos:**

```typescript
const { elementStream } = streamText({
  output: Output.array({
    element: z.object({
      name: z.string(),
      class: z.string(),
      description: z.string(),
    }),
  }),
  prompt: 'Gere 3 descrições de heróis.',
});

for await (const hero of elementStream) {
  console.log(hero); // Cada herói é completo e validado
}
```

#### Erro `NoObjectGeneratedError`

```typescript
import { generateText, Output, NoObjectGeneratedError } from 'ai';

try {
  await generateText({
    model,
    output: Output.object({ schema }),
    prompt,
  });
} catch (error) {
  if (NoObjectGeneratedError.isInstance(error)) {
    console.log('Texto gerado:', error.text);
    console.log('Causa:', error.cause);
    console.log('Response:', error.response);
    console.log('Usage:', error.usage);
  }
}
```

### 4.3 Tool Calling

#### Definição de Tools

```typescript
import { tool } from 'ai';
import { z } from 'zod';

const weatherTool = tool({
  description: 'Obtém o clima de uma localização',
  inputSchema: z.object({
    location: z.string().describe('A localização para buscar o clima'),
  }),
  execute: async ({ location }) => ({
    location,
    temperature: 72 + Math.floor(Math.random() * 21) - 10,
  }),
});
```

**Strict Mode** (validação rigorosa):
```typescript
tool({
  description: 'Executa um comando',
  inputSchema: z.object({ command: z.string() }),
  strict: true, // Validação rigorosa (suportado por alguns providers)
  execute: async ({ command }) => { ... },
});
```

**Input Examples** (apenas Anthropic):
```typescript
tool({
  description: 'Obtém o clima',
  inputSchema: z.object({ location: z.string() }),
  inputExamples: [
    { input: { location: 'San Francisco' } },
    { input: { location: 'London' } },
  ],
  execute: async ({ location }) => { ... },
});
```

#### Tool Execution Approval

```typescript
const runCommand = tool({
  description: 'Executa um comando shell',
  inputSchema: z.object({
    command: z.string().describe('O comando a executar'),
  }),
  needsApproval: true, // Requer aprovação
  execute: async ({ command }) => { ... },
});

// Aprovação dinâmica baseada no input
const paymentTool = tool({
  description: 'Processa pagamento',
  inputSchema: z.object({
    amount: z.number(),
    recipient: z.string(),
  }),
  needsApproval: async ({ amount }) => amount > 1000, // Só acima de $1000
  execute: async ({ amount, recipient }) => { ... },
});
```

**Fluxo de Aprovação:**

```typescript
import { type ModelMessage, generateText, type ToolApprovalResponse } from 'ai';

const messages: ModelMessage[] = [
  { role: 'user', content: 'Delete o arquivo mais recente' },
];

const result = await generateText({
  model: openai('gpt-4o'),
  tools: { runCommand },
  messages,
});

messages.push(...result.response.messages);

// Verificar requests de aprovação
const approvals: ToolApprovalResponse[] = [];
for (const part of result.content) {
  if (part.type === 'tool-approval-request') {
    approvals.push({
      type: 'tool-approval-response',
      approvalId: part.approvalId,
      approved: true, // ou false para negar
      reason: 'Usuário confirmou',
    });
  }
}

// Adicionar aprovações e chamar novamente
messages.push({ role: 'tool', content: approvals });
const finalResult = await generateText({ model, tools, messages });
```

#### Multi-Step Calls com `stopWhen`

```typescript
import { generateText, tool, stepCountIs } from 'ai';

const { text, steps } = await generateText({
  model: openai('gpt-4o'),
  tools: { weather: weatherTool },
  stopWhen: stepCountIs(5), // Máximo 5 steps
  prompt: 'Qual o clima em São Paulo?',
});

// Acessar tool calls de todos os steps
const allToolCalls = steps.flatMap(step => step.toolCalls);
```

**Callbacks de Step:**

```typescript
const result = await generateText({
  // ...
  onStepFinish({ text, toolCalls, toolResults, finishReason, usage }) {
    // Executado após cada step
  },
});
```

**`prepareStep` - Configuração Dinâmica por Step:**

```typescript
const result = await generateText({
  // ...
  prepareStep: async ({ model, stepNumber, steps, messages }) => {
    if (stepNumber === 0) {
      return {
        model: modelForThisStep, // Modelo diferente
        toolChoice: { type: 'tool', toolName: 'tool1' }, // Forçar tool
        activeTools: ['tool1'], // Limitar tools disponíveis
      };
    }
    // Compressão de contexto para loops longos
    if (messages.length > 20) {
      return { messages: messages.slice(-10) };
    }
    return {};
  },
});
```

#### Dynamic Tools

Para tools com schemas desconhecidos em compile-time:

```typescript
import { dynamicTool } from 'ai';

const customTool = dynamicTool({
  description: 'Executa uma função customizada',
  inputSchema: z.object({}),
  execute: async input => {
    const { action, parameters } = input as any;
    return { result: `Executou ${action}` };
  },
});

// Type-safe handling com dynamic flag
const result = await generateText({
  tools: { weather: weatherTool, custom: customTool },
  onStepFinish: ({ toolCalls }) => {
    for (const toolCall of toolCalls) {
      if (toolCall.dynamic) {
        // Dynamic tool: input é 'unknown'
        console.log('Dynamic:', toolCall.toolName, toolCall.input);
      } else {
        // Static tool: tipos inferidos
        switch (toolCall.toolName) {
          case 'weather':
            console.log(toolCall.input.location);
            break;
        }
      }
    }
  },
});
```

#### Tool Execution Options

```typescript
const myTool = tool({
  // ...
  execute: async (args, options) => {
    // ID do tool call
    const { toolCallId } = options;
    
    // Histórico de mensagens
    const { messages } = options;
    
    // Sinal de abort
    const { abortSignal } = options;
    
    // Contexto customizado
    const { experimental_context } = options;
    
    return fetch(url, { signal: abortSignal });
  },
});

// Passar contexto
const result = await generateText({
  tools: { myTool },
  experimental_context: { userId: '123' },
});
```

#### Tool Input Lifecycle Hooks

```typescript
const getWeather = tool({
  description: 'Obtém o clima',
  inputSchema: z.object({ location: z.string() }),
  execute: async ({ location }) => ({ temperature: 72 }),
  
  // Apenas em streamText
  onInputStart: () => {
    console.log('Tool call iniciando');
  },
  onInputDelta: ({ inputTextDelta }) => {
    console.log('Chunk de input:', inputTextDelta);
  },
  onInputAvailable: ({ input }) => {
    console.log('Input completo:', input);
  },
});
```

#### Preliminary Tool Results

```typescript
tool({
  description: 'Obtém o clima',
  inputSchema: z.object({ location: z.string() }),
  async *execute({ location }) {
    yield {
      status: 'loading' as const,
      text: `Buscando clima para ${location}`,
      weather: undefined,
    };

    await new Promise(resolve => setTimeout(resolve, 3000));

    const temperature = 72 + Math.floor(Math.random() * 21) - 10;

    yield {
      status: 'success' as const,
      text: `O clima em ${location} é ${temperature}°F`,
      temperature,
    };
  },
});
```

#### Tool Choice

```typescript
const result = await generateText({
  tools: { weather: weatherTool },
  toolChoice: 'auto',    // (default) modelo escolhe
  // toolChoice: 'required', // deve chamar alguma tool
  // toolChoice: 'none',     // não pode chamar tools
  // toolChoice: { type: 'tool', toolName: 'weather' }, // forçar tool específica
});
```

#### Active Tools

Limita tools disponíveis para o modelo:

```typescript
const { text } = await generateText({
  tools: myToolSet, // Muitas tools definidas
  activeTools: ['firstTool'], // Apenas esta disponível
});
```

#### Tool Error Handling

```typescript
import { NoSuchToolError, InvalidToolInputError } from 'ai';

try {
  const result = await generateText({ ... });
} catch (error) {
  if (NoSuchToolError.isInstance(error)) {
    // Modelo tentou chamar tool inexistente
  } else if (InvalidToolInputError.isInstance(error)) {
    // Inputs inválidos para a tool
  }
}

// Em streamText, erros são partes do stream
for await (const part of result.fullStream) {
  if (part.type === 'tool-error') {
    console.log('Tool error:', part.error);
  }
}
```

#### Tool Call Repair

```typescript
const result = await generateText({
  model,
  tools,
  prompt,
  experimental_repairToolCall: async ({ toolCall, tools, inputSchema, error }) => {
    if (NoSuchToolError.isInstance(error)) {
      return null; // Não tentar reparar nomes inválidos
    }
    
    // Usar modelo com structured output para reparar
    const { object: repairedArgs } = await generateObject({
      model: openai('gpt-4o'),
      schema: tools[toolCall.toolName].inputSchema,
      prompt: `Corrija os inputs: ${JSON.stringify(toolCall.input)}`,
    });
    
    return { ...toolCall, input: JSON.stringify(repairedArgs) };
  },
});
```

#### Multi-modal Tool Results

```typescript
const result = await generateText({
  tools: {
    screenshot: tool({
      // ...
      execute: async () => ({
        type: 'image',
        data: fs.readFileSync('./screenshot.png').toString('base64'),
      }),
      
      toModelOutput({ output }) {
        return {
          type: 'content',
          value: typeof output === 'string'
            ? [{ type: 'text', text: output }]
            : [{ type: 'media', data: output.data, mediaType: 'image/png' }],
        };
      },
    }),
  },
});
```

### 4.4 Model Context Protocol (MCP)

#### Criando Cliente MCP

**HTTP Transport (Recomendado para Produção):**

```typescript
import { createMCPClient } from '@ai-sdk/mcp';

const mcpClient = await createMCPClient({
  transport: {
    type: 'http',
    url: 'https://your-server.com/mcp',
    headers: { Authorization: 'Bearer my-api-key' },
    authProvider: myOAuthClientProvider, // opcional
  },
});
```

**SSE Transport:**

```typescript
const mcpClient = await createMCPClient({
  transport: {
    type: 'sse',
    url: 'https://my-server.com/sse',
    headers: { Authorization: 'Bearer token' },
  },
});
```

**Stdio Transport (Apenas Local):**

```typescript
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const mcpClient = await createMCPClient({
  transport: new StdioClientTransport({
    command: 'node',
    args: ['src/server.js'],
  }),
});
```

#### Usando MCP Tools

```typescript
// Schema Discovery (automático)
const tools = await mcpClient.tools();

// Schema Definition (tipagem explícita)
const tools = await mcpClient.tools({
  schemas: {
    'get-data': {
      inputSchema: z.object({
        query: z.string(),
        format: z.enum(['json', 'text']).optional(),
      }),
    },
    'no-args-tool': {
      inputSchema: z.object({}),
    },
  },
});

// Com output tipado
const tools = await mcpClient.tools({
  schemas: {
    'get-weather': {
      inputSchema: z.object({ location: z.string() }),
      outputSchema: z.object({
        temperature: z.number(),
        conditions: z.string(),
      }),
    },
  },
});
```

#### Usando MCP Resources

```typescript
// Listar recursos
const resources = await mcpClient.listResources();

// Ler conteúdo de recurso
const resourceData = await mcpClient.readResource({
  uri: 'file:///example/document.txt',
});

// Listar templates de recursos
const templates = await mcpClient.listResourceTemplates();
```

#### Usando MCP Prompts

```typescript
const prompts = await mcpClient.experimental_listPrompts();

const prompt = await mcpClient.experimental_getPrompt({
  name: 'code_review',
  arguments: { code: 'function add(a, b) { return a + b; }' },
});
```

#### Fechando o Cliente

```typescript
// Com streaming
const result = await streamText({
  tools: await mcpClient.tools(),
  onFinish: async () => {
    await mcpClient.close();
  },
});

// Sem streaming
try {
  const tools = await mcpClient.tools();
  // ...
} finally {
  await mcpClient?.close();
}
```

### 4.5 Embeddings

#### Embedding Único

```typescript
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

const { embedding } = await embed({
  model: openai.embeddingModel('text-embedding-3-small'),
  value: 'dia ensolarado na praia',
});
```

#### Múltiplos Embeddings (Batch)

```typescript
import { embedMany } from 'ai';

const { embeddings } = await embedMany({
  model: openai.embeddingModel('text-embedding-3-small'),
  values: [
    'dia ensolarado na praia',
    'tarde chuvosa na cidade',
    'noite nevada nas montanhas',
  ],
});
```

#### Similaridade de Embeddings

```typescript
import { cosineSimilarity, embedMany } from 'ai';

const { embeddings } = await embedMany({
  model: openai.embeddingModel('text-embedding-3-small'),
  values: ['dia ensolarado', 'tarde chuvosa'],
});

console.log(`Similaridade: ${cosineSimilarity(embeddings[0], embeddings[1])}`);
```

#### Configurações

```typescript
const { embedding, usage, response } = await embed({
  model: openai.embeddingModel('text-embedding-3-small'),
  value: 'texto',
  maxRetries: 0,              // Desabilitar retries
  abortSignal: AbortSignal.timeout(1000),
  headers: { 'X-Custom': 'value' },
  providerOptions: {
    openai: { dimensions: 512 },
  },
});

// embedMany com paralelismo
const { embeddings } = await embedMany({
  model,
  values,
  maxParallelCalls: 2,
});
```

#### Modelos de Embedding

| Provider | Modelo | Dimensões |
|----------|--------|-----------|
| OpenAI | `text-embedding-3-large` | 3072 |
| OpenAI | `text-embedding-3-small` | 1536 |
| Google | `gemini-embedding-001` | 3072 |
| Mistral | `mistral-embed` | 1024 |
| Cohere | `embed-english-v3.0` | 1024 |

### 4.6 Reranking

```typescript
import { rerank } from 'ai';
import { cohere } from '@ai-sdk/cohere';

const { ranking, rerankedDocuments } = await rerank({
  model: cohere.reranking('rerank-v3.5'),
  documents: [
    'dia ensolarado na praia',
    'tarde chuvosa na cidade',
    'noite nevada nas montanhas',
  ],
  query: 'fale sobre chuva',
  topN: 2,
});

// ranking: [{ originalIndex, score, document }, ...]
// rerankedDocuments: documentos ordenados por relevância
```

**Com Documentos Estruturados:**

```typescript
const { rerankedDocuments } = await rerank({
  model: cohere.reranking('rerank-v3.5'),
  documents: [
    { from: 'Paul', subject: 'Follow-up', text: 'Desconto de 20%...' },
    { from: 'John', subject: 'Pricing', text: 'Preços da Oracle: $5000/mês' },
  ],
  query: 'Qual preço recebemos da Oracle?',
  topN: 1,
});
```

### 4.7 Geração de Imagens

```typescript
import { generateImage } from 'ai';
import { openai } from '@ai-sdk/openai';

const { image } = await generateImage({
  model: openai.image('dall-e-3'),
  prompt: 'Papai Noel dirigindo um Cadillac',
  size: '1024x1024', // ou aspectRatio: '16:9' para alguns modelos
});

const base64 = image.base64;
const uint8Array = image.uint8Array;
```

**Múltiplas Imagens:**

```typescript
const { images } = await generateImage({
  model: openai.image('dall-e-2'),
  prompt: 'Papai Noel',
  n: 4,
  maxImagesPerCall: 5, // Override batch size
});
```

**Configurações:**

```typescript
const { image, warnings, providerMetadata } = await generateImage({
  model: openai.image('dall-e-3'),
  prompt: '...',
  seed: 1234567890,
  abortSignal: AbortSignal.timeout(30000),
  headers: { 'X-Custom': 'value' },
  providerOptions: {
    openai: { style: 'vivid', quality: 'hd' },
  },
});
```

**Modelos de Imagem:**

| Provider | Modelo | Tamanhos |
|----------|--------|----------|
| OpenAI | `gpt-image-1` | 1024x1024, 1536x1024, 1024x1536 |
| OpenAI | `dall-e-3` | 1024x1024, 1792x1024, 1024x1792 |
| OpenAI | `dall-e-2` | 256x256, 512x512, 1024x1024 |
| Google Vertex | `imagen-4.0-generate-001` | 1:1, 3:4, 4:3, 9:16, 16:9 |

### 4.8 Transcrição de Áudio

```typescript
import { experimental_transcribe as transcribe } from 'ai';
import { openai } from '@ai-sdk/openai';
import { readFile } from 'fs/promises';

const transcript = await transcribe({
  model: openai.transcription('whisper-1'),
  audio: await readFile('audio.mp3'),
});

transcript.text;              // Texto transcrito
transcript.segments;          // Segmentos com timestamps
transcript.language;          // Idioma detectado
transcript.durationInSeconds; // Duração
```

### 4.9 Geração de Fala (TTS)

```typescript
import { experimental_generateSpeech as generateSpeech } from 'ai';
import { openai } from '@ai-sdk/openai';

const audio = await generateSpeech({
  model: openai.speech('tts-1'),
  text: 'Hello, world!',
  voice: 'alloy',
  language: 'en', // opcional
});

const audioData = audio.audio.uint8Array;
const audioBase64 = audio.audio.base64;
```

### 4.10 Sources (RAG)

```typescript
// Com generateText
const result = await generateText({
  model: google('gemini-2.5-flash'),
  tools: {
    google_search: google.tools.googleSearch({}),
  },
  prompt: 'Últimas notícias de São Paulo',
});

for (const source of result.sources) {
  if (source.sourceType === 'url') {
    console.log('ID:', source.id);
    console.log('Title:', source.title);
    console.log('URL:', source.url);
  }
}

// Com streamText (fullStream)
for await (const part of result.fullStream) {
  if (part.type === 'source' && part.sourceType === 'url') {
    console.log('Source:', part.url);
  }
}
```

### 4.11 Configurações Comuns

```typescript
const result = await generateText({
  model: openai('gpt-4o'),
  
  // Tokens e geração
  maxOutputTokens: 512,
  temperature: 0.3,       // 0 = determinístico
  topP: 0.9,              // Nucleus sampling
  topK: 40,               // Top K sampling
  presencePenalty: 0,     // Penalidade de presença
  frequencyPenalty: 0,    // Penalidade de frequência
  stopSequences: ['\n'],  // Parar ao encontrar
  seed: 12345,            // Seed para reproducibilidade
  
  // Retries e timeouts
  maxRetries: 5,
  timeout: 5000,          // ms (ou objeto detalhado)
  timeout: {
    totalMs: 60000,       // Total
    stepMs: 10000,        // Por step
    chunkMs: 5000,        // Entre chunks (streaming)
  },
  
  // Abort
  abortSignal: AbortSignal.timeout(5000),
  
  // Headers customizados
  headers: { 'Prompt-Id': 'my-prompt-id' },
  
  prompt: '...',
});
```

### 4.12 Error Handling

#### Erros Regulares (try/catch)

```typescript
import { generateText } from 'ai';

try {
  const { text } = await generateText({
    model: openai('gpt-4o'),
    prompt: 'Escreva uma receita.',
  });
} catch (error) {
  // handle error
}
```

#### Erros em Streaming Simples

```typescript
try {
  const { textStream } = streamText({
    model: openai('gpt-4o'),
    prompt: 'Escreva uma história.',
  });

  for await (const textPart of textStream) {
    process.stdout.write(textPart);
  }
} catch (error) {
  // handle error
}
```

#### Erros em fullStream (com `error` e `abort` parts)

```typescript
try {
  const { fullStream } = streamText({
    model: openai('gpt-4o'),
    prompt: 'Escreva uma história.',
  });

  for await (const part of fullStream) {
    switch (part.type) {
      case 'error': {
        const error = part.error;
        // handle error
        break;
      }
      case 'abort': {
        // handle stream abort
        break;
      }
      case 'tool-error': {
        const error = part.error;
        // handle tool error
        break;
      }
      // ... outros tipos
    }
  }
} catch (error) {
  // handle error
}
```

#### Handling Stream Aborts

```typescript
const { textStream } = streamText({
  model: openai('gpt-4o'),
  prompt: 'Escreva uma história.',
  
  onAbort: ({ steps }) => {
    // Cleanup: update UI, save partial state
    console.log('Stream abortado após', steps.length, 'steps');
  },
  
  onFinish: ({ steps, totalUsage }) => {
    // Chamado apenas em conclusão normal
    console.log('Stream completado normalmente');
  },
});
```

### 4.13 Language Model Middleware

#### Usando Middleware

```typescript
import { wrapLanguageModel, streamText } from 'ai';

const wrappedModel = wrapLanguageModel({
  model: openai('gpt-4o'),
  middleware: yourMiddleware,
});

const result = streamText({
  model: wrappedModel,
  prompt: 'Quais cidades existem nos EUA?',
});
```

#### Múltiplos Middlewares

```typescript
const wrappedModel = wrapLanguageModel({
  model: yourModel,
  middleware: [firstMiddleware, secondMiddleware],
});
// Aplicado como: firstMiddleware(secondMiddleware(yourModel))
```

#### Middlewares Built-in

**`extractReasoningMiddleware`** - Extrai reasoning de tags especiais:
```typescript
import { wrapLanguageModel, extractReasoningMiddleware } from 'ai';

const model = wrapLanguageModel({
  model: yourModel,
  middleware: extractReasoningMiddleware({ 
    tagName: 'think',
    startWithReasoning: true, // Para modelos como DeepSeek R1
  }),
});
```

**`extractJsonMiddleware`** - Remove markdown code fences de JSON:
```typescript
import { wrapLanguageModel, extractJsonMiddleware, Output } from 'ai';

const model = wrapLanguageModel({
  model: yourModel,
  middleware: extractJsonMiddleware(),
});

const result = await generateText({
  model,
  output: Output.object({ schema }),
  prompt: 'Gere dados.',
});
```

**`simulateStreamingMiddleware`** - Simula streaming para modelos não-streaming:
```typescript
import { wrapLanguageModel, simulateStreamingMiddleware } from 'ai';

const model = wrapLanguageModel({
  model: yourModel,
  middleware: simulateStreamingMiddleware(),
});
```

**`defaultSettingsMiddleware`** - Aplica configurações padrão:
```typescript
import { wrapLanguageModel, defaultSettingsMiddleware } from 'ai';

const model = wrapLanguageModel({
  model: yourModel,
  middleware: defaultSettingsMiddleware({
    settings: {
      temperature: 0.5,
      maxOutputTokens: 800,
      providerOptions: { openai: { store: false } },
    },
  }),
});
```

**`addToolInputExamplesMiddleware`** - Adiciona exemplos ao description de tools:
```typescript
import { wrapLanguageModel, addToolInputExamplesMiddleware, tool } from 'ai';
import { z } from 'zod';

const model = wrapLanguageModel({
  model: yourModel,
  middleware: addToolInputExamplesMiddleware({
    prefix: 'Input Examples:',
  }),
});

// Ao usar a tool, os examples são adicionados ao description
const weatherTool = tool({
  description: 'Get weather',
  inputSchema: z.object({ location: z.string() }),
  inputExamples: [
    { input: { location: 'San Francisco' } },
    { input: { location: 'London' } },
  ],
});
```

#### Implementando Middleware Customizado

```typescript
import type { LanguageModelV3Middleware, LanguageModelV3StreamPart } from '@ai-sdk/provider';

// Middleware de logging
export const loggingMiddleware: LanguageModelV3Middleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    console.log('doGenerate called', params);
    const result = await doGenerate();
    console.log('Generated text:', result.text);
    return result;
  },

  wrapStream: async ({ doStream, params }) => {
    console.log('doStream called', params);
    const { stream, ...rest } = await doStream();

    let generatedText = '';
    const transformStream = new TransformStream<
      LanguageModelV3StreamPart,
      LanguageModelV3StreamPart
    >({
      transform(chunk, controller) {
        if (chunk.type === 'text-delta') {
          generatedText += chunk.delta;
        }
        controller.enqueue(chunk);
      },
      flush() {
        console.log('Generated text:', generatedText);
      },
    });

    return { stream: stream.pipeThrough(transformStream), ...rest };
  },
};

// Middleware de cache
const cache = new Map<string, any>();

export const cacheMiddleware: LanguageModelV3Middleware = {
  wrapGenerate: async ({ doGenerate, params }) => {
    const cacheKey = JSON.stringify(params);
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey);
    }
    const result = await doGenerate();
    cache.set(cacheKey, result);
    return result;
  },
};

// Middleware de RAG
export const ragMiddleware: LanguageModelV3Middleware = {
  transformParams: async ({ params }) => {
    const lastUserMessage = getLastUserMessageText({ prompt: params.prompt });
    if (!lastUserMessage) return params;

    const sources = findSources({ text: lastUserMessage });
    const instruction = 'Use estas informações:\n' + 
      sources.map(s => JSON.stringify(s)).join('\n');

    return addToLastUserMessage({ params, text: instruction });
  },
};

// Middleware de guardrail
export const guardrailMiddleware: LanguageModelV3Middleware = {
  wrapGenerate: async ({ doGenerate }) => {
    const { text, ...rest } = await doGenerate();
    const cleanedText = text?.replace(/badword/g, '<REDACTED>');
    return { text: cleanedText, ...rest };
  },
};
```

### 4.14 Provider & Model Management

#### Custom Providers

**Configurações Customizadas:**
```typescript
import { gateway, customProvider, defaultSettingsMiddleware, wrapLanguageModel } from 'ai';

export const openai = customProvider({
  languageModels: {
    'gpt-5.1-high-reasoning': wrapLanguageModel({
      model: gateway('openai/gpt-5.1'),
      middleware: defaultSettingsMiddleware({
        settings: {
          providerOptions: {
            openai: { reasoningEffort: 'high' },
          },
        },
      }),
    }),
  },
  fallbackProvider: gateway,
});
```

**Aliases de Modelo:**
```typescript
import { customProvider, gateway } from 'ai';

export const anthropic = customProvider({
  languageModels: {
    opus: gateway('anthropic/claude-opus-4.1'),
    sonnet: gateway('anthropic/claude-sonnet-4.5'),
    haiku: gateway('anthropic/claude-haiku-4.5'),
  },
  fallbackProvider: gateway,
});
```

**Limitar Modelos Disponíveis:**
```typescript
export const myProvider = customProvider({
  languageModels: {
    'text-medium': gateway('anthropic/claude-sonnet-4.5'),
    'text-small': gateway('openai/gpt-4o-mini'),
    'reasoning': wrapLanguageModel({
      model: gateway('openai/o1'),
      middleware: defaultSettingsMiddleware({ ... }),
    }),
  },
  embeddingModels: {
    embedding: gateway.embeddingModel('openai/text-embedding-3-small'),
  },
  // Sem fallback = apenas modelos listados disponíveis
});
```

#### Provider Registry

```typescript
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { createProviderRegistry, gateway } from 'ai';

export const registry = createProviderRegistry({
  gateway,
  anthropic,
  openai,
});

// Uso
const { text } = await generateText({
  model: registry.languageModel('openai:gpt-4o'),
  prompt: 'Invente um feriado.',
});

const { embedding } = await embed({
  model: registry.embeddingModel('openai:text-embedding-3-small'),
  value: 'texto',
});

const { image } = await generateImage({
  model: registry.imageModel('openai:dall-e-3'),
  prompt: 'Paisagem',
});
```

**Separador Customizado:**
```typescript
const registry = createProviderRegistry(
  { gateway, anthropic, openai },
  { separator: ' > ' },
);

// Uso: registry.languageModel('openai > gpt-4o')
```

#### Configuração Completa de Provider

```typescript
import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { xai } from '@ai-sdk/xai';
import { groq } from '@ai-sdk/groq';
import {
  createProviderRegistry,
  customProvider,
  defaultSettingsMiddleware,
  gateway,
  wrapLanguageModel,
} from 'ai';

export const registry = createProviderRegistry(
  {
    // Pass-through com gateway
    gateway,

    // Pass-through direto
    xai,

    // Provider OpenAI-compatible customizado
    custom: createOpenAICompatible({
      name: 'custom-provider',
      apiKey: process.env.CUSTOM_API_KEY,
      baseURL: 'https://api.custom.com/v1',
    }),

    // Aliases com configurações
    anthropic: customProvider({
      languageModels: {
        fast: anthropic('claude-haiku-4.5'),
        writing: anthropic('claude-sonnet-4.5'),
        reasoning: wrapLanguageModel({
          model: anthropic('claude-sonnet-4.5'),
          middleware: defaultSettingsMiddleware({
            settings: {
              maxOutputTokens: 100000,
              providerOptions: {
                anthropic: {
                  thinking: { type: 'enabled', budgetTokens: 32000 },
                } satisfies AnthropicProviderOptions,
              },
            },
          }),
        }),
      },
      fallbackProvider: anthropic,
    }),

    // Limitar a modelos específicos
    groq: customProvider({
      languageModels: {
        'gemma2-9b-it': groq('gemma2-9b-it'),
        'qwen-qwq-32b': groq('qwen-qwq-32b'),
      },
    }),
  },
  { separator: ' > ' },
);

// Uso
const model = registry.languageModel('anthropic > reasoning');
```

### 4.15 Testing

#### Mock Language Model

```typescript
import { generateText, streamText, simulateReadableStream } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

// generateText mock
const result = await generateText({
  model: new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [{ type: 'text', text: 'Hello, world!' }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10 },
        outputTokens: { total: 20, text: 20 },
      },
      warnings: [],
    }),
  }),
  prompt: 'Hello, test!',
});

// streamText mock
const streamResult = streamText({
  model: new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: 'text-start', id: 'text-1' },
          { type: 'text-delta', id: 'text-1', delta: 'Hello' },
          { type: 'text-delta', id: 'text-1', delta: ', world!' },
          { type: 'text-end', id: 'text-1' },
          {
            type: 'finish',
            finishReason: { unified: 'stop', raw: undefined },
            usage: {
              inputTokens: { total: 3, noCache: 3 },
              outputTokens: { total: 10, text: 10 },
            },
          },
        ],
      }),
    }),
  }),
  prompt: 'Hello, test!',
});
```

#### Mock Embedding Model

```typescript
import { embed } from 'ai';
import { MockEmbeddingModelV3 } from 'ai/test';

const result = await embed({
  model: new MockEmbeddingModelV3({
    doEmbed: async ({ values }) => ({
      embeddings: values.map(() => [0.1, 0.2, 0.3]),
    }),
  }),
  value: 'test text',
});
```

#### Test Helpers

```typescript
import { mockId, mockValues, simulateReadableStream } from 'ai/test';

// mockId: incrementing IDs
const id1 = mockId(); // '0'
const id2 = mockId(); // '1'

// mockValues: iterate over array
const getValue = mockValues(['a', 'b', 'c']);
getValue(); // 'a'
getValue(); // 'b'
getValue(); // 'c'
getValue(); // 'c' (último valor repetido)

// simulateReadableStream: simula stream com delays
const stream = simulateReadableStream({
  initialDelayInMs: 1000,
  chunkDelayInMs: 300,
  chunks: [
    { type: 'text-delta', delta: 'Hello' },
    { type: 'text-delta', delta: ' World' },
  ],
});
```

#### Simular UI Message Stream (Para Testes de API)

```typescript
// route.ts
import { simulateReadableStream } from 'ai';

export async function POST(req: Request) {
  return new Response(
    simulateReadableStream({
      initialDelayInMs: 1000,
      chunkDelayInMs: 300,
      chunks: [
        `data: {"type":"start","messageId":"msg-123"}\n\n`,
        `data: {"type":"text-start","id":"text-1"}\n\n`,
        `data: {"type":"text-delta","id":"text-1","delta":"This"}\n\n`,
        `data: {"type":"text-delta","id":"text-1","delta":" is an"}\n\n`,
        `data: {"type":"text-delta","id":"text-1","delta":" example."}\n\n`,
        `data: {"type":"text-end","id":"text-1"}\n\n`,
        `data: {"type":"finish"}\n\n`,
        `data: [DONE]\n\n`,
      ],
    }).pipeThrough(new TextEncoderStream()),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'x-vercel-ai-ui-message-stream': 'v1',
      },
    },
  );
}
```

### 4.16 DevTools (Experimental)

> **Nota:** DevTools é experimental e apenas para desenvolvimento local. NÃO use em produção.

#### Setup

```bash
npm install @ai-sdk/devtools
```

#### Usando DevTools

```typescript
import { wrapLanguageModel, gateway } from 'ai';
import { devToolsMiddleware } from '@ai-sdk/devtools';

const model = wrapLanguageModel({
  model: gateway('anthropic/claude-sonnet-4.5'),
  middleware: devToolsMiddleware(),
});

// Use o model normalmente
const result = await generateText({
  model,
  prompt: 'Hello!',
});
```

#### Iniciando o Viewer

```bash
npx @ai-sdk/devtools
# Abra http://localhost:4983
```

#### O Que é Capturado

- Input parameters e prompts
- Output content e tool calls
- Token usage e timing
- Raw provider data
- Runs (interações completas) e Steps (chamadas individuais ao LLM)

> **Aviso de Segurança:** DevTools armazena todas as interações em texto simples (`.devtools/generations.json`). Verifique se `.devtools` está no `.gitignore`.

### 4.17 Telemetry (Experimental)

O AI SDK usa OpenTelemetry para telemetria.

#### Habilitando Telemetry

```typescript
const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Escreva uma história.',
  experimental_telemetry: {
    isEnabled: true,
    functionId: 'my-function',
    metadata: {
      userId: 'user-123',
      feature: 'story-generation',
    },
    recordInputs: true,  // Gravar inputs (default: true)
    recordOutputs: true, // Gravar outputs (default: true)
  },
});
```

#### Custom Tracer

```typescript
const tracerProvider = new NodeTracerProvider();

const result = await generateText({
  model,
  prompt: '...',
  experimental_telemetry: {
    isEnabled: true,
    tracer: tracerProvider.getTracer('ai'),
  },
});
```

#### Dados Coletados

Para `generateText`/`streamText`:
- `ai.prompt`: Prompt usado
- `ai.response.text`: Texto gerado
- `ai.response.toolCalls`: Tool calls feitas
- `ai.response.finishReason`: Razão de término
- `ai.usage.promptTokens`: Tokens de prompt
- `ai.usage.completionTokens`: Tokens de completion
- `ai.model.id`: ID do modelo
- `ai.model.provider`: Provider do modelo

### 4.18 Prompt Engineering Tips

#### Dicas para Tools

1. Use modelos fortes para tool calling (gpt-4o, claude-opus-4.1)
2. Mantenha número de tools baixo (≤5)
3. Mantenha schemas de parâmetros simples
4. Use nomes semanticamente significativos
5. Adicione `.describe()` aos parâmetros
6. Use o campo `description` da tool para explicar outputs
7. Inclua exemplos de input/output no prompt

#### Zod Schemas Tips

**Datas:** Use string com transformação:
```typescript
const schema = z.object({
  date: z.string().date().transform(value => new Date(value)),
});
```

**Parâmetros Opcionais (strict mode):** Use `.nullable()` ao invés de `.optional()`:
```typescript
// ❌ Pode falhar com strict schema
const schema = z.object({
  command: z.string(),
  workdir: z.string().optional(),
});

// ✅ Funciona com strict schema
const schema = z.object({
  command: z.string(),
  workdir: z.string().nullable(),
});
```

**Temperature:** Use `temperature: 0` para tool calls e structured output:
```typescript
const result = await generateText({
  model: openai('gpt-4o'),
  temperature: 0, // Recomendado para tools
  tools: { ... },
  prompt: '...',
});
```

#### Debugging

```typescript
const result = await generateText({
  model: openai('gpt-4o'),
  prompt: 'Hello!',
});

// Verificar warnings
console.log(result.warnings);

// Inspecionar request body (para debug)
console.log(result.request.body);
```

---

## 5. Guia de Implementação

### 5.1 Configuração do Provider OpenAI

```typescript
// src/lib/ai/config.ts
import { createOpenAI } from '@ai-sdk/openai';

/**
 * Configuração do provider OpenAI
 * A API key é lida de variáveis de ambiente para segurança.
 */
export const openai = createOpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  compatibility: 'strict',
});

/**
 * Modelos disponíveis como constantes tipadas
 */
export const MODELS = {
  GPT_4O: 'gpt-4o',
  GPT_4O_MINI: 'gpt-4o-mini',
  GPT_4_TURBO: 'gpt-4-turbo',
} as const;

export type ModelId = typeof MODELS[keyof typeof MODELS];

export const DEFAULT_MODEL = MODELS.GPT_4O_MINI;
```

### 5.2 Variáveis de Ambiente

```env
# .env.local (NÃO commitar)
OPENAI_API_KEY=sk-proj-...
```

### 5.3 Route Handler (Backend) - Básico

```typescript
// src/app/api/chat/route.ts
import { convertToModelMessages, streamText, UIMessage } from 'ai';
import { openai } from '@ai-sdk/openai';

// Permite streaming até 30 segundos
export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: 'Você é um assistente útil. Responda em português.',
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
```

### 5.4 Componente de Chat (Frontend) - Básico

```typescript
// src/components/chat/ChatContainer.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

export default function ChatContainer() {
  const [input, setInput] = useState('');
  
  const { messages, sendMessage, status, stop, regenerate, error } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat',
    }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      sendMessage({ text: input });
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-4xl mx-auto">
      {/* Área de mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(message => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-lg ${
              message.role === 'user' 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-900'
            }`}>
              {/* Renderização usando parts (v6) */}
              {message.parts.map((part, index) => {
                if (part.type === 'text') {
                  return <span key={index}>{part.text}</span>;
                }
                return null;
              })}
            </div>
          </div>
        ))}

        {/* Indicadores de status */}
        {status === 'submitted' && (
          <div className="text-gray-500">Pensando...</div>
        )}
        
        {status === 'streaming' && (
          <button onClick={stop} className="text-red-500">
            Parar
          </button>
        )}

        {error && (
          <div className="p-3 bg-red-100 text-red-700 rounded">
            Erro ocorreu.
            <button onClick={regenerate} className="ml-2 underline">
              Tentar novamente
            </button>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Digite sua mensagem..."
            disabled={status !== 'ready'}
            className="flex-1 p-3 border rounded-lg"
          />
          <button
            type="submit"
            disabled={status !== 'ready' || !input.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:opacity-50"
          >
            Enviar
          </button>
        </div>
      </form>
    </div>
  );
}
```

---

## 6. Sistema de Transport (Novo na v6)

### 6.1 DefaultChatTransport

O transport controla como as mensagens são enviadas para a API.

```typescript
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
    
    // Headers customizados
    headers: {
      Authorization: 'Bearer token',
    },
    
    // Body adicional
    body: {
      user_id: '123',
    },
    
    credentials: 'include',
  }),
});
```

### 6.2 Configuração Dinâmica

```typescript
const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
    
    // Headers dinâmicos (funções)
    headers: () => ({
      Authorization: `Bearer ${getAuthToken()}`,
    }),
    
    // Body dinâmico
    body: () => ({
      sessionId: getCurrentSessionId(),
    }),
  }),
});
```

### 6.3 Transformação de Request

```typescript
const { messages, sendMessage } = useChat({
  transport: new DefaultChatTransport({
    api: '/api/chat',
    
    // Enviar apenas última mensagem (para persistência server-side)
    prepareSendMessagesRequest: ({ id, messages }) => ({
      body: {
        id,
        message: messages[messages.length - 1],
      },
    }),
  }),
});
```

### 6.4 TextStreamChatTransport (Streams de Texto Puro)

```typescript
import { useChat } from '@ai-sdk/react';
import { TextStreamChatTransport } from 'ai';

const { messages } = useChat({
  transport: new TextStreamChatTransport({
    api: '/api/chat',
  }),
});
```

### 6.5 DirectChatTransport (Sem HTTP)

Para cenários SSR, testes ou aplicações single-process:

```typescript
import { useChat } from '@ai-sdk/react';
import { DirectChatTransport, ToolLoopAgent } from 'ai';
import { openai } from '@ai-sdk/openai';

const agent = new ToolLoopAgent({
  model: openai('gpt-4o-mini'),
  instructions: 'You are a helpful assistant.',
});

const { messages, sendMessage } = useChat({
  transport: new DirectChatTransport({ agent }),
});
```

---

## 7. Sistema de Tools (AI SDK UI) (Function Calling)

### 7.1 Definição de Tools

```typescript
// src/lib/ai/tools.ts
import { tool } from 'ai';
import { z } from 'zod';

export const weatherTool = tool({
  description: 'Obtém informações do clima para uma cidade',
  inputSchema: z.object({
    city: z.string().describe('Nome da cidade'),
  }),
  execute: async ({ city }) => {
    // Implementação real chamaria API de clima
    const conditions = ['ensolarado', 'nublado', 'chuvoso'];
    return {
      city,
      temperature: Math.floor(Math.random() * 30) + 10,
      condition: conditions[Math.floor(Math.random() * conditions.length)],
    };
  },
});

export const tools = {
  getWeather: weatherTool,
};
```

### 7.2 Route Handler com Tools

```typescript
// src/app/api/chat/route.ts
import { convertToModelMessages, streamText, UIMessage, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { tools } from '@/lib/ai/tools';

export const maxDuration = 30;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: 'Você é um assistente útil.',
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5), // Máximo de 5 iterações de tools
  });

  return result.toUIMessageStreamResponse();
}
```

### 7.3 Frontend com Tools

```typescript
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { useState } from 'react';

export default function ChatWithTools() {
  const [input, setInput] = useState('');
  
  const { messages, sendMessage, addToolOutput, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    
    // Auto-submit quando todas as tools tiverem resultados
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    
    // Handler para tools client-side automáticas
    async onToolCall({ toolCall }) {
      if (toolCall.dynamic) return;
      
      if (toolCall.toolName === 'getLocation') {
        addToolOutput({
          tool: 'getLocation',
          toolCallId: toolCall.toolCallId,
          output: 'São Paulo, Brasil',
        });
      }
    },
  });

  return (
    <div>
      {messages.map(message => (
        <div key={message.id}>
          {message.role === 'user' ? 'Você: ' : 'AI: '}
          
          {message.parts.map((part, index) => {
            // Partes de texto
            if (part.type === 'text') {
              return <span key={index}>{part.text}</span>;
            }
            
            // Tool: getWeather (tipagem automática: tool-${toolName})
            if (part.type === 'tool-getWeather') {
              switch (part.state) {
                case 'input-streaming':
                  return <div key={index}>Preparando consulta...</div>;
                case 'input-available':
                  return <div key={index}>Buscando clima para {part.input.city}...</div>;
                case 'output-available':
                  return (
                    <div key={index} className="p-2 bg-blue-100 rounded">
                      🌤️ {part.input.city}: {part.output.temperature}°C, {part.output.condition}
                    </div>
                  );
                case 'output-error':
                  return <div key={index} className="text-red-500">Erro: {part.errorText}</div>;
              }
            }
            
            return null;
          })}
        </div>
      ))}

      <form onSubmit={e => {
        e.preventDefault();
        if (input.trim()) {
          sendMessage({ text: input });
          setInput('');
        }
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          disabled={status !== 'ready'}
          placeholder="Pergunte sobre o clima..."
        />
        <button type="submit" disabled={status !== 'ready'}>
          Enviar
        </button>
      </form>
    </div>
  );
}
```

### 7.4 Tools Client-Side com Interação do Usuário

```typescript
// Tool que requer confirmação do usuário
if (part.type === 'tool-askForConfirmation') {
  const callId = part.toolCallId;
  
  switch (part.state) {
    case 'input-available':
      return (
        <div key={callId}>
          <p>{part.input.message}</p>
          <button onClick={() => addToolOutput({
            tool: 'askForConfirmation',
            toolCallId: callId,
            output: 'Confirmado',
          })}>
            Sim
          </button>
          <button onClick={() => addToolOutput({
            tool: 'askForConfirmation',
            toolCallId: callId,
            output: 'Negado',
          })}>
            Não
          </button>
        </div>
      );
    case 'output-available':
      return <div key={callId}>Resposta: {part.output}</div>;
  }
}
```

### 7.5 Tool Execution Approval (Server-Side com Confirmação)

```typescript
// Backend: Tool que requer aprovação
const tools = {
  deleteFile: tool({
    description: 'Delete a file',
    inputSchema: z.object({ filename: z.string() }),
    needsApproval: true, // Requer aprovação do usuário
    execute: async ({ filename }) => {
      // Executa apenas após aprovação
      return { deleted: filename };
    },
  }),
};
```

```typescript
// Frontend: Handling approval
const { addToolApprovalResponse } = useChat({ ... });

if (part.type === 'tool-deleteFile' && part.state === 'approval-requested') {
  return (
    <div>
      <p>Deletar {part.input.filename}?</p>
      <button onClick={() => addToolApprovalResponse({
        id: part.approval.id,
        approved: true,
      })}>
        Aprovar
      </button>
      <button onClick={() => addToolApprovalResponse({
        id: part.approval.id,
        approved: false,
      })}>
        Negar
      </button>
    </div>
  );
}
```

---

## 8. Message Parts (Sistema de Partes)

### 8.1 Tipos de Parts Disponíveis

| Part Type | Descrição | Uso |
|-----------|-----------|-----|
| `text` | Conteúdo de texto | `part.text` |
| `tool-${toolName}` | Tool call tipada | `part.input`, `part.output`, `part.state` |
| `dynamic-tool` | Tool dinâmica | Quando tool não é conhecida em compile-time |
| `reasoning` | Reasoning tokens | DeepSeek, Claude com reasoning |
| `source-url` | Fonte web | RAG com Perplexity, Google |
| `source-document` | Fonte documento | RAG |
| `file` | Arquivo/Imagem | Geração de imagens |
| `step-start` | Início de step | Multi-step tool calls |

### 8.2 Estados de Tool Parts

```typescript
type ToolPartState = 
  | 'input-streaming'    // Input sendo gerado
  | 'input-available'    // Input completo, aguardando execução
  | 'approval-requested' // Aguardando aprovação (needsApproval: true)
  | 'output-available'   // Resultado disponível
  | 'output-error';      // Erro na execução
```

### 8.3 Renderização Completa de Parts

```typescript
{message.parts.map((part, index) => {
  switch (part.type) {
    case 'text':
      return <span key={index}>{part.text}</span>;
    
    case 'reasoning':
      return <pre key={index} className="text-gray-500">{part.text}</pre>;
    
    case 'source-url':
      return (
        <a key={index} href={part.url} target="_blank">
          [{part.title ?? new URL(part.url).hostname}]
        </a>
      );
    
    case 'file':
      if (part.mediaType?.startsWith('image/')) {
        return <img key={index} src={part.url} alt="Generated" />;
      }
      return null;
    
    case 'step-start':
      return index > 0 ? <hr key={index} /> : null;
    
    // Tools tipadas
    case 'tool-getWeather':
      // ... handling específico
    
    // Tools dinâmicas
    case 'dynamic-tool':
      return (
        <div key={index}>
          <strong>{part.toolName}</strong>
          {part.state === 'output-available' && (
            <pre>{JSON.stringify(part.output, null, 2)}</pre>
          )}
        </div>
      );
    
    default:
      return null;
  }
})}
```

---

## 9. Message Metadata

### 9.1 Backend: Enviando Metadata

```typescript
// src/app/api/chat/route.ts
import { streamText, UIMessage, type LanguageModelUsage } from 'ai';

type MyMetadata = {
  createdAt?: number;
  model?: string;
  totalTokens?: number;
};

export type MyUIMessage = UIMessage<MyMetadata>;

export async function POST(req: Request) {
  const { messages }: { messages: MyUIMessage[] } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    messageMetadata: ({ part }) => {
      if (part.type === 'start') {
        return {
          createdAt: Date.now(),
          model: 'gpt-4o-mini',
        };
      }
      
      if (part.type === 'finish') {
        return {
          totalTokens: part.totalUsage.totalTokens,
        };
      }
    },
  });
}
```

### 9.2 Frontend: Acessando Metadata

```typescript
import { useChat } from '@ai-sdk/react';
import type { MyUIMessage } from './api/chat/route';
import { DefaultChatTransport } from 'ai';

const { messages } = useChat<MyUIMessage>({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
});

// Renderização
{messages.map(m => (
  <div key={m.id}>
    {m.metadata?.createdAt && (
      <span className="text-xs text-gray-400">
        {new Date(m.metadata.createdAt).toLocaleTimeString()}
      </span>
    )}
    
    {/* Conteúdo */}
    {m.parts.map(/* ... */)}
    
    {m.metadata?.totalTokens && (
      <span className="text-xs">{m.metadata.totalTokens} tokens</span>
    )}
  </div>
))}
```

---

## 10. Streaming Custom Data

### 10.1 Definindo Tipos de Data Parts

```typescript
// src/lib/ai/types.ts
import { UIMessage } from 'ai';

export type MyUIMessage = UIMessage<
  never, // metadata type
  {
    weather: {
      city: string;
      weather?: string;
      status: 'loading' | 'success';
    };
    notification: {
      message: string;
      level: 'info' | 'warning' | 'error';
    };
  }
>;
```

### 10.2 Backend: Streaming Data Parts

```typescript
import { createUIMessageStream, createUIMessageStreamResponse, streamText } from 'ai';
import type { MyUIMessage } from '@/lib/ai/types';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const stream = createUIMessageStream<MyUIMessage>({
    execute: ({ writer }) => {
      // Data part transiente (não salva no histórico)
      writer.write({
        type: 'data-notification',
        data: { message: 'Processando...', level: 'info' },
        transient: true,
      });

      // Data part com loading state
      writer.write({
        type: 'data-weather',
        id: 'weather-1',
        data: { city: 'São Paulo', status: 'loading' },
      });

      const result = streamText({
        model: openai('gpt-4o-mini'),
        messages: await convertToModelMessages(messages),
        onFinish() {
          // Atualiza o mesmo data part (reconciliação por ID)
          writer.write({
            type: 'data-weather',
            id: 'weather-1',
            data: { city: 'São Paulo', weather: 'ensolarado', status: 'success' },
          });
        },
      });

      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
```

### 10.3 Frontend: Consumindo Data Parts

```typescript
const { messages } = useChat<MyUIMessage>({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
  
  // Callback para data parts (incluindo transientes)
  onData: dataPart => {
    if (dataPart.type === 'data-notification') {
      showToast(dataPart.data.message, dataPart.data.level);
    }
  },
});

// Renderização de data parts persistentes
{message.parts
  .filter(part => part.type === 'data-weather')
  .map((part, index) => (
    <div key={index}>
      {part.data.status === 'loading' 
        ? `Carregando clima para ${part.data.city}...`
        : `${part.data.city}: ${part.data.weather}`
      }
    </div>
  ))}
```

---

## 11. Persistência de Mensagens

### 11.1 Estrutura do Chat Store

```typescript
// src/lib/chat-store.ts
import { UIMessage, generateId } from 'ai';

export async function createChat(): Promise<string> {
  const id = generateId();
  // Criar registro no banco
  return id;
}

export async function loadChat(id: string): Promise<UIMessage[]> {
  // Carregar do banco
  return [];
}

export async function saveChat({ 
  chatId, 
  messages 
}: { 
  chatId: string; 
  messages: UIMessage[] 
}): Promise<void> {
  // Salvar no banco
}
```

### 11.2 Backend com Persistência

```typescript
// src/app/api/chat/route.ts
import { convertToModelMessages, streamText, UIMessage, generateId } from 'ai';
import { saveChat } from '@/lib/chat-store';

export async function POST(req: Request) {
  const { messages, chatId }: { messages: UIMessage[]; chatId: string } = 
    await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages: await convertToModelMessages(messages),
  });

  // Consumir stream para garantir salvamento mesmo com desconexão
  result.consumeStream(); // sem await

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    
    // IDs gerados no servidor para consistência
    generateMessageId: () => generateId(),
    
    // Salvar após completar
    onFinish: ({ messages }) => {
      saveChat({ chatId, messages });
    },
  });
}
```

### 11.3 Frontend com Persistência

```typescript
// src/app/chat/[id]/page.tsx
import { loadChat } from '@/lib/chat-store';
import ChatComponent from '@/components/ChatComponent';

export default async function ChatPage({ params }: { params: { id: string } }) {
  const messages = await loadChat(params.id);
  
  return <ChatComponent id={params.id} initialMessages={messages} />;
}
```

```typescript
// src/components/ChatComponent.tsx
'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, UIMessage } from 'ai';

export default function ChatComponent({ 
  id, 
  initialMessages 
}: { 
  id: string; 
  initialMessages: UIMessage[] 
}) {
  const { messages, sendMessage } = useChat({
    id,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      // Enviar apenas última mensagem
      prepareSendMessagesRequest: ({ id, messages }) => ({
        body: {
          chatId: id,
          message: messages[messages.length - 1],
        },
      }),
    }),
  });
  
  // ...
}
```

---

## 12. Resumable Streams

### 12.1 Habilitando Resume no Cliente

```typescript
const { messages, sendMessage } = useChat({
  id: chatId,
  messages: initialMessages,
  resume: true, // Habilita reconexão automática
  transport: new DefaultChatTransport({
    prepareSendMessagesRequest: ({ id, messages }) => ({
      body: { id, message: messages[messages.length - 1] },
    }),
  }),
});
```

### 12.2 Backend com Resumable Streams

```typescript
// src/app/api/chat/route.ts
import { createResumableStreamContext } from 'resumable-stream';
import { after } from 'next/server';

export async function POST(req: Request) {
  const { message, id } = await req.json();
  
  const result = streamText({
    model: openai('gpt-4o-mini'),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: ({ messages }) => {
      saveChat({ id, messages, activeStreamId: null });
    },
    async consumeSseStream({ stream }) {
      const streamId = generateId();
      const streamContext = createResumableStreamContext({ waitUntil: after });
      await streamContext.createNewResumableStream(streamId, () => stream);
      saveChat({ id, activeStreamId: streamId });
    },
  });
}
```

```typescript
// src/app/api/chat/[id]/stream/route.ts
import { UI_MESSAGE_STREAM_HEADERS } from 'ai';
import { createResumableStreamContext } from 'resumable-stream';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const chat = await loadChat(params.id);
  
  if (!chat.activeStreamId) {
    return new Response(null, { status: 204 });
  }
  
  const streamContext = createResumableStreamContext({ waitUntil: after });
  return new Response(
    await streamContext.resumeExistingStream(chat.activeStreamId),
    { headers: UI_MESSAGE_STREAM_HEADERS }
  );
}
```

---

## 13. Validação de Mensagens

### 13.1 Validando Mensagens do Banco

```typescript
import { validateUIMessages, TypeValidationError } from 'ai';

export async function POST(req: Request) {
  const { message, id } = await req.json();
  const previousMessages = await loadChat(id);
  
  let validatedMessages;
  
  try {
    validatedMessages = await validateUIMessages({
      messages: [...previousMessages, message],
      tools,
      metadataSchema,
    });
  } catch (error) {
    if (error instanceof TypeValidationError) {
      console.error('Validation failed:', error);
      validatedMessages = [message]; // Começar do zero
    } else {
      throw error;
    }
  }
  
  // Continuar com mensagens validadas...
}
```

---

## 14. Reasoning e Sources

### 14.1 Reasoning Tokens (DeepSeek, Claude)

```typescript
// Backend
return result.toUIMessageStreamResponse({
  sendReasoning: true,
});

// Frontend
{message.parts.map((part, index) => {
  if (part.type === 'reasoning') {
    return (
      <details key={index}>
        <summary>Raciocínio</summary>
        <pre className="text-sm text-gray-500">{part.text}</pre>
      </details>
    );
  }
  if (part.type === 'text') {
    return <span key={index}>{part.text}</span>;
  }
})}
```

### 14.2 Sources (RAG - Perplexity, Google)

```typescript
// Backend
return result.toUIMessageStreamResponse({
  sendSources: true,
});

// Frontend
{message.parts
  .filter(part => part.type === 'source-url')
  .map(part => (
    <a key={part.id} href={part.url} target="_blank">
      [{part.title ?? new URL(part.url).hostname}]
    </a>
  ))}
```

---

## 15. Hooks Adicionais

### 15.1 useCompletion (Text Completion)

```typescript
'use client';

import { useCompletion } from '@ai-sdk/react';

export default function CompletionPage() {
  const { completion, input, handleInputChange, handleSubmit, isLoading } = 
    useCompletion({
      api: '/api/completion',
    });

  return (
    <form onSubmit={handleSubmit}>
      <input value={input} onChange={handleInputChange} />
      <button type="submit" disabled={isLoading}>Completar</button>
      <div>{completion}</div>
    </form>
  );
}
```

### 15.2 useObject (Structured Output)

```typescript
'use client';

import { experimental_useObject as useObject } from '@ai-sdk/react';
import { z } from 'zod';

const notificationSchema = z.object({
  notifications: z.array(z.object({
    name: z.string(),
    message: z.string(),
  })),
});

export default function ObjectPage() {
  const { object, submit, isLoading } = useObject({
    api: '/api/notifications',
    schema: notificationSchema,
  });

  return (
    <>
      <button onClick={() => submit('Gere 3 notificações')} disabled={isLoading}>
        Gerar
      </button>
      
      {object?.notifications?.map((n, i) => (
        <div key={i}>
          <strong>{n?.name}</strong>: {n?.message}
        </div>
      ))}
    </>
  );
}
```

---

## 16. Tratamento de Erros (AI SDK UI)

### 16.1 Backend: Customizando Mensagens de Erro

```typescript
return result.toUIMessageStreamResponse({
  onError: error => {
    if (error == null) return 'Erro desconhecido';
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    return JSON.stringify(error);
  },
});
```

### 16.2 Frontend: Handling de Erros

```typescript
const { messages, error, regenerate, sendMessage } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
  
  onError: error => {
    console.error('Chat error:', error);
  },
});

// Na UI
{error && (
  <div className="bg-red-100 p-3 rounded">
    <p>Algo deu errado.</p>
    <button onClick={regenerate}>Tentar novamente</button>
  </div>
)}
```

---

## 17. Tabela de Referência Rápida

### 17.1 Hooks do AI SDK v6

| Hook | Import | Uso |
|------|--------|-----|
| `useChat` | `@ai-sdk/react` | Chat conversacional |
| `useCompletion` | `@ai-sdk/react` | Text completion |
| `useObject` | `@ai-sdk/react` (experimental) | Structured output streaming |

### 17.2 Funções Core

| Função | Uso | Response Method |
|--------|-----|-----------------|
| `streamText` | Streaming de texto | `toUIMessageStreamResponse()` |
| `generateText` | Texto sem streaming | N/A |
| `streamObject` | Objeto estruturado streaming | `toTextStreamResponse()` |
| `generateObject` | Objeto sem streaming | N/A |

### 17.3 Transport Types

| Transport | Uso |
|-----------|-----|
| `DefaultChatTransport` | HTTP padrão |
| `TextStreamChatTransport` | Plain text streams |
| `DirectChatTransport` | Comunicação direta com Agent |

### 17.4 useChat Return Values

| Propriedade | Tipo | Descrição |
|-------------|------|-----------|
| `messages` | `UIMessage[]` | Lista de mensagens |
| `sendMessage` | `(msg) => void` | Envia mensagem |
| `status` | `string` | `'ready'` \| `'submitted'` \| `'streaming'` \| `'error'` |
| `stop` | `() => void` | Para streaming |
| `regenerate` | `() => void` | Regenera última resposta |
| `setMessages` | `(msgs) => void` | Substitui mensagens |
| `addToolOutput` | `(opts) => void` | Adiciona resultado de tool |
| `addToolApprovalResponse` | `(opts) => void` | Responde aprovação de tool |
| `error` | `Error \| undefined` | Erro ocorrido |

## 18. Consequências

### 18.1 Positivas

1. **Tipagem Forte**: Sistema de parts totalmente tipado
2. **Flexibilidade**: Transport system permite customização total
3. **Tools Modernas**: Suporte completo a function calling com estados
4. **Streaming Avançado**: Data parts, metadata, sources, reasoning
5. **Persistência**: Suporte nativo a message persistence e resume

### 18.2 Negativas

1. **Breaking Changes**: Migração significativa da v3.x
2. **Complexidade**: Mais conceitos para aprender (transports, parts)
3. **Boilerplate**: Input agora é gerenciado manualmente

### 18.3 Migração da v3.x

```typescript
// ANTES (v3.x)
import { useChat } from 'ai/react';
const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat();

// DEPOIS (v6.x)
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useState } from 'react';

const [input, setInput] = useState('');
const { messages, sendMessage, status } = useChat({
  transport: new DefaultChatTransport({ api: '/api/chat' }),
});
```

---

## 19. Checklist de Implementação

### 19.1 Setup Inicial

- [ ] Instalar dependências (`ai@^6.0.0`, `@ai-sdk/react`, `@ai-sdk/openai`, `zod`)
- [ ] Configurar variáveis de ambiente (`OPENAI_API_KEY`)
- [ ] Criar arquivo de configuração do provider
- [ ] Adicionar `.env.local` ao `.gitignore`

### 19.2 Backend

- [ ] Criar route handler `/api/chat`
- [ ] Usar `convertToModelMessages()` e `toUIMessageStreamResponse()`
- [ ] Implementar tools se necessário
- [ ] Adicionar `maxDuration = 30`

### 19.3 Frontend

- [ ] Importar `useChat` de `@ai-sdk/react`
- [ ] Configurar `DefaultChatTransport`
- [ ] Gerenciar input com `useState`
- [ ] Renderizar `message.parts` (não `message.content`)
- [ ] Usar `status` ao invés de `isLoading`

### 19.4 Produção

- [ ] Configurar rate limiting
- [ ] Implementar persistência
- [ ] Adicionar telemetria/logging
- [ ] Testar resumable streams

---

## 20. Referências

### Documentação Oficial
- [AI SDK Documentation](https://ai-sdk.dev/docs)
- [AI SDK Core](https://ai-sdk.dev/docs/ai-sdk-core)
- [AI SDK UI](https://ai-sdk.dev/docs/ai-sdk-ui)

### Funções Core
- [generateText](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text)
- [streamText](https://ai-sdk.dev/docs/reference/ai-sdk-core/stream-text)
- [Output API](https://ai-sdk.dev/docs/reference/ai-sdk-core/output)
- [Tool Calling](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [MCP](https://ai-sdk.dev/docs/ai-sdk-core/mcp)

### UI Hooks
- [useChat](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- [useCompletion](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-completion)
- [useObject](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-object)

### Recursos Adicionais
- [Transport API](https://ai-sdk.dev/docs/ai-sdk-ui/transport)
- [Streaming Custom Data](https://ai-sdk.dev/docs/ai-sdk-ui/streaming-custom-data)
- [Language Model Middleware](https://ai-sdk.dev/docs/ai-sdk-core/middleware)
- [Provider Management](https://ai-sdk.dev/docs/ai-sdk-core/provider-management)
- [Testing](https://ai-sdk.dev/docs/ai-sdk-core/testing)
- [Telemetry](https://ai-sdk.dev/docs/ai-sdk-core/telemetry)

### Provedores
- [OpenAI Provider](https://ai-sdk.dev/providers/ai-sdk-providers/openai)
- [Anthropic Provider](https://ai-sdk.dev/providers/ai-sdk-providers/anthropic)
- [Google Provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)
- [Mistral Provider](https://ai-sdk.dev/providers/ai-sdk-providers/mistral)

---

**Última atualização:** 2025-02-03  
**Versão SDK:** 6.x (6.0.68+)  
**Próxima revisão:** 2025-05-03  
**Responsável:** Equipe de Arquitetura