---
title: Domain Events — Convenções de Modelagem
type: contracts
scope: events
status: active
last_updated: 2026-05-20
related:
  - "@architecture/ddd"
  - "@contracts/api"
  - "@contracts/schemas"
  - "@contracts/postgres"
  - "@contracts/firebase-firestore"
  - "@contracts/bigquery"
  - "@rules/data-modeling"
  - "@rules/security"
  - "@rules/observability"
  - "@rules/governance"
  - "@rules/migration"
  - "@stacks/backend/firebase-functions"
  - "@stacks/validation/zod@4"
---

# Domain Events — Convenções de Modelagem

Este documento prescreve **como modelar eventos** que cruzam fronteiras temporais ou de bounded context no projeto. Ele governa o envelope, o naming, o versionamento, o transport, a idempotência e os schemas de eventos. Para o conceito teórico, ver `@architecture/ddd`. Para regras de implementação de handlers, ver `@rules/data-modeling` e `@rules/observability`.

> **Princípio fundador**: um evento é um **fato consumado, imutável, no passado**. Se a frase faz sentido no presente do indicativo ou no imperativo, é um comando — não um evento.

---

## 1. Taxonomia: três classes de eventos

A escolha da classe **define o contrato, o transport e a política de retenção**. Classificar antes de modelar.

### 1.1 Domain Events (internos ao bounded context)

- Expressam um fato em **linguagem ubíqua** do contexto.
- Consumidores: o próprio contexto (para projeções, side-effects intra-contexto) ou contextos downstream que **assinaram explicitamente**.
- Schema pode evoluir com mais liberdade, mas ainda segue versionamento (seção 5).
- Exemplo: `ORDER_PLACED`, `INVOICE_ISSUED`.

### 1.2 Integration Events (cruzam fronteiras)

- Cruzam **bounded contexts** ou **sistemas externos** (microservices, parceiros).
- Contrato **estável**, versionado com rigor de API pública (ver `@contracts/api`).
- Devem ser **anêmicos em vocabulário interno**: não vazar conceitos privados do contexto produtor.
- Exemplo: `Orders.OrderPlaced` consumido por Billing, Analytics, Notifications.

### 1.3 Notification Events (lightweight)

- Apenas sinalizam que **algo mudou**; sem payload pesado.
- Consumidor faz **re-fetch** do estado autoritativo.
- Usar quando: payload seria grande, ou consumidor precisa de estado fresco e não da delta histórica.
- Exemplo: `USER_PROFILE_CHANGED` com apenas `{ userId }`.

> Regra de seleção: **Domain Event** por default dentro do contexto; **Integration Event** quando cruzar fronteira; **Notification** quando o payload completo for caro ou volátil.

---

## 2. Envelope canônico

Todo evento publicado no projeto **DEVE** conformar com o envelope abaixo. Inspirado em CloudEvents 1.0, adaptado à doutrina do projeto.

```json
{
  "eventId": "01HZX1J4K8VN3P5Q7R9S2T4W6Y",
  "eventName": "ORDER_PLACED",
  "eventVersion": 1,
  "occurredAt": "2026-05-20T14:30:00.000Z",
  "tenantId": "tenant-123",
  "aggregateType": "Order",
  "aggregateId": "order-01HZX1J4K8VN3P5Q7R9S2T4W6Y",
  "causationId": "command-01HZW9G2H7VN3P5Q7R9S2T4W6Y",
  "correlationId": "trace-abc-123",
  "actor": { "type": "USER", "id": "user-01HZV8F1G6VN3P5Q7R9S2T4W6Y" },
  "source": "orders-service",
  "schemaVersion": 1,
  "data": { "...": "payload específico do evento" }
}
```

### 2.1 Campos obrigatórios universais

| Campo | Tipo | Regra |
|---|---|---|
| `eventId` | ULID string | Único globalmente. **Dedup key**. Wire format **sempre ULID** (cross-store, gerado no emissor) — distinto de PKs de entidade Postgres (`uuidv7()`, ver `@contracts/postgres`). |
| `eventName` | SCREAMING_SNAKE_CASE | Verbo no **passado** (seção 3). |
| `eventVersion` | int >= 1 | Versão do envelope+data combinado. |
| `occurredAt` | ISO 8601 UTC com `Z` | Quando o fato ocorreu no **domínio**. |
| `tenantId` | string | Multi-tenancy obrigatória em todo evento. |
| `aggregateType` | PascalCase | Tipo da entidade origem (`Order`, `User`). |
| `aggregateId` | string | ID da entidade que originou. |
| `correlationId` | string | Propagado por toda a cadeia (ver `@rules/observability`). |
| `source` | kebab-case | Serviço/contexto emissor (`orders-service`). |
| `data` | object | Payload específico (schema versionado). |

