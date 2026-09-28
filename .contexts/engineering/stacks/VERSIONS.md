---
title: Versões medidas do baseline
type: index
status: active
last_updated: 2026-09-28
---

# Versões medidas

Registro do que o npm e as páginas oficiais mostravam em **2026-09-28**. A matriz de produção está em `MEMORY.md`. Este arquivo é a evidência da medição, não um segundo baseline.

Método: `npm view <pkg> version` e, para runtimes sem pacote npm, a página de release do fornecedor. Não usar a memória do modelo como fonte.

Reavalie antes de subir um pin. A coluna "por que não o mais novo" é parte do contrato de compatibilidade.

| Pacote / runtime | Medido | Baseline do framework | Por que não o mais novo, quando diferir |
|---|---|---|---|
| Node.js | 24.21.0 LTS (Krypton); 26.10.0 Current | **24.21.0** | 26 entra em LTS em 2026-10-28. 24 entra em Maintenance em 2026-10-20 e segue suportado até 2028-04-30. |
| typescript | 7.0.2 | **7.0.2** | API programática estável ainda não saiu (prevista para 7.1). |
| @typescript/typescript6 | 6.0.2 | **6.0.2** | Só para ferramentas que importam a API JS (eslint, Volar, deployer Mastra). |
| next | 16.3.6 (canary 16.4 existe) | **16.3.6** | 16.3 é Active LTS desde 2026-08-03. 16.4 é canary. Release de segurança 16.3.7 anunciada para 2026-09-30: subir no dia em que publicar. |
| react / react-dom | 19.3.0 | **19.3.0** | Peer de `next@16.3.6` é `^19`. Peer de `@ai-sdk/react@4` aceita `^19.2.1`. |
| @types/react / @types/react-dom | 19.3.0 | **19.3.0** | Mesma linha do runtime React. |
| zod | 4.6.5 | **4.6.5** | AI SDK 7 aceita `zod ^4.1.8`. Zod 3 não entra no mesmo bundle. |
| tailwindcss | 4.3.3 | **4.3.3** | — |
| zustand | 5.0.15 | **5.0.15** | — |
| radix-ui | 1.6.7 | **1.6.7** | Pacote unificado. `@radix-ui/react-slot` medido em 1.3.3. |
| firebase-functions | 7.4.0 | **7.4.0** | Peer aceita `firebase-admin` 11–14. Runtime do projeto: `nodejs24`. |
| firebase-admin | 14.5.0 | **14.5.0** | — |
| firebase | 12.19.0 | **12.19.0** | SDK cliente. |
| firebase-tools | 15.32.0 | devDependency | Não vai para o runtime. |
| drizzle-orm | 0.45.3 | **0.45.3** | Ainda 0.x. drizzle-kit 0.31.11. |
| PostgreSQL | 18.6 (2026-08-13). 18.5 não foi publicado. 19 beta 4 em 2026-09-24 | **18.6** | 19 não teve GA. pgvector 0.8.6 publica imagem `0.8.6-pg18`, não `pg19`. |
| pgvector | 0.8.6 (2026-07-29) | **0.8.6** | Imagem `pgvector/pgvector:0.8.6-pg18`. |
| vitest | 5.0.2 | **5.0.2** | Exige Node `^22.12 \|\| ^24 \|\| >=26` e Vite `^6.4 \|\| ^7 \|\| ^8` como peer. Vite medido: 8.3.1. Linha 4.1 recebe só correção. |
| @playwright/test | 1.63.0 | **1.63.0** | `@playwright/experimental-ct-react` ainda está em 1.62.1. Não force 1.63 nesse pacote. |
| ai | 7.0.120 | **7.0.120** | Exige Node >= 22. Peer Zod `^3.25.76 \|\| ^4.1.8`. |
| @ai-sdk/react | 4.0.123 | **4.0.123** | A major do provider **não** acompanha a major do `ai`. |
| @ai-sdk/openai | 4.0.79 | **4.0.79** | Idem. |
| @ai-sdk/anthropic | 4.0.67 | **4.0.67** | Idem. |
| @ai-sdk/google | 4.0.84 | **4.0.84** | Idem. |
| @ai-sdk/google-vertex | 5.0.97 | **5.0.97** | Major diferente dos outros providers. Medir de novo a cada upgrade. |
| @mastra/core | 1.71.0 | **1.71.0** | `LanguageModelV4` (AI SDK 7) desde 1.47.0. Peer Zod `^3.25 \|\| ^4`. |
| mastra (CLI) | 1.31.3 | **1.31.3** | Pin exato, na mesma leva do core. |
| @mastra/memory | 1.32.1 | **1.32.1** | Peer core `>=1.4 <2`. |
| @mastra/rag | 2.6.4 | **2.6.4** | Major própria. Peer core `>=1 <2`. |
| @mastra/mcp | 2.1.0 | **2.1.0** | Major própria. Peer core `>=1.68 <2`. |
| @mastra/pg | 1.27.1 | **1.27.1** | Peer core `>=1.68 <2`. |
| @mastra/ai-sdk | 1.10.5 | **1.10.5** | Ponte para `useChat`. |
| @mastra/evals | 1.10.3 | fora | Peer `vitest >=3 <5`. Incompatível com Vitest 5.0.2. |
| openai | 7.23.0 | **7.23.0** | SDK oficial. O id de modelo não é pin deste arquivo. |
| @google-cloud/bigquery | 9.1.0 | **9.1.0** | — |
| @google-cloud/bigquery-storage | 6.1.0 | **6.1.0** | Storage Write API. |
| @anthropic-ai/sdk | 0.129.0 | **0.129.0** | Continua 0.x. Não existe 1.x no npm nesta data. Pin exato. |
| @google/genai | 2.24.0 | **2.24.0** | — |

Modelos Gemini (Vertex AI, lido em 2026-09-28): produção nova usa `gemini-3.5-flash` e `gemini-3.5-flash-lite` (janela de 12 meses). `gemini-2.5-pro`, `gemini-2.5-flash` e `gemini-2.5-flash-lite` aposentam em **2026-10-20** no Vertex. O console AI Studio, na mesma data, ainda não anunciava shutdown dos modelos 2.5 de texto. O default do framework segue o Vertex, que é o caminho de produção.
