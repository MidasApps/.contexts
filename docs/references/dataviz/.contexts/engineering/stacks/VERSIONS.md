---
title: Versões da stack — instalado × upstream
version: 2026-08-13c
last_updated: 2026-08-13
status: current
category: stacks
---

# Versões da stack

Auditoria do que está **instalado** contra o que o registro publica como
**último**. Levantada por `pnpm outdated` + `npm view <pkg> time`, não de
memória — e é assim que deve ser refeita.

> **Como atualizar este documento:** `pnpm outdated` para a tabela,
> `npm view <pkg> time --json` para as datas. Nunca preencha por lembrança:
> um modelo com corte de conhecimento acha que a versão dele é a última.

**Verificado em 2026-08-13**, depois da rodada de upgrades. Está tudo na
última versão **exceto dois pacotes, ambos por motivo declarado abaixo** —
não por esquecimento.

## O que ficou para trás, e por quê

| pacote | instalado | último | por que não subiu |
|---|---|---|---|
| `@tanstack/react-table` | 8.21.3 | 9.1.2 | **decisão**: v9 é reescrita de API, não bump |
| `eslint` | 9.39.4 | 10.8.1 | **bloqueado upstream**: nenhum plugin compatível |

### `@tanstack/react-table` — deliberadamente em v8

A v9 troca a arquitetura, não a versão: `useReactTable` → `useTable`, features
declaradas explicitamente (`tableFeatures`/`stockFeatures`), `getSortedRowModel()`
→ `createSortedRowModel(sortFns)`, `sortingFn` → `sortFn`, `table.getState()`
→ acesso por store/atoms, e `data`/`columns` passam a ser readonly. Tentado em
13/08/2026: **26 erros de tipo** em `DataTableWidget.tsx` (440 linhas) e
`TableBlock.tsx`, que servem toda tabela de todo relatório.

Não subiu porque o produto não ganha nada com isso — a v9 entrega
tree-shaking de features que usamos quase todas — e o risco é regressão em
ordenação, paginação, visibilidade de coluna, export CSV e modal de detalhe.
Existe um `useLegacyTable` de compatibilidade, e ele é pior que ficar na v8:
adotar um shim já marcado como deprecated para poder dizer "estamos na v9" é
dívida disfarçada de atualização.

Quando fizer sentido subir, é tarefa própria, com teste do widget, não carona
numa rodada de dependências.

### `eslint` — bloqueado por plugin, não por nós

A 10 remove `context.getFilename()`, e o `eslint-plugin-react@7.37.5` —
**que é a última publicada** — ainda o usa: o lint quebra com
`TypeError: contextOrFilename.getFilename is not a function` no primeiro
arquivo. O peer dela declara até `^9.7`. O plugin entra por
`eslint-config-next`, então nem dá para contornar por pin.

Reavaliar quando `eslint-plugin-react` publicar suporte a ESLint 10.

## Já resolvido nesta rodada

Stack de IA inteira (`ai` 7.0.64, `@ai-sdk/google-vertex` 5.0.52,
`@ai-sdk/react` 4.0.67, `@mastra/core` 1.58.0, `mastra` 1.24.0);
`typescript` 5.9.3 → **7.0.2**; `firebase-admin` 13→14,
`@google-cloud/bigquery` 8→9, `lucide-react` 0.577→1.31; e os minors/patches
(`next` 16.3.0, `react` 19.2.8, `zod` 4.4.3, `radix-ui` 1.6.7, `recharts`
3.10.1, `tailwindcss` 4.3.3, `vitest` 4.1.10, `firebase` 12.17.1).

**TypeScript 7** exigiu um ajuste só: `baseUrl` foi removido da configuração
(TS5102). Seguro aqui porque as `paths` já eram relativas. O `tsc --noEmit`
do repositório caiu de ~60s para **9,4s**.

Datas de publicação relevantes:

| | data |
|---|---|
| `@mastra/core@1.32.1` (o nosso) | 2026-05-05 |
| `@mastra/core@1.58.0` | 2026-08-12 |
| `ai@6.0.116` (o nosso) | 2026-03-05 |
| `ai@7.0.0` | 2026-06-25 |

## A ordem do upgrade da stack de IA, e por que ela não é livre

