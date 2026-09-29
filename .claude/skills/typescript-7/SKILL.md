---
name: typescript-7
description: "Use para TypeScript 7 (typescript@7.0.2; API TS 6 para lint) — tsconfig, tipos avançados, branded types, generics, strictness, typescript-eslint. Keywords: typescript, ts, tsc, tsconfig, types, typescript-eslint."
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
1. `tsconfig` com `strict: true` + `erasableSyntaxOnly` + `verbatimModuleSyntax`; `target: "ES2025"` + `lib` com `ESNext.Disposable`, `paths: { "@/*": ["./src/*"] }` (sem `baseUrl`), apps com bundler: `module: "preserve"` + `moduleResolution: "bundler"`.
2. Typecheck com **TypeScript 7** (`typescript@7.0.2`, pin exato; `tsc --noEmit`). Lint (E2): `typescript-eslint@8.71.0` aceita só `typescript <6.1.0`, então recebe a API de `@typescript/typescript6@6.0.2`. Com Next 16.3 o alias de `typescript` quebra o `next build`: a raiz fica no 7 e a API 6 entra só nos pacotes de lint via hook `readPackage` em `.pnpmfile.cjs`. ESLint fica em **9.39.5** (E3).
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
type PaymentEvent =
  | { kind: "authorized"; amountMinor: number; currency: string }
  | { kind: "refunded"; amountMinor: number; currency: string }
  | { kind: "failed"; code: string };

const describePayment = (e: PaymentEvent): string => {
  switch (e.kind) {
    case "authorized": return `+${e.amountMinor} ${e.currency}`;
    case "refunded": return `-${e.amountMinor} ${e.currency}`;
    case "failed": return e.code;
    default: {
      const unreachable: never = e;
      return unreachable;
    }
  }
};

const config = { region: "us-east-1", retries: 3 } satisfies { region: string; retries: number };
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/language/typescript@7.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
