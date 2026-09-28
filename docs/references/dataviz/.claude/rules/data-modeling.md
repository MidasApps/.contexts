# Data Modeling — regra sempre-ativa

Modelos de dados seguem convenções consistentes: naming, timestamps, IDs, nullability, índices e evolução previsível.

## Princípios
- Naming consistente em toda a base: `snake_case` em SQL/event payloads, `camelCase` em código TS. Tradução só na boundary.
- Toda tabela/coleção tem `id`, `created_at`, `updated_at`. Soft-delete via `deleted_at` quando audit/recuperação é requisito.
- IDs: UUID v7 (ordenável) ou ULID para entidades distribuídas; bigserial só em casos internos.
- Nullability é decisão: campo opcional vs valor desconhecido vs default — documentar.
- Foreign keys sempre têm índice. Sem FK → não existe relação confiável; declare.
- Tipos específicos: `timestamptz` (não `timestamp`), `numeric` para dinheiro (não `float`), `text` (não `varchar(n)` sem motivo).
- Enum vs lookup-table: enum quando estável, lookup quando muda com dados.
- Evite premature normalization e premature denormalization — comece em 3FN, denormalize com dado.

## Checklist (aplicar a todo turn)
- [ ] `id`, `created_at`, `updated_at` presentes.
- [ ] FKs têm índice; `ON DELETE` definido explicitamente.
- [ ] `timestamptz` em vez de `timestamp`.
- [ ] Money em `numeric(precision, scale)` ou centavos em `bigint`.
- [ ] Booleans com nome positivo (`is_active`, não `is_not_disabled`).
- [ ] Naming consistente com convenção do projeto.

## Anti-patterns
- `float` para dinheiro → `numeric(18,4)` ou `bigint` centavos.
- `varchar(255)` por hábito → `text` ou tamanho real.
- FK sem índice → SELECT/DELETE lentos, locks largos.
- Coluna `data jsonb` polimórfica sem schema → modelar ou validar shape.
- Soft-delete em tudo "por garantia" → só quando há requisito real.

## Mini-exemplo
```sql
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('pending','paid','cancelled')),
  total_cents bigint NOT NULL CHECK (total_cents >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON orders(tenant_id);
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/data-modeling.md`
