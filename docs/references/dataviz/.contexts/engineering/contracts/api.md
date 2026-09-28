---
title: Convenções de modelagem para APIs
type: contracts
scope: api
status: active
last_updated: 2026-05-20
related:
  - "@rules/api-design"
  - "@rules/data-modeling"
  - "@rules/validation"
  - "@rules/security"
  - "@rules/error-handling"
  - "@rules/observability"
  - "@rules/caching"
  - "@stacks/validation/zod@4"
  - "@stacks/frontend/next@16"
  - "@stacks/backend/firebase-functions"
  - "@practices/sdd"
  - "@contracts/schemas"
  - "@contracts/events"
---

# Convenções de modelagem para APIs

Este documento governa **como desenhamos fronteiras HTTP/RPC** no projeto. Não repete princípios imperativos de design — esses vivem em `@rules/api-design`. Aqui ficam as convenções concretas: naming, paths, envelopes, status codes, headers, paginação, versionamento, evolução.

Aplica-se a:

- Route Handlers do Next.js 16 (`app/api/**/route.ts`) — ver `@stacks/frontend/next@16`
- Firebase Functions `onRequest` HTTP públicas — ver `@stacks/backend/firebase-functions`
- Server Actions e Callable Functions (RPC interno — convenções específicas na seção *Internal vs Public APIs*)
- Webhooks emitidos pelo sistema

Toda nova API consulta este documento **antes** de definir schema ou path.

---

## 1. Naming

### 1.1 Paths

- **kebab-case** em segmentos de path: `/order-items`, não `/orderItems` nem `/order_items`.
- **Plural** para coleções: `/users`, `/orders`, `/order-items`.
- **Singular** apenas para singletons globais: `/health`, `/me`, `/config`.
- Sub-recursos aninhados até **2 níveis**: `/users/{userId}/orders` (aceitável), `/users/{userId}/orders/{orderId}/items` (limite). Acima disso, achatar: `/order-items?orderId=...`.
- IDs em path sempre como variáveis nomeadas: `/orders/{orderId}`, nunca `/orders/{id}` genérico.

### 1.2 JSON payloads

- **camelCase** em chaves de objeto: `firstName`, `createdAt`, `orderItems`.
- Nunca misturar `snake_case` e `camelCase` no mesmo response (ou no projeto inteiro).
- Arrays são plurais: `items`, `tags`, `errors`.

### 1.3 IDs

- **ULIDs** opacos em paths e payloads: `01HZX7K2P5N9V8M3Q4R6T7Y8U0`. Ver `@rules/data-modeling`.
- **Nunca expor** IDs sequenciais internos de banco (PK auto-increment, Firestore auto-IDs internos não-ULID).
- IDs são strings em JSON, sempre — mesmo que numéricos por baixo.

### 1.4 Operações RPC (Server Actions, Callable Functions)

- Verbo + recurso em camelCase: `createOrder`, `cancelOrder`, `archiveUser`, `regenerateApiKey`.
- Evitar verbos genéricos: `process`, `handle`, `manage`, `doStuff`.
- Um verbo por intenção: `createOrder` cria, `updateOrder` atualiza — não `saveOrder` ambíguo.

---

## 2. Path conventions

### 2.1 Estrutura base

```
/v{major}/<resource>[/{id}][/<sub-resource>[/{subId}]]
```

Exemplos válidos:

```
GET    /v1/orders
GET    /v1/orders/{orderId}
POST   /v1/orders
PATCH  /v1/orders/{orderId}
DELETE /v1/orders/{orderId}
GET    /v1/users/{userId}/orders
POST   /v1/orders/{orderId}/cancel       # ação não-CRUD
```

### 2.2 Ações não-CRUD

Quando a operação não mapeia para CRUD puro, usar sub-recurso verbal:

```
POST /v1/orders/{orderId}/cancel
POST /v1/orders/{orderId}/refund
POST /v1/users/{userId}/verify-email
```

Não criar endpoints estilo `/v1/cancelOrder` no path REST público.

### 2.3 Query strings

Reservadas para filtros, paginação, ordenação e seleção de campos:

