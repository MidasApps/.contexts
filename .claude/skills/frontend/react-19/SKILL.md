---
name: react-19
description: Use ao trabalhar com React 19 (react@19.3.0) — componentes, hooks, Actions, useActionState, useOptimistic, use(), ref como prop, Suspense, React Compiler. Keywords: react, jsx, tsx, hooks, suspense, actions, forwardRef.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# React 19

Baseline **react@19.3.0** + `react-dom@19.3.0` e `@types/react@19.3.0` (pin exato; peer de `next@16.3.6` é `^19`). Actions estáveis, `useActionState`, `useOptimistic`, `useFormStatus`, `use()` para promessas/context condicional, refs como props, e Suspense melhorado. Arquivo de componente em PascalCase (`AddTodo.tsx`).

## Essência
- **Server Components / Server Actions** integrados (com Next/RSC framework).
- **`use(promise)`** dentro de Suspense para "unwrap" promise; **`use(context)`** condicional, dentro de ifs/loops.
- **Actions:** funções async passadas a `<form action={fn}>`. `useFormStatus()` lê pending; `useActionState()` mantém estado entre invocações. Server Action devolve `{ ok: true, data } | { ok: false, error }`; erro de validação é `VALIDATION_FAILED` com `details: [{ field, issue }]` (envelope de `contracts/api.md` §6) e o form lê `error.details` por campo; `z.flattenError()` só em validação client-only.
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
function AddTodo({ todos, addTodo }: { todos: Todo[]; addTodo: (t: string) => Promise<void> }) {
  const [optimistic, addOptimistic] = useOptimistic<Todo[], string>(todos, (s, t) => [...s, { id: crypto.randomUUID(), text: t, isPending: true }]);
  const action = async (formData: FormData) => {
    const text = String(formData.get("text"));
    addOptimistic(text);
    await addTodo(text);
  };
  return (
    <>
      <ul>{optimistic.map((t) => <li key={t.id}>{t.text}</li>)}</ul>
      <form action={action}><input name="text" /><SubmitBtn /></form>
    </>
  );
}
function SubmitBtn() { const { pending } = useFormStatus(); return <button disabled={pending}>Add</button>; }
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/frontend/react@19.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
