---
name: events
description: Use ao definir contratos de eventos de domínio/integração. Keywords: events, event-driven, pubsub.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Event Contracts

Define o shape, semântica e evolução de eventos publicados em fila/stream (Pub/Sub, Kafka, SNS/SQS, EventBridge). AsyncAPI/CloudEvents/JSON Schema descrevem o contrato.

## Essência
- **Nome no passado:** `OrderPlaced`, `UserSignedUp` — descreve algo que aconteceu, não comando.
- **Envelope:**
  - `id` (uuid único do evento, para idempotência).
  - `type` / `eventName` (`order.placed`, `user.signed_up`).
  - `schemaVersion` (semver ou inteiro).
  - `occurredAt` (timestamptz quando aconteceu) e `publishedAt` (quando entrou na fila).
  - `source` (serviço/bounded context que emitiu).
  - `data` (payload tipado).
  - `metadata` (correlationId, traceId, tenantId, userId).
- **Payload mínimo:** o necessário para o consumer agir; evite "tudo da entidade". Quem precisa de mais consulta API.
- **Idempotência:** consumer deduplica por `id`. Eventos podem ser entregues > 1x.
- **Versionamento:** schemaVersion no envelope; consumer aceita N e N-1. Nova versão → novo schema, dual-publish durante transição.
- **Compatibilidade:** aditivo só (campo opcional novo). Remover/renomear → novo tipo/versão.
- **AsyncAPI** para documentar canais e mensagens. **CloudEvents** spec para interop entre clouds.
- **Schema registry** (Confluent, AWS Glue) para validação central em Kafka.
- **Dead letter queue** documentada para mensagens não-processáveis.

## Procedimento mínimo
1. Identificar evento de domínio (algo que mudou e que outros se importam).
2. Definir envelope padronizado + payload mínimo necessário.
3. Schema (JSON Schema/Avro/Proto) versionado no repo.
4. Documentar em AsyncAPI: channel, message, examples.
5. Publisher inclui `id`, `correlationId`, `schemaVersion`. Consumer dedup por `id`.
6. Mudança breaking → novo `type` ou bump `schemaVersion`; dual-publish para transição.

## Anti-patterns
- Evento `EntityUpdated` genérico com diff → consumer não sabe o que importa; emita eventos de domínio específicos.
- Payload com todo o estado da entidade → acopla; envie só o relevante + ID para fetch.
- Sem `schemaVersion` → evolução vira loteria.
- Sem dedup no consumer → side effects duplicados em retry.

## Mini-exemplo
```jsonc
// order.placed v1
{
  "id": "evt_01HXYZ...",
  "type": "order.placed",
  "schemaVersion": 1,
  "occurredAt": "2026-05-25T10:30:00Z",
  "publishedAt": "2026-05-25T10:30:01Z",
  "source": "orders-service",
  "data": {
    "orderId": "ord_01H...",
    "tenantId": "ten_01H...",
    "totalCents": 19900,
    "currency": "BRL"
  },
  "metadata": {
    "correlationId": "req_01H...",
    "traceId": "00-abc...",
    "userId": "usr_01H..."
  }
}
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/contracts/events.md`
