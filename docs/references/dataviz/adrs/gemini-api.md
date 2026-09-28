# ADR-001 — Integração com Gemini API
## Geração de Texto e Imagem via REST

---

| Campo            | Valor                          |
|------------------|-------------------------------|
| **ID**           | ADR-001                       |
| **Data**         | 09 de Março de 2026           |
| **Versão**       | 1.2.0                         |
| **Status**       | ✅ ACEITO                     |
| **Autores**      | Time de Arquitetura           |
| **Revisores**    | Tech Lead / CTO               |
| **Próxima revisão** | Setembro 2026              |

---

## Sumário

1. [Contexto](#1-contexto)
2. [Decisão](#2-decisão)
3. [Implementação Técnica — Exemplos cURL](#3-implementação-técnica--exemplos-curl)
4. [Structured Output — Saída JSON Estruturada](#4-structured-output--saída-json-estruturada)
5. [Schemas JSON — Request e Response](#5-schemas-json--request-e-response)
6. [Parâmetros de Configuração](#6-parâmetros-de-configuração)
7. [Rate Limits, Quotas e Preços](#7-rate-limits-quotas-e-preços)
8. [Alternativas Consideradas](#8-alternativas-consideradas)
9. [Google AI Studio vs Vertex AI](#9-google-ai-studio-vs-vertex-ai)
10. [Consequências](#10-consequências)
11. [Critérios de Revisão desta ADR](#11-critérios-de-revisão-desta-adr)

---

## 1. Contexto

O produto necessita de capacidades avançadas de geração de linguagem natural e síntese de imagens para suportar funcionalidades como assistentes conversacionais, geração automatizada de conteúdo, análise de documentos e criação de assets visuais. A equipe avaliou as principais plataformas de IA generativa disponíveis no mercado para determinar qual atenderia melhor ao conjunto de requisitos técnicos, operacionais e econômicos do projeto.

### 1.1 Forças motrizes desta decisão

- Necessidade de API REST estável com suporte a geração de **texto e imagem em um único provedor**
- Contexto de entrada longo (mínimo 200K tokens) para análise de documentos extensos e bases de código
- Tier gratuito funcional para prototipagem sem custo inicial de infraestrutura
- **Structured Output nativo** para integração com sistemas downstream sem parseamento frágil
- Multimodalidade: texto → imagem, imagem → texto, texto+imagem → texto no mesmo endpoint
- Streaming SSE para interfaces conversacionais responsivas
- Compatibilidade com ecossistema Google Cloud (Vertex AI, Cloud Run, Firebase)

### 1.2 Restrições e premissas

- A solução deve operar via **API REST pura** — sem dependência obrigatória de SDK proprietário
- A chave de autenticação deve ser configurável por variável de ambiente
- O sistema deve ser **agnóstico de linguagem de programação** no nível de integração
- Dados sensíveis de usuário não devem trafegar pelo tier gratuito (dados podem ser usados para treinamento)
- O orçamento inicial de inferência é limitado; custo por token é critério de eliminação

---

## 2. Decisão

> **Adotar a Gemini API (Google AI Studio Developer API) como plataforma primária de inferência**, utilizando os modelos `gemini-2.5-flash` e `gemini-2.5-pro` para geração de texto e raciocínio, e os modelos `gemini-2.5-flash-image` / `imagen-4.0-generate-001` para geração de imagens, com acesso via endpoint REST `https://generativelanguage.googleapis.com/v1beta` e autenticação por API Key.

### 2.1 Plataforma e endpoints adotados

| Finalidade | Endpoint REST | Método |
|---|---|---|
| Geração de texto (síncrona) | `/v1beta/models/{MODEL}:generateContent` | POST |
| Geração de texto (streaming) | `/v1beta/models/{MODEL}:streamGenerateContent?alt=sse` | POST |
| Geração de imagem via Gemini | `/v1beta/models/gemini-2.5-flash-image:generateContent` | POST |
| Geração de imagem via Imagen 4 | `/v1beta/models/imagen-4.0-generate-001:predict` | POST |
| Análise multimodal (imagem + texto) | `/v1beta/models/gemini-2.5-flash:generateContent` | POST |
| Upload de arquivos grandes | `/upload/v1beta/files` | POST |
| Listar modelos disponíveis | `/v1beta/models` | GET |
| Compatibilidade OpenAI (drop-in) | `/v1beta/openai/chat/completions` | POST |

### 2.2 Modelos selecionados e justificativa

| Modelo | Uso primário | Contexto entrada | Saída máx. | Status |
|---|---|---|---|---|
| `gemini-2.5-flash` | Texto: alto volume, custo-benefício | 1M tokens | 65.536 tokens | Estável |
| `gemini-2.5-pro` | Texto: raciocínio profundo, STEM | 1M tokens | 65.536 tokens | Estável |
| `gemini-2.5-flash-lite` | Texto: throughput máximo, custo mínimo | 1M tokens | 65.536 tokens | Estável |
| `gemini-2.5-flash-image` | Imagem: geração conversacional | 1M tokens | 65.536 tokens | Estável |
| `imagen-4.0-generate-001` | Imagem: fotorrealismo dedicado | Texto (prompt) | N/A | Atual |
| `imagen-4.0-ultra-generate-001` | Imagem: qualidade máxima | Texto (prompt) | N/A | Atual |

---

## 3. Implementação Técnica — Exemplos cURL

Todos os exemplos utilizam a variável de ambiente `$GEMINI_API_KEY`. Configure-a antes de executar:

```bash
# Defina sua chave de API como variável de ambiente
export GEMINI_API_KEY="sua_chave_aqui"

# Obtenha sua chave gratuita em: https://aistudio.google.com/apikey
```

---

### 3.1 Geração de texto simples

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "contents": [{
      "parts": [{ "text": "Explique como funciona a energia solar em 3 parágrafos." }]
    }],
    "generationConfig": {
      "temperature": 0.7,
      "maxOutputTokens": 1024
    }
  }'
```

---

### 3.2 Chat multi-turn (conversa com histórico)

A API é **stateless**. O histórico completo deve ser enviado a cada request no array `contents`, alternando roles `user` e `model`. O `system_instruction` configura o comportamento base do assistente.

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "system_instruction": {
      "parts": [{ "text": "Você é um especialista em arquitetura de software." }]
    },
    "contents": [
      { "role": "user",  "parts": [{ "text": "O que são microsserviços?" }] },
      { "role": "model", "parts": [{ "text": "Microsserviços são uma abordagem arquitetural..." }] },
      { "role": "user",  "parts": [{ "text": "Quais são as principais vantagens?" }] }
    ]
  }'
```

---

### 3.3 Streaming de texto (Server-Sent Events)

Use `streamGenerateContent` com `?alt=sse` para receber a resposta em chunks em tempo real. A flag `--no-buffer` é essencial para visualizar os eventos conforme chegam.

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  --no-buffer \
  -d '{
    "contents": [{
      "parts": [{ "text": "Escreva uma história curta sobre um viajante do tempo." }]
    }]
  }'

# Cada chunk chega prefixado com "data:" e contém um JSON parcial.
# Exemplo: data: {"candidates":[{"content":{"parts":[{"text":"Era uma..."}]}}]}
```

---

### 3.4 Geração de imagem via Gemini nativo (Nano Banana)

Modelos Gemini com capacidade de imagem usam o mesmo endpoint `generateContent`. O campo `responseModalities` deve incluir `"IMAGE"`. A resposta contém `inlineData` com a imagem codificada em base64.

```bash
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [{ "text": "Ilustração de um gato astronauta no espaço, estilo aquarela" }]
    }],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"]
    }
  }'

# A resposta contém parts com inlineData:
# { "inlineData": { "mimeType": "image/png", "data": "<base64>" } }
```

---

### 3.5 Geração de imagem via Imagen 4 (endpoint dedicado)

O Imagen 4 usa o endpoint `:predict` com estrutura de request diferente. Suporta até 4 imagens por request, múltiplas proporções e controle de geração de pessoas.

```bash
curl -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instances": [
      { "prompt": "Robô segurando skate vermelho, fotorrealista, luz natural" }
    ],
    "parameters": {
      "sampleCount": 2,
      "aspectRatio": "16:9",
      "personGeneration": "dont_allow"
    }
  }'

# Aspect ratios disponíveis: "1:1", "3:4", "4:3", "9:16", "16:9"
# sampleCount: 1-4 imagens por request
```

---

### 3.6 Análise multimodal (imagem + texto)

Envie imagens como base64 inline (até 20 MB) ou via URI de arquivo previamente carregado pela Files API. MIME types suportados: `image/jpeg`, `image/png`, `image/gif`, `image/webp`.

```bash
# Encode a imagem em base64
IMG_B64=$(base64 -w0 /caminho/para/imagem.jpg)

curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "contents": [{
      "parts": [
        {
          "inline_data": {
            "mime_type": "image/jpeg",
            "data": "'"$IMG_B64"'"
          }
        },
        { "text": "Descreva esta imagem em detalhes." }
      ]
    }]
  }'
```

---

## 4. Structured Output — Saída JSON Estruturada

O Gemini suporta forçar a saída em JSON com schema OpenAPI 3.0 definido pelo desenvolvedor. A combinação obrigatória é sempre `responseMimeType: "application/json"` + `responseSchema`. Esta é uma das funcionalidades mais críticas para integrações que precisam parsear respostas diretamente, sem depender de regex ou extração frágil de texto.

> **⚡ REGRA:** `responseMimeType: "application/json"` + `responseSchema` são **obrigatórios juntos**. Um sem o outro não ativa o modo estruturado.

---

### 4.1 Array de objetos — lista estruturada

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "contents": [{
      "parts": [{ "text": "Liste 3 linguagens de programação populares." }]
    }],
    "generationConfig": {
      "responseMimeType": "application/json",
      "responseSchema": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "nome":        { "type": "string" },
            "paradigma":   { "type": "string" },
            "ano_criacao": { "type": "integer" },
            "tipagem": {
              "type": "string",
              "enum": ["estatica", "dinamica"]
            }
          },
          "required": ["nome", "paradigma", "ano_criacao", "tipagem"]
        }
      }
    }
  }'
```

**Resposta garantida:**
```json
[
  { "nome": "Python", "paradigma": "multiparadigma", "ano_criacao": 1991, "tipagem": "dinamica" },
  { "nome": "Go",     "paradigma": "imperativo",     "ano_criacao": 2009, "tipagem": "estatica" },
  { "nome": "Rust",   "paradigma": "multiparadigma", "ano_criacao": 2010, "tipagem": "estatica" }
]
```

---

### 4.2 Objeto aninhado — extração de dados

Ideal para processar documentos, notas fiscais, contratos ou qualquer texto com estrutura implícita que precise ser convertido para formato estruturado.

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "contents": [{
      "parts": [{ "text": "Extraia: ACME Ltda, CNPJ 12.345.678/0001-99, 10/03/2026, R$1.500,00, 2x Cadeira R$500, 1x Mesa R$500." }]
    }],
    "generationConfig": {
      "responseMimeType": "application/json",
      "responseSchema": {
        "type": "object",
        "properties": {
          "empresa":      { "type": "string" },
          "cnpj":         { "type": "string" },
          "data_emissao": { "type": "string", "description": "Formato YYYY-MM-DD" },
          "valor_total":  { "type": "number" },
          "itens": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "descricao":      { "type": "string" },
                "quantidade":     { "type": "integer" },
                "valor_unitario": { "type": "number" }
              },
              "required": ["descricao", "quantidade", "valor_unitario"]
            }
          }
        },
        "required": ["empresa", "cnpj", "data_emissao", "valor_total", "itens"]
      }
    }
  }'
