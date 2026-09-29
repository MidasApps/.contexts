---
title: Versões medidas do baseline
type: stacks
status: active
last_updated: 2026-09-29
---

# Versões medidas

Registro do que o npm e as páginas oficiais mostravam em **2026-09-29** (medição anterior: 2026-09-28). A matriz de produção está em `MEMORY.md`. Este arquivo é a evidência da medição, não um segundo baseline.

Método: `npm view <pkg> version` e, para runtimes sem pacote npm, a página de release do fornecedor. Não usar a memória do modelo como fonte.

Reavalie antes de subir um pin. A coluna "por que não o mais novo" é parte do contrato de compatibilidade. **Política (ADR 0004):** o baseline é a última estável; pacote atrás do `latest` só com exceção `E1`–`E6` registrada em `decisions/0004-latest-stable-baseline-and-documented-exceptions.md`. Pré-release (canary, beta, rc) não é versão.

| Pacote / runtime | Medido | Baseline do framework | Por que não o mais novo, quando diferir |
|---|---|---|---|
| Node.js | 26.10.0 Current (2026-09-21, `nodejs.org/dist/index.json` em 2026-09-29); 24.21.0 LTS | **26.10.0** | ADR 0004. 26 entra em LTS em 2026-10-28 (Maintenance 2027-10-20, EOL 2029-04-30). **E1:** o deploy de Firebase Functions fica em `nodejs24` (EOL 2028-04-30), porque o Google não oferece `nodejs26`. **E6 (provisória):** o `apps/web` roda `nodejs24` em prod no Firebase App Hosting (suporte a versões pares espelhando o Cloud Run, onde `nodejs26` é Preview; ADR 0009); `engines` `>=24.0.0 <27`, `@types/node@24`, local e CI em 26. O servidor Mastra no Cloud Run usa imagem própria `node:26-alpine`. |
| @types/node | 26.6.3 | **26.6.3** | Acompanha o Node 26. O pacote de functions usa `@types/node@24`. |
| typescript | 7.0.2 | **7.0.2** | API programática estável ainda não saiu (prevista para 7.1). |
| @typescript/typescript6 | 6.0.2 | **6.0.2** | Só para ferramentas que importam a API JS (typescript-eslint, Volar, deployer Mastra). |
| typescript-eslint | 8.71.0 | **8.71.0** | **E2:** peer `typescript >=4.8.4 <6.1.0`; roda na API do TS 6, o `tsc` segue no 7. |
| eslint | 10.11.0 | **9.39.5** | **E3:** `eslint-plugin-react@7.37.5` (última) declara peer `eslint ^9.7`. `eslint-config-next@16.3.7` aceita `>=9`. |
| next | 16.3.7 (canary 16.4 existe) | **16.3.7** | 16.3 é Active LTS desde 2026-08-03. 16.3.7 (release de segurança) publicada antes do anúncio de 2026-09-30; subiu de 16.3.6. 16.4 é canary. `eslint-config-next` 16.3.7. Peer React `^18.2.0 \|\| ^19.0.0`, engines Node `>=20.9.0`. |
| react / react-dom | 19.3.0 | **19.3.0** | Peer de `next@16.3.7` aceita `^19.0.0`. Peer de `@ai-sdk/react@4` aceita `^19.2.1`. |
| @types/react / @types/react-dom | 19.3.0 | **19.3.0** | Mesma linha do runtime React. |
| zod | 4.6.5 | **4.6.5** | AI SDK 7 aceita `zod ^4.1.8`. Zod 3 não entra no mesmo bundle. |
| tailwindcss | 4.3.3 | **4.3.3** | — |
| zustand | 5.0.15 | **5.0.15** | — |
| radix-ui | 1.6.7 | **1.6.7** | Pacote unificado. `@radix-ui/react-slot` medido em 1.3.3. |
| firebase-functions | 7.4.0 | **7.4.0** | Peer aceita `firebase-admin` 11–14. Runtime do projeto: `nodejs24`. |
| firebase-admin | 14.5.0 | **14.5.0** | — |
| firebase | 12.19.0 | **12.19.0** | SDK cliente. |
| @firebase/rules-unit-testing | 5.0.2 | **5.0.2** (dev) | Peer `firebase ^12`, engines Node `>=20`. Testes de Security Rules no emulator. |
| firebase-tools | 15.32.0 | devDependency | Não vai para o runtime. |
| @apphosting/adapter-nextjs | 14.0.21 | usado pelo build do App Hosting | Peer `next: *` não prova suporte ao Next 16; a tabela do App Hosting vai até 15.2.x Critérios de saída do spike na ADR 0009. |
| @google-cloud/cloud-sql-connector | 1.12.0 | **1.12.0** (opcional) | Só se o `apps/mastra` usar IAM database auth sem o socket embutido do Cloud Run (`stacks/backend/cloud-run.md`). |
| drizzle-orm | 0.45.3 | **0.45.3** | Ainda 0.x. drizzle-kit 0.31.11. |
| PostgreSQL | 18.6 (2026-08-13). 18.5 não foi publicado. 19 beta 4 em 2026-09-24 | **18.6** | 19 não teve GA. pgvector 0.8.6 publica imagem `0.8.6-pg18`, não `pg19`. |
| pgvector | 0.8.6 (2026-07-29) | **0.8.6** | Imagem `pgvector/pgvector:0.8.6-pg18`. |
| vitest | 5.0.2 | **5.0.2** | Exige Node `^22.12 \|\| ^24 \|\| >=26` e Vite `^6.4 \|\| ^7 \|\| ^8` como peer. Vite medido: 8.3.1. Linha 4.1 recebe só correção. |
| @playwright/test | 1.63.0 | **1.63.0** | — |
| @playwright/experimental-ct-react | 1.62.1 | não adotado | **E5:** depende de `experimental-ct-core` exato 1.62.1, uma versão atrás do `@playwright/test`. Teste de componente roda no Vitest. |
| ai | 7.0.122 | **7.0.122** | Exige Node >= 22. Peer Zod `^3.25.76 \|\| ^4.1.8`. |
| @ai-sdk/react | 4.0.125 | **4.0.125** | A major do provider **não** acompanha a major do `ai`. |
| @ai-sdk/openai | 4.0.81 | **4.0.81** | Idem. |
| @ai-sdk/anthropic | 4.0.68 | **4.0.68** | Idem. |
| @ai-sdk/google | 4.0.85 | **4.0.85** | Idem. |
| @ai-sdk/google-vertex | 5.0.98 | **5.0.98** | Major diferente dos outros providers. Medir de novo a cada upgrade. |
| @mastra/core | 1.71.0 | **1.71.0** | `LanguageModelV4` (AI SDK 7) desde 1.47.0. Peer Zod `^3.25 \|\| ^4`. |
| mastra (CLI) | 1.31.3 | **1.31.3** | Pin exato, na mesma leva do core. |
| @mastra/memory | 1.32.1 | **1.32.1** | Peer core `>=1.4 <2`. |
| @mastra/rag | 2.6.4 | **2.6.4** | Major própria. Peer core `>=1 <2`. |
| @mastra/mcp | 2.1.0 | **2.1.0** | Major própria. Peer core `>=1.68 <2`. |
| @mastra/pg | 1.27.1 | **1.27.1** | Peer core `>=1.68 <2`. |
| @mastra/ai-sdk | 1.10.5 | **1.10.5** | Ponte para `useChat`. |
| @mastra/observability | 1.18.1 | **1.18.1** | Tracing via `new Mastra({ observability })`. Peer core `>=1.16 <2`. |
| @mastra/auth-firebase | 1.1.2 | **não adotado** | Declara `firebase-admin ^13.7.0` como **dependency** (não peer) e usa a API de namespace (`admin.auth()`, `admin.credential`) que a 14.0.0 removeu: `pnpm.overrides` para 14.5.0 quebra o pacote. O servidor Mastra usa provider próprio `extends MastraAuthProvider` com o `firebase-admin` 14.5.0 do workspace (ADR 0010). |
| @mastra/loggers | 1.3.2 | **1.3.2** | Peer core `>=1 <2`. |
| @mastra/google-cloud-pubsub | 1.1.3 | **1.1.3** | Peer core `>=1.13.2 <2`. |
| @mastra/deployer-vercel | 1.2.30 | **1.2.30** | Deployer preferido (Vercel). Peer core `>=1.58 <2`. |
| @mastra/evals | 1.10.3 | fora | **E4:** peer `vitest >=3.0.0 <5.0.0` (re-medido em 2026-09-29), incompatível com Vitest 5.0.2. Evals no harness próprio. |
| pnpm | 12.6.0 | **12.6.0** | `packageManager` da raiz do monorepo. Engines Node `>=18`. |
| turbo | 2.11.5 | **2.11.5** | Orquestrador de tasks do monorepo. devDependency da raiz. |
| @tauri-apps/cli / @tauri-apps/api | 2.12.0 | **2.12.0** | CLI e API na mesma versão. Shell desktop. |
| vite | 8.3.1 | **8.3.1** | Bundler do app desktop; mesma versão aceita como peer do Vitest 5. Engines Node `^20.19 \|\| >=22.12`. |
| @tanstack/react-router | 1.170.40 | **1.170.40** | Router do app desktop. Peer React `>=18 \|\| >=19`, engines Node `>=20.19`. |
| Rust (toolchain) | 1.98.1 stable (`static.rust-lang.org/dist/channel-rust-stable.toml`, 2026-09-01) | **1.98.1** | Pin em `apps/desktop/src-tauri/rust-toolchain.toml` (`channel = "1.98.1"`). MSRV do crate `tauri` 2.12.0: 1.90. |
| crate tauri / tauri-build | 2.12.0 / 2.7.0 (crates.io) | **2.12.0** / **2.7.0** | `tauri` na mesma major.minor de `@tauri-apps/api`. `tauri-build` tem numeração própria. |
| @tauri-apps/plugin-* (npm) / tauri-plugin-* (crate) | updater 2.13.0/2.13.0; http 2.7.0/2.8.0; deep-link 2.5.0/2.5.0; notification 2.5.0/2.5.0; store 2.5.0/2.5.0; opener 2.6.0/2.6.0 | latest de cada registry | As duas metades de um plugin nem sempre saem juntas (http em 2026-09-29). Conferir npm e crates.io antes de subir. |
| @tanstack/router-plugin | 1.168.41 | **1.168.41** | Plugin de Vite do router; peer `@tanstack/react-router ^1.170.40`, `vite >=5`. Linha de versão própria. |
| @vitejs/plugin-react | 6.1.1 | **6.1.1** | Peer `vite ^8.0.0`; React Compiler via peer opcional. |
| @tailwindcss/vite | 4.3.3 | **4.3.3** | Tailwind no desktop (o web usa `@tailwindcss/postcss`). Peer `vite ^5.2.0 \|\| ^6 \|\| ^7 \|\| ^8`. |
| next-intl / use-intl | 4.14.8 | **4.14.8** | Peer `next ^16` e React `^19`. `use-intl` fora do Next. |
| eslint-plugin-boundaries | 7.2.0 | **7.2.0** | Peer `eslint >=6` (roda no ESLint 9.39.5, E3). Fronteiras entre pacotes/camadas. |
| shadcn (CLI) | 4.21.0 | **4.21.0** | Engines Node `>=20.18.1`. Só em dev/scaffold; init com base Radix (ver `stacks/frontend/shadcn-ui.md`). |
| openai | 7.23.0 | **7.23.0** | SDK oficial. O id de modelo não é pin deste arquivo. |
| @google-cloud/bigquery | 9.1.0 | **9.1.0** | — |
| @google-cloud/bigquery-storage | 6.1.0 | **6.1.0** | Storage Write API. |
| @anthropic-ai/sdk | 0.129.0 | **0.129.0** | Continua 0.x. Não existe 1.x no npm nesta data. Pin exato. |
| @google/genai | 2.24.0 | **2.24.0** | — |

Modelos Gemini (Vertex AI, lido em 2026-09-28): produção nova usa `gemini-3.5-flash` e `gemini-3.5-flash-lite` (janela de 12 meses). `gemini-2.5-pro`, `gemini-2.5-flash` e `gemini-2.5-flash-lite` aposentam em **2026-10-20** no Vertex. O console AI Studio, na mesma data, ainda não anunciava shutdown dos modelos 2.5 de texto. O default do framework segue o Vertex, que é o caminho de produção.
