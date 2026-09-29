# Data Modeling — regra sempre-ativa

Modelos de dados seguem convenções consistentes: naming, timestamps, IDs, nullability, índices e evolução previsível.

## Princípios
- Naming por camada: `camelCase` em TS, JSON, Firestore e payload de evento; `snake_case` em Postgres/BigQuery; enum persistido minúsculo (`pending`); `eventName` SCREAMING_SNAKE. Tradução só na boundary.
- Toda tabela/coleção tem `id`, `created_at`/`createdAt`, `updated_at`/`updatedAt`; timestamp sempre com sufixo `_at`/`At`. Soft-delete via `deleted_at` quando audit/recuperação é requisito. Tenant é `tenant_id`/`tenantId`.
- IDs opacos sem prefixo de tipo: Postgres `uuid DEFAULT uuidv7()`; Firestore ID automático (`collection.doc()`, ADR 0005); ULID só em `eventId`, `Idempotency-Key`, `X-Request-Id`; nunca auto-increment exposto.
- Nullability é decisão: campo opcional vs valor desconhecido vs default — documentar.
- Foreign keys sempre têm índice. Sem FK → não existe relação confiável; declare.
- Tipos específicos: `timestamptz` (não `timestamp`), dinheiro em `amount_minor bigint` (`amountMinor` inteiro em TS/JSON/Firestore; derivados `total_minor`, sem sufixo de moeda) + `currency text` com CHECK `~ '^[A-Z]{3}$'` (não `float`, não `CHAR(3)`); `numeric` só para taxa/quantidade fracionária, `text` (não `varchar(n)` sem motivo).
- Enum vs lookup-table: enum quando estável, lookup quando muda com dados.
- Evite premature normalization e premature denormalization — comece em 3FN, denormalize com dado.

## Checklist (aplicar a todo turn)
- [ ] `id`, `created_at`, `updated_at` presentes; `tenant_id` quando multi-tenant.
- [ ] FKs têm índice; `ON DELETE` definido explicitamente.
- [ ] `timestamptz` em vez de `timestamp`.
- [ ] Money em `amount_minor bigint` + `currency` (ISO 4217, `text` + CHECK); `numeric` só para taxa.
- [ ] Booleans com nome positivo (`is_active`, não `is_not_disabled`).
- [ ] Naming consistente com convenção do projeto.

## Anti-patterns
- `float` para dinheiro → `amount_minor bigint` + `currency`.
- `varchar(255)` por hábito → `text` ou tamanho real.
- FK sem índice → SELECT/DELETE lentos, locks largos.
- Coluna `data jsonb` polimórfica sem schema → modelar ou validar shape.
- Soft-delete em tudo "por garantia" → só quando há requisito real.

## Mini-exemplo
```sql
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('pending','paid','cancelled')),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON orders(tenant_id);
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/data-modeling.md`
