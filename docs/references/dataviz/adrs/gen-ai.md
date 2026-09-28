# ADR-0001 — @google/genai: SDK Unificado Google para Vertex AI em Node.js

| Campo            | Valor                          |
|------------------|-------------------------------|
| **Identificador**| ADR-0001                      |
| **Pacote NPM**   | `@google/genai@1.44.0`        |
| **Status**       | ✅ Aceito                      |
| **Data**         | Março / 2026                  |
| **Node.js mín.** | v20 LTS                       |
| **Responsável**  | Time de Arquitetura           |
| **Substitui**    | `@google-cloud/vertexai`, `@google/generative-ai` |

---

## 1. Título

Adoção do SDK Unificado `@google/genai` como biblioteca padrão para integração com Google Vertex AI em projetos Node.js.

---

## 2. Status

**✅ ACEITO — Março / 2026**

Substitui:
- `@google-cloud/vertexai` — descontinuado em 24/06/2025, remoção em **24/06/2026**
- `@google/generative-ai` — arquivado em 16/12/2025, fim de vida em **31/08/2025**

---

## 3. Contexto

O ecossistema de SDKs para Vertex AI no Node.js passou por uma consolidação crítica em 2025. Historicamente, dois pacotes dividiam o espaço:

- **`@google-cloud/vertexai`** — para ambientes Google Cloud / Vertex AI
- **`@google/generative-ai`** — para a Gemini Developer API (AI Studio)

Essa divisão criava fricção: os times precisavam manter dois conjuntos de abstrações, tipos incompatíveis e padrões de inicialização distintos para o que é, na prática, o mesmo modelo Gemini.

Em **maio de 2025**, o Google DeepMind lançou o `@google/genai` como GA — um SDK de primeira linha capaz de direcionar tanto a Gemini Developer API quanto a Vertex AI via flag de inicialização. Em **junho de 2025**, o `@google-cloud/vertexai` foi oficialmente descontinuado.

### Situação dos SDKs em Março de 2026

| Pacote                    | Versão Atual | Status               | Prazo Final  |
|---------------------------|--------------|----------------------|--------------|
| `@google/genai`           | **1.44.0**   | ✅ Ativo (GA)         | —            |
| `@google-cloud/vertexai`  | 1.10.0       | ⛔ Descontinuado      | 24/06/2026   |
| `@google/generative-ai`   | 0.24.1       | ⛔ Arquivado (EoL)    | 31/08/2025   |

### Fatores que motivaram a decisão

- **Convergência forçada pela Google:** modelos Gemini 2.5, Gemini 3.x, Veo, Imagen 3 e Live API só são acessíveis via `@google/genai`.
- **Novos recursos exclusivos:** Live API (voz bidirecional), Deep Research Agent, Grounding com Google Search, Context Caching explícito.
- **Deadline obrigatório:** remoção do `@google-cloud/vertexai` em 24/06/2026 impõe urgência na migração.
- **Unificação de API:** uma única instância `GoogleGenAI` serve Gemini Developer API (chave API) e Vertex AI (ADC/service account).
- **TypeScript first:** tipos completos inclusos no pacote, sem necessidade de `@types/*` adicionais.

---

## 4. Decisão

Adotamos `@google/genai@1.44.0` como **única e exclusiva biblioteca** para integração com o Google Vertex AI em todos os projetos Node.js. O uso dos pacotes legados é proibido em código novo. Código existente deve ser migrado até **01/05/2026**.

---

### 4.1 Instalação e Requisitos

```bash
# Instalação
npm install @google/genai

# Requisitos de runtime
# Node.js >= 20 LTS
# TypeScript >= 5.0 (tipos incluídos no pacote — sem @types/* adicionais)
# Sem peer dependencies adicionais (google-auth-library é interno ao SDK)
```

---

### 4.2 Inicialização para Vertex AI

A diferença entre Vertex AI e Gemini Developer API é somente um parâmetro no construtor:

