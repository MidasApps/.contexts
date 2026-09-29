# Google Vertex AI with Node.js: complete ADR reference for 2025–2026

**The Vertex AI Node.js ecosystem underwent a fundamental shift in 2025: Google deprecated both legacy SDKs and consolidated everything into a single unified package, `@google/genai` (v1.44.0).** This SDK now serves as the single entry point for both the Gemini Developer API and Vertex AI enterprise endpoints, dramatically simplifying the developer experience. Meanwhile, the model landscape has accelerated to Gemini 2.5 (GA) and Gemini 3.x (preview), with Gemini 1.5 fully retired and 2.0 sunsetting in June 2026. This report covers every dimension needed for an Architecture Decision Record: SDK architecture, model capabilities, infrastructure, security, pricing, integrations, and operational best practices.

---

## The SDK has been unified — and the old packages are dead

The single most critical architectural decision is which SDK to use. As of March 2026, the answer is unambiguous:

| Package | Version | Status | Notes |
|---------|---------|--------|-------|
| **`@google/genai`** | **1.44.0** | ✅ Active (GA since May 2025) | Unified SDK for Gemini API + Vertex AI |
| `@google-cloud/vertexai` | 1.10.0 | ⛔ Deprecated June 24, 2025 | Removal: June 24, 2026 |
| `@google/generative-ai` | 0.16.1 | ⛔ Archived Dec 16, 2025 | End-of-life: Aug 31, 2025 |

**Installation and minimum requirements:**

```bash
npm install @google/genai
```

Node.js **20 or later** is required. The SDK is written in TypeScript with full type definitions included. No peer dependencies are needed for basic usage; `google-auth-library` is bundled internally.

**Initialization for Vertex AI** follows two patterns — explicit or environment-based:

```typescript
import { GoogleGenAI } from '@google/genai';

// Explicit configuration
const ai = new GoogleGenAI({
  vertexai: true,
  project: 'my-project-id',
  location: 'us-central1',
});

// Environment-based (set GOOGLE_GENAI_USE_VERTEXAI=true,
// GOOGLE_CLOUD_PROJECT, GOOGLE_CLOUD_LOCATION)
const ai = new GoogleGenAI();
```

**Authentication methods** supported include Application Default Credentials (ADC) via `gcloud auth application-default login` for local development; automatic service account detection on GCP compute (Cloud Run, Cloud Functions, GKE); Workload Identity Federation for external environments; explicit service account JSON via `GOOGLE_APPLICATION_CREDENTIALS`; and a new **Vertex AI Express Mode** that accepts API keys directly (`new GoogleGenAI({ vertexai: true, apiKey: 'KEY' })`).

The SDK exposes a clean submodule architecture: `ai.models` for generation and embeddings, `ai.caches` for context caching, `ai.chats` for multi-turn sessions, `ai.files` for file management, and `ai.interactions` (beta) for agent-style workflows.

**Core code patterns** for generation:

```typescript
// Non-streaming
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Explain quantum computing',
  config: {
    temperature: 0.7,
    topP: 0.95,
    topK: 20,
    maxOutputTokens: 2048,
    systemInstruction: ['You are a physics professor.'],
    responseMimeType: 'application/json',
    safetySettings: [
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  },
});

// Streaming
const stream = await ai.models.generateContentStream({
  model: 'gemini-2.5-flash',
  contents: 'Write a detailed essay.',
});
for await (const chunk of stream) {
  process.stdout.write(chunk.text);
}
```

**Migration from the legacy SDK** is straightforward. The old `VertexAI → getGenerativeModel → generateContent` chain maps to the new `GoogleGenAI → ai.models.generateContent` pattern. The `startChat` → `sendMessage` flow maps to `ai.interactions.create` with `previous_interaction_id` chaining (currently beta).

---

## Gemini model landscape: what's available and what it costs

The model portfolio has evolved rapidly. **Gemini 1.5 is fully retired** (returns 404). Gemini 2.0 Flash is sunsetting **June 1, 2026**. The current production workhorses are Gemini 2.5 Pro and 2.5 Flash, with Gemini 3.x models in preview.

### Current model matrix

