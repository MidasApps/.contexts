---
name: gemini
description: Use para modelos Google Gemini. Keywords: gemini, google ai, vertex.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Gemini (Google)

Família Gemini do Google: Pro (high-end, 1M+ context), Flash (rápido, custo baixo), Flash-Lite/Nano (extremamente barato). Disponível via Google AI Studio (key) ou Vertex AI (GCP).

## Essência
- **Context massivo:** Pro 2M tokens, Flash 1M — ingestão de PDFs, vídeos, codebases inteiros.
- **Multimodal nativo:** texto, imagem, áudio, vídeo no mesmo prompt.
- **Function calling** com declaração de tools (JSON Schema parecido com OpenAI).
- **Structured output:** `response_mime_type: "application/json"` + `response_schema`.
- **Grounding** com Google Search built-in para fatos atuais.
- **Code execution** tool nativo (sandbox Python).
- **Vertex AI** vs **AI Studio**: Vertex tem IAM/regions/quotas enterprise; AI Studio é mais simples (API key).
- **Caching:** context caching explícito (`cachedContents`) com TTL — útil em prompts gigantes reutilizados.
- **Parâmetros:** `temperature`, `topP`, `topK`, `maxOutputTokens`, `safetySettings`.
- **Safety filters** mais agressivos por default — ajustar `safetySettings` se necessário.

## Procedimento mínimo
1. Escolher modelo: Pro para qualidade, Flash para vazão, Lite/Nano para custo baixo extremo.
2. AI Studio (API key) para protótipo; Vertex (GCP) para produção com IAM.
3. Multimodal: incluir parts com `inlineData` (base64) ou `fileData` (URI no Cloud Storage).
4. Structured output via `response_schema` para JSON conformante.
5. Context caching para prompts > 32k tokens reusados.

## Anti-patterns
- Usar Pro para classificação simples → Flash-Lite resolve por fração do custo.
- Safety filter bloqueando legítimo → ajustar `safetySettings`, não contornar conteúdo.
- Não validar JSON output sem `response_schema` → quebra ocasional.

## Mini-exemplo
```ts
const res = await ai.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType: "image/png", data: b64 } }] }],
  config: { responseMimeType: "application/json", responseSchema: SCHEMA },
});
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/ai/gemini.md`
**Documentação upstream:** MCP `liquid-docs` — busque por `gemini` para detalhes da versão atual.
