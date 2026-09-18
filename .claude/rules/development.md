---
paths: ["**/*.ts","**/*.tsx"]
---
# Development — ativa em TypeScript

Convenções de desenvolvimento em código TS/TSX: strictness, estilo async, imports, padrões idiomáticos.

## Princípios
- TS strict mode obrigatório (`strict: true` + `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`).
- Sem `any` — use `unknown` + narrow, ou tipo concreto. `// @ts-expect-error` apenas com comentário explicando.
- `async/await` em vez de `.then()` encadeado; combine com `Promise.all` para paralelizar.
- Named exports — `export default` reservado a páginas/route handlers obrigatórios pelo framework.
- Imports absolutos com path alias (`@/lib/...`), não `../../../`.
- Sem `enum` — use union literal (`type Status = "open" | "closed"`) ou `const` object + `keyof`.
- `const` por default; `let` só quando reatribui. Sem `var`.
- Não exportar tipos privados de um módulo público.
- Side effects em import time são proibidos.

## Checklist (aplicar a todo turn)
- [ ] Sem `any` introduzido.
- [ ] Funções `async` em vez de `.then`.
- [ ] Import via alias, não relativo profundo.
- [ ] `export default` só em arquivos onde framework exige.
- [ ] Tipos públicos exportados com nome estável.
- [ ] Sem `// @ts-ignore` (use `expect-error` justificado).

## Anti-patterns
- `as any` para silenciar erro → corrigir o tipo.
- `enum Color { Red, Blue }` → `type Color = "red" | "blue"`.
- `Promise<void>.then(...)` solto → `await` + try/catch ou floating-promise no top-level handler.
- `import { x } from "../../../shared/x"` → `import { x } from "@/shared/x"`.

## Mini-exemplo
```ts
type Status = "draft" | "published" | "archived";
export async function publish(id: PostId): Promise<Post> {
  const post = await db.posts.findOrFail(id);
  return db.posts.update(id, { status: "published" satisfies Status });
}
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/development.md`