| Model | Model ID | Status | Context (in/out) | Input Modalities | Key Strengths |
|-------|----------|--------|-------------------|-----------------|---------------|
| **Gemini 2.5 Pro** | `gemini-2.5-pro` | GA | 1M / 65K tokens | Text, code, image, audio, video | Reasoning, coding, analysis |
| **Gemini 2.5 Flash** | `gemini-2.5-flash` | GA | 1M / 65K tokens | Text, code, image, audio, video | Speed, cost, thinking mode |
| **Gemini 2.5 Flash-Lite** | `gemini-2.5-flash-lite` | GA | 1M / 65K tokens | Text, code, image, audio, video | Lowest cost in 2.5 family |
| Gemini 2.0 Flash | `gemini-2.0-flash-001` | GA (retiring June 2026) | 1M / 8K tokens | Text, code, image, audio, video | Legacy workhorse |
| Gemini 3.1 Pro | `gemini-3.1-pro-preview` | Preview | 1M / 64K tokens | Full multimodal | Enhanced reasoning |
| Gemini 3 Flash | `gemini-3-flash-preview` | Preview | 1M / 64K tokens | Full multimodal | Next-gen speed |

All GA models support **function calling, grounding with Google Search, system instructions, structured JSON output, code execution, context caching, and the RAG Engine**. The 2.5 models introduce **thinking mode** (controllable reasoning budgets via `thinkingConfig`). Knowledge cutoff for 2.5 models is **January 2025**.

### Pricing per 1 million tokens (USD)

| Model | Input (≤200K) | Input (>200K) | Output (≤200K) | Output (>200K) |
|-------|---------------|---------------|----------------|----------------|
| **Gemini 2.5 Pro** | $1.25 | $2.50 | $10.00 | $15.00 |
| **Gemini 2.5 Flash** | $0.15 | $0.30 | $0.60 | $1.20 |
| **Gemini 2.5 Flash-Lite** | $0.075 | — | $0.30 | — |
| Gemini 2.0 Flash | $0.15 | — | $0.60 | — |

**Batch prediction** runs at roughly **50% discount** versus real-time inference. **Context caching** provides **90% off input token costs** for Gemini 2.5+ models (75% for 2.0). **Grounding with Google Search** costs **$35 per 1,000 grounded prompts** with a free daily quota of ~1,500 prompts. Only HTTP 200 responses are billed.

### Quotas and rate limits

Quotas operate on a tiered system based on 30-day rolling spend:

- **Tier 1** ($0+ with billing): ~1M TPM for Flash, ~500K TPM for Pro
- **Tier 2** ($250+): ~4M TPM for Flash, ~2M TPM for Pro
- **Tier 3** ($1,000+): ~10M TPM for Flash, ~4M TPM for Pro
- **System-wide hard cap**: 30,000 RPM per model per region

Quota increases can be requested via Cloud Console or `gcloud alpha services quotas update`. For sustained high-volume workloads, **Provisioned Throughput** (measured in GSUs) provides SLA-backed capacity.

---

## Full capability map across the Vertex AI platform

### Generative AI core

Beyond basic text generation, Vertex AI supports **image generation** (via Gemini 2.5 Flash Image and Imagen 3), **video generation** (Veo 2/3 with 1080p, synchronized dialogue), **speech-to-text** (Chirp, 125+ languages), and the **Live API** for real-time bidirectional voice conversations (`gemini-live-2.5-flash-native-audio`).

### Embeddings

The recommended model is **`gemini-embedding-001`** — **3,072 dimensions** by default (customizable via `output_dimensionality`), 8K token input limit, 100+ languages, ranked #1 on MTEB Multilingual. Legacy models include `text-embedding-005` (768 dimensions) and `text-embedding-004`. The new SDK provides embeddings directly:

```typescript
const response = await ai.models.embedContent({
  model: 'gemini-embedding-001',
  contents: 'Text to embed',
});
```

### Vector Search

Vertex AI Vector Search (formerly Matching Engine) uses Google's **ScaNN algorithm** for approximate nearest neighbor search at billion-scale. It supports **hybrid search** (dense + sparse embeddings), **streaming updates** for real-time indexing, metadata filtering, and both public and Private Service Connect endpoints. Distance measures include cosine, dot product, and L2 squared.

### RAG Engine

The Vertex AI RAG Engine (GA) provides end-to-end retrieval-augmented generation. It ingests from **Cloud Storage, Google Drive, Slack, Jira, SharePoint, BigQuery, and websites**. Vector database backends include a fully managed Spanner-based RAG Managed DB, Vertex AI Vector Search, Weaviate, and Pinecone. Chunking is configurable (recommended **300–500 tokens with 50–100 token overlap**). RAG integrates directly as a Gemini tool in API calls.

### Grounding

Three grounding modes are available. **Google Search grounding** connects to live web data — enabled by adding `tools: [{ googleSearch: {} }]` to requests. **Enterprise Web Search** provides compliance-controlled web access (no customer data logging, VPC-SC support). **Vertex AI Search grounding** connects to private enterprise documents. All return `groundingMetadata` with source URLs and confidence scores.

