# Schemas — regra sempre-ativa (meta-doutrina de contratos)

Schemas (Zod, JSON Schema, OpenAPI, proto) são a fonte de verdade do shape dos dados. Tipos derivam deles, não o contrário. Evolução é compatível por default.

## Princípios
- Schema-first: defina shape com schema; gere/infira tipos a partir dele.
- Convenção de naming consistente: escolha snake_case OU camelCase para wire format e mantenha em toda API. Tradução só na boundary.
- Nullability explícita: `optional`, `nullable`, `default` significam coisas diferentes — escolha conscientemente.
- Branded types para identificadores semânticos (`UserId`, `OrderId`) — impede mistura.
- Evolução compatível: adicionar campo opcional sim; tornar obrigatório não; renomear não (use deprecation + novo campo).
- Schemas vivem em arquivos próprios (`*.schema.ts`, `schemas/`) — compartilháveis cliente/servidor.
- Refinements (regex, range, business rule) no schema, não no handler.
- Errors do parser são serializáveis para resposta de API.

## Checklist (aplicar a todo turn)
- [ ] Tipo TS é `z.infer<typeof X>`, não duplicado.
- [ ] Schema em arquivo dedicado, exportado.
- [ ] Mudança de schema é aditiva (nova prop opcional) OU é versionada.
- [ ] IDs com `.brand<...>()` quando atravessam módulos.
- [ ] Sem `z.any()` em payload crítico.

## Anti-patterns
- Tipo `interface Foo` + `z.object({...})` em paralelo, mantidos à mão → infira do schema.
- Adicionar campo obrigatório a schema existente → quebra clientes; faça opcional + migração.
- Renomear `customer_id` → `customerId` no wire sem versionar → quebra produção.

## Mini-exemplo
```ts
export const User = z.object({
  id: z.string().uuid().brand<"UserId">(),
  email: z.string().email(),
  createdAt: z.string().datetime(),
});
export type User = z.infer<typeof User>;
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/contracts/schemas.md`