```

**Resposta garantida:**
```json
{
  "empresa": "ACME Ltda",
  "cnpj": "12.345.678/0001-99",
  "data_emissao": "2026-03-10",
  "valor_total": 1500.00,
  "itens": [
    { "descricao": "Cadeira", "quantidade": 2, "valor_unitario": 500.00 },
    { "descricao": "Mesa",    "quantidade": 1, "valor_unitario": 500.00 }
  ]
}
```

---

### 4.3 Classificação com enum — análise de sentimento

`enum` no schema restringe a saída a um conjunto predefinido de valores, eliminando variações de texto e garantindo integridade referencial.

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "contents": [{
      "parts": [{ "text": "Analise: Produto chegou rápido mas embalagem amassada e suporte não respondeu." }]
    }],
    "generationConfig": {
      "responseMimeType": "application/json",
      "responseSchema": {
        "type": "object",
        "properties": {
          "sentimento_geral": {
            "type": "string",
            "enum": ["positivo", "negativo", "neutro", "misto"]
          },
          "score": {
            "type": "number",
            "description": "De -1.0 (muito negativo) a 1.0 (muito positivo)"
          },
          "pontos_positivos": { "type": "array", "items": { "type": "string" } },
          "pontos_negativos": { "type": "array", "items": { "type": "string" } },
          "recomenda_acao": {
            "type": "string",
            "enum": ["responder_urgente", "responder_normal", "monitorar", "nenhuma"]
          }
        },
        "required": ["sentimento_geral", "score", "pontos_positivos", "pontos_negativos", "recomenda_acao"]
      }
    }
  }'
```