```typescript
import { GoogleGenAI } from '@google/genai';

// Produção: Vertex AI com ADC (Application Default Credentials) — RECOMENDADO
const ai = new GoogleGenAI({
  vertexai: true,
  project:  process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION ?? 'us-central1',
});

// Alternativa via variáveis de ambiente (inicialização sem argumentos)
// export GOOGLE_GENAI_USE_VERTEXAI=true
// export GOOGLE_CLOUD_PROJECT=meu-projeto-id
// export GOOGLE_CLOUD_LOCATION=us-central1
const aiEnv = new GoogleGenAI();

// Desenvolvimento: Vertex AI Express Mode (API Key, sem billing completo)
const aiDev = new GoogleGenAI({
  vertexai: true,
  apiKey: process.env.VERTEX_EXPRESS_API_KEY,
});
```

**Variáveis de ambiente padrão (`.env`):**

```bash
GOOGLE_CLOUD_PROJECT=meu-projeto-123
GOOGLE_CLOUD_LOCATION=us-central1
GOOGLE_GENAI_USE_VERTEXAI=true

# Opcional: forçar endpoint de API estável (sem features em preview)
# GOOGLE_GENAI_API_VERSION=v1
```

---

### 4.3 Geração de Conteúdo

```typescript
// --- Geração síncrona --------------------------------------------------------
const response = await ai.models.generateContent({
  model:    'gemini-2.5-flash',
  contents: 'Explique arquitetura hexagonal em 3 parágrafos.',
  config: {
    temperature:       0.7,
    topP:              0.95,
    maxOutputTokens:   2048,
    systemInstruction: ['Você é um arquiteto de software sênior.'],
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  },
});
console.log(response.text);

// --- Streaming (Server-Sent Events) ------------------------------------------
const stream = await ai.models.generateContentStream({
  model:    'gemini-2.5-flash',
  contents: 'Escreva um documento técnico extenso.',
});
for await (const chunk of stream) {
  process.stdout.write(chunk.text ?? '');
}

// --- JSON Estruturado (Structured Output) ------------------------------------
const jsonResp = await ai.models.generateContent({
  model:    'gemini-2.5-flash',
  contents: 'Liste 3 linguagens com pros e cons em JSON.',
  config:   { responseMimeType: 'application/json' },
});
const data = JSON.parse(jsonResp.text);
```

---

### 4.4 Embeddings

```typescript
// gemini-embedding-001: 3.072 dimensões, 8K tokens, 100+ idiomas
// #1 no ranking MTEB Multilingual (Março 2026)
const embResp = await ai.models.embedContent({
  model:    'gemini-embedding-001',
  contents: 'Texto para vetorizar',
  config: {
    outputDimensionality: 768,         // opções: 768 | 1024 | 3072
    taskType: 'RETRIEVAL_DOCUMENT',    // ou RETRIEVAL_QUERY | SEMANTIC_SIMILARITY
  },
});
const vector = embResp.embeddings[0].values; // Float32Array
```

---

### 4.5 Function Calling (Ferramentas)

```typescript
const weatherTool = {
  name:        'get_weather',
  description: 'Retorna temperatura e condição climática de uma cidade.',
  parametersJsonSchema: {
    type: 'object',
    properties: {
      city:  { type: 'string', description: 'Nome da cidade' },
      units: { type: 'string', enum: ['celsius', 'fahrenheit'] },
    },
    required: ['city'],
  },
};

const fc = await ai.models.generateContent({
  model:    'gemini-2.5-flash',
  contents: 'Qual a temperatura em São Paulo agora?',
  config: {
    tools: [{ functionDeclarations: [weatherTool] }],
    toolConfig: {
      functionCallingConfig: {
        mode: 'AUTO', // AUTO | ANY | NONE
      },
    },
  },
});

const call = fc.candidates[0].content.parts
               .find(p => p.functionCall)?.functionCall;
// call.name === 'get_weather'
// call.args === { city: 'São Paulo' }
```

---

### 4.6 Grounding com Google Search

```typescript
// Fundamenta respostas em dados da web em tempo real
const grounded = await ai.models.generateContent({
  model:    'gemini-2.5-flash',
  contents: 'Quais as novidades do Node.js 24 lançadas hoje?',
  config: {
    tools: [{ googleSearch: {} }],
  },
});

// Metadados de fontes disponíveis em:
// grounded.candidates[0].groundingMetadata.groundingChunks
// Custo: $35 / 1.000 prompts fundamentados (cota diária ~1.500 gratuitos)
```

---

### 4.7 Context Caching — 90% de Desconto

