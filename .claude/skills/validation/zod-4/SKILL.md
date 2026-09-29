---
name: zod-4
description: Use para schemas Zod 4 (zod@4.6.5) — validação na borda, inferência de tipos, branded ids, refinements, migração de Zod 3. Keywords: zod, schema, validation, safeParse, z.infer, .schema.ts.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Zod 4

Lib de schema validation TS-first com inferência de tipos. Baseline **zod@4.6.5** (sem Zod 3 no mesmo bundle; AI SDK 7 aceita `^4.1.8`). v4 trouxe perf significativa, `z.iso.*` para ISO datetime/date, opção `error` no lugar de `errorMap`, e ergonomia em discriminated unions.

## Essência
- **Schema-first:** declare shape com Zod; tipo TS via `z.infer<typeof Schema>`.
- **`parse` vs `safeParse`:** `parse` lança; `safeParse` retorna `{ success, data | error }`. Em boundary, use `safeParse`.
- **Tipos comuns:** `z.string()`, `z.number()`, `z.boolean()`, `z.literal("x")`, `z.enum(["a","b"])`, `z.array(...)`, `z.object({...})`, `z.union(...)`, `z.discriminatedUnion("kind", [...])`.
- **Modifiers:** `.optional()`, `.nullable()`, `.default(...)`, `.catch(...)`, `.min/max/length`. Formatos são top-level em v4: `z.email()`, `z.url()`, `z.uuid()` (não `z.string().email()`).
- **Objetos:** `.extend()` (não `.merge()`), `z.strictObject()` / `z.looseObject()` (não `.strict()`/`.passthrough()`).
- **Branded types:** `.brand<"UserId">()`.
- **Refinements:** `.refine(fn, "msg")` para regra custom; `.superRefine` para multi-issue.
- **Transforms:** `.transform(v => ...)` muda saída (cuidado: vira diferente do input type).
- **Discriminated union:** `z.discriminatedUnion("kind", [A, B])` — perf melhor e narrow exaustivo.
- **ISO helpers:** `z.iso.datetime()`, `z.iso.date()`, `z.iso.time()`.
- **Error formatting:** `error.issues` lista; `z.flattenError(err)` / `z.treeifyError(err)` (não `err.flatten()`/`.format()`); custom `error: (ctx) => "msg"` (não `errorMap`). `flattenError` só em validação client-only: route handler e Server Action devolvem `VALIDATION_FAILED` com `details: [{ field, issue }]` montado de `error.issues`.

## Procedimento mínimo
1. Schema em arquivo dedicado (`user.schema.ts`); constante `UserSchema` + tipo `User = z.infer<typeof UserSchema>`.
2. `safeParse` na borda (route/action/handler). Erro → 400 com o envelope de `contracts/api.md` seção 6 (`details` a partir de `error.issues`).
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
// input externo: z.strictObject em todos os níveis (chave desconhecida → 400)
export const CreateOrderInputSchema = z.strictObject({
  tenantId: z.uuid().brand<"TenantId">(),
  items: z.array(z.strictObject({
    sku: z.string().min(1),
    quantity: z.int().positive(),
  })).min(1),
  paymentMethod: z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("card"), token: z.string().min(1) }),
    z.strictObject({ kind: z.literal("pix") }),
  ]),
  createdAt: z.iso.datetime(),
});
export type CreateOrderInput = z.infer<typeof CreateOrderInputSchema>;

const parsed = CreateOrderInputSchema.safeParse(body);
if (!parsed.success) {
  return json({ error: { code: "VALIDATION_FAILED", message: "Invalid input.", details: parsed.error.issues.map((i) => ({ field: i.path.map(String).join("."), issue: i.code.toUpperCase() })), requestId } }, { status: 400 });
}
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/stacks/validation/zod@4.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
