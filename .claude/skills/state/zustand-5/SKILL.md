---
name: zustand-5
description: Use para state management com Zustand 5 — stores, slices, persistência. Keywords: zustand, store, state.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Zustand 5

Store global minimalista para React: API baseada em hooks, sem Context boilerplate, sem reducers obrigatórios, com middlewares (persist, immer, devtools, subscribeWithSelector).

## Essência
- **Store = hook:** `const useStore = create<S>()((set, get) => ({ ...state, ...actions }))`.
- **Selectors:** `useStore(s => s.user)` — re-renderiza só quando a fatia muda. Use **sempre** selector específico em vez de `useStore()`.
- **Actions** moram no próprio store; chamadas com `set(...)` (merge) ou `set(prev => ...)`.
- **Slices pattern:** dividir state em slices (`createAuthSlice`, `createUISlice`) combinadas em uma store.
- **Middlewares:** `persist(store, { name, storage })` para localStorage; `immer(store)` para mutate-style; `devtools(store)` para Redux DevTools; `subscribeWithSelector` para subscribers granulares.
- **Sem Provider:** store é singleton no módulo. Para teste/SSR isolado, crie store por request via factory.
- **SSR:** em Next, criar store por request (factory + Context) para evitar vazamento de estado entre usuários.
- **Equality function:** `useStore(s => s.list, shallow)` para arrays/objetos.
- **`useShallow`** hook em v5 para shorthand de shallow comparison em objetos.

## Procedimento mínimo
1. Definir tipo do state + actions.
2. `create<State>()((set, get) => ({ ...defaults, action: (x) => set({ field: x }) }))`.
3. Consumir com selector específico: `const user = useStore(s => s.user)`.
4. Persistência via `persist`; auth/theme/feature flags são candidatos típicos.
5. Slices: `create((...a) => ({ ...createAuthSlice(...a), ...createUISlice(...a) }))`.

## Anti-patterns
- `useStore()` sem selector → re-render em qualquer mudança.
- Dado de servidor na store global → use TanStack Query.
- Store gigante de 50 campos → quebrar em slices ou múltiplas stores.
- Mutate direto `state.x = y` sem `immer` → broken updates.

## Mini-exemplo
```ts
type State = { count: number; inc: () => void };
export const useCounter = create<State>()((set) => ({
  count: 0,
  inc: () => set((s) => ({ count: s.count + 1 })),
}));

// component:
const count = useCounter((s) => s.count);
const inc = useCounter((s) => s.inc);
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/state/zustand@5.md`
**Documentação upstream:** MCP `liquid-docs` — busque por `zustand` para detalhes da versão atual.