```typescript
// 1. Criar cache com TTL configurável (mínimo: 2.048 tokens no prompt)
const cache = await ai.caches.create({
  model:    'gemini-2.5-flash',
  contents: [{ role: 'user', parts: [{ text: documentoGrande }] }],
  ttl:      '3600s', // padrão: 60 min | máximo: 24h
});

// 2. Reutilizar cache em N chamadas (90% off nos tokens de input cacheados)
const resp = await ai.models.generateContent({
  model:         'gemini-2.5-flash',
  contents:      'Resuma o documento em 5 tópicos.',
  cachedContent: cache.name,
});

// Cache implícito: habilitado por padrão, sem código adicional.
// O SDK reutiliza KV pairs idênticos automaticamente.
```

---

### 4.8 Multimodal — Imagem, Áudio e Vídeo

```typescript
import { createPartFromUri, createUserContent } from '@google/genai';

// Upload de arquivo (imagem, PDF, áudio, vídeo)
const file = await ai.files.upload({
  file:   fs.createReadStream('./diagrama.png'),
  config: { mimeType: 'image/png' },
});

const multiResp = await ai.models.generateContent({
  model:    'gemini-2.5-flash',
  contents: createUserContent([
    createPartFromUri(file.uri, file.mimeType),
    'Descreva este diagrama de arquitetura em detalhes.',
  ]),
});
```

---

### 4.9 Retry com Backoff Exponencial

```typescript
// O SDK já inclui retry automático para 429/5xx.
// Use esta função apenas para lógica customizada adicional.
async function generateWithRetry(params, maxRetries = 5) {
  const NON_RETRYABLE = new Set([400, 401, 403, 404]);
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await ai.models.generateContent(params);
    } catch (err) {
      const status = err?.status ?? err?.code;
      if (NON_RETRYABLE.has(status) || attempt === maxRetries) throw err;
      // Backoff exponencial com jitter
      const delay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 32000);
      await new Promise(r => setTimeout(r, delay));
    }
  }
}

// Dica: trocar endpoint regional para 'global' pode resolver 429 persistentes
// new GoogleGenAI({ vertexai: true, location: 'global', ... })
```

---

## 5. Modelos Disponíveis via @google/genai

| Model ID                              | Status          | Contexto     | Pontos Fortes                        |
|---------------------------------------|-----------------|--------------|--------------------------------------|
| `gemini-2.5-pro`                      | ✅ GA            | 1M / 65K tok | Raciocínio, código, análise complexa |
| `gemini-2.5-flash`                    | ✅ GA            | 1M / 65K tok | Velocidade + custo, modo pensamento  |
| `gemini-2.5-flash-lite`               | ✅ GA            | 1M / 65K tok | Menor custo da família 2.5           |
| `gemini-2.0-flash-001`                | ⚠️ Sunset Jun/26 | 1M / 8K tok  | Migrar para `gemini-2.5-flash`       |
| `gemini-3.1-pro-preview`              | 🔬 Preview       | 1M / 64K tok | Raciocínio next-gen                  |
| `gemini-3-flash-preview`              | 🔬 Preview       | 1M / 64K tok | Velocidade de próxima geração        |
| `gemini-embedding-001`                | ✅ GA            | 8K tok input | 3.072 dims, #1 MTEB multilingual     |
| `gemini-live-2.5-flash-native-audio`  | ✅ GA            | —            | Voz bidirecional em tempo real       |

**Todos os modelos GA suportam:**
- Function Calling (modos: `AUTO`, `ANY`, `NONE`)
- Grounding com Google Search e Vertex AI Search
- System Instructions e Safety Settings configuráveis
- JSON estruturado (`responseMimeType: 'application/json'`)
- Streaming de resposta e Server-Sent Events
- Context Caching explícito e implícito
- Code Execution integrada (sandbox Python no modelo)

---

## 6. Modelo de Preços (USD por 1 Milhão de Tokens)

| Modelo                | Input ≤200K | Input >200K | Output ≤200K | Output >200K |
|-----------------------|-------------|-------------|--------------|--------------|
| Gemini 2.5 Pro        | $1,25       | $2,50       | $10,00       | $15,00       |
| Gemini 2.5 Flash      | $0,15       | $0,30       | $0,60        | $1,20        |
| Gemini 2.5 Flash-Lite | $0,075      | —           | $0,30        | —            |
| Gemini 2.0 Flash      | $0,15       | —           | $0,60        | —            |