### 2.2 Campos opcionais reconhecidos

| Campo | Quando usar |
|---|---|
| `causationId` | ID do comando ou evento anterior que disparou este. Obrigatório em cadeias multi-step. |
| `actor` | Identidade do agente (humano ou sistema) responsável pelo fato. |
| `schemaVersion` | Versão isolada do `data` quando difere da do envelope. |
| `publishedAt` | Registrado pelo **bus**, não pelo emissor. |
| `ingestedAt` | Registrado pelo **consumidor/warehouse**. |

---

## 3. Naming

### 3.1 `eventName`

- **SCREAMING_SNAKE_CASE**, verbo no **particípio passado**.
- Expressa um **fato consumado**, nunca uma intenção.
- Quando ambíguo entre contextos, prefixar com bounded context em PascalCase: `Orders.OrderPlaced` (formato externo) ou manter convenção SCREAMING_SNAKE_CASE com prefixo do contexto: `ORDERS_ORDER_PLACED`.

| Correto | Incorreto | Por quê |
|---|---|---|
| `ORDER_PLACED` | `PLACE_ORDER` | Imperativo é comando. |
| `PAYMENT_FAILED` | `PAYMENT_FAIL` | Particípio expressa o fato consumado. |
| `USER_DELETED` | `DELETE_USER` | `DELETE_USER` é comando. |
| `INVOICE_ISSUED` | `INVOICE_UPDATED` | Eventos genéricos CRUD-like são anti-pattern (seção 14). |

### 3.2 Aggregate

- `aggregateType`: PascalCase singular (`Order`, `User`, `Invoice`).
- `aggregateId`: ULID com prefixo opcional (`order-01HZX...`).

### 3.3 Topics

- kebab-case, **um topic por bounded context**: `orders-events`, `billing-events`, `auth-events`, `ai-events`.
- **NÃO** criar topic por tipo de evento (explosão de topics).
- DLQ por topic: `<topic>-dlq`.

### 3.4 Subscriptions

- Formato: `<consumer>-<topic>-sub`.
- Exemplo: `billing-orders-events-sub`, `analytics-orders-events-sub`.

---

## 4. Identificadores e timestamps

### 4.1 IDs

| Campo | Convenção |
|---|---|
| `eventId` | ULID. Único globalmente. Serve como **dedup key**. |
| `aggregateId` | ID da entidade. Usar como **partition key** quando ordering por aggregate for necessário. |
| `correlationId` | Propagado **end-to-end**. Alinhar com `traceparent` do OpenTelemetry — ver `@rules/observability`. |
| `causationId` | ID do evento ou comando que **causou** este. Obrigatório em sagas e cadeias multi-step. |

### 4.2 Timestamps

| Campo | Quem preenche | Significado |
|---|---|---|
| `occurredAt` | **Emissor** | Quando o fato ocorreu no domínio. UTC ISO 8601 com `Z`. |
| `publishedAt` | **Bus** | Quando entrou no broker. **NÃO** preencher no emissor. |
| `ingestedAt` | **Consumidor/warehouse** | Quando chegou ao destino terminal (BQ, Postgres). |

> Todos os timestamps em **UTC**, formato ISO 8601 com milissegundos e sufixo `Z`. Ver `@rules/data-modeling`.

---

## 5. Versionamento

### 5.1 Regra de bump

| Mudança | Bump |
|---|---|
| Adicionar campo **opcional** em `data` | **Não** bumpar. Consumers tolerant readers ignoram desconhecidos. |
| Adicionar campo **obrigatório** | Breaking. Bump. |
| Remover ou renomear campo | Breaking. Bump. |
| Mudar tipo ou semântica de campo existente | Breaking. Bump. |
| Mudar `eventName` | Evento **novo**, não bump. |

### 5.2 Estratégia de versionamento

