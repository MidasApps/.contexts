# Validation — regra sempre-ativa

Toda entrada externa cruza um schema de validação na borda do sistema antes de tocar lógica de domínio. Falha → resposta 400 com mensagem útil.

## Princípios
- Validate at the boundary, trust inside: handler/route/action valida; código interno assume tipos confiáveis.
- Schema é a fonte de verdade: tipo TS é inferido do schema (`z.infer`), não duplicado.
- `safeParse` em boundary onde quer mensagem de erro estruturada; `parse` quando exceção é aceitável.
- Validar UMA vez por request — não re-validar em camadas internas. Se precisa, refatore.
- Branded types para IDs (`UserId`, `OrderId`) — evita misturar identificadores.
- Nullability é decisão deliberada: optional vs nullable vs default, nunca acidente.
- Mensagens de erro dizem **qual campo** e **o que esperava**, sem vazar internals.

## Checklist (aplicar a todo turn)
- [ ] Toda rota/handler/action tem schema na primeira linha.
- [ ] Schema mora em arquivo separado (`*.schema.ts` ou `schemas/`) — reutilizável entre server/client.
- [ ] Tipo TS vem de `z.infer<typeof Schema>`, não declarado manualmente.
- [ ] IDs externos não são `string` cru — usar branded type.
- [ ] Erro de validação retorna 400 com `{ field, message }[]`, não 500.
- [ ] Sem validação duplicada em camadas internas.

## Anti-patterns
- `as unknown as Foo` para escapar do schema → corrija o schema.
- Schema inline em handler de 200 linhas → extrair.
- Validar só no client → server sempre valida; client é UX redundante.
- `z.any()` em campos críticos → declarar shape ou usar `z.unknown()` + refinement.

## Mini-exemplo
```ts
// orders.schema.ts
export const CreateOrderSchema = z.object({
  tenantId: z.string().uuid().brand<"TenantId">(),
  items: z.array(z.object({ sku: z.string(), qty: z.number().int().positive() })).min(1),
});
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;

// route.ts
const parsed = CreateOrderSchema.safeParse(body);
if (!parsed.success) return Response.json({ errors: parsed.error.issues }, { status: 400 });
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/validation.md`