**Descontos estratégicos:**
- **Batch Prediction** (assíncrono via GCS/BigQuery): **50% de desconto** em toda a inferência.
- **Context Caching explícito**: **90% de desconto** nos tokens de input cacheados (Gemini 2.5+).
- **Context Caching implícito**: habilitado por padrão, sem código adicional.
- **Grounding com Google Search**: $35 / 1.000 prompts fundamentados (cota diária gratuita ~1.500 prompts).
- Somente respostas HTTP 200 são faturadas.

---

## 7. Infraestrutura e Configuração Google Cloud

### 7.1 Pré-requisitos

| Recurso                   | Configuração Necessária                                                |
|---------------------------|------------------------------------------------------------------------|
| Projeto GCP               | Criado com billing ativado                                             |
| API obrigatória           | `aiplatform.googleapis.com`                                            |
| APIs complementares       | `storage.googleapis.com`, `cloudkms.googleapis.com`, `compute.googleapis.com` |
| IAM — role mínimo         | `roles/aiplatform.user` (inferência padrão)                           |
| IAM — role admin          | `roles/aiplatform.admin` (gestão de recursos e IAM)                   |
| Autenticação local        | `gcloud auth application-default login`                               |
| Autenticação em produção  | Service Account + Workload Identity Federation (GKE / Cloud Run)      |

### 7.2 Regiões Disponíveis

| Região / Cluster   | Exemplos                                                     | Observação                         |
|--------------------|--------------------------------------------------------------|------------------------------------|
| América do Norte   | `us-central1`, `us-east1`, `us-west1` (+ 7 outras)          | Mais features GA disponíveis       |
| Europa             | `europe-west1..12`, `europe-north1`, `europe-central2`       | Conformidade GDPR                  |
| América do Sul     | `southamerica-east1` (São Paulo)                             | LGPD / menor latência para BR      |
| Ásia-Pacífico      | `asia-east1`, `asia-southeast1`, `asia-northeast1` (+ 8)    | —                                  |
| Global             | `location: 'global'`                                         | Sem garantia de residência de dados|

---

## 8. Segurança e Conformidade

| Certificação           | Escopo                                                               |
|------------------------|----------------------------------------------------------------------|
| SOC 1 / 2 / 3          | Auditoria anual — relatórios via Cloud Console                       |
| ISO 27001/27017/27018  | Segurança da informação, serviços em nuvem, dados pessoais           |
| ISO 42001:2023         | AI Management System — específico para sistemas de IA                |
| HIPAA                  | Requer BAA (Business Associate Agreement) com o Google               |
| PCI DSS                | Ambientes de pagamento                                               |
| FedRAMP Moderate / High| Moderate padrão; High via Assured Workloads                          |
| GDPR                   | Configurar região EU + private endpoints + CMEK                      |
| LGPD (Brasil)          | Usar `southamerica-east1` + VPC-SC para dados pessoais BR            |

### VPC Service Controls
- Cria perímetro que bloqueia todo acesso público ao Vertex AI — recomendado para ambientes regulados.
- Requer configuração de Access Context Manager no nível organizacional GCP.
- Jobs de treino dentro do perímetro sem acesso externo precisam de proxy (Squid/Envoy) + Cloud NAT.

### CMEK (Customer-Managed Encryption Keys)
- Chaves via Cloud KMS (FIPS 140-2 L2), Cloud HSM (L3) ou Cloud EKM (chaves externas).
- Cobre: boot disks, dados de treino, modelos, endpoints, batch prediction e RAG Engine corpus.
- Chave deve residir na mesma região que o recurso.
- Service Agent necessita de `roles/cloudkms.cryptoKeyEncrypterDecrypter`.

### Audit Logging
- **Admin Activity Logs:** sempre habilitados, gratuitos, imutáveis.
- **Data Access Logs:** desabilitados por padrão — habilitar explicitamente para HIPAA, PCI DSS e LGPD.

---

## 9. Consequências