- **Preferida**: incrementar `eventVersion` mantendo o mesmo `eventName`. Emissor publica V1 e V2 em paralelo durante janela de migração.
- **Alternativa**: novo `eventName` sufixado (`ORDER_PLACED_V2`) quando a mudança redefinir semanticamente o fato.
- Consumers **devem ser tolerant readers**: ignorar campos desconhecidos, falhar explicitamente em campos obrigatórios ausentes.

### 5.3 Janela de coexistência

- Toda quebra de schema mantém **N >= 2 versões em paralelo** pelo prazo combinado com consumidores.
- Ver `@rules/migration` para o playbook de migração de schemas.

---

## 6. Schemas com Zod

Todo evento **DEVE** ter schema Zod versionado. Schemas implícitos são anti-pattern (seção 14). Ver `@contracts/schemas` e `@stacks/validation/zod@4`.

### 6.1 Envelope base

```ts
import { z } from 'zod';

export const ActorSchema = z.object({
  type: z.enum(['USER', 'SYSTEM', 'SERVICE']),
  id: z.string().min(1),
});

export const EventEnvelopeSchema = z.object({
  eventId: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/), // ULID
  eventName: z.string(),
  eventVersion: z.number().int().positive(),
  occurredAt: z.string().datetime({ offset: false }),
  tenantId: z.string().min(1),
  aggregateType: z.string(),
  aggregateId: z.string().min(1),
  causationId: z.string().optional(),
  correlationId: z.string(),
  actor: ActorSchema.optional(),
  source: z.string(),
  schemaVersion: z.number().int().positive().optional(),
});
```

### 6.2 Evento concreto

```ts
export const OrderPlacedEventV1Schema = EventEnvelopeSchema.extend({
  eventName: z.literal('ORDER_PLACED'),
  eventVersion: z.literal(1),
  aggregateType: z.literal('Order'),
  data: z.object({
    orderId: OrderIdSchema,
    userId: UserIdSchema,
    totalCents: z.number().int().nonnegative(),
    currency: z.string().length(3),
    items: z.array(OrderItemSchema).min(1),
  }),
});

export type OrderPlacedEventV1 = z.infer<typeof OrderPlacedEventV1Schema>;
```

### 6.3 Convenções de schema

- Um schema por **(eventName, eventVersion)**. Co-localizar em `events/<context>/<event-name>.v<n>.ts`.
- `eventName` e `eventVersion` SEMPRE com `z.literal(...)` — força discriminação estática.
- Reusar schemas atômicos (`OrderIdSchema`, `MoneyCentsSchema`) — ver `@contracts/schemas`.
- Validar no **producer (antes de publicar)** e no **consumer (antes de processar)**.

---

## 7. Idempotência

### 7.1 Default: at-least-once

- Pub/Sub e a maioria dos brokers entregam **at-least-once**. Duplicatas acontecem.
- **Todo handler DEVE ser idempotente**. Não é opcional.

### 7.2 Dedup por `eventId`

- Consumidor mantém tabela `processed_events`:

```sql
CREATE TABLE processed_events (
  event_id text PRIMARY KEY,              -- ULID do envelope (não uuidv7 de entidade)
  consumer text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
```

- Antes de processar: `INSERT ... ON CONFLICT DO NOTHING`. Se não inseriu, já foi processado — ack e ignora.
- Retention da tabela alinhada com retention do topic + janela de retry.

Ver `@rules/migration` para outros patterns de idempotência (token, version check).

---

## 8. Ordering

| Cenário | Garantia |
|---|---|
| Default | **Sem** garantia de ordem global. |
| Por aggregate | Usar `aggregateId` como `ordering_key` no Pub/Sub (Pub/Sub ordered delivery). |
| Cross-aggregate | **Não garantir**. Modelar consumers para tolerar reordering. |

> Documentar explicitamente, no schema do evento, **se a ordem importa e em qual escopo**. Quando importa, registrar como anotação no schema e na subscription.

---

## 9. Transport

### 9.1 Default: Google Pub/Sub

- **Topics** por bounded context (kebab-case): `orders-events`, `billing-events`, `auth-events`, `ai-events`.
- **Ordering key**: `aggregateId` quando ordem por aggregate for necessária.
- **Subscriptions**: pull para workers de longa duração; push para HTTP endpoints (Firebase Functions).
- **DLQ obrigatório** após N retries (default: 5 com exponential backoff). Topic DLQ: `<topic>-dlq`.