```
GET /v1/orders?status=ACTIVE&createdAfter=2025-01-01&limit=20&cursor=eyJ...&sort=-createdAt
```

---

## 3. Versionamento

### 3.1 Major (breaking) — versão em path

- `/v1`, `/v2`. Bump obrigatório quando:
  - Remover campo de response.
  - Renomear campo.
  - Mudar tipo de campo.
  - Mudar semântica de status code.
  - Tornar campo opcional em obrigatório no request.

### 3.2 Minor/patch — evolução aditiva sem bump

Permitido sem novo `/v{N}`:

- Adicionar campos **opcionais** ao request.
- Adicionar campos novos ao response (clientes devem ignorar desconhecidos).
- Adicionar novos endpoints.
- Adicionar novos valores a enums **apenas se** o cliente trata enums abertamente (ver seção 8.4).

### 3.3 Coexistência

Durante migração, `/v1` e `/v2` rodam em paralelo. Janela mínima de **6 meses** após anúncio de deprecation antes de `/v1` ser desligada.

---

## 4. Request envelope

### 4.1 Headers obrigatórios em writes

```
Content-Type: application/json
Authorization: Bearer <token>
```

### 4.2 Headers opcionais padronizados

```
X-Request-Id: <ulid>          # propagado em logs/traces, ver @rules/observability
Idempotency-Key: <ulid>       # obrigatório em POST idempotentes (pagamentos, criação de pedido)
Accept-Language: pt-BR
```

### 4.3 Body

JSON com camelCase. Nunca formulário `application/x-www-form-urlencoded` em APIs novas. Multipart apenas para upload binário.

```json
POST /v1/orders
{
  "customerId": "01HZX...",
  "items": [
    { "productId": "01HZY...", "quantity": 2 }
  ],
  "shippingAddress": {
    "street": "...",
    "city": "..."
  }
}
```

### 4.4 Validação

Todo input passa por schema Zod antes de qualquer lógica. Falha → 400 com error envelope (ver seção 6). Ver `@rules/validation` e `@stacks/validation/zod@4`.

---

## 5. Response envelope — sucesso

### 5.1 Recurso único

```json
{
  "data": {
    "id": "01HZX...",
    "createdAt": "2025-05-20T14:30:00.000Z",
    "...": "..."
  },
  "meta": {
    "requestId": "01HZX...",
    "timestamp": "2025-05-20T14:30:00.123Z"
  }
}
```

### 5.2 Coleção

```json
{
  "data": [
    { "id": "01HZX...", "...": "..." },
    { "id": "01HZY...", "...": "..." }
  ],
  "meta": {
    "requestId": "01HZZ...",
    "timestamp": "2025-05-20T14:30:00.123Z",
    "page": {
      "cursor": "eyJpZCI6IjAxSFpZLi4uIn0",
      "hasMore": true,
      "limit": 20
    }
  }
}
```

### 5.3 Operação sem retorno significativo

- `204 No Content` com body vazio. Não retornar `{ "success": true }` redundante.
- Exceção: se houver `requestId` relevante para o cliente, usar `200` com `{ "data": null, "meta": { ... } }`.

---

## 6. Response envelope — erro