### Function calling

Gemini supports declarative function calling with three modes: **AUTO** (model decides), **ANY** (forced function call, optionally restricted to specific functions), and **NONE** (disabled). The new SDK uses `FunctionCallingConfigMode` enums and `parametersJsonSchema` for tool declarations. For thinking models (Gemini 2.5+), `thought_signature` must be propagated between function call rounds.

### Model Garden, fine-tuning, and batch prediction

The **Model Garden** offers **200+ models** including Google first-party (Gemini, Imagen, Veo), Anthropic Claude, Meta Llama 4, Mistral, DeepSeek, and more — accessible via MaaS (pay per token) or one-click deployment. **Supervised fine-tuning** is available for Gemini 2.5 Pro, 2.5 Flash-Lite, and 2.0 Flash, supporting text, image, audio, video, and document training data up to 131K tokens per example. **Batch prediction** processes JSONL from Cloud Storage or BigQuery asynchronously at 50% discount.

---

## Infrastructure setup and IAM configuration

### Project setup checklist

1. Create or select a GCP project with active billing
2. Enable `aiplatform.googleapis.com` (core), plus `storage.googleapis.com`, `cloudkms.googleapis.com` (for CMEK), and `compute.googleapis.com` as needed
3. Grant IAM roles to users and service accounts
4. Configure region (SDK: `location: 'us-central1'`)

The **Express Mode** allows a 90-day free tier without billing for experimentation.

### Key IAM roles

| Role | Purpose | Use Case |
|------|---------|----------|
| `roles/aiplatform.user` | Most Vertex AI capabilities | Standard developer access |
| `roles/aiplatform.admin` | Full control + IAM management | Platform administrators |
| `roles/aiplatform.viewer` | Read-only access | Auditors, read-only dashboards |

**Least-privilege recommendation**: Create custom roles with specific permissions (e.g., just `aiplatform.endpoints.predict` for applications that only need inference). Use resource-level IAM policies on individual endpoints. Restrict model access using the `vertexai.allowedModels` organization policy.

### Regional availability

Vertex AI operates in **38+ regions** globally. Key regions include **9 US regions** (us-central1 being most feature-complete), **11 European regions** (europe-west1 through europe-west12, europe-north1, europe-central2), **11 Asia-Pacific regions**, and coverage in Canada, South America, Africa, and the Middle East. The **global endpoint** (`location: 'global'`) routes dynamically for higher availability but **does not guarantee data residency**.

---

## Security, compliance, and data governance

### VPC Service Controls

VPC-SC creates service perimeters that **block all public internet access** to Vertex AI when enabled. Configuration requires an Access Context Manager policy at the organization level, with ingress/egress rules for authorized access. When VPC-SC is active, Google-managed tenant environments lose default internet access — training jobs requiring external data need an explicit **proxy server** (Squid/Envoy) with Cloud NAT.

### CMEK encryption

Customer-managed keys via Cloud KMS encrypt boot disks, training data, models, datasets, endpoints, batch prediction artifacts, Pipeline metadata, Feature Store content, and **RAG Engine corpus data**. Keys must reside in the **same region** as resources. The Vertex AI service agent (`service-PROJECT_NUMBER@gcp-sa-aiplatform.iam.gserviceaccount.com`) needs `roles/cloudkms.cryptoKeyEncrypterDecrypter`. Cloud HSM (FIPS 140-2 Level 3) and Cloud EKM (external keys) are supported.

### Compliance certifications

Vertex AI is certified for **SOC 1/2/3**, **ISO 27001/27017/27018**, **ISO 42001:2023** (AI Management System), **HIPAA** (under BAA), **PCI DSS**, **FedRAMP** (Moderate; High via Assured Workloads), and **GDPR**. Data Access audit logs must be **explicitly enabled** — they are off by default. Admin Activity logs are always on and free.

### Private endpoints

**Private Service Connect (PSC)** is the recommended approach for private API access within a VPC. It creates forwarding rules targeting Vertex AI service attachments, with support for cross-region failover via `--allow-psc-global-access`. VPC Network Peering remains available as a legacy option for prediction endpoints and training jobs.

---

## Framework integrations for the Node.js ecosystem

### LangChain.js

The `@langchain/google-vertexai` package provides `ChatVertexAI` with support for chat models, embeddings, tool calling, and streaming. A separate `@langchain/google-vertexai-web` package exists for edge/web environments. Note that model naming mismatches have caused 404 errors with newer preview models — pin to GA model IDs for stability.

