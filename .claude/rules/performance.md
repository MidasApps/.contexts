---
paths: ["**/*.tsx","**/*.ts","next.config.*"]
---
# Performance — ativa em código de aplicação

Performance é medida, não adivinhada. Orçamentos de bundle e Core Web Vitals (LCP, INP, CLS) definem alvo; otimização vem com profile.

## Princípios
- **Measure first**: profile antes de otimizar (Chrome DevTools, React Profiler, `next build --analyze`).
- Bundle budget: JS inicial < 200 KB gzipped para landing; route-level code-split é default.
- LCP < 2.5s, INP < 200ms, CLS < 0.1. Cada commit que regride é justificado.
- Imagens: `next/image` com `width`/`height` definidos; `priority` em LCP image; AVIF/WebP via framework.
- Lazy import (`dynamic()`) componentes pesados não-críticos (modais, charts, editores).
- `React.memo`/`useMemo`/`useCallback` apenas com profile mostrando ganho — overhead em casos normais.
- Server > Client quando possível (RSC em Next): menos JS no cliente.
- Evite waterfalls: `Promise.all` para fetches independentes; preload no header quando aplicável.
- Caching aplica camada anterior — ver rule `caching`.

## Checklist (aplicar a todo turn)
- [ ] Imagem nova usa `next/image` com dimensões.
- [ ] Componente pesado importado é avaliado para `dynamic()`.
- [ ] Sem `useMemo` "preventivo" em dado primitivo.
- [ ] Fetches independentes paralelos (`Promise.all`).
- [ ] Sem `'use client'` no topo de árvore que poderia ser RSC.
- [ ] Bundle analyzer rodou se a mudança soma > 20 KB.

## Anti-patterns
- `<img src="..." />` em vez de `next/image` → CLS + bytes maiores.
- `useEffect` para fetch que dá pra fazer no servidor → waterfall.
- Memo em tudo "por garantia" → custo de comparação > ganho.
- Lib gigante (moment, lodash inteiro) em client bundle → use date-fns/lodash-es/named imports.

## Mini-exemplo
```tsx
const Editor = dynamic(() => import("./Editor"), { ssr: false, loading: () => <Skeleton /> });
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/performance.md`
