---
name: api
description: Use ao definir contratos de API — endpoints, payloads, versionamento, erros. Keywords: api contract, openapi, rest.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# API Contracts

Documento o **shape** de uma API (endpoints, payloads, status codes, erros, versionamento) com OpenAPI/JSON Schema/Zod, antes ou em paralelo à implementação. Contrato é fonte de verdade entre produtor e consumidor.

## Essência
- **OpenAPI 3.1** (compatível com JSON Schema) é o padrão dominante. Alternativas: AsyncAPI (eventos), gRPC `.proto`.
- **Spec-first** OU **code-first com codegen**: ambos válidos; importa que ambos os lados (server, client) derivem da MESMA fonte.
- **Naming** consistente no wire format (escolha snake_case OU camelCase para toda a API).
- **Versionamento:** `/v1/...` no path ou header. Breaking → nova versão. Aditivo → mesma versão.
- **Error envelope estável:** `{ code, message, details?, traceId }`. Cliente programa contra `code`, não mensagem.
- **Paginação:** cursor-based para listas grandes; sempre incluir `nextCursor` no response.
- **Idempotency-key** em mutations retryable. Documentar TTL.
- **Auth:** declarar mecanismo (Bearer, OAuth, Basic) em `securitySchemes`; aplicar em `security` por operação.
- **Status codes** documentados por operação (200/201/400/401/403/404/409/422/429/5xx).
- **Examples** em request/response — vira mock automático em ferramentas.
- **Backward compat rules:** adicionar campo opcional ✓; tornar obrigatório ✗; remover ✗; mudar tipo ✗.

## Procedimento mínimo
1. Definir recursos e operações; rascunhar paths e métodos.
2. Modelar schemas reutilizáveis em `components.schemas/`.
3. Para cada operação: requestBody schema, responses por status, errors documentados.
4. `securitySchemes` global + `security` por operação onde requer auth.
5. Gerar client/server stubs via codegen; CI valida que implementação responde conforme spec (contract testing).
6. Mudança breaking → bump major; aditiva → minor; correção de doc → patch.

## Anti-patterns
- Atualizar implementação sem atualizar spec → desincroniza; CI deveria pegar.
- Status 200 com `{ ok: false, error }` → use status code real (4xx/5xx).
- Cada endpoint com error shape diferente → consolidar envelope.
- `additionalProperties: true` sem motivo em schema fechado → permite payload lixo.

## Mini-exemplo
```yaml
openapi: 3.1.0
info: { title: Orders API, version: 1.0.0 }
paths:
  /v1/orders:
    post:
      operationId: createOrder
      security: [{ bearerAuth: [] }]
      parameters:
        - in: header
          name: Idempotency-Key
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema: { $ref: "#/components/schemas/CreateOrderInput" }
      responses:
        "201": { content: { application/json: { schema: { $ref: "#/components/schemas/Order" } } } }
        "400": { content: { application/json: { schema: { $ref: "#/components/schemas/Error" } } } }
components:
  securitySchemes: { bearerAuth: { type: http, scheme: bearer } }
  schemas:
    Error:
      type: object
      required: [code, message, traceId]
      properties: { code: { type: string }, message: { type: string }, traceId: { type: string } }
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/contracts/api.md`
