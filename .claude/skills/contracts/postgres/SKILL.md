---
name: contracts-postgres
description: Use ao definir convenções e contratos Postgres — naming, FKs, soft-delete, timestamps. Keywords: postgres contract, schema.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Contracts: Postgres Schema Conventions

Convenções de modelagem para tabelas Postgres: naming, tipos canônicos, timestamps, soft-delete, FKs e índices. Padroniza o shape do schema entre features/serviços.

## Essência
- **Naming:** `snake_case` em tabelas e colunas. Tabelas no **plural** (`orders`, `users`). FKs com sufixo `_id` (`tenant_id`).
- **PK:** `id uuid PRIMARY KEY DEFAULT uuidv7()` (PG18, ordenável por tempo).
- **Timestamps padrão:** `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()` (trigger ou app atualiza).
- **Soft-delete (quando aplicável):** `deleted_at timestamptz NULL` + partial index `WHERE deleted_at IS NULL` nas queries vivas.
- **FK:** sempre `REFERENCES <table>(id)` + `ON DELETE` explícito (`CASCADE`/`RESTRICT`/`SET NULL`). FK SEMPRE tem índice.
- **Tipos canônicos:** `timestamptz` (não `timestamp`); `text` (não `varchar(n)` sem motivo); dinheiro em inteiro `amount_minor bigint` + `currency text` (CHECK `~ '^[A-Z]{3}$'`), `numeric` só para taxa/quantidade fracionária; `jsonb` (não `json`).
- **Enums:** `text` com `CHECK (col IN (...))` — fácil evoluir; `CREATE TYPE ... AS ENUM` só quando absolutamente estável.
- **Booleans:** nome positivo + default (`is_active boolean NOT NULL DEFAULT true`).
- **Multi-tenant:** `tenant_id uuid NOT NULL` em toda tabela de domínio + índice composto começando por `tenant_id`.
- **Constraint/index naming:** `<table>_<columns>_idx`, `<table>_<columns>_key` (unique), `<table>_<column>_fkey`, `<table>_<purpose>_check`, `<table>_<columns>_partial_idx`.
- **Migrations:** forward-only, idempotentes onde possível (`IF NOT EXISTS`), `CONCURRENTLY` em índices, additive antes de destructive (ver rule `migration`).
- **Audit columns** opcionais: `created_by`, `updated_by` quando rastreabilidade exigida.

## Procedimento mínimo
1. Toda nova tabela inclui `id`, `created_at`, `updated_at` no mínimo.
2. `tenant_id` em todas tabelas de domínio multi-tenant.
3. FK com `ON DELETE` explícito + índice declarado.
4. Trigger `set_updated_at` (ou app) atualiza `updated_at` em updates.
5. Soft-delete só quando há requisito real; partial index para leituras vivas.
6. Naming review antes de migrar: `snake_case` plural; FK `_id`; índice `_idx`; unique `_key`.

## Anti-patterns
- `varchar(255)` por hábito → `text`.
- `float` para money → `amount_minor bigint` + `currency`.
- Coluna `data jsonb` polimórfica sem schema → ou modela ou valida com Zod.
- Sem `tenant_id` em multi-tenant → impossível isolar.
- FK sem índice → DELETE/SELECT lentos.

## Mini-exemplo
```sql
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('draft','sent','paid','void')),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX invoices_tenant_id_created_at_partial_idx ON invoices (tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX invoices_tenant_id_idx ON invoices (tenant_id);     -- FK
CREATE INDEX invoices_customer_id_idx ON invoices (customer_id); -- FK
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/contracts/postgres.md`
**Documentação upstream:** documentação oficial da biblioteca na versão pinada em MEMORY.