**Resposta garantida:**
```json
{
  "sentimento_geral": "misto",
  "score": -0.3,
  "pontos_positivos": ["Entrega rápida"],
  "pontos_negativos": ["Embalagem amassada", "Suporte sem resposta"],
  "recomenda_acao": "responder_urgente"
}
```

---

### 4.4 `text/x.enum` — valor único sem wrapper JSON

Quando o resultado é apenas uma palavra de um conjunto fixo, use `responseMimeType: "text/x.enum"`. A resposta é uma string limpa, sem chaves JSON, sem aspas — ideal para classificação de alta frequência.

```bash
curl "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -X POST \
  -d '{
    "contents": [{
      "parts": [{ "text": "Sistema de pagamento fora do ar há 2h, todos os clientes afetados." }]
    }],
    "generationConfig": {
      "responseMimeType": "text/x.enum",
      "responseSchema": {
        "type": "string",
        "enum": ["CRITICO", "ALTO", "MEDIO", "BAIXO"]
      }
    }
  }'

# Resposta: CRITICO
# Sem JSON, sem aspas, sem explicação — direto para if/switch.
```

---

### 4.5 Tipos suportados no `responseSchema`

| Tipo JSON Schema | Suporte | Observação |
|---|---|---|
| `string`, `integer`, `number`, `boolean` | ✅ Completo | Tipos primitivos totalmente suportados |
| `array`, `object` | ✅ Completo | Aninhamento ilimitado de níveis |
| `enum: [...]` | ✅ Completo | Restringe a valores fixos predefinidos |
| `nullable: true` | ✅ Completo | Campo pode retornar `null` |
| `description` | ✅ Recomendado | Melhora a precisão semântica do modelo |
| `required: [...]` | ✅ Obrigatório | Sempre inclua para garantir presença dos campos |
| `$ref` / `$defs` | ❌ Não suportado | Referências recursivas não funcionam |
| `oneOf` / `anyOf` / `allOf` | ⚠️ Parcial | Suporte instável — evitar em produção |

