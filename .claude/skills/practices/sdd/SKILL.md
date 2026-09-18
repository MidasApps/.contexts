---
name: sdd
description: Use ao aplicar spec-driven development antes de implementar. Keywords: SDD, spec-driven, specification.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Spec-Driven Development (SDD)

Escreve **especificação executável** (contrato, schema, OpenAPI, exemplos) **antes** do código. A spec é fonte de verdade; código e testes derivam dela.

## Essência
- Spec primeiro: OpenAPI/JSON Schema/Zod/proto descreve shape e comportamento.
- Tipos e clientes gerados a partir da spec (codegen) — server e client compartilham.
- Mock server da spec permite frontend desbloquear antes do backend.
- Spec revisada em PR como código — quebra é breaking change.
- Testes de contrato (consumer-driven, Pact) garantem que implementação respeita spec.
- Complementa TDD (comportamento interno) e BDD (cenários de uso) com **shape de I/O**.

## Procedimento mínimo
1. Esboçar spec (`openapi.yaml`, `*.schema.ts`, `*.proto`) cobrindo endpoints/eventos.
2. Revisar com consumidores (frontend, parceiros).
3. Gerar tipos/cliente/server stubs via codegen.
4. Implementar contra a spec; rodar testes de contrato.
5. Versionar spec; mudança breaking → nova versão (ver rule `api-design`).

## Anti-patterns
- Implementar primeiro e "documentar depois" → spec desatualizada por padrão.
- Spec em wiki separada do código → desincroniza; manter no repo.
- Spec sem mock/codegen → vira documento ornamental.

## Mini-exemplo
```yaml
# openapi.yaml
paths:
  /v1/orders:
    post:
      requestBody:
        content: { application/json: { schema: { $ref: "#/components/schemas/CreateOrderInput" } } }
      responses:
        "201": { content: { application/json: { schema: { $ref: "#/components/schemas/Order" } } } }
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/practices/sdd.md`
