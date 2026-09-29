# Validation — regra sempre-ativa

Toda entrada externa cruza um schema Zod 4 na borda do sistema antes de tocar lógica de domínio. Falha → 400 com o envelope canônico de erro.

## Princípios
- Validate at the boundary, trust inside: route handler/Server Action/callable/consumer de fila valida; código interno assume tipos confiáveis.
- Schema é a fonte de verdade: tipo TS vem de `z.infer`, nunca duplicado (ver rule `schemas`).
- `safeParse` na boundary (falha vira resposta); `parse` só onde falha é bug/boot (env vars).
- Validar UMA vez por boundary — não re-validar no mesmo módulo.
- Branded types para IDs (`z.string().min(1).brand<"OrderId">()`) — nunca `as OrderId`.
- Zod 4: `z.email()`, `z.uuid()`, `z.iso.datetime()`, `z.strictObject()` para input de cliente externo, `z.looseObject()` só com justificativa; nada de `.passthrough()`/`.strict()`/`.merge()`/`errorMap`.
- Erro de validação: `code: "VALIDATION_FAILED"`, `details: [{ field, issue }]` (shape em `@.contexts/engineering/contracts/api.md` §6). Nunca vazar `ZodError` cru. Server Action devolve o mesmo shape em `{ ok: false, error }`; `z.flattenError()` nunca sai da action/handler (só validação client-only).

## Checklist (aplicar a todo turn)
- [ ] Toda rota/handler/action valida input antes de qualquer side effect.
- [ ] Schema em `*.schema.ts`, constante `XxxSchema`, num dos locais de `contracts/schemas.md` §2: `src/contracts/<context>/` (client ↔ server), `src/<layer>/<slice>/model/` (FSD), `src/services/<context>/application/use-cases/<uc>.schema.ts` (input server-only).
- [ ] Tipo TS é `z.infer<typeof XxxSchema>`.
- [ ] IDs externos são branded, não `string` cru.
- [ ] Falha → 400 com `{ error: { code: "VALIDATION_FAILED", message, details, requestId } }`, todos os campos de uma vez.
- [ ] Output de LLM, webhook (após HMAC), fila e env vars também passam por schema.

## Anti-patterns
- `as unknown as Foo` para escapar do schema → corrija o schema.
- `Response.json({ errors: parsed.error.issues })` → mapear para o envelope canônico.
- Validar só no client → server sempre valida; client é UX.
- `z.any()` em campo crítico → declarar shape.

## Mini-exemplo
```ts
// src/contracts/orders/place-order-input.schema.ts
export const PlaceOrderInputSchema = z.strictObject({
  tenantId: z.string().min(1).brand<"TenantId">(),
  items: z.array(z.strictObject({ sku: z.string().min(1), quantity: z.int().positive() })).min(1),
});
export type PlaceOrderInput = z.infer<typeof PlaceOrderInputSchema>;

// src/services/orders/adapters/driving/place-order-route-handler.ts (dentro do POST, após auth)
const parsed = PlaceOrderInputSchema.safeParse(await req.json());
if (!parsed.success) {
  const details = parsed.error.issues.map((i) => ({ field: i.path.map(String).join("."), issue: i.code.toUpperCase() }));
  return Response.json({ error: { code: "VALIDATION_FAILED", message: "One or more fields are invalid.", details, requestId } }, { status: 400 });
}
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/validation.md`
