---
name: events
description: Use ao definir contratos de eventos de domínio/integração. Keywords: events, event-driven, pubsub.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Event Contracts

Define o shape, semântica e evolução de eventos publicados em fila/stream (Pub/Sub, Kafka, SNS/SQS, EventBridge). AsyncAPI/CloudEvents/JSON Schema descrevem o contrato.

## Essência
- **Nome no passado:** `ORDER_PLACED`, `USER_SIGNED_UP` (SCREAMING_SNAKE) — descreve algo que aconteceu, não comando.
- **Envelope** (obrigatórios, fonte: `@.contexts/engineering/contracts/events.md` §2):
  - `eventId` (ULID, dedup key).
  - `eventName` (`ORDER_PLACED`, `USER_SIGNED_UP`).
  - `eventVersion` (int >= 1, versão do envelope + `data`).
  - `occurredAt` (ISO 8601 UTC com `Z`, quando o fato ocorreu no domínio).
  - `tenantId` (obrigatório em todo evento).
  - `aggregateType` (PascalCase) e `aggregateId`.
  - `correlationId` (propagado ponta a ponta).
  - `source` (serviço/bounded context que emitiu, kebab-case).
  - `data` (payload tipado).
  - Opcionais: `causationId` (obrigatório em cadeia multi-step), `actor`, `schemaVersion` (só quando `data` versiona à parte), `publishedAt` (preenchido pelo **bus**, não pelo emissor).
- **Payload mínimo:** o necessário para o consumer agir; evite "tudo da entidade". Quem precisa de mais consulta API.
- **Idempotência:** consumer deduplica por `eventId`. Eventos podem ser entregues > 1x.
- **Versionamento:** `eventVersion` no envelope; consumer aceita N e N-1. Nova versão → novo schema (`OrderPlacedEventV2Schema`), dual-publish durante transição.
- **Compatibilidade:** aditivo só (campo opcional novo). Remover/renomear → novo `eventName`/versão.
- **AsyncAPI** para documentar canais e mensagens. **CloudEvents** spec para interop entre clouds.
- **Schema registry** (Confluent, AWS Glue) para validação central em Kafka.
- **Dead letter queue** documentada para mensagens não-processáveis.

## Procedimento mínimo
1. Identificar evento de domínio (algo que mudou e que outros se importam).
2. Definir envelope padronizado + payload mínimo necessário.
3. Schema (JSON Schema/Avro/Proto) versionado no repo.
4. Documentar em AsyncAPI: channel, message, examples.
5. Publisher inclui `eventId`, `eventVersion`, `correlationId`. Consumer dedup por `eventId`.
6. Mudança breaking → novo `eventName` ou bump de versão; dual-publish para transição.

## Anti-patterns
- Evento `EntityUpdated` genérico com diff → consumer não sabe o que importa; emita eventos de domínio específicos.
- Payload com todo o estado da entidade → acopla; envie só o relevante + ID para fetch.
- Sem `eventVersion` → evolução vira loteria.
- Sem dedup no consumer → side effects duplicados em retry.

## Mini-exemplo
```jsonc
// ORDER_PLACED v1
{
  "eventId": "01HZX1J4K8VN3P5Q7R9S2T4W6Y",
  "eventName": "ORDER_PLACED",
  "eventVersion": 1,
  "occurredAt": "2026-05-25T10:30:00.000Z",
  "tenantId": "01932a7c-5b14-7c3a-8e2d-6f4b9a1c0d12",
  "aggregateType": "Order",
  "aggregateId": "01932a7c-5b14-7c3a-8e2d-6f4b9a1c0d11",
  "correlationId": "trace-abc-123",
  "source": "orders-service",
  "data": {
    "orderId": "01932a7c-5b14-7c3a-8e2d-6f4b9a1c0d11",
    "amountMinor": 19900,
    "currency": "BRL"
  }
}
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/contracts/events.md`
