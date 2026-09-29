---
title: Next.js
type: stacks
category: frontend
version: 16.3.6
last_updated: 2026-09-28
status: current
upstream: https://nextjs.org/docs
supersedes: next@15
---

# Next.js 16

Framework full-stack React baseado em App Router, com Server Components, Server Actions, streaming, Cache Components (`cacheComponents: true`, sucessor do PPR experimental) e Turbopack como compilador padrão para dev e build. Esta é a versão de referência do projeto. A versão 15 está descontinuada — todo código novo segue Next 16.

Requer **React 19.3** (peer `^19` — ver `@stacks/frontend/react@19`) e **Node 26** (ver `@stacks/runtime/node@26`). TypeScript **7.0.2** (`@stacks/language/typescript@7`). Baseline de produção: **Next 16.3.6** (Active LTS desde 2026-08-03). 16.4 é canary. O release de segurança **16.3.7** foi anunciado para 2026-09-30: subir no dia em que publicar.

---

## Linha 16.3 (2026)

- **16.3.6** é o piso de produção nesta data. Inclui Instant Navigations (GA, não preview) e os patches de segurança de agosto e de 22/09/2026.
- Instant Navigations: navegações com feeling de SPA em app server-driven.
  - Exige `cacheComponents: true` em `next.config.ts`.
  - Rotas “instant” usam Stream (`<Suspense>`) ou Cache (`'use cache'`); opt-out com `export const instant = false`.
  - **Partial Prefetching** (`partialPrefetching: true`): prefetch de shell reutilizável por rota (não por link).
  - Helper de teste: `import { instant } from '@next/playwright'` com Playwright (`@stacks/testing/playwright`).

## O que mudou em relação a Next 15

Mudanças marcantes que afetam decisão diária:

- **Turbopack estável para `next build`**, não apenas `next dev`. O Webpack continua disponível como fallback, mas o caminho default é Turbopack em todos os comandos. Tempos de build caem significativamente — desativar Turbopack só com motivo documentado.
- **Async Request APIs** consolidadas e obrigatórias. `cookies()`, `headers()`, `draftMode()`, e os props `params` e `searchParams` em pages/layouts são `Promise<...>`. Não há mais codemod opcional — quem migra de 14 ou 15 antiga precisa `await` em todos os pontos.
- **Partial Prerendering via Cache Components**. A flag `experimental.ppr` e o `export const experimental_ppr` foram removidos no 16; o modelo agora é `cacheComponents: true` em `next.config.ts`. Combina shell estático prerenderizado com slots dinâmicos via `<Suspense>`. Fonte: nextjs.org/docs/app/guides/upgrading/version-16.
- **`after()` estabilizado** (era `unstable_after` em 15). Import de `next/server`. Use para trabalho pós-resposta (telemetria, logs, cache warming) sem bloquear o response.
- **`instrumentation.ts`** com suporte OpenTelemetry first-class. Hook `register()` carregado uma vez por runtime (Node e Edge), e hook `onRequestError` para captura de erros. Ver `@rules/observability`.
- **Server Actions** com enforcement de origin por default, encryption automática dos action IDs, e stack traces melhores em dev. Mantém-se a recomendação de validar input com Zod antes de qualquer side-effect (`@rules/validation`, `@stacks/validation/zod@4`).
- **`next/form`** maduro — primitive de formulário com prefetch e client-side navigation.
- **Cache Components** (`cacheComponents: true`; `use cache` directive e `cacheLife`/`cacheTag` APIs) para granularidade fina de cache em componentes e funções. É a base das Instant Navigations (linha 16.3) e o caminho do projeto para caching.
- **Typed Routes** estável. Habilitar `typedRoutes: true` em `next.config.ts` — todo `<Link href>` e `redirect()` passam a ser type-checked contra as rotas reais.
- **Pages Router descontinuado para código novo**. Mantido apenas em rotas legacy que ainda não migraram. Nada novo entra em `pages/`. Sob FSD a camada de páginas se chama `views` (`src/views`) justamente para o Next não interpretá-la como Pages Router.

---

## Convenções de arquivos do App Router

Estrutura canônica dentro de `app/`:

| Arquivo | Responsabilidade |
|---|---|
| `layout.tsx` | Wrapper persistente entre navegações. Server Component por default. |
| `page.tsx` | Rota navegável. Server Component por default. |
| `loading.tsx` | UI de fallback enquanto o segmento carrega (Suspense automático). |
| `error.tsx` | Error boundary do segmento. **Sempre `"use client"`.** |
| `global-error.tsx` | Error boundary raiz (substitui o root layout em erro fatal). |
| `not-found.tsx` | UI para `notFound()` ou rota inexistente. |
| `route.ts` | Route Handler (HTTP endpoint). Use apenas quando Server Action não resolve. |
| `template.tsx` | Como layout, mas remonta a cada navegação. Evitar sem motivo claro. |
| `default.tsx` | Fallback para parallel routes não resolvidas. |
| `proxy.ts` | Interceptação de request antes do handler (substitui `middleware.ts` no 16). Export nomeado `proxy`; roda sempre em `nodejs`. |
| `instrumentation.ts` | Bootstrap de telemetria, OTel, monitoring. |