```typescript
import { ChatVertexAI } from "@langchain/google-vertexai";
const llm = new ChatVertexAI({ model: "gemini-2.5-flash", temperature: 0 });
```

### Firebase Genkit

Genkit provides the most integrated Google ecosystem experience. The `@genkit-ai/vertexai` plugin (v1.27.0) supports evaluation, vector search, grounding, and Model Garden access. A newer unified `@genkit-ai/google-genai` plugin simplifies basic model access. Genkit's **flow-based architecture** with Zod schemas, **Dotprompt** template management, and built-in evaluators make it strong for production AI applications.

```typescript
import { genkit } from 'genkit';
import { vertexAI } from '@genkit-ai/vertexai';
const ai = genkit({ plugins: [vertexAI({ location: 'us-central1' })] });
```

### LlamaIndex.TS and Vercel AI SDK

LlamaIndex.TS supports Vertex AI via `@llamaindex/google` with `gemini()` factory function. The **Vercel AI SDK** (`@ai-sdk/google-vertex`) provides a provider-agnostic interface that supports both Node.js and edge runtimes, offering the strongest vendor lock-in mitigation.

### Cloud Run and Cloud Functions deployment

On Cloud Run, ADC is automatic via the attached service account. Best practices include setting **min instances ≥ 1** to eliminate cold starts, enabling **startup CPU boost** (30% faster initialization), and using concurrency settings up to 250 requests per instance. For Cloud Functions Gen 2, allocate **at least 512 MiB memory** — the Genkit Vertex AI plugin alone can exceed the 256 MiB default. Gen 2 HTTP functions support up to **60-minute timeouts**.

---

## Operational best practices and known trade-offs

### Retry logic

The `@google/genai` SDK includes **automatic retry with exponential backoff** for transient errors (429, 5xx, 408, network failures). For custom retry logic, implement jittered exponential backoff with **5 max retries**, starting at 1 second. Never retry 400, 401, or 403 errors. A practical tip: switching from a regional endpoint to the **global endpoint** can resolve persistent 429 errors by distributing load across regions.

### Streaming with Server-Sent Events

```typescript
app.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  const stream = await ai.models.generateContentStream({
    model: 'gemini-2.5-flash',
    contents: req.query.prompt,
  });
  for await (const chunk of stream) {
    res.write(`data: ${JSON.stringify({ text: chunk.text })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});
```

### Context caching for cost optimization

**Implicit caching** is enabled by default — Vertex AI automatically caches and reuses KV pairs with no code changes. **Explicit caching** provides a guaranteed 90% discount on cached input tokens for 2.5+ models (minimum 2,048 tokens, configurable TTL defaulting to 60 minutes). This is ideal for repeated queries against large documents, few-shot learning contexts, or multi-turn conversations with consistent base content.

```typescript
const cache = await ai.caches.create({
  model: 'gemini-2.5-flash',
  contents: [{ role: 'user', parts: [{ text: largeDocument }] }],
  ttl: '3600s',
});
const response = await ai.models.generateContent({
  model: 'gemini-2.5-flash',
  contents: 'Summarize this document',
  cachedContent: cache.name,
});
```

### Vendor lock-in mitigation

The unified `@google/genai` SDK means switching between Gemini Developer API and Vertex AI requires only changing initialization parameters — no code refactoring. For broader portability, LangChain.js, Genkit's plugin architecture, and the Vercel AI SDK all provide abstraction layers. Vertex AI's **OpenAI-compatible chat completions endpoint** allows existing OpenAI client code to work with minimal changes. The Model Garden's access to Claude, Llama, and Mistral through a single API further reduces single-vendor dependency.

---

## Conclusion

The Vertex AI Node.js story in 2026 is defined by **consolidation and maturity**. The unified `@google/genai` SDK eliminates the previous fragmentation across three packages, and teams still on `@google-cloud/vertexai` must migrate before June 2026. For model selection, **Gemini 2.5 Flash** at $0.15/1M input tokens represents the sweet spot for most production workloads, while **Gemini 2.5 Pro** at $1.25/1M input tokens serves complex reasoning tasks. The enterprise security stack (VPC-SC, CMEK, ISO 42001, HIPAA) is comprehensive and production-ready. The most impactful cost optimization lever is **explicit context caching** (90% input savings), followed by **batch prediction** (50% savings) and appropriate model selection. For teams prioritizing portability, the Vercel AI SDK or LangChain.js provide clean abstraction layers, though the new unified SDK's simple initialization swap between API key and Vertex AI modes already provides significant flexibility.