Ver `@stacks/backend/firebase-functions` para handlers via Pub/Sub triggers.

### 9.2 Postgres Outbox (atomicidade write+publish)

Quando a publicação **deve ser atômica** com a escrita no banco transacional:

```sql
CREATE TABLE outbox_events (
  id text PRIMARY KEY,                    -- eventId (ULID do envelope; ver §2.1)
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  event_name text NOT NULL,
  event_version int NOT NULL,
  payload jsonb NOT NULL,                 -- envelope completo
  occurred_at timestamptz NOT NULL,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX outbox_events_unpublished_idx
  ON outbox_events (created_at)
  WHERE published_at IS NULL;
```

- Worker lê: `SELECT ... FROM outbox_events WHERE published_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT N`.
- Publica no Pub/Sub e marca `published_at = NOW()`.
- **NUNCA** publicar diretamente do código de aplicação quando atomicidade for requisito — use sempre outbox. Ver `@contracts/postgres`.

### 9.3 Sink para warehouse

Eventos copiados para BigQuery via:
- Subscription Pub/Sub → BigQuery (preferido para volume médio).
- Dataflow (para transformação ou volume alto).

Tabela de eventos em BQ segue convenções de `@contracts/bigquery` (particionamento por `occurredAt`, clustering por `eventName` + `tenantId`).

### 9.4 O que NÃO usar como event bus

| Mecanismo | Por que não |
|---|---|
| **Firestore writes/triggers cross-domain** | Acoplamento de schema, sem versionamento, sem DLQ, retry limitado. Use Pub/Sub. Ver `@contracts/firebase-firestore`. |
| **Postgres LISTEN/NOTIFY em produção crítica** | Sem durability — mensagem perdida se nenhum listener estiver conectado. Tolerado apenas em dev/dashboards. |
| **Cloud Tasks como event bus** | Cloud Tasks é **work queue** (1 consumidor por task), não event bus. Usar para jobs assíncronos pontuais, não pub/sub. |
| **HTTP fire-and-forget** | Sem retry, sem ack, sem dedup. |

---

## 10. Retry, DLQ e poison messages

- **Retry policy padrão**: exponential backoff, min 10s, max 600s, max delivery attempts 5.
- Após exhaustion, mensagem vai para **DLQ** (`<topic>-dlq`).
- DLQ **NUNCA** é silencioso: alerta configurado (ver `@rules/observability`).
- Reprocessamento manual ou via job dedicado após investigação.

---

## 11. Payload size e Claim Check

- Pub/Sub: limite efetivo **<1MB** por mensagem.
- Eventos com payload grande (>256KB) devem usar **Claim Check**:

```json
{
  "eventName": "DOCUMENT_PROCESSED",
  "data": {
    "documentId": "doc-01HZX...",
    "claim": { "ref": "gs://bucket/path/doc-01HZX.json", "size": 4823100 }
  }
}
```

- O consumidor faz fetch do storage. Lifecycle do blob alinhado com retention do evento.

---

## 12. PII, retention e governança

Ver `@rules/security` e `@rules/governance`.

- **Minimizar PII no payload**. Quando necessária:
  - Hash ou tokenizar quando possível.
  - Para eventos cross-context, preferir referenciar IDs (consumer re-fetch sob ACL).
- **Eventos são imutáveis** — não há "edição" de evento publicado. Correções viram **eventos compensatórios** (`ORDER_CORRECTED`, `PAYMENT_REVERSED`).
- **Retention policy explícita** no topic, alinhada com LGPD/GDPR e classificação do dado.
- Topics que carregam PII têm:
  - Retention finita e documentada.
  - Encryption at rest (default GCP).
  - ACL restritiva nas subscriptions.

---

## 13. Tipos comuns no projeto

### 13.1 Domain Events (orders, users, billing)

| Evento | Aggregate |
|---|---|
| `ORDER_PLACED` | Order |
| `ORDER_PAID` | Order |
| `ORDER_CANCELLED` | Order |
| `USER_REGISTERED` | User |
| `USER_DELETED` | User |
| `INVOICE_ISSUED` | Invoice |

### 13.2 AI Events (observability, eval)

| Evento | Aggregate |
|---|---|
| `LLM_CALL_COMPLETED` | LlmCall |
| `EMBEDDING_GENERATED` | Embedding |
| `RAG_QUERY_EXECUTED` | RagQuery |

