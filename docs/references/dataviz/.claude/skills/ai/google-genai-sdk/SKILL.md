---
name: google-genai-sdk
description: Use para o SDK Google GenAI — Gemini, embeddings. Keywords: google genai, gemini sdk, vertex ai.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Google GenAI SDK (`@google/genai`)

Cliente unificado para Gemini via Google AI (key) ou Vertex AI (GCP IAM). Substitui o antigo `@google/generative-ai`.

## Essência
- **Init:** `import { GoogleGenAI } from "@google/genai"; const ai = new GoogleGenAI({ apiKey })` (AI Studio) ou `new GoogleGenAI({ vertexai: true, project, location })` (Vertex).
- **`ai.models.generateContent({ model, contents, config })`** para single-turn; **`ai.models.generateContentStream`** para streaming.
- **`contents`:** array de `Content` com `role` ("user"/"model") e `parts` (text, inlineData base64, fileData URI).
- **Tools:** `config.tools: [{ functionDeclarations: [{ name, description, parameters }] }]`. Resposta com `functionCall`; execute; mande `functionResponse` no próximo turn.
- **Structured output:** `config.responseMimeType: "application/json"` + `config.responseSchema` (Type.OBJECT etc).
- **Chats:** `ai.chats.create({ model, history })` mantém histórico.
- **Caching:** `ai.caches.create({ model, contents, ttl })` → reuse via `config.cachedContent`.
- **Files API:** upload de arquivos grandes (`ai.files.upload`) e referenciar por URI.
- **Embeddings:** `ai.models.embedContent({ model: "gemini-embedding-001", contents })`.
- **Safety:** `config.safetySettings` por categoria (HARASSMENT, HATE_SPEECH, etc).

## Procedimento mínimo
1. Decidir entre AI Studio (`apiKey`) e Vertex (`vertexai: true`).
2. `ai.models.generateContent` com modelo + contents + config.
3. Multimodal: `parts` com `inlineData: { mimeType, data: base64 }` ou `fileData`.
4. Para JSON tipado: `responseMimeType` + `responseSchema`.
5. Wrappear com timeout/retry; o SDK não faz retry agressivo por default.

## Anti-patterns
- Misturar SDK antigo `@google/generative-ai` com `@google/genai` → escolher um.
- API key em client bundle → server-side only.
- Ignorar `promptFeedback.blockReason` → resposta vazia mistério.

## Mini-exemplo
```ts
import { GoogleGenAI, Type } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const res = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: prompt,
  config: {
    responseMimeType: "application/json",
    responseSchema: { type: Type.OBJECT, properties: { name: { type: Type.STRING } }, required: ["name"] },
  },
});
const data = JSON.parse(res.text);
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/google-genai-sdk.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
