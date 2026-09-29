---
name: typescript-7
description: Use para TypeScript 7 — tipos avançados, branded types, generics, strictness. Keywords: typescript, ts, types.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# TypeScript 7

Linguagem com tipos estruturais, inferência forte, narrowing, generics, branded/nominal patterns, e ecosistema ESM/decorators estáveis. Carregue ao escrever TS, configurar tsconfig, ou modelar tipos não-triviais.

## Essência
- **Strictness:** `strict: true` + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`. Custa pouco e pega muito bug.
- **Inferir > anotar:** retornos de função preferem inferência (a menos que API pública).
- **Union + narrowing:** `if ("foo" in x)`, `typeof`, type-guard. Em vez de `any`.
- **`unknown` em vez de `any`:** força narrow antes de usar.
- **Branded/nominal types:** `type UserId = string & { readonly __brand: "UserId" }` para evitar mistura.
- **Discriminated unions:** `type Action = { kind: "add"; payload: ... } | { kind: "remove"; id: ... }` — switch exaustivo com `never`.
- **`satisfies`:** valida shape sem alargar tipo (`{ a: 1 } satisfies Record<string, number>`).
- **Template literal types**, **conditional types**, **infer**: úteis com moderação.
- **Decorators ECMAScript** estáveis (stage 3); evitar legacy `experimentalDecorators` em código novo.
- **Module resolution:** `moduleResolution: "bundler"` ou `"nodenext"` conforme target.

## Procedimento mínimo
1. `tsconfig` com `strict: true` + `erasableSyntaxOnly` + `verbatimModuleSyntax`; `target: "ES2024"`, apps com bundler: `module: "preserve"` + `moduleResolution: "bundler"`.
2. Typecheck com **TypeScript 7** (`typescript@^7`). Se typescript-eslint/Volar precisar de API TS 6, use side-by-side (`@typescript/typescript6`).
3. Modelar dado com union/branded; evitar `any` e `enum` (bloqueados por `erasableSyntaxOnly`).
4. Para validação runtime (input externo), use Zod (skill `zod-4`) e inferir tipo.
5. `satisfies` + exhaustive switch com `never`.

## Anti-patterns
- `any` em código novo → `unknown` + narrow ou tipo concreto.
- Type assertion `as Foo` para esconder erro → corrigir tipo ou usar guard.
- `enum` → union literal (`type X = "a" | "b"`) ou `as const` object.
- Tipos duplicados (interface + Zod schema mantidos à mão) → infer do schema.

## Mini-exemplo
```ts
type OrderId = string & { readonly __brand: "OrderId" };
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

function handle(r: Result<number, string>): number {
  if (r.ok) return r.value;
  switch (true) { /* narrow */ }
  return 0;
}

const config = { region: "us-east-1", retries: 3 } satisfies { region: string; retries: number };
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/language/typescript@7.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