Roteamento avançado:

- **Dynamic**: `[id]/page.tsx` — `params: Promise<{ id: string }>`.
- **Catch-all**: `[...slug]`.
- **Optional catch-all**: `[[...slug]]`.
- **Route groups**: `(marketing)/`, `(app)/` — agrupam sem afetar URL.
- **Parallel routes**: `@slot/` — renderiza múltiplas páginas no mesmo layout.
- **Intercepting routes**: `(.)foo`, `(..)foo`, `(...)foo` — interceptam navegações (modais, drawers).

A organização interna dentro de cada feature segue `@architecture/fsd`. `app/**/page.tsx` é arquivo fino que renderiza views/widgets; `route.ts` re-exporta o driving adapter em `src/services/<context>/adapters/driving/`; `actions.ts` é wrapper `"use server"` de uma linha que chama o adapter.

Re-exportar os handlers funciona (`export { POST } from "@/services/orders/adapters/driving/place-order-route-handler"`). **Route segment config não atravessa re-export:** `runtime`, `dynamicParams` e `maxDuration` são lidos estaticamente e precisam ser declarados como literal no próprio `route.ts`/`page.tsx`; re-exportados, o Next avisa e usa o default. Com `cacheComponents: true`, `dynamic`, `revalidate` e `fetchCache` não existem mais (removidos no 16.0.0; fonte: nextjs.org/docs/app/api-reference/file-conventions/route-segment-config).

---

## Server Components vs Client Components

Server Components são o **default**. Adicione `"use client"` apenas quando o componente precisar de:

- State local (`useState`, `useReducer`).
- Effects (`useEffect`, `useLayoutEffect`).
- Browser APIs (`window`, `localStorage`, `IntersectionObserver`).
- Event handlers (`onClick`, `onChange`) — exceto Server Actions em forms.
- Hooks de libs client-only (Zustand store consumer, etc — ver `@stacks/state/zustand@5` e `@rules/state-management`).

Regras operacionais:

- Marque o componente **folha** que precisa de interatividade, não o layout/page inteiro.
- Server Components podem importar Client Components. Client Components **não** podem importar Server Components, mas podem **receber** Server Components como `children`.
- Nunca passe dados sensíveis (secrets, tokens, dados internos) para Client Components — eles cruzam a network boundary. Ver `@rules/security` e `@contracts/secrets`.
- Não faça `fetch` em Client Component quando o mesmo dado pode ser carregado em Server Component pai.
- Não use `useEffect` para derivar dados que vêm de Server Components — passe via props.

---

## Server Actions

Funções server-side invocáveis do client, marcadas com `"use server"`.

O arquivo de `src/app/` só declara `"use server"` e delega para o driving adapter do contexto (ADR 0003, Amendments). Sem lógica, sem acesso a banco:

```ts
// src/app/posts/actions.ts
"use server";

import { createPostAction } from "@/services/posts/adapters/driving/create-post-action";

export const createPost = async (formData: FormData) => createPostAction(formData);
```

O schema é compartilhado entre client (form) e server, então mora em `src/contracts/` (`@contracts/schemas` §2):

```ts
// src/contracts/posts/create-post-input.schema.ts
import { z } from "zod";

export const CreatePostInputSchema = z.strictObject({ title: z.string().min(1).max(120) });
export type CreatePostInput = z.infer<typeof CreatePostInputSchema>;
```

O driving adapter autentica, valida na borda, chama o use case e invalida o cache:

```ts
// src/services/posts/adapters/driving/create-post-action.ts
import { updateTag } from "next/cache";
import { CreatePostInputSchema } from "@/contracts/posts/create-post-input.schema";
import { createPost } from "@/services/posts/composition"; // makeCreatePost({ posts: postgresPostRepository })
import { getRequestId } from "@/services/shared/request-id"; // async: lê x-request-id (setado pelo proxy.ts) via await headers()

export const createPostAction = async (formData: FormData) => {
  const user = await requireUser(); // authn/authz na primeira linha
  const parsed = CreatePostInputSchema.safeParse({ title: formData.get("title") });
  if (!parsed.success) {
    // Result da Server Action: { ok: false, error } com error no envelope de contracts/api.md seção 6
    return {
      ok: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "One or more fields are invalid.",
        details: parsed.error.issues.map((i) => ({ field: i.path.map(String).join("."), issue: i.code.toUpperCase() })),
        requestId: await getRequestId(),
      },
    } as const;
  }

  const post = await createPost({ ...parsed.data, authorId: user.id });
  updateTag("posts"); // read-your-writes: roda dentro da Server Action que chamou o adapter
  return { ok: true, data: { postId: post.id } } as const;
};
```

