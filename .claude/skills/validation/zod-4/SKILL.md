---
name: zod-4
description: Use para schemas Zod 4 — validação, inferência de tipos, refinements. Keywords: zod, schema, validation.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Zod 4

Lib de schema validation TS-first com inferência de tipos. v4 trouxe perf significativa, `z.iso.*` para ISO datetime/date, error map melhor, e ergonomia em discriminated unions.

## Essência
- **Schema-first:** declare shape com Zod; tipo TS via `z.infer<typeof Schema>`.
- **`parse` vs `safeParse`:** `parse` lança; `safeParse` retorna `{ success, data | error }`. Em boundary, use `safeParse`.
- **Tipos comuns:** `z.string()`, `z.number()`, `z.boolean()`, `z.literal("x")`, `z.enum(["a","b"])`, `z.array(...)`, `z.object({...})`, `z.union(...)`, `z.discriminatedUnion("kind", [...])`.
- **Modifiers:** `.optional()`, `.nullable()`, `.default(...)`, `.catch(...)`, `.min/max/length`, `.email/url/uuid`.
- **Branded types:** `.brand<"UserId">()`.
- **Refinements:** `.refine(fn, "msg")` para regra custom; `.superRefine` para multi-issue.
- **Transforms:** `.transform(v => ...)` muda saída (cuidado: vira diferente do input type).
- **Discriminated union:** `z.discriminatedUnion("kind", [A, B])` — perf melhor e narrow exaustivo.
- **ISO helpers:** `z.iso.datetime()`, `z.iso.date()`, `z.iso.time()`.
- **Error formatting:** `error.issues` lista; `z.treeifyError(err)` para shape aninhado; custom `error: (ctx) => "msg"`.

## Procedimento mínimo
1. Schema em arquivo dedicado (`*.schema.ts`); export schema + tipo inferido.
2. `safeParse` na borda (route/action/handler). Erro → 400 com `error.issues`.
3. Branded IDs (`.brand<"OrderId">()`) para identificadores semânticos.
4. Discriminated union para variantes (`kind: "a" | "b"`).
5. Refinement para regras cross-field (ex.: `password === confirmPassword`).

## Anti-patterns
- `interface Foo` paralela ao schema, mantida à mão → infira do schema.
- `z.any()` em payload externo → modelar shape ou `z.unknown()` + refine.
- `.transform` que muda significado → fica difícil rastrear; prefira parse + map separado.
- Schema gigante numa rota só → quebrar em sub-schemas reutilizáveis.

## Mini-exemplo
```ts
export const CreateOrderInput = z.object({
  tenantId: z.string().uuid().brand<"TenantId">(),
  items: z.array(z.object({
    sku: z.string(),
    qty: z.number().int().positive(),
  })).min(1),
  paymentMethod: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("card"), token: z.string() }),
    z.object({ kind: z.literal("pix") }),
  ]),
  createdAt: z.iso.datetime(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderInput>;

const parsed = CreateOrderInput.safeParse(body);
if (!parsed.success) return json({ errors: parsed.error.issues }, { status: 400 });
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/validation/zod@4.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