> **💡 DICA:** Sempre use `"description"` em campos com semântica ambígua. Ele funciona como instrução inline ao modelo e melhora significativamente a qualidade da extração, especialmente em dados textuais não estruturados.

---

## 5. Schemas JSON — Request e Response

### 5.1 Request body completo

```json
{
  "contents": [
    {
      "role": "user | model | tool",
      "parts": [
        { "text": "string" },
        { "inline_data": { "mime_type": "string", "data": "base64" } },
        { "file_data":   { "mime_type": "string", "file_uri": "string" } },
        { "function_call":     { "name": "string", "args": {} } },
        { "function_response": { "name": "string", "response": {} } }
      ]
    }
  ],
  "systemInstruction": {
    "parts": [{ "text": "instrução de sistema" }]
  },
  "tools": [{
    "functionDeclarations": [{ "name": "fn", "description": "...", "parameters": {} }],
    "googleSearch":   {},
    "codeExecution":  {},
    "urlContext":     {}
  }],
  "toolConfig": {
    "functionCallingConfig": { "mode": "AUTO | ANY | NONE" }
  },
  "safetySettings": [
    { "category": "HarmCategory", "threshold": "HarmBlockThreshold" }
  ],
  "generationConfig": {
    "temperature":        0.0,
    "topP":               0.0,
    "topK":               0,
    "maxOutputTokens":    0,
    "candidateCount":     1,
    "stopSequences":      ["string"],
    "responseMimeType":   "text/plain | application/json | text/x.enum",
    "responseSchema":     {},
    "responseModalities": ["TEXT", "IMAGE"],
    "presencePenalty":    0.0,
    "frequencyPenalty":   0.0,
    "seed":               0,
    "thinkingConfig": {
      "thinkingBudget":   0,
      "thinkingLevel":    "high | medium | low | minimal",
      "includeThoughts":  false
    }
  },
  "cachedContent": "cachedContents/{id}"
}
```

