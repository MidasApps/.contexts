---
paths: ["**/*.ts","**/*.tsx"]
---
# Development — ativa em TypeScript

Convenções de código TS/TSX: strictness, funções, nomes de arquivo, imports, async. Doutrina completa em `.contexts`.

## Princípios
- TS 7 strict (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `erasableSyntaxOnly`): sem `enum`, `namespace` runtime nem parameter properties.
- Sem `any` — `unknown` + narrowing. `@ts-expect-error` só com comentário; nunca `@ts-ignore`.
- `const` arrow por padrão; `function` permitida em componente React, handler de framework (`GET`/`POST`, `page.tsx`) e export nomeado de lógica.
- Use case/adapter/repository = função ou factory (`makePlaceOrder`, `postgresOrderRepository`); classe só para erro de domínio (com `code`) e, opcionalmente, agregado. Ports são `type`.
- Arquivo não-componente em kebab-case (`place-order.ts`, `user.schema.ts`, `use-auth-store.ts`); componente React em PascalCase (`LoginForm.tsx`).
- Named exports; `export default` só onde o framework exige. `index.ts` só como API pública de slice/feature/contexto, sem `export *`.
- Imports com alias `@/`, nunca `../../../`. Side effect de módulo só em `composition.ts`.
- `async/await` (sem `.then` encadeado); `Promise.all` para independentes; nenhuma promise solta.
- Identificadores em inglês; nomes de dado do contrato aparecem como valor, sem tradução.

## Checklist (aplicar a todo turn)
- [ ] Sem `any`, `enum`, parameter property ou `@ts-ignore` introduzidos.
- [ ] Tipo de retorno explícito em função exportada.
- [ ] Nome de arquivo e de símbolo seguem a convenção acima.
- [ ] Import via alias; sem barrel interno.
- [ ] Sem `console.log`, `process.env.X` espalhado ou `Date.now()` em lógica testável (injete clock).

## Anti-patterns
- `as any` para silenciar erro → corrigir o tipo.
- `enum Color { Red, Blue }` → `type Color = "red" | "blue"`.
- `class PlaceOrderUseCase` / `PgOrderRepository.ts` → `makePlaceOrder` em `place-order.ts`.
- `import { x } from "../../../shared/x"` → `import { x } from "@/shared/x"`.

## Mini-exemplo
```ts
// src/services/orders/application/use-cases/place-order.ts
type Deps = { orders: OrderRepository; clock: Clock };

export const makePlaceOrder =
  ({ orders, clock }: Deps) =>
  async (input: PlaceOrderInput): Promise<Result<Order, OrderWithoutItemsError>> => {
    if (input.items.length === 0) return { ok: false, error: new OrderWithoutItemsError() };
    const order = await orders.insert({ ...input, status: "pending", createdAt: clock.now() });
    return { ok: true, data: order };
  };
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/development.md`
