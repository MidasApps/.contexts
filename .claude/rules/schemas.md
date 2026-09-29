# Schemas — regra sempre-ativa (meta-doutrina de contratos)

Schemas (Zod, JSON Schema, OpenAPI, proto) são a fonte de verdade do shape dos dados. Tipos derivam deles, não o contrário. Evolução é compatível por default.

## Princípios
- Schema-first: defina shape com schema; gere/infira tipos a partir dele.
- Wire format JSON é camelCase em toda API (snake_case só em Postgres/BigQuery). Tradução só na boundary de persistência.
- Nullability explícita: `optional`, `nullable`, `default` significam coisas diferentes — escolha conscientemente.
- Branded types para identificadores semânticos (`UserId`, `OrderId`) — impede mistura. ID automático do Firestore: `z.string().min(1).brand<>()`; `z.uuid()` só para uuidv7 do Postgres; ULID (`eventId`): `z.ulid()`.
- Evolução compatível: adicionar campo opcional sim; tornar obrigatório não; renomear não (use deprecation + novo campo).
- Nome: constante `UserSchema` em `user.schema.ts` (kebab-case + sufixo de papel). Local (`contracts/schemas.md` §2): client ↔ server em `src/contracts/<context>/`; slice FSD em `src/<layer>/<slice>/model/`; input só do server em `src/services/<context>/application/use-cases/<uc>.schema.ts`. Nada de `schemas.ts`, `schema.ts`, `userSchema`.
- Zod 4 idioms: `z.email()`, `z.iso.datetime()`, `.extend()` (não `.merge()`), `z.strictObject()`/`z.looseObject()`, opção `error` (não `errorMap`).
- OpenAPI é gerado dos schemas Zod (`docs/openapi/v1.yaml`), não o contrário.
- Refinements (regex, range, business rule) no schema, não no handler.
- Erro do parser vira o envelope `VALIDATION_FAILED` (rule `validation`), nunca `ZodError` cru.

## Checklist (aplicar a todo turn)
- [ ] Tipo TS é `z.infer<typeof XSchema>`, não duplicado.
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
// user.schema.ts
export const UserSchema = z.object({
  id: z.string().min(1).brand<"UserId">(), // ID automático do Firestore
  email: z.email(),
  createdAt: z.iso.datetime(),
});
export type User = z.infer<typeof UserSchema>;
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/contracts/schemas.md`