> **Nota:** Cada `Part` é um **union** — apenas um campo pode ser populado por part.

### 5.2 Response body

```json
{
  "candidates": [
    {
      "content": {
        "parts": [
          { "text": "resposta gerada" },
          { "inlineData": { "mimeType": "image/png", "data": "<base64>" } }
        ],
        "role": "model"
      },
      "finishReason": "STOP | MAX_TOKENS | SAFETY | RECITATION | OTHER",
      "index": 0,
      "safetyRatings": [
        {
          "category": "HARM_CATEGORY_HARASSMENT",
          "probability": "NEGLIGIBLE | LOW | MEDIUM | HIGH",
          "blocked": false
        }
      ],
      "citationMetadata": {
        "citations": [
          { "startIndex": 0, "endIndex": 100, "uri": "https://...", "title": "..." }
        ]
      }
    }
  ],
  "usageMetadata": {
    "promptTokenCount":         15,
    "candidatesTokenCount":     200,
    "totalTokenCount":          215,
    "cachedContentTokenCount":  0,
    "thoughtsTokenCount":       0
  },
  "modelVersion": "gemini-2.5-flash",
  "responseId":   "abc123"
}
```

> **Nota:** O campo `promptFeedback` aparece quando o prompt é bloqueado, indicando `blockReason` e `safetyRatings` do prompt.

---

## 6. Parâmetros de Configuração

| Parâmetro | Tipo | Range | Default | Descrição |
|---|---|---|---|---|
| `temperature` | float | 0.0 – 2.0 | 1.0 | Aleatoriedade. `0` = determinístico; `2` = máximo criativo. Modelos 3.x: manter em 1.0 (valores baixos podem causar loops). |
| `topP` | float | 0.0 – 1.0 | ~0.95 | Nucleus sampling. Seleciona tokens até acumular topP de probabilidade. |
| `topK` | int | 1 – 100+ | ~40 | Limita seleção aos K tokens mais prováveis em cada passo de geração. |
| `maxOutputTokens` | int | 1 – limite do modelo | Varia | Tokens máximos na resposta. Gemini 2.5+: até 65.536. |
| `stopSequences` | string[] | Até 5 | `[]` | Geração para ao encontrar qualquer sequência da lista. |
| `responseMimeType` | string | Enum | `text/plain` | `application/json` ativa JSON estruturado; `text/x.enum` para valor único. |
| `responseSchema` | object | OpenAPI 3.0 | — | Define schema de saída. Requer `responseMimeType: "application/json"`. |
| `presencePenalty` | float | — | 0.0 | Penaliza tokens já presentes na saída, aumentando diversidade. |
| `frequencyPenalty` | float | — | 0.0 | Penaliza proporcionalmente à frequência, reduzindo repetições. |
| `seed` | int | — | — | Semente para saída determinística e reproduzível. |
| `responseModalities` | string[] | — | `["TEXT"]` | Incluir `"IMAGE"` para gerar imagens via modelos Nano Banana. |
| `thinkingLevel` | string | Enum | — | `high`/`medium`/`low`/`minimal`. Controla profundidade de raciocínio (2.5+, 3.x). |

