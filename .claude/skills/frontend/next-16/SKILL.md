---
name: next-16
description: Use ao trabalhar com Next.js 16 — app router, server actions, RSC, caching. Keywords: next, nextjs, app router, server components.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Next.js 16

Framework React com App Router, React Server Components, Server Actions, data cache granular por tag, streaming SSR, Turbopack como bundler default em dev e build.

## Essência
- **App Router (`app/`):** layouts aninhados, `page.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx`, `route.ts` (handlers).
- **RSC default:** componentes em `app/` são server por default; `'use client'` no topo para virar client component.
- **Server Actions:** `'use server'` em função → mutação invocável de form/handler client. Validar input sempre.
- **Data fetching:** `fetch()` em RSC com `{ cache: "force-cache", next: { tags: [...], revalidate: N } }`. `unstable_cache` para funções não-fetch.
- **Invalidação:** `revalidateTag("tag")`, `revalidatePath("/path")` após mutation.
- **Routing dinâmico:** `app/posts/[slug]/page.tsx`; `generateStaticParams` para SSG; `generateMetadata` para SEO.
- **Middleware** (`middleware.ts`): edge runtime, ideal para auth/redirect.
- **Streaming:** `<Suspense>` entre slow + fast partes; `loading.tsx` automático.
- **`next/image`, `next/font`, `next/link`:** otimizações automáticas.
- **Turbopack** dev/build default; alpha API stable em 16.

## Procedimento mínimo
1. Estruturar rotas em `app/`. Layouts compartilham UI persistente.
2. Server > Client: `'use client'` só onde precisa estado/efeito/listener.
3. Mutations via Server Action (`'use server'`) com validação Zod na entrada.
4. Cache fetch com `tags`; revalidar tag após mutation.
5. `next/image` para toda imagem; `next/font` para fontes self-hosted.
6. Auth/redirect em `middleware.ts` quando precisa edge.

## Anti-patterns
- `useEffect(fetch)` em client component quando RSC poderia fazer no server → mover.
- Server Action sem validação → 400 esperado vira 500.
- `revalidatePath("/")` global após cada mutation → use tag específica.
- Importar lib pesada num client component crítico → `dynamic(() => import(...))`.

## Mini-exemplo
```tsx
// app/posts/[slug]/page.tsx — RSC
export default async function Page({ params }: { params: { slug: string } }) {
  const post = await fetch(`/api/posts/${params.slug}`, { next: { tags: [`post:${params.slug}`] } }).then(r => r.json());
  return <Article post={post} />;
}

// app/posts/actions.ts
'use server';
export async function publishPost(formData: FormData) {
  const input = PublishSchema.parse(Object.fromEntries(formData));
  await db.posts.publish(input.id);
  revalidateTag(`post:${input.slug}`);
}
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/frontend/next@16.md`
**Documentação upstream:** MCP `liquid-docs` — busque por `nextjs` para detalhes da versão atual.
