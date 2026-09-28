---
paths: ["**/*.tsx","**/store/**"]
---
# State Management — ativa em UI/store

Escolha de onde mora cada pedaço de estado segue árvore de decisão: server state, URL state, global client state, local component state. Cada um tem dono.

## Princípios
- **Server state → TanStack Query / SWR / RSC.** Dados que vivem em DB: cache, refetch, stale, mutate.
- **URL state → query params + router.** Filtros, paginação, abas, modais que precisam de share/back/forward.
- **Global client state → Zustand (ou similar) com slices pequenas.** Auth user, theme, feature flags client-side, UI cross-page.
- **Local state → `useState` / `useReducer`.** Inputs controlados, toggles, estado de componente.
- **Form state → react-hook-form + Zod resolver.** Não reinventar com `useState` per-field.
- Single source of truth: server state nunca é "copiado" para store global — query lida com cache.
- Selectors específicos para evitar re-render: `useStore(s => s.user)` em vez de `useStore()`.
- Imutabilidade: spread/Immer; nunca `state.x = y` direto.

## Checklist (aplicar a todo turn)
- [ ] Dado de servidor NÃO está duplicado em store global.
- [ ] Filtro/aba navegável tem reflexo em URL.
- [ ] Form com mais de 2 campos usa react-hook-form.
- [ ] Componente consome só o slice que precisa (seletor específico).
- [ ] Mutation com optimistic update reverte em erro.

## Anti-patterns
- `useState` para data do server → use TanStack Query.
- `localStorage` direto em componente → wrap em store com persist middleware.
- Store global gigante de 50 campos → quebrar em slices.
- `useContext` para evitar prop-drilling de 1 nível → passar prop.

## Mini-exemplo
```ts
// Zustand slice
export const useUI = create<UIState>((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
}));
const sidebarOpen = useUI(s => s.sidebarOpen); // seletor específico
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/state-management.md`