### 6.1 Safety Settings

Cinco categorias de segurança estão disponíveis:

| Categoria | Descrição |
|---|---|
| `HARM_CATEGORY_HARASSMENT` | Comentários negativos sobre identidade |
| `HARM_CATEGORY_HATE_SPEECH` | Conteúdo rude ou profano |
| `HARM_CATEGORY_SEXUALLY_EXPLICIT` | Conteúdo sexual |
| `HARM_CATEGORY_DANGEROUS_CONTENT` | Conteúdo que promove atos prejudiciais |
| `HARM_CATEGORY_CIVIC_INTEGRITY` | Consultas eleitorais |

Limiares: `BLOCK_LOW_AND_ABOVE` · `BLOCK_MEDIUM_AND_ABOVE` · `BLOCK_ONLY_HIGH` · `BLOCK_NONE` · `OFF`

> O default em modelos **2.5+ estáveis** é `BLOCK_NONE`.

---

## 7. Rate Limits, Quotas e Preços

### 7.1 Sistema de tiers

| Tier | Requisito | RPM (Flash) | RPD (Flash) | TPM |
|---|---|---|---|---|
| **Free** | Sem billing | ~10 RPM | ~250 RPD | 250K |
| **Tier 1** | Billing vinculado | ~200–300 RPM | Ilimitado | 1M |
| **Tier 2** | Gasto > $250 + 30 dias | ~500–1.500 RPM | Ilimitado | 2M |
| **Tier 3** | Gasto > $1.000 + 30 dias | ~1.000–4.000 RPM | Ilimitado | Personalizado |

> **⚠️ ATENÇÃO:** Rate limits são **por projeto** Google Cloud, não por API Key. Exceder qualquer dimensão (RPM, RPD ou TPM) retorna **HTTP 429**. O RPD reseta à meia-noite no horário Pacific Time.

### 7.2 Preços de texto (USD por 1M tokens)

| Modelo | Input ≤200K | Input >200K | Output | Batch (50% off) |
|---|---|---|---|---|
| Gemini 2.5 Flash-Lite | $0.10 | $0.20 | $0.40 | $0.05 / $0.20 |
| Gemini 2.5 Flash | $0.30 | $0.60 | $2.50 | $0.15 / $1.25 |
| Gemini 3 Flash Preview | $0.50 | $1.00 | $3.00 | $0.25 / $1.50 |
| Gemini 2.5 Pro | $1.25 | $2.50 | $10.00 | $0.625 / $5.00 |
| Gemini 3.1 Pro Preview | $2.00 | $4.00 | $12.00 | $1.00 / $6.00 |

### 7.3 Preços de geração de imagem (por imagem)

| Modelo | Preço | Qualidade |
|---|---|---|
| Imagen 4 Fast | $0.02 | Boa — otimizado para velocidade |
| Imagen 4 Standard | $0.04 | Excelente — uso geral |
| Imagen 4 Ultra | $0.06 | Máxima — detalhes e fotorrealismo |
| Gemini 2.5 Flash Image (~1K) | ~$0.039 | Boa — conversacional |
| Gemini 3 Pro Image (~1K) | ~$0.134 | Excelente — alta fidelidade |

### 7.4 Tier gratuito — o que está incluído