O use case (`src/services/posts/application/use-cases/create-post.ts`) é uma factory que recebe o port `PostRepository` e grava; o acesso a banco fica no adapter driven (`@architecture/feature-based`, `@architecture/hexagonal`).

Disciplina:

- **Retorno é `Result`:** `{ ok: true, data } | { ok: false, error }`, com `error` = `{ code, message, details?, requestId }` de `@contracts/api` §6 (ADR 0003). Nada de `{ ok: false, code }` achatado nem campos soltos (`postId`) fora de `data`.
- **Validar todo input com Zod** antes de qualquer side-effect (ver `@rules/validation`, `@stacks/validation/zod@4`).
- **Idempotência** sempre que possível — actions podem ser disparadas duas vezes em retries.
- **Revalidation explícita** ao final da action: `updateTag(tag)` (read-your-writes, só em Server Actions), `revalidateTag(tag, "max")` (stale-while-revalidate; a forma de 1 argumento está deprecated) ou `revalidatePath(path)`, todos de `next/cache`.
- **Origin enforcement** já é default em 16, mas valide `allowedOrigins` em `next.config.ts` se houver proxies/CDN customizados.
- Prefira Server Actions a Route Handlers quando o consumidor é o próprio app. Reserve `route.ts` para webhooks, APIs públicas, ou integrações externas.

---

## Caching

Caching em Next 16 é **opt-in explícito**. Não confie em comportamento implícito. Detalhes operacionais em `@rules/caching`.

Mecanismos disponíveis:

- **`fetch` options**: `fetch(url, { cache: "force-cache" | "no-store", next: { revalidate: 60, tags: ["posts"] } })`.
- **`unstable_cache` / `cache`** (React): memoização de funções server. `unstable_cache` é superado por `use cache` quando `cacheComponents` está ligado; use-o apenas em código sem Cache Components.
- **`revalidateTag(tag, "max")`**, **`updateTag(tag)`** e **`revalidatePath(path)`**: invalidação targeted.
- **`staleTimes`** em `next.config.ts`: tuning do Router Cache do client.
- **`use cache` directive** (Cache Components): cache de componentes/funções com `cacheLife`/`cacheTag`.

Padrão do projeto: nenhuma rota é cacheada por inferência. Toda decisão de cache aparece explicitamente em `'use cache'` com `cacheLife(...)`/`cacheTag(...)` dentro da função ou componente cacheado. Com `cacheComponents: true`, `export const revalidate`, `export const dynamic` e `export const fetchCache` foram removidos (nextjs.org/docs/app/api-reference/file-conventions/route-segment-config, v16.0.0); o tempo de vida vem de `cacheLife()` dentro de `'use cache'` (nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents).

---

## Streaming, Suspense e UX assíncrono

Ver `@rules/performance`.

- `loading.tsx` por segmento para fallback automático via Suspense.
- `<Suspense fallback={...}>` para granularidade fina dentro de uma page.
- `useTransition` em Client Components para pending states em mutations.
- `useOptimistic` para optimistic UI em Server Actions.

Com `cacheComponents: true` em `next.config.ts`, o PPR combina shell prerenderizado com slots dinâmicos (sem flag por rota):

```tsx
export default function Page() {
  return (
    <>
      <StaticHeader />
      <Suspense fallback={<Skeleton />}>
        <DynamicUser />
      </Suspense>
    </>
  );
}
```

---

## Metadata, imagens, fontes

- **Metadata**: `export const metadata` estático ou `generateMetadata()` async. Inclui `openGraph`, `twitter`, `robots`, `alternates`.
- **`sitemap.ts`** e **`robots.ts`** em `app/` para geração nativa.
- **`next/image`**: configure `remotePatterns` em `next.config.ts`. Nada de `domains` (descontinuado; use `remotePatterns`).
- **`next/font`**: prefira `next/font/google` (self-hosted automático) e `next/font/local`. Não carregue fontes via `<link>` no head.

---

## Internacionalização

Sem i18n routing nativo. Use `proxy.ts` para detecção/redirect de locale, e libs como `next-intl` para mensagens e formatters. Ver `@rules/internationalization`.

---

## Proxy e runtimes

- `proxy.ts` (export `proxy`) substitui `middleware.ts` no 16 e roda sempre no runtime `nodejs`; Edge não é suportado nele. Mantenha leve — auth check, redirect, rewrites. Não faça queries pesadas. `middleware.ts` está deprecated e só se justifica para quem precisa de Edge.
- `export const runtime` aceita `"nodejs"` (default) e `"edge"`, mas `"edge"` está deprecated e **Cache Components exige o runtime Node.js**. Como o projeto liga `cacheComponents: true`, não declare `runtime = "edge"`; rota legada com edge precisa migrar (nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents).
- Server Actions sempre rodam em Node runtime do segmento que as importou.