**`@mastra/core` não depende do `ai`.** O único peer dele é
`zod ^3.25.0 || ^4.0.0` — verificado no pacote instalado e no 1.58.0. Ele
recebe o objeto de modelo pronto, então o que importa é a *spec version* do
modelo (`LanguageModelV3` para AI SDK v6, `V4` para v7), não a versão do
pacote `ai`.

Daí a ordem: **Mastra primeiro, AI SDK depois.**

O nosso `@mastra/core@1.32.1` é de 5 de maio; o `ai@7.0.0` saiu em 25 de
junho. Ele é de **antes de a v7 existir** e não tem como conhecer
`LanguageModelV4`. Já o release
[1.53.0 do Mastra (27/07/2026)](https://github.com/mastra-ai/mastra/releases)
corrige explicitamente o formato de tool result para *providers da v7* — ou
seja, v7 já é território conhecido de lá.

Subir o `ai` para 7 antes do Mastra seria entregar modelo V4 a um runtime que
não sabe o que é.

⚠️ A [página de integração do Mastra com o AI SDK](https://mastra.ai/en/docs/frameworks/agentic-uis/ai-sdk)
ainda documenta só v5/v6 no `toAISdkStream()`. Os releases falam de v7, a
página não. Não é bloqueio, mas a parte de **stream para a UI** merece teste
próprio no upgrade.

## Superfície do `ai` neste repositório

Levantada por grep dos imports, não de memória:

`tool`, `wrapLanguageModel`, `defaultSettingsMiddleware`, `customProvider`,
`generateObject`, `embed`, `embedMany`, `DefaultChatTransport`, `UIMessage`.

O que a v7 muda, cruzado com o que usamos:

| mudança da v7 | impacto aqui |
|---|---|
| `wrapLanguageModel` / `defaultSettingsMiddleware` mantidos | **nenhum** — o `model-registry`, com thinking embutido por middleware, sobrevive |
| `experimental_customProvider` removido | **nenhum** — usamos `customProvider` |
| `tool()` reformula contexto (`experimental_context` → `context`, `toolsContext`, `contextSchema`) | **baixo** — 63 arquivos definem `tool({...})`, mas nenhum usa `experimental_*` |
| `system:` vira `instructions:` | **1 uso** (`judge-runner.ts`) — migrado |
| `needsApproval` → `toolApproval` no loop do AI SDK | **NÃO migrar** — ver abaixo |

Superfície moderada, portanto — não foi reescrita. Migração feita em
13/08/2026: typecheck limpo, 263 arquivos / 1769 testes verdes na primeira
execução, `pnpm build` completo, e `pnpm smoke:supervisor` com 8/8
sub-agentes contra o Vertex — este último é o que prova que o Mastra 1.58
aceita modelo `LanguageModelV4`, que era o risco da ordem.

### ⚠️ `needsApproval`: o guia de migração do AI SDK não vale aqui

A v7 move aprovação para `toolApproval`, opção de **chamada** em
`streamText`/`generateText`. Seguir isso nesta base **desligaria em silêncio**
o gate humano de `bq-save-validated-query` (que escreve no catálogo de SQL) e
de `bqml/create-or-use-model`.

Motivo: nossas tools não rodam no loop do AI SDK, rodam no do **Mastra** — e
o Mastra lê `needsApproval` da própria tool e mapeia para o `requireApproval`
dele, aceitando boolean **ou** função (as duas formas que usamos). Verificado
no dist do `@mastra/core@1.58.0`.

**Regra geral:** guia de migração de SDK descreve o loop DAQUELE SDK. Quem
dirige as tools aqui é o Mastra. Antes de aplicar qualquer item do guia,
confira se o Mastra lê aquilo.

## Fora da stack de IA

- **`typescript`**: o repositório está em **7.0.2** (`tsc` e `next build`). O
  typescript-eslint roda na API do TS 6 via `.pnpmfile.cjs` — ver
  `@stacks/language/typescript@7`, parágrafo "Neste projeto".
- **`@tanstack/react-table` 8 → 9**, **`@google-cloud/bigquery` 8 → 9**,
  **`firebase-admin` 13 → 14**, **`eslint` 9 → 10**: majors independentes
  entre si e da stack de IA; cada um vale um passo próprio.
- **`lucide-react` 0.577 → 1.31**: saiu de `0.x`, então a promessa de semver
  muda de natureza. Vale ler o changelog antes.