Alinhado com **Problem Details for HTTP APIs (RFC 9457)**, adaptado ao nosso envelope:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "One or more fields are invalid.",
    "details": [
      { "field": "email", "issue": "INVALID_FORMAT" },
      { "field": "quantity", "issue": "OUT_OF_RANGE" }
    ],
    "requestId": "01HZX..."
  }
}
```

### 6.1 Convenções de erro

- `code`: **SCREAMING_SNAKE_CASE**, estável, parte do contrato. Exemplos: `VALIDATION_FAILED`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `INTERNAL_ERROR`. Nunca renomear sem version bump.
- `message`: string user-facing curta em inglês (i18n acontece no cliente via `code` + `details`). Não incluir IDs internos, paths de arquivo, ou trechos de query.
- `details`: array opcional para erros granulares (validação por campo, múltiplas violações).
- `requestId`: sempre presente, para correlacionar com logs/traces.

### 6.2 Proibido em error responses

- Stack traces.
- SQL/Firestore query fragments.
- Variáveis de ambiente.
- Mensagens do ORM/SDK cruas (`FirebaseError: PERMISSION_DENIED at ...`).

Ver `@rules/security` e `@rules/error-handling`.

---

## 7. Status codes

Uso prescrito:

| Code | Quando usar |
|---|---|
| `200 OK` | GET/PATCH/PUT/DELETE com body de resposta |
| `201 Created` | POST que criou recurso; incluir `Location` header com path do recurso |
| `202 Accepted` | Operação assíncrona aceita; body com `{ "data": { "jobId": "..." } }` |
| `204 No Content` | DELETE/PUT sem corpo de resposta significativo |
| `400 Bad Request` | Falha de validação de schema/sintaxe |
| `401 Unauthorized` | Sem credencial ou credencial inválida |
| `403 Forbidden` | Credencial válida, mas sem permissão para o recurso |
| `404 Not Found` | Recurso inexistente (ou existente mas que o caller não pode ver — preferir 404 a 403 para não vazar existência) |
| `409 Conflict` | Estado atual do recurso incompatível com a operação (idempotency key reusada com payload diferente, optimistic lock) |
| `410 Gone` | Recurso existiu e foi permanentemente removido |
| `422 Unprocessable Entity` | Sintaticamente válido (passou Zod), mas semanticamente inválido (regra de negócio) |
| `429 Too Many Requests` | Rate limit excedido; incluir `Retry-After` e `X-RateLimit-Reset` |
| `500 Internal Server Error` | Erro não tratado do servidor |
| `502 Bad Gateway` | Dependência upstream falhou |
| `503 Service Unavailable` | Em manutenção ou sobrecarga; incluir `Retry-After` |
| `504 Gateway Timeout` | Timeout em dependência upstream |

### 7.1 401 vs 403

- **401**: "não sei quem você é" — sem token, token expirado, assinatura inválida.
- **403**: "sei quem você é, mas você não pode" — autenticado mas falta scope/role/ownership.

Não usar 403 para "não autenticado" nem 401 para "sem permissão". Distinguir é parte do contrato.

### 7.2 Nunca

- `200 OK` com `{ "error": { ... } }` no body. Status HTTP é a verdade.
- `500` para erro de validação.
- `404` para erro de permissão sem motivo de privacidade.

---

## 8. Tipos de campo

### 8.1 Timestamps

- **ISO 8601 UTC com sufixo `Z`**: `"2025-05-20T14:30:00.000Z"`.
- Precisão em milissegundos.
- Nomes padrão: `createdAt`, `updatedAt`, `deletedAt`, `expiresAt`, `scheduledAt`. Ver `@rules/data-modeling`.
- **Proibido**: timestamps em fuso local, formato `"2025-05-20 14:30:00"`, epoch como inteiro em APIs públicas.

### 8.2 Money

```json
{ "amount": "1234.56", "currency": "BRL" }
```

- `amount`: **string decimal** (preserva precisão arbitrária).
- `currency`: ISO 4217 maiúsculo (`BRL`, `USD`, `EUR`).
- **Proibido**: `amount` como número (`1234.56` float), centavos como inteiro sem documentação explícita em escopo restrito.

### 8.3 Booleans

- Nomes positivos: `isActive`, `hasShipped`, `canEdit`.
- **Evitar** negações: `notActive`, `isDisabled` (preferir `isActive: false`).
- Nunca `status: true` — usar enum com nome do estado.

### 8.4 Enums

```json
{ "status": "PENDING_REVIEW" }
```

- **SCREAMING_SNAKE_CASE** strings.
- Evoluir aditivamente: adicionar valores novos é seguro **se** clientes tratam desconhecidos como passthrough (fallback `UNKNOWN`).
- **Proibido**: enums como inteiros (`status: 1`), enums com case misto (`PendingReview`, `pending_review`).

### 8.5 Strings

- UTF-8.
- Limites máximos definidos no schema Zod (`.max(255)`).
- Trimming de whitespace é feito no servidor antes de validar.

### 8.6 Null vs ausência

- Campo opcional ausente do JSON: "não enviado / não definido".
- Campo presente com `null`: "explicitamente apagado / sem valor".
- Documentar a diferença quando ela for relevante (PATCH parcial).

---

## 9. Paginação

### 9.1 Cursor-based (padrão para listas dinâmicas)

Request:

```
GET /v1/orders?limit=20&cursor=eyJpZCI6IjAxSFpZLi4uIn0
```

Response:

```json
{
  "data": [ ... ],
  "meta": {
    "page": {
      "cursor": "eyJpZCI6IjAxSFpaLi4uIn0",
      "hasMore": true,
      "limit": 20
    }
  }
}
```

- `cursor`: opaco para o cliente (base64 de JSON interno, ULID, ou hash). Cliente passa de volta sem interpretar.
- `limit`: default 20, máximo 100.
- `hasMore`: boolean explícito. Nunca depender de `data.length < limit` (frágil em filtros).
- Fim da lista: `cursor: null, hasMore: false`.

### 9.2 Offset-based (apenas para datasets pequenos e imutáveis)

Permitido somente para: catálogos congelados, dimensões de relatório, listas administrativas com < 10k itens. Para tudo mais, **proibido** porque produz duplicatas/lacunas em listas dinâmicas.

```
GET /v1/countries?offset=0&limit=50
```

### 9.3 Anti-padrão

`?page=2&pageSize=20` em listas dinâmicas (orders, events, messages). Migrar para cursor.

---

## 10. Filtros e ordenação

### 10.1 Filtros

Query params nomeados pelo campo:

```
?status=ACTIVE
?status=ACTIVE,PENDING_REVIEW       # múltiplos valores separados por vírgula
?createdAfter=2025-01-01T00:00:00Z
?createdBefore=2025-12-31T23:59:59Z
?customerId=01HZX...
```

Convenções:

- Igualdade: `status=ACTIVE`.
- Range em timestamp/número: sufixos `After`/`Before` ou `Min`/`Max` (`amountMin=100&amountMax=500`).
- Busca textual livre: `q=...` (reservar `q` para isso, não usar como filtro estruturado).

### 10.2 Ordenação

```
?sort=-createdAt              # desc
?sort=name                    # asc
?sort=-createdAt,name         # multi-campo: createdAt desc, name asc
```

- Prefixo `-` para descendente, ausência para ascendente.
- Campos válidos para sort são documentados no OpenAPI por endpoint.

### 10.3 Sparse fieldsets (opcional)

```
?fields=id,name,email
```

Servidor retorna apenas campos solicitados. Suporte é opcional por endpoint; quando suportado, documentar no OpenAPI.

---

## 11. Headers padronizados

### 11.1 Request

| Header | Uso |
|---|---|
| `Authorization: Bearer <token>` | OAuth 2.0 ou Firebase ID Token |
| `Content-Type: application/json` | Obrigatório em writes com body |
| `Accept: application/json` | Opcional; default é JSON |
| `X-Request-Id: <ulid>` | Opcional; cliente pode gerar para correlação. Se ausente, servidor gera. |
| `Idempotency-Key: <ulid>` | Obrigatório em POST idempotentes (`/orders`, `/payments`, `/refunds`) |
| `Accept-Language: pt-BR` | Opcional; influencia i18n de `message` em error envelope |

### 11.2 Response

| Header | Quando |
|---|---|
| `X-Request-Id: <ulid>` | Sempre — espelha o do request ou novo gerado |
| `X-RateLimit-Limit` | Endpoints com rate limit |
| `X-RateLimit-Remaining` | Endpoints com rate limit |
| `X-RateLimit-Reset` | Timestamp Unix de reset; em 429, junto com `Retry-After` |
| `Retry-After` | 429, 503 |
| `Cache-Control` | GET cacheáveis — ver `@rules/caching` |
| `ETag` | GET de recurso individual; suporte a `If-None-Match` → 304 |
| `Vary` | Quando resposta varia por header (`Accept-Language`, `Authorization`) |
| `Location` | 201 Created, apontando para o novo recurso |
| `Sunset` | Endpoints deprecated — RFC 8594 |
| `Deprecation` | Endpoints deprecated — `true` ou data |

---

## 12. Autenticação

- **Bearer tokens** via `Authorization: Bearer <token>`. OAuth 2.0 ou Firebase ID Token.
- **Nunca** autenticação por session cookie em APIs públicas. Cookies (httpOnly, SameSite=Strict) apenas para sessões de UI Next.js no mesmo domínio, e nesse caso CSRF token explícito em mutations.
- Tokens nunca em query string (vaza em logs).
- Refresh tokens em endpoint dedicado: `POST /v1/auth/refresh`.

Ver `@rules/security`.

---

## 13. Webhooks (saída)

Eventos emitidos pelo sistema para URLs registradas por consumidores.

### 13.1 Envelope

```json
POST <consumer-url>
Headers:
  Content-Type: application/json
  X-Signature: sha256=<hex>
  X-Signature-Timestamp: 1716210600
  X-Event-Id: 01HZX...
  X-Event-Type: order.created
  X-Delivery-Attempt: 1