- ✅ `gemini-2.5-flash`, `gemini-2.5-flash-lite` e modelos Flash preview com limites de RPM/RPD reduzidos
- ⚠️ `gemini-2.5-pro` disponível no free tier, mas **extremamente limitado** (~5 RPM, ~25–100 RPD)
- ❌ `gemini-3.1-pro-preview` — **somente pago**
- ❌ Imagen 4 — exige billing ativado
- ⚠️ Dados do tier gratuito podem ser usados pelo Google para melhorar produtos

---

## 8. Alternativas Consideradas

| Alternativa | Pontos fortes | Pontos fracos | Razão da rejeição |
|---|---|---|---|
| **OpenAI API (GPT-4o)** | Ecossistema maduro, DALL-E 3 integrado, ampla adoção | Sem tier gratuito real, custo elevado, contexto menor | Custo por token 3–5× maior. Tier free inexistente para produção. |
| **Anthropic Claude API** | Excelente raciocínio e segurança, Haiku barato | Sem geração de imagens nativa, sem tier gratuito | Ausência de geração de imagens elimina requisito core do projeto. |
| **Azure OpenAI Service** | Compliance enterprise, SLA robusto, integração Azure | Sem tier gratuito, setup complexo, latência variável | Overhead operacional elevado para fase inicial. Candidato para produção enterprise futura. |
| **Cohere API** | Embeddings excelentes, bom custo-benefício texto | Sem geração de imagens, menor qualidade de reasoning | Capacidades de imagem ausentes. Adequado apenas para casos de uso texto. |
| **Mistral AI API** | Open weights disponíveis, custo muito baixo | Sem geração de imagens, infraestrutura menos madura | Geração de imagens ausente. Considerado para texto em workloads de altíssimo volume. |
| **Vertex AI (Google)** | Enterprise-grade, SLA, data residency, Model Garden | Sem tier gratuito, setup complexo, billing obrigatório | Mesma tecnologia Gemini com overhead maior. Adoção planejada para fase enterprise. |
| **Self-hosted (Llama/Mistral)** | Controle total, sem custo por token, privacidade | Alto custo infra GPU, manutenção, inferior em qualidade | TCO total mais alto. Sem capacidade de imagem equivalente. Avaliado para dados ultra-sensíveis. |

---

## 9. Google AI Studio vs Vertex AI

| Aspecto | AI Studio (Developer API) | Vertex AI (Enterprise) |
|---|---|---|
| **Endpoint base** | `generativelanguage.googleapis.com` | `{REGION}-aiplatform.googleapis.com` |
| **Autenticação** | API Key (`x-goog-api-key`) | Service Account / IAM / OAuth / ADC |
| **Setup inicial** | Minutos (gerar chave no AI Studio) | Requer projeto GCP, billing, configuração IAM |
| **Tier gratuito** | ✅ Sim — disponível para prototipagem | ❌ Não — billing obrigatório desde o início |
| **SLA formal** | ❌ Sem SLA garantido | ✅ SLA enterprise disponível |
| **Dados para treinamento** | Free tier: podem ser usados pelo Google | Nunca usados para treinamento de modelos |
| **Compliance** | Básico (sem HIPAA, SOC avançado) | HIPAA, SOC 2, VPC Service Controls, CMEK |
| **Model Garden** | Apenas modelos Gemini e Imagen | Gemini + Claude + Llama + Mistral + centenas |
| **Fine-tuning** | Limitado (apenas supervised) | Completo (RLHF, distilação, DPO) |
| **Provisioned Throughput** | ❌ Não disponível | ✅ Throughput garantido disponível |
| **Data Residency** | ❌ Não configurável | ✅ Controle de região e residência de dados |
| **Recomendação** | 🚀 Dev, prototipagem e startups | 🏢 Produção enterprise e dados sensíveis |

### 9.1 Exemplo equivalente no Vertex AI

```bash
curl -X POST \
  "https://us-central1-aiplatform.googleapis.com/v1/projects/MEU_PROJETO/locations/us-central1/publishers/google/models/gemini-2.5-flash:generateContent" \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d '{"contents":[{"parts":[{"text":"Olá, mundo!"}]}]}'
```