### 9.1 Positivas
- Acesso imediato a Gemini 2.5/3.x, Veo, Imagen 3 e Live API sem refatoração futura.
- Uma única instância `GoogleGenAI` serve Vertex AI e Gemini Dev API — reduz abstrações.
- Eliminação do risco de remoção do `@google-cloud/vertexai` em junho de 2026.
- TypeScript first: tipos completos, sem `@types/*` adicionais.
- Context Caching e Batch Prediction nativos para otimização de custos.
- Compatível com LangChain.js, Firebase Genkit e Vercel AI SDK sem troca de SDK base.

### 9.2 Negativas / Trade-offs
- Vendor lock-in no ecossistema Google (mitigável via Vercel AI SDK ou camada de abstração).
- SDK emite beta endpoints por padrão — usar `GOOGLE_GENAI_API_VERSION=v1` para forçar estável.
- Cold start em Cloud Functions < 512 MiB: pacote excede a alocação padrão — alocar >= 512 MiB.
- Custos de Grounding com Google Search ($35/1K prompts) podem não estar no orçamento previsto.

### 9.3 Riscos e Mitigações

| Risco                              | Probabilidade | Mitigação                                                    |
|------------------------------------|---------------|--------------------------------------------------------------|
| Quota 429 em pico de tráfego       | Alta          | Retry com backoff; endpoint `global`; Provisioned Throughput |
| Breaking changes em minor/patch    | Média         | Pinagem semântica (`^1.44.0`); testes de contrato CI/CD      |
| Dados pessoais fora da região      | Média         | `location` explícito; VPC-SC; `southamerica-east1` para BR   |
| Custo não planejado por caching    | Baixa         | Cloud Billing Budget Alerts; revisar TTL do cache            |
| Preview models em produção         | Baixa         | Usar somente model IDs GA; previews apenas em staging        |

---

## 10. Alternativas Consideradas

| Alternativa                             | Por que foi descartada                                                                |
|-----------------------------------------|---------------------------------------------------------------------------------------|
| Manter `@google-cloud/vertexai`         | Descontinuado; remoção mandatória em 24/06/2026; sem suporte a novos modelos         |
| `@google/generative-ai`                 | Arquivado; EoL 31/08/2025; sem features Vertex AI enterprise                         |
| LangChain.js como camada base           | Overhead de abstração; atraso em features novas; `@google/genai` ainda necessário    |
| Vercel AI SDK (`@ai-sdk/google-vertex`) | Adotado como camada *opcional* para apps provider-agnostic; não substitui o SDK base |
| REST API direta                         | Maior manutenção; sem retry automático; sem tipos; sem streaming simplificado         |
| Firebase Genkit                         | Adotado como framework de alto nível opcional; não substitui o SDK base              |

---

## 11. Integrações com o Ecossistema Node.js

| Framework            | Pacote NPM                      | Versão  | Notas                                        |
|----------------------|---------------------------------|---------|----------------------------------------------|
| LangChain.js         | `@langchain/google-vertexai`    | 2.1.24  | `ChatVertexAI` com ferramentas e streaming   |
| Firebase Genkit      | `@genkit-ai/google-genai`       | 1.29.0  | Plugin unificado Google AI + Vertex AI       |
| Vercel AI SDK        | `@ai-sdk/google-vertex`         | 3.0.37  | Provider-agnostic; edge + Node.js            |
| LlamaIndex.TS        | `@llamaindex/google`            | Atual   | RAG e retrieval nativos                      |
| Cloud Run            | —                               | —       | ADC automático; `min-instances >= 1`         |
| Cloud Functions Gen 2| —                               | —       | Alocar >= 512 MiB; timeout até 60 min        |

---

## 12. Guia de Migração

```typescript
// --- ANTES (@google-cloud/vertexai — descontinuado) --------------------------
import { VertexAI } from '@google-cloud/vertexai';
const vertexai = new VertexAI({ project: 'my-proj', location: 'us-central1' });
const model = vertexai.getGenerativeModel({ model: 'gemini-1.5-flash' });
const result = await model.generateContent('Hello');
const text = result.response.candidates[0].content.parts[0].text;

// --- DEPOIS (@google/genai — atual) ------------------------------------------
import { GoogleGenAI } from '@google/genai';
const ai = new GoogleGenAI({
  vertexai: true,
  project:  'my-proj',
  location: 'us-central1',
});
const result = await ai.models.generateContent({
  model:    'gemini-2.5-flash', // 1.5-flash → 2.5-flash
  contents: 'Hello',
});
const text = result.text; // propriedade direta, mais limpo
```