Body:
{
  "eventId": "01HZX...",
  "eventType": "order.created",
  "occurredAt": "2025-05-20T14:30:00.000Z",
  "data": { ... }
}
```

### 13.2 Convenções

- **Assinatura HMAC-SHA256** sobre `timestamp + "." + body`, com shared secret por consumidor. Cliente valida.
- **Timestamp** em segundos Unix; rejeitar se delta > 5 min (anti-replay).
- **Idempotência** por `eventId` (ULID) — consumidor deve deduplicar.
- **Retry** com backoff exponencial: 1m, 5m, 30m, 2h, 12h, 24h. Após última falha, dead-letter.
- **Status code esperado do consumidor**: `2xx` = sucesso. Qualquer outro = retry.

### 13.3 Naming de event types

`<resource>.<verbo-passado>`: `order.created`, `order.cancelled`, `payment.refunded`, `user.email-verified`.

Schema do payload de eventos vive em `@contracts/events`.

---

## 14. Streaming (SSE / chunked)

Para respostas longas (LLM streaming, exports, logs em tempo real):

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

### 14.1 Formato

```
event: data
data: {"chunk":"..."}

event: data
data: {"chunk":"..."}

event: done
data: {"requestId":"..."}

```

- Eventos padrão: `data`, `error`, `done`.
- Cada `data:` é um JSON válido em uma linha.
- `done` sempre fecha o stream com sucesso; `error` fecha com falha (mesmo envelope da seção 6 no `data`).
- Suportar `Last-Event-Id` para reconexão quando aplicável.

---

## 15. OpenAPI

- Spec OpenAPI 3.1 gerada a partir dos schemas Zod via `zod-to-openapi`.
- Commitada no repo em `docs/openapi/v1.yaml` (e v2, quando existir).
- Cada endpoint documenta: parâmetros, request schema, response schema (sucesso e erros possíveis), exemplos.
- **Examples obrigatórios** por endpoint, cobrindo: caso sucesso típico, caso erro de validação, caso erro de autorização quando aplicável.
- Geração e validação rodam no CI. Ver `@practices/sdd`.

---

## 16. Internal vs Public APIs

### 16.1 Public (HTTP REST)

- Convenções **completas** deste documento.
- Versionada em path.
- Spec OpenAPI publicada.
- Rate limited.
- Auth por Bearer token externo.
- Breaking changes exigem `/v{N+1}`.

### 16.2 Internal (RPC tipado)

- **Server Actions** do Next.js, **Callable Functions** do Firebase, ou tRPC entre serviços internos.
- Cliente e servidor compartilham tipos via monorepo — evoluem juntos.
- Não precisa de OpenAPI separado; o TypeScript É o contrato.
- Naming de operações por verbo + recurso (seção 1.4).
- Validação Zod ainda obrigatória (input não é confiável só porque é interno — ver `@rules/validation`).
- Error envelope da seção 6 ainda se aplica ao payload de erro retornado.
- Não há versionamento em path; mudanças breaking exigem coordenação de release entre client e server.

---

## 17. Migração e deprecation

Quando um endpoint ou versão entra em fim de vida:

```
HTTP/1.1 200 OK
Deprecation: true
Sunset: Sat, 31 Dec 2026 23:59:59 GMT
Link: </v2/orders>; rel="successor-version"
```

- `Deprecation`: `true` ou data ISO de quando ficou deprecated.
- `Sunset`: RFC 8594, data prevista de desligamento.
- `Link rel="successor-version"`: aponta para o substituto quando aplicável.
- Janela mínima de 6 meses entre anúncio (`Deprecation`) e remoção (`Sunset`).
- Comunicação fora-de-banda (changelog, e-mail) **complementa**, não substitui, os headers.

---

## 18. Anti-padrões — proibidos

Lista de padrões que **violam** este contrato. Code review rejeita.

| Anti-padrão | Correção |
|---|---|
| `200 OK` com `{ "error": ... }` no body | Status code correto (4xx/5xx) com error envelope |
| `user_id` em uma rota, `userId` em outra | camelCase em todo JSON |
| IDs sequenciais de banco em path/payload | ULIDs opacos |
| `status: 1` (enum como inteiro) | `"status": "ACTIVE"` |
| `createdAt: "2025-05-20 14:30:00"` (sem timezone) | ISO 8601 UTC com `Z` |
| `amount: 1234.56` (money como float) | `{ "amount": "1234.56", "currency": "BRL" }` |
| `?page=2&pageSize=20` em lista dinâmica | Cursor-based |
| Error response sem `requestId` | `requestId` sempre presente |
| `message: "FirebaseError: ... at /path/to/file.ts:42"` | Mensagem user-facing, sem stack/SQL/path |
| Webhook sem assinatura HMAC | `X-Signature` obrigatório |
| Renomear campo em `/v1` sem novo `/v2` | Breaking change exige version bump |
| Resposta inconsistente: `{ "data": ... }` em um endpoint, `{ "result": ... }` em outro | Envelope `{ "data", "meta" }` em todos |
| `403` para "não autenticado" | `401` para sem credencial, `403` para sem permissão |
| Token em query string (`?token=...`) | `Authorization: Bearer` header |
| Endpoint RPC público (`POST /v1/cancelOrder`) | `POST /v1/orders/{orderId}/cancel` |

---

## 19. Checklist para nova API

Antes de mergear uma rota nova, confirmar:

- [ ] Path em kebab-case, plural, no máximo 2 níveis de aninhamento.
- [ ] Versionado em `/v1` (ou superior).
- [ ] Request validado por schema Zod.
- [ ] Response segue envelope `{ data, meta }` ou `{ error }`.
- [ ] Status codes corretos por cenário (incluindo 401 vs 403).
- [ ] `X-Request-Id` propagado em response.
- [ ] Timestamps ISO 8601 UTC.
- [ ] IDs são ULIDs opacos.
- [ ] Enums em SCREAMING_SNAKE_CASE.
- [ ] Money como `{ amount: string, currency: string }`.
- [ ] Paginação cursor-based quando aplicável.
- [ ] Erros nunca vazam stack/SQL/path.
- [ ] OpenAPI atualizado e exemplos incluídos.
- [ ] Idempotency-Key suportado em POST idempotentes.
- [ ] Rate limit definido e headers `X-RateLimit-*` enviados.
- [ ] Webhook (se emite) tem assinatura HMAC e idempotência por eventId.

---

## Referências cruzadas

- Princípios imperativos de design: `@rules/api-design`
- Naming de IDs, timestamps, soft delete: `@rules/data-modeling`
- Validação obrigatória de input: `@rules/validation`
- Não vazar dados sensíveis em error: `@rules/security`, `@rules/error-handling`
- Propagação de `requestId` em logs/traces: `@rules/observability`
- `Cache-Control`, `ETag`, `Vary`: `@rules/caching`
- Schemas Zod e geração OpenAPI: `@stacks/validation/zod@4`
- Route Handlers e Server Actions: `@stacks/frontend/next@16`
- `onRequest`/`onCall`: `@stacks/backend/firebase-functions`
- Spec-driven development: `@practices/sdd`
- Convenções de schemas internos: `@contracts/schemas`
- Payload de eventos de domínio: `@contracts/events`
