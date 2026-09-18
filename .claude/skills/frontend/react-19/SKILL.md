---
name: react-19
description: Use ao trabalhar com React 19 — hooks, suspense, actions, transitions. Keywords: react, jsx, hooks.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# React 19

Versão com Actions estáveis, `useActionState`, `useOptimistic`, `useFormStatus`, `use()` para promessas/context condicional, refs como props, e Suspense melhorado.

## Essência
- **Server Components / Server Actions** integrados (com Next/RSC framework).
- **`use(promise)`** dentro de Suspense para "unwrap" promise; **`use(context)`** condicional, dentro de ifs/loops.
- **Actions:** funções async passadas a `<form action={fn}>`. `useFormStatus()` lê pending; `useActionState()` mantém estado entre invocações.
- **`useOptimistic(state, reducer)`:** UI otimista durante action pendente, reverte em erro.
- **Refs como prop:** `<Input ref={inputRef} />` sem `forwardRef`. Function components recebem `ref` direto.
- **`useTransition`/`useDeferredValue`:** marca updates não-urgentes; UI mantém responsiva.
- **Document metadata:** `<title>`, `<meta>`, `<link>` no componente são içados pra `<head>`.
- **Error handling melhor:** `onCaughtError`, `onUncaughtError`.
- **`useId`** para IDs SSR-safe; **`useSyncExternalStore`** para integrar stores externas.

## Procedimento mínimo
1. Forms críticos via `<form action={serverActionOrLocalFn}>` + `useFormStatus` no botão.
2. Mutação otimista: `const [optimistic, setOptimistic] = useOptimistic(items, reducer)`; `setOptimistic(next)` antes do await.
3. `use(promise)` em RSC ou client dentro de Suspense para data fetching ad-hoc.
4. Sem `forwardRef` em componente novo — `ref` é prop normal.
5. UI cara/lista grande: `useTransition` para updates não-urgentes.

## Anti-patterns
- `useState` + handler manual onde Action + `useOptimistic` resolve.
- `forwardRef` em código novo → remover, usar ref como prop.
- `useMemo` em primitiva ou objeto pequeno → custo > benefício.
- Suspense sem fallback significativo → spinner pelado degrada UX.

## Mini-exemplo
```tsx
function AddTodo({ addTodo }: { addTodo: (t: string) => Promise<void> }) {
  const [optimistic, addOptimistic] = useOptimistic<Todo[], string>(todos, (s, t) => [...s, { id: "tmp", text: t }]);
  async function action(formData: FormData) {
    const text = String(formData.get("text"));
    addOptimistic(text);
    await addTodo(text);
  }
  return <form action={action}><input name="text" /><SubmitBtn /></form>;
}
function SubmitBtn() { const { pending } = useFormStatus(); return <button disabled={pending}>Add</button>; }
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/frontend/react@19.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
