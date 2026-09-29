---
name: sdd
description: "Use ao aplicar spec-driven development antes de implementar. Keywords: SDD, spec-driven, specification."
---
# Spec-Driven Development (SDD)

Escreve **especificação executável** (contrato, schema, OpenAPI, exemplos) **antes** do código. A spec é fonte de verdade; código e testes derivam dela.

## Essência
- Spec primeiro: schema Zod (`*.schema.ts`) descreve shape e comportamento; o OpenAPI é GERADO dos schemas (`docs/openapi/v1.yaml`). JSON Schema/proto quando o contrato pedir.
- Tipos vêm de `z.infer` — server e client compartilham o schema. Codegen a partir de spec só para specs de terceiros.
- Mock server da spec permite frontend desbloquear antes do backend.
- Spec revisada em PR como código — quebra é breaking change.
- Testes de contrato (consumer-driven, Pact) garantem que implementação respeita spec.
- Complementa TDD (comportamento interno) e BDD (cenários de uso) com **shape de I/O**.

## Procedimento mínimo
1. Esboçar spec (`*.schema.ts`; `*.proto` quando aplicável) cobrindo endpoints/eventos.
2. Revisar com consumidores (frontend, parceiros).
3. Gerar o OpenAPI dos schemas (e clients externos a partir dele); tipos via `z.infer`.
4. Implementar contra a spec; rodar testes de contrato.
5. Versionar spec; mudança breaking → nova versão (ver rule `api-design`).

## Anti-patterns
- Implementar primeiro e "documentar depois" → spec desatualizada por padrão.
- Spec em wiki separada do código → desincroniza; manter no repo.
- Spec sem mock/codegen → vira documento ornamental.

## Mini-exemplo
```ts
// src/contracts/orders/place-order-input.schema.ts (spec primeiro); docs/openapi/v1.yaml é gerado daqui
export const PlaceOrderInputSchema = z.strictObject({
  tenantId: z.string().min(1).brand<"TenantId">(),
  items: z.array(z.strictObject({ sku: z.string().min(1), quantity: z.int().positive() })).min(1),
});
export type PlaceOrderInput = z.infer<typeof PlaceOrderInputSchema>;
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/practices/sdd.md`
