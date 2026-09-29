---
paths: ["**/*.tsx","src/**/model/**","**/use-*-store.ts"]
---
# State Management — ativa em UI/store

Cada pedaço de estado tem uma categoria e um dono: server state, URL state, form state, local state, global client state. Nunca trate uma categoria como outra.

## Princípios
- **Server state → RSC / fetch layer do Next** (cache + `updateTag`/`revalidateTag` após Server Action). Nunca copiado para Zustand, Context ou variável de módulo.
- **URL state → search params + router.** Filtros, paginação, abas, modais que precisam de share/back/forward. Não duplicar em store.
- **Form state → form uncontrolled + `FormData` + Server Action + `useActionState`**, validado com o mesmo schema Zod no servidor. Controlled só quando precisa reagir a cada tecla.
- **Local state → `useState`/`useReducer`.** Não promova para global o que vive no componente.
- **Global client state → Zustand 5**, stores pequenos por domínio em `model/use-<name>-store.ts` do slice FSD. Só em client components.
- Zustand 5: `create<State>()(...)` (double call), selector explícito sempre, `useShallow` para objeto; toda store global tem `reset`.
- Persistência (`persist`) só para o que sobrevive a reload (preferências, draft longo, carrinho), com shape versionado; nunca server state nem derivado.
- Imutabilidade: spread/Immer; nunca `state.x = y` direto.

## Checklist (aplicar a todo turn)
- [ ] Dado de servidor NÃO está duplicado em store cliente.
- [ ] Filtro/aba navegável tem reflexo em URL.
- [ ] Form submete via Server Action; erros por campo voltam no `useActionState` como `error.details` (`VALIDATION_FAILED`, nunca `flattenError`).
- [ ] Componente consome só o que precisa (selector específico / `useShallow`).
- [ ] Optimistic update (`useOptimistic`) reverte em erro.

## Anti-patterns
- `useEffect` + `fetch` + `useState` para dado do servidor → RSC/fetch layer.
- `localStorage` direto em componente → store com `persist` versionado.
- Mega-store global única → dividir por domínio.
- `useStore()` sem selector → re-render a cada mudança.

## Mini-exemplo
```ts
// src/widgets/sidebar/model/use-sidebar-store.ts
type SidebarState = { isOpen: boolean; toggle: () => void; reset: () => void };

export const useSidebarStore = create<SidebarState>()((set) => ({
  isOpen: false,
  toggle: () => set((s) => ({ isOpen: !s.isOpen })),
  reset: () => set({ isOpen: false }),
}));

const isOpen = useSidebarStore((s) => s.isOpen); // selector específico
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/state-management.md`