> A migração entre plataformas é facilitada pelo SDK unificado `google-genai`. No REST direto, a diferença é apenas o endpoint e o método de autenticação.

---

## 10. Consequências

### 10.1 Consequências positivas

- Único provedor cobre texto e imagem, **reduzindo complexidade operacional** e número de contratos
- Tier gratuito viabiliza desenvolvimento e validação sem custo inicial de infraestrutura
- Contexto de **1M tokens** permite processar documentos longos, bases de código e históricos extensos em uma única chamada
- Structured Output nativo elimina parseamento frágil de texto e garante contratos de dados previsíveis
- Streaming SSE nativo permite interfaces conversacionais responsivas sem polling
- Compatibilidade com endpoint OpenAI facilita migração ou comparação com outros provedores
- Caminho de migração natural para Vertex AI quando compliance enterprise for necessário
- Suporte a function calling, code execution e search grounding expande capacidades sem custo de infraestrutura adicional

### 10.2 Consequências negativas e riscos

- **Dependência de provedor único (vendor lock-in)** — mitigado pela camada de abstração no serviço de IA
- Tier gratuito tem limites estritos; picos de uso podem causar throttling em fases de crescimento
- Dados no tier gratuito podem ser usados para treinamento — **dados sensíveis de usuário devem usar tier pago**
- Modelos preview (série 3.x) podem ter breaking changes — necessário versionamento explícito de modelo em produção
- Latência de geração de imagens pode ser incompatível com UX síncrono — considerar filas assíncronas
- Structured Output não suporta `$ref` e tem suporte parcial a `oneOf`/`anyOf` — schemas complexos precisam ser simplificados

### 10.3 Ações de mitigação recomendadas

1. Implementar uma **camada de abstração** (`interface AIProvider`) para isolar dependência do provedor
2. **Versionar explicitamente** o model ID em produção — nunca usar alias como `gemini-flash-latest`
3. Usar tier pago (billing ativado) para qualquer dado que inclua PII ou informação sensível
4. Implementar **circuit breaker e retry** com backoff exponencial para erros HTTP 429 e 503
5. Monitorar `usageMetadata` em cada resposta para **controle de custos** em tempo real
6. Criar **testes de contrato** para `responseSchema` — schemas mudados no código devem falhar CI antes de produção
7. Documentar todos os prompts de sistema como **artefatos versionados** no repositório

---

## 11. Critérios de Revisão desta ADR

Esta ADR deve ser revisada quando um dos seguintes eventos ocorrer:

- Lançamento de modelos com breaking changes que afetem schemas de request/response
- Custo mensal de inferência superar **30% do orçamento de infraestrutura**
- Necessidade de compliance HIPAA, SOC 2 ou regulações de dados regionais
- SLA de disponibilidade da aplicação exigir garantias formais que o AI Studio não ofereça
- Surgimento de alternativa com custo **50% menor** para o mesmo nível de qualidade
- Requisito de fine-tuning com RLHF ou DPO para domínio específico

**Próxima revisão programada: Setembro 2026.**

---

## Referências

- [Gemini API Reference](https://ai.google.dev/api)
- [Models | Gemini API](https://ai.google.dev/gemini-api/docs/models)
- [Image Generation | Gemini API](https://ai.google.dev/gemini-api/docs/image-generation)
- [Imagen | Gemini API](https://ai.google.dev/gemini-api/docs/imagen)
- [Safety Settings | Gemini API](https://ai.google.dev/gemini-api/docs/safety-settings)
- [Rate Limits | Gemini API](https://ai.google.dev/gemini-api/docs/rate-limits)
- [Pricing | Gemini API](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini Developer API vs Vertex AI](https://ai.google.dev/gemini-api/docs/migrate-to-cloud)
- [API Versions Explained](https://ai.google.dev/gemini-api/docs/api-versions)

---

*ADR-001 · v1.2.0 · Aceito · 09 Mar 2026 · Time de Arquitetura*