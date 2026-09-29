---
name: next-16
description: Use ao trabalhar com Next.js 16 (next@16.3.6 + React 19.3.0) — App Router, Server Actions, RSC, Cache Components, proxy.ts, route handlers. Keywords: next, nextjs, app router, server components, server actions, use cache, route.ts, proxy.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Next.js 16

Framework React com App Router, React Server Components, Server Actions, data cache granular por tag, streaming SSR, Turbopack como bundler default em dev e build. Baseline **next@16.3.6** (Active LTS; 16.4 é canary; subir para 16.3.7 quando publicar) com **React 19.3.0**, Node 26 e TypeScript 7.0.2 (com Next 16.3 a API TS 6 do lint entra por `.pnpmfile.cjs`, não por alias da raiz).

## Essência
- **App Router (`app/`):** layouts aninhados, `page.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts` (handlers).
- **RSC default:** componentes em `app/` são server por default; `'use client'` no topo para virar client component.
- **Server Actions:** `'use server'` em função → mutação invocável de form/handler client. Validar input sempre.
- **Data fetching:** com `cacheComponents: true` (padrão do projeto), `'use cache'` + `cacheLife()` + `cacheTag()` em função/componente; `fetch` com `{ cache: "force-cache", next: { tags, revalidate } }` e `unstable_cache` só sem Cache Components.
- **Invalidação:** `updateTag("tag")` (read-your-writes em Server Action), `revalidateTag("tag", "max")` (1 argumento está deprecated), `revalidatePath("/path")` após mutation.
- **Routing dinâmico:** `app/posts/[slug]/page.tsx`; `generateStaticParams` para SSG; `generateMetadata` para SEO.
- **Proxy** (`proxy.ts`, export `proxy`): roda em `nodejs` (Edge não suportado); `middleware.ts` está deprecated. Ideal para auth/redirect leve.
- **Cache Components** (`cacheComponents: true`): substitui `experimental_ppr`, que foi removido no 16.
- **Streaming:** `<Suspense>` entre slow + fast partes; `loading.tsx` automático.
- **`next/image`, `next/font`, `next/link`:** otimizações automáticas.
- **Turbopack** dev/build default.
- **Entry points finos:** `src/app/v1/<resource>/route.ts` re-exporta o driving adapter; `src/app/<rota>/actions.ts` é wrapper `"use server"` de uma linha; ambos chamam `src/services/<context>/adapters/driving/`; route segment config (`runtime`, `maxDuration`) não atravessa re-export: declare literal no próprio arquivo. Com `cacheComponents: true`, `export const revalidate`/`dynamic`/`fetchCache`/`dynamicParams` dão erro: use `cacheLife()` dentro de `'use cache'`. Camada de páginas FSD é `src/views/` (nunca `src/pages/`).

## Procedimento mínimo
1. Estruturar rotas em `app/`. Layouts compartilham UI persistente.
2. Server > Client: `'use client'` só onde precisa estado/efeito/listener.
3. Mutations via Server Action (`'use server'`) com validação Zod na entrada.
4. Cache fetch com `tags`; revalidar tag após mutation.
5. `next/image` para toda imagem; `next/font` para fontes self-hosted.
6. Auth/redirect leve em `proxy.ts`.

## Anti-patterns
- `useEffect(fetch)` em client component quando RSC poderia fazer no server → mover.
- Server Action sem auth na primeira linha ou sem `safeParse` → 400 esperado vira 500. Retorno é `{ ok: true, data } | { ok: false, error }`, com `error` no envelope de `contracts/api.md` seção 6 (ADR 0003).
- `revalidatePath("/")` global após cada mutation → use tag específica.
- Importar lib pesada num client component crítico → `dynamic(() => import(...))`.

## Mini-exemplo
```tsx
// src/app/posts/[slug]/page.tsx — só importa o slice de src/views/
export { PostPage as default } from "@/views/post";

// src/views/post/ui/PostPage.tsx — RSC; dado vem do use case, não de fetch no route handler
import { getPostBySlug } from "@/services/posts/composition"; // makeGetPostBySlug(...) com 'use cache' + cacheLife("hours") + cacheTag(`post:${slug}`)
export async function PostPage({ params }: { params: Promise<{ slug: string }> }) {
  const post = await getPostBySlug({ slug: (await params).slug });
  return <Article post={post} />;
}

// src/app/posts/actions.ts — "use server" + wrapper async de uma linha; nada de lógica aqui
"use server";
import { publishPostAction } from "@/services/posts/adapters/driving/publish-post-action";
export const publishPost = async (formData: FormData) => publishPostAction(formData);

// src/services/posts/adapters/driving/publish-post-action.ts — auth → safeParse → use case → updateTag
import { updateTag } from "next/cache";
import { PublishPostInputSchema } from "@/contracts/posts/publish-post-input.schema";
import { publishPost as runPublishPost } from "@/services/posts/composition"; // makePublishPost({ posts: postgresPostRepository })
import { getRequestId } from "@/services/shared/request-id"; // async: (await headers()).get("x-request-id") ?? ulid()

export const publishPostAction = async (formData: FormData) => {
  const user = await requireUser();
  const parsed = PublishPostInputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => ({ field: i.path.map(String).join("."), issue: i.code.toUpperCase() }));
    return { ok: false, error: { code: "VALIDATION_FAILED", message: "One or more fields are invalid.", details, requestId: await getRequestId() } } as const;
  }
  const post = await runPublishPost({ postId: parsed.data.postId, authorId: user.id });
  updateTag(`post:${parsed.data.slug}`);
  return { ok: true, data: { postId: post.id, publishedAt: post.publishedAt } } as const;
};
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/frontend/next@16.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