Topic dedicado: `ai-events`. Consumidos por warehouse para eval e custo.

### 13.3 Audit Events

| Evento | Aggregate |
|---|---|
| `RESOURCE_ACCESSED` | Resource |
| `RESOURCE_MODIFIED` | Resource |
| `PERMISSION_GRANTED` | Permission |

Topic: `audit-events`. Sink imutável (BQ + cold storage). Ver `@rules/governance`.

---

## 14. Event Sourcing (opcional)

Event Sourcing **não é o default** do projeto. Quando adotado em um contexto específico:

- Tabela `event_store` append-only por aggregate.
- Estado derivado por **replay** dos eventos.
- Trade-offs: complexidade, debug, snapshots, migração de schema histórico.
- Decisão registrada em ADR (ver `@architecture/ddd` e o procedimento de decisões).
- Eventos de domínio publicados em Pub/Sub continuam sendo o **canal de integração** — Event Sourcing é detalhe interno do contexto.

---

## 15. Tracing e observability

Ver `@rules/observability`.

- `correlationId` propagado em **todo** evento.
- Alinhar com `traceparent` do OpenTelemetry: extrair trace context do contexto da requisição que originou o comando; propagar no header da mensagem Pub/Sub (`googclient_traceparent` ou atributo customizado).
- Spans OTel cruzam **producer → broker → consumer**.
- Métricas mínimas: contagem por `eventName`, latência publish→ack, taxa de DLQ.

---

## 16. Anti-patterns

| Anti-pattern | Por que evitar |
|---|---|
| `eventName` no presente ou imperativo (`PLACE_ORDER`) | É comando, não evento. |
| Payload sem `eventId` | Sem chave de dedup, at-least-once vira at-least-bug. |
| PII excessiva no payload | Viola minimização, complica retention LGPD/GDPR. |
| Schema implícito (sem Zod) | Drift silencioso entre producer e consumer. |
| Schema mudado sem version bump | Breaking change invisível para consumers. |
| Firestore triggers como event bus cross-domain | Sem versionamento, sem DLQ, acoplamento de schema. |
| Postgres LISTEN/NOTIFY em produção crítica | Sem durability. |
| Sem DLQ configurado | Poison messages bloqueiam ou queimam quota. |
| Handlers não-idempotentes em at-least-once | Duplicatas causam efeitos colaterais duplicados. |
| Topic por evento (em vez de por contexto) | Explosão de topics, IAM intratável. |
| Payload >1MB sem claim check | Falha de publish ou perda de mensagem. |
| Ausência de `correlationId` / `causationId` | Debug e auditoria de cadeias impossíveis. |
| Eventos CRUD-like (`OrderUpdated`) | Não diz **o que** mudou; consumers viram polling. Preferir eventos específicos (`OrderShipped`, `OrderAddressChanged`). |
| Comandos disfarçados de eventos | Quebra de direção de fluxo; eventos descrevem fatos, não pedem ações. |
| Side effects multi-step no handler sem outbox/saga | Perda de atomicidade write+publish. |
| Retention infinita em topic com PII | Violação de LGPD/GDPR. |
| Publicar do código de aplicação sem outbox quando atomicidade é requisito | Inconsistência write/publish em falha. |
| Usar Cloud Tasks como event bus | Cloud Tasks é fila de trabalho, não pub/sub. |

---

## 17. Checklist de modelagem de um novo evento

Antes de publicar um novo evento, validar:

- [ ] Classifiquei como Domain / Integration / Notification.
- [ ] `eventName` em SCREAMING_SNAKE_CASE, particípio passado.
- [ ] Schema Zod versionado criado em `events/<context>/<event-name>.v<n>.ts`.
- [ ] Envelope completo (todos os campos obrigatórios da seção 2.1).
- [ ] Topic alvo definido (kebab-case, por bounded context).
- [ ] DLQ configurado.
- [ ] Ordering policy definida (sem ordem / por aggregate).
- [ ] Idempotência do handler validada.
- [ ] PII minimizada; retention apropriada para o topic.
- [ ] Payload <1MB ou claim check definido.
- [ ] `correlationId` propagado da origem.
- [ ] Outbox usado se atomicidade write+publish for requisito.
- [ ] Sink para warehouse definido (se aplicável).
- [ ] Documentado em catálogo de eventos do contexto.
