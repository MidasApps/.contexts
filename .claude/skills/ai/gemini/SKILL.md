---
name: gemini
description: Use para modelos Google Gemini. Keywords: gemini, google ai, vertex.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Gemini (Google)

Família Gemini do Google, via Google AI Studio (key) ou Vertex AI (GCP, default de produção). Default do framework: `gemini-3.5-flash` (geral) e `gemini-3.5-flash-lite` (throughput); `gemini-2.5-*` aposenta no Vertex em 2026-10-20 — não use em trabalho novo. Ids e janelas em `@.contexts/engineering/stacks/ai/gemini.md`.

## Essência
- **Context massivo:** ordem de 1M tokens (confira a ficha do modelo) — ingestão de PDFs, vídeos, codebases inteiros.
- **Multimodal nativo:** texto, imagem, áudio, vídeo no mesmo prompt.
- **Function calling** com declaração de tools (JSON Schema parecido com OpenAI).
- **Structured output:** `responseMimeType: "application/json"` + `responseJsonSchema` (JSON Schema, ex. `z.toJSONSchema`) ou `responseSchema` (estilo OpenAPI).
- **Thinking:** `thinkingConfig.thinkingLevel` nos 3.x; `thinkingBudget` é da 2.5.
- **Grounding** com Google Search built-in para fatos atuais.
- **Code execution** tool nativo (sandbox Python).
- **Vertex AI** vs **AI Studio**: Vertex tem IAM/regions/quotas enterprise; AI Studio é mais simples (API key).
- **Caching:** context caching explícito (`cachedContents`) com TTL — útil em prompts gigantes reutilizados.
- **Parâmetros:** `temperature`, `topP`, `topK`, `maxOutputTokens`, `safetySettings`.
- **Safety filters** mais agressivos por default — ajustar `safetySettings` se necessário.

## Procedimento mínimo
1. Escolher modelo: `gemini-3.5-flash` por padrão, `gemini-3.5-flash-lite` para vazão/custo; confira a ficha antes de fixar outro id.
2. AI Studio (API key) para protótipo; Vertex (GCP) para produção com IAM.
3. Multimodal: incluir parts com `inlineData` (base64) ou `fileData` (URI no Cloud Storage).
4. Structured output via `responseJsonSchema` para JSON conformante; valide com Zod.
5. Context caching para prompts > 32k tokens reusados.

## Anti-patterns
- Usar modelo grande para classificação simples → `gemini-3.5-flash-lite` resolve por fração do custo.
- Safety filter bloqueando legítimo → ajustar `safetySettings`, não contornar conteúdo.
- JSON sem `responseJsonSchema` e sem validação Zod → quebra ocasional.

## Mini-exemplo
```ts
const res = await ai.models.generateContent({
  model: config.geminiModelId, // ex. "gemini-3.5-flash"
  contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: "image/png", data: b64 } }] }],
  config: { responseMimeType: "application/json", responseJsonSchema: z.toJSONSchema(ImageTagsSchema) },
});
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/gemini.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
