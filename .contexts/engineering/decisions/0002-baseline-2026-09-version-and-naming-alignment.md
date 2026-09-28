# 0002. Baseline de setembro de 2026 e alinhamento de nomes entre camadas

- **Status:** accepted
- **Date:** 2026-09-28
- **Deciders:** projeto DDC / revisão de contextos
- **Tags:** `engineering`, `stacks`, `naming`, `ssot`
- **Supersedes:** a matriz de versões de [0001](0001-ddc-engineering-baseline-and-harness-enforcement.md). IDs (`uuidv7` / ULID), harness e a decisão sobre secrets da 0001 permanecem.

## Context

A matriz aceita em julho de 2026 (ADR 0001) deixou de descrever o upstream medido em 2026-09-28. Next 16.3 saiu de preview e virou Active LTS. Vitest 5, AI SDK 7 e Mastra 1 estão estáveis e se aceitam no Node 24. Parte dos documentos ainda ensinava a linha anterior, ou convivia com as duas.

Ao mesmo tempo, os contratos discordavam entre si sobre o mesmo dado:

- Dinheiro era string decimal na API, inteiro de centavos na rule e no Firestore, e `NUMERIC` ou `BIGINT` no Postgres.
- Enum persistido era `PENDING_REVIEW` na API e no Firestore, e `pending` na rule de modelagem.
- ID público era "sempre ULID" na API, `uuidv7()` no Postgres, e às vezes vinha com prefixo (`order-01H…`).
- Arquivo de use case, store e schema aparecia em camelCase nos docs de arquitetura e em kebab-case na rule de desenvolvimento.

Um agente que lesse dois arquivos do mesmo framework escrevia formas incompatíveis.

## Decision Drivers

1. Baseline único, medido no registry e nas release notes, não na memória do modelo.
2. Subir major só quando o resto da linha aceita o runtime já pinado (Node 24, Postgres 18, Zod 4).
3. Um nome físico por camada, com tradução só na boundary.
4. Não reabrir a política de identificadores da ADR 0001.
5. Postgres 19 e Node 26 ficam de fora enquanto não forem o release suportado que o ecossistema (pgvector, LTS) acompanha.

## Considered Options

### A. Versões

1. Manter a matriz de julho e só marcar os docs defasados.
2. Subir cada pacote para o `latest` do npm, inclusive Node 26 e Postgres 19 beta.
3. Subir o que já é compatível entre si e registrar, na mesma tabela, o que ficou para trás e por quê.

### B. Dinheiro, enum e arquivo

1. Deixar cada contrato com a própria convenção.
2. Escolher a forma já majoritária nas rules (`amountMinor` inteiro, enum minúsculo, arquivo kebab-case) e fazer os contratos obedecerem.

## Decision Outcome

**A3 + B2.**

### Matriz (produção)

Medição em `stacks/VERSIONS.md`. Resumo:

| Camada | Baseline |
|---|---|
| Runtime | Node.js **24.21.0** LTS. Node 26 continua Current até 2026-10-28. |
| Linguagem | TypeScript **7.0.2**, com `@typescript/typescript6@6.0.2` só para API programática. |
| App | Next.js **16.3.6** + React **19.3.0**. 16.4 é canary. Subir para 16.3.7 quando o release de 2026-09-30 publicar. |
| UI | Tailwind **4.3.3**, Zustand **5.0.15**, `radix-ui@1.6.7`. |
| Validação | Zod **4.6.5**. Sem Zod 3 no mesmo bundle. |
| Serverless | `firebase-functions@7.4.0`, `firebase-admin@14.5.0`, runtime `nodejs24`. |
| OLTP | PostgreSQL **18.6**. O patch 18.5 não foi publicado. Postgres 19 segue em beta. |
| Vetores | pgvector **0.8.6** na imagem `pg18`. |
| Testes | Vitest **5.0.2** (Vite 8 como peer do runner) e Playwright **1.63.0**. |
| IA | `ai@7.0.120` com providers nas majors medidas (`@ai-sdk/openai@4`, `@ai-sdk/google-vertex@5`, …). `@mastra/core@1.71.0`, CLI `mastra@1.31.3`, `rag@2` e `mcp@2`. `@mastra/evals` fica de fora: o peer pede Vitest `<5`. |

A major de `@ai-sdk/*` não é a major de `ai`. Cada upgrade mede o conjunto de novo.

### Nomes

A tabela canônica vive em `@.contexts/engineering/rules/data-modeling.md` (seção "Nomes físicos por camada").

- Dinheiro: inteiro `amountMinor` / coluna `amount_minor` + `currency` ISO 4217. `NUMERIC` fica para taxa e quantidade fracionária.
- Enum persistido: `pending`, `in_review`. `eventName` continua `SCREAMING_SNAKE_CASE` porque é o nome do fato, não um status.
- ID no JSON: a string do store, sem prefixo. Postgres `uuidv7()`, Firestore e `eventId` ULID, como na ADR 0001.
- Arquivo que não é componente React: kebab-case (`place-order.ts`, `use-auth-store.ts`).

## Consequences

- Docs de stack, contracts e a matriz em `MEMORY.md` passam a citar os mesmos pins.
- Quem copiava `generateObject`, `toDataStreamResponse` ou `^0.x` do Mastra passa a seguir a linha 7 / 1.
- Campo monetário e enum mudam de forma em relação a exemplos antigos. Código de aplicação que já gravou `amountCents` ou `ACTIVE` migra com expand/contract; este repositório é o framework, não um banco populado.
- Node 26 e Postgres 19 continuam explicitamente fora. A janela de outubro de 2026 (Node 26 LTS, possível RC do Postgres 19, Next 16.3.7) pede outra medição, não uma adoção antecipada.

## References

- `stacks/VERSIONS.md`
- `MEMORY.md`
- ADR 0001 (IDs, harness, secrets)
- https://nodejs.org/en/about/previous-releases
- https://nextjs.org/blog/next-16-3
- https://vitest.dev/blog/vitest-5
- https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data
- https://mastra.ai/blog/ai-sdk-v7-support