---

## Variáveis de ambiente

- `NEXT_PUBLIC_*`: expostas ao client em build time. **Nunca** coloque secret aqui.
- Todo o resto: server-only, lido via `process.env.X` em Server Components, Actions, Route Handlers, ou `instrumentation.ts`.
- Convenções de naming e armazenamento em `@contracts/secrets`. Regras de exposição em `@rules/security`.

---

## Error handling

Ver `@rules/error-handling`.

- `error.tsx` por segmento (sempre Client Component) com `reset()`.
- `global-error.tsx` na raiz para erros que escapam o root layout.
- `notFound()` para 404 controlados; `not-found.tsx` para UI.
- `instrumentation.ts` exporta `onRequestError(err, request, context)` para envio a Sentry/OTel.

---

## Build e deploy

- **Turbopack** é o compilador default em `next dev` e `next build`. Verifique compatibilidade de plugins Webpack antes de migrar configurações legacy.
- **Vercel**: deploy ideal (PPR e streaming nativos).
- **Firebase App Hosting**: rodando sobre Cloud Run, suporta SSR/RSC. Configurar `apphosting.yaml`; o runtime Node é escolhido no backend — confira a versão oferecida.
- **Cloud Run direto**: viável via output `standalone` (`output: "standalone"` em `next.config.ts`).
- Para SPA estática, `output: "export"` continua disponível mas perde Server Actions, ISR, proxy, image optimization padrão.

---

## Stack relacionada

- Estilização: `@stacks/frontend/tailwind@4`.
- Componentes: `@stacks/frontend/shadcn-ui`, `@stacks/frontend/radix-ui`.
- Validação: `@stacks/validation/zod@4`.
- Estado client: `@stacks/state/zustand@5` (regras em `@rules/state-management`).
- IA / streaming UI: `@stacks/ai/vercel-ai-sdk`.

---

## Migração 15 → 16

1. Atualizar Node para `>=20.9` (requisito do Next 16, ADR 0004; baseline do projeto: 26 — `@stacks/runtime/node@26`).
2. Atualizar React: `npm i react@19 react-dom@19`.
3. Rodar codemod oficial: `npx @next/codemod@canary upgrade latest`.
4. Revisar `next.config.ts`: remover flags que viraram default ou foram removidas (`experimental.ppr` -> `cacheComponents`, `after`), mover `experimental.typedRoutes` para `typedRoutes: true` no topo (saiu de experimental), trocar `export const revalidate`/`dynamic`/`fetchCache` por `'use cache'` + `cacheLife()` e remover `runtime = "edge"` (Cache Components exige Node.js), renomear `middleware.ts` para `proxy.ts`, confirmar `remotePatterns` para imagens.
5. Auditar uso de `unstable_after` → `after`.
6. Auditar Server Actions: confirmar `allowedOrigins` se houver proxies.
7. Rodar `next build` com Turbopack e validar; se algum plugin Webpack quebrar, isolar e decidir entre migrar ou usar `--webpack` temporário.
8. Verificar `instrumentation.ts` e ativar OTel — ver `@rules/observability`.
9. Remover qualquer código novo de `pages/`. Migrar rotas legacy conforme prioridade.

---

## Anti-patterns

Evite ativamente:

- Criar código novo no **Pages Router** (`pages/`). App Router é o único caminho para features novas.
- Marcar `"use client"` em `layout.tsx` ou `page.tsx` inteiros sem necessidade — empurra árvore inteira para o client e perde RSC.
- Passar **dados sensíveis** (tokens, secrets, dados internos) como props para Client Components.
- Fazer `fetch` em Client Component quando Server Component pai pode buscar e passar via props.
- Usar `useEffect` para **derivar dados** que vêm de Server Components — passe via props.
- Assumir **cache implícito**. Em 16, cache é opt-in — toda decisão é explícita.
- Criar Route Handler (`route.ts`) quando Server Action resolve. Route Handlers existem para APIs públicas, webhooks e integrações externas.
- Colocar **lógica pesada em `proxy.ts`** (queries, parsing complexo). O proxy roda em todo request — mantenha-o trivial.
- Desativar Turbopack em build sem motivo documentado.
- Não habilitar `instrumentation.ts` — perde observability nativa.
- Usar `domains` em `next/image` (descontinuado no 16) em vez de `remotePatterns`.
- Esquecer de validar input de Server Actions com Zod antes de side-effects.
- Bloquear o response em trabalho pós-resposta — use `after()` em vez disso.