### Mapeamento de Model IDs

| Modelo Anterior       | Substituto Recomendado   | Justificativa                                     |
|-----------------------|--------------------------|---------------------------------------------------|
| `gemini-1.5-flash`    | `gemini-2.5-flash`       | Mais rápido, contexto 1M, mesmo custo-benefício   |
| `gemini-1.5-pro`      | `gemini-2.5-pro`         | Maior contexto (1M), raciocínio superior          |
| `gemini-2.0-flash-001`| `gemini-2.5-flash`       | Sunset jun/26; 2.5 Flash superior em tudo         |
| `text-embedding-004`  | `gemini-embedding-001`   | #1 MTEB multilingual; 3.072 dimensões             |

---

## 13. Checklist de Implementação

- [ ] Instalar `@google/genai@^1.44.0` e remover `@google-cloud/vertexai` e `@google/generative-ai`
- [ ] Configurar variáveis de ambiente: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_GENAI_USE_VERTEXAI`
- [ ] Habilitar API `aiplatform.googleapis.com` no projeto GCP
- [ ] Configurar `roles/aiplatform.user` na Service Account de produção
- [ ] Definir `location` explícita no SDK (evitar `'global'` se houver requisito de residência de dados)
- [ ] Implementar retry com backoff exponencial para erros 429 e 5xx
- [ ] Configurar Cloud Billing Budget Alerts para monitorar custos de inferência
- [ ] Habilitar Data Access Logs se o projeto exigir HIPAA, PCI DSS ou LGPD
- [ ] Alocar >= 512 MiB de memória em Cloud Functions Gen 2 com `@google/genai`
- [ ] Configurar `min-instances >= 1` em Cloud Run para eliminar cold start
- [ ] Migrar model IDs: `gemini-1.5-*` → `gemini-2.5-*` e `text-embedding-004` → `gemini-embedding-001`
- [ ] Avaliar Context Caching explícito para prompts com contexto > 32K tokens (90% desconto)
- [ ] Avaliar Batch Prediction para workloads assíncronas (50% desconto)
- [ ] Implementar testes de contrato para detecção de breaking changes em updates do SDK

---

## 14. Referências

- [npm @google/genai (v1.44.0)](https://www.npmjs.com/package/@google/genai)
- [GitHub googleapis/js-genai — SDK Unificado](https://github.com/googleapis/js-genai)
- [Guia de Migração SDK Vertex AI](https://cloud.google.com/vertex-ai/generative-ai/docs/deprecations/genai-vertexai-sdk)
- [Vertex AI — Visão Geral](https://cloud.google.com/vertex-ai/docs/start/introduction-unified-platform)
- [Gemini 2.5 Pro — Documentação](https://cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/2-5-pro)
- [Context Caching — Visão Geral](https://cloud.google.com/vertex-ai/generative-ai/docs/context-cache/context-cache-overview)
- [Grounding com Google Search](https://cloud.google.com/vertex-ai/generative-ai/docs/grounding/grounding-with-google-search)
- [IAM e Controle de Acesso](https://cloud.google.com/vertex-ai/docs/general/access-control)
- [VPC Service Controls](https://cloud.google.com/vertex-ai/docs/general/vpc-service-controls)
- [CMEK — Chaves Gerenciadas pelo Cliente](https://cloud.google.com/vertex-ai/docs/general/cmek)
- [Batch Inference com Gemini](https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/batch-prediction-gemini)
- [RAG Engine — Visão Geral](https://cloud.google.com/vertex-ai/generative-ai/docs/rag-engine/rag-overview)
- [Pricing Vertex AI](https://cloud.google.com/vertex-ai/generative-ai/pricing)
- [Vertex AI Locations](https://cloud.google.com/vertex-ai/docs/general/locations)
- [Vertex AI Release Notes](https://cloud.google.com/vertex-ai/docs/core-release-notes)

---

> Documento baseado na versão `1.44.0` do `@google/genai`, publicada em Março de 2026.
> Validar datas de sunset e preços na documentação oficial do Google Cloud antes de cada sprint de planejamento.