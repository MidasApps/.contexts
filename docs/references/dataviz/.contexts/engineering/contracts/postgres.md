---
title: Convenções de modelagem para PostgreSQL
type: contracts
status: active
last_updated: 2026-07-13
scope: Doutrina de modelagem de schemas relacionais em PostgreSQL
related:
  - "@stacks/database/postgres"
  - "@stacks/database/pgvector"
  - "@rules/data-modeling"
  - "@rules/migration"
  - "@rules/security"
  - "@contracts/pgvector"
  - "@contracts/events"
  - "@contracts/schemas"
---

# Convenções de modelagem para PostgreSQL

Este documento governa **como modelar schemas relacionais em PostgreSQL** no projeto. Não trata da tecnologia em si (versão, drivers, extensões — ver `@stacks/database/postgres`) nem de princípios agnósticos de modelagem de dados (ver `@rules/data-modeling`). Foca exclusivamente nas convenções opinativas que dirigem o desenho de tabelas, colunas, constraints, índices, schemas e tipos quando o substrato é Postgres.

Toda modelagem nova consulta este documento antes de gerar DDL. Toda divergência é justificada por escrito no PR.

## Escopo

Esta doutrina cobre:

- Naming de objetos (tabelas, colunas, índices, constraints, schemas, tipos).
- Tipos de dados preferidos e proibidos.
- Identificadores primários e estrangeiros.
- Campos de auditoria obrigatórios e soft-delete.
- Constraints (CHECK, UNIQUE, EXCLUDE, FK).
- Índices e estratégias de particionamento.
- Tenant isolation em sistemas multi-tenant.
- Enums, JSONB, money, vetores.
- Triggers, views, e patterns de eventos (outbox).

## Naming

### Regra geral

`snake_case` sempre. Lowercase. Sem aspas duplas em identificadores. Sem prefixos do tipo `tbl_`, `fk_`, `idx_` (use os sufixos canônicos abaixo).

### Tabelas

- **Plural** para entidades: `users`, `orders`, `order_items`, `payment_methods`.
- Tabelas de junção entre duas entidades: `<a>_<b>` no plural quando faz sentido, ou nome de domínio próprio se a relação carrega semântica (`order_items`, não `orders_products`, quando o item é uma entidade do domínio).

### Colunas

- `snake_case`, descritivas, sem abreviações obscuras.
- FK: `<entity>_id` (`user_id`, `order_id`, `parent_category_id` para auto-referência).
- Boolean: prefixo verbal afirmativo (`is_active`, `has_expired`, `requires_review`). Nunca `not_*`.
- Timestamps: sufixo `_at` (`created_at`, `placed_at`, `expires_at`). Datas puras: sufixo `_on` (`born_on`).

### Schemas (namespaces)

- `public` reservado para o **domínio principal** da aplicação.
- Bounded contexts em schemas próprios: `auth`, `billing`, `ai`, `analytics`.
- Schemas operacionais separados: `audit`, `archive`, `migrations`.
- Nunca colocar tabelas de domínios distintos no mesmo schema apenas por conveniência.

### Tipos e enums

- **Tipos** (DOMAIN, custom types): **singular**, snake_case → `email`, `order_status`, `currency_code`.
- **Enum values**: `SCREAMING_SNAKE_CASE` → `'PENDING'`, `'PAID'`, `'AWAITING_REVIEW'`.

### Constraints e índices (sufixos canônicos)

| Tipo            | Padrão                                       | Exemplo                              |
| --------------- | -------------------------------------------- | ------------------------------------ |
| Primary key     | `<table>_pkey` (auto)                        | `orders_pkey`                        |
| Foreign key     | `<table>_<column>_fkey`                      | `orders_user_id_fkey`                |
| Unique          | `<table>_<columns>_key`                      | `users_email_key`                    |
| Check           | `<table>_<purpose>_check`                    | `orders_total_non_negative_check`    |
| Exclude         | `<table>_<purpose>_excl`                     | `bookings_room_overlap_excl`         |
| Index           | `<table>_<columns>_idx`                      | `orders_tenant_id_user_id_idx`       |
| Partial index   | `<table>_<columns>_partial_idx`              | `orders_active_partial_idx`          |
| GIN/JSONB       | `<table>_<column>_gin_idx`                   | `events_payload_gin_idx`             |
| BRIN            | `<table>_<column>_brin_idx`                  | `events_created_at_brin_idx`         |

Nunca aceitar nome default genérico do tipo `tbl_check`. Sempre nomeie a constraint explicitamente no DDL.

## Identificadores primários

### Default do projeto (Postgres 18+)

```sql
id uuid PRIMARY KEY DEFAULT uuidv7()
```

Use **`uuidv7()`** nativo do Postgres 18 como padrão de PK. UUIDv7 é ordenável por tempo (bom para índices B-tree e paginação cursor), evita hotspot de `BIGSERIAL`, e é UUID wire-format (integrações, drivers, Drizzle). Alinhado a `@stacks/database/postgres` e `@rules/data-modeling`.

### Alternativas permitidas

```sql
-- ULID gerado na aplicação (TEXT), quando o bounded context já padronizou ULID
-- ou precisa de geração client-side idêntica a Firestore/event IDs
id text PRIMARY KEY  -- ULID

-- UUID v4 apenas se ordenação temporal for indesejada (tokens públicos, etc.)
id uuid PRIMARY KEY DEFAULT gen_random_uuid()
```

Não introduzir ULID e UUIDv7 no **mesmo** bounded context sem ADR.

### Proibido

```sql
-- NUNCA
id BIGSERIAL PRIMARY KEY
id SERIAL PRIMARY KEY
```

Razões: IDs sequenciais expostos via API vazam volume de negócio, geram hotspot de inserção no índice, dificultam sharding/migrações futuras, e impedem geração client-side. Ver `@rules/security` para o aspecto de exposição.

**Não misturar UUID e ULID como PK no mesmo bounded context sem critério documentado.**

## Foreign keys

### Nomenclatura

```sql
user_id TEXT NOT NULL REFERENCES users(id)
parent_category_id TEXT REFERENCES categories(id)  -- auto-referência
```

### ON DELETE explícito sempre

| Política    | Quando usar                                                     |
| ----------- | --------------------------------------------------------------- |
| `RESTRICT`  | **Default.** Relacionamento exige integridade — falha o delete. |
| `CASCADE`   | Ownership real (ex: `order_items` quando `orders` é deletado).  |
| `SET NULL`  | Relacionamento opcional, FK pode ficar órfã legitimamente.      |
| `NO ACTION` | Equivalente a RESTRICT diferido — evite por clareza.            |

### ON UPDATE

Raramente necessário — IDs são imutáveis por convenção (ULIDs/UUIDs não mudam). Omitir cláusula ON UPDATE é o padrão.

### Índice em FK

Postgres **não cria índice automaticamente** em colunas FK. Todo `*_id` que referencia outra tabela recebe índice próprio, exceto se já participa como prefixo de outro índice composto.

```sql
ALTER TABLE orders ADD CONSTRAINT orders_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

CREATE INDEX orders_user_id_idx ON orders(user_id);
```

## Audit fields obrigatórios

Toda tabela de domínio carrega os campos abaixo. Tabelas puramente operacionais (filas, locks, caches) podem omitir.

```sql
created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
created_by TEXT NOT NULL,
updated_by TEXT NOT NULL
```

- `created_by` / `updated_by` recebem o ID do usuário autor ou a string literal `'system'` para mutações de processo automatizado.
- `updated_at` é mantido por **trigger** `BEFORE UPDATE` (única exceção legítima ao princípio de minimizar triggers — ver seção Triggers).

```sql
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

## Soft delete

Aplica-se a entidades onde auditoria histórica ou recovery importam. Não aplicar a todas as tabelas por reflexo — `@rules/data-modeling` discute o tradeoff.

```sql
deleted_at TIMESTAMPTZ,
deleted_by TEXT
```

- Ambos NULL = registro ativo. Ambos preenchidos simultaneamente quando soft-deletado.
- CHECK opcional para consistência: `CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))`.
- Partial index para queries comuns:

```sql
CREATE INDEX orders_tenant_id_active_partial_idx
  ON orders(tenant_id) WHERE deleted_at IS NULL;
```

- View `<entity>_active` para consumo padrão:

```sql
CREATE VIEW orders_active AS
  SELECT * FROM orders WHERE deleted_at IS NULL;
```

Aplicação consome `orders_active` por default; acessa `orders` diretamente apenas em código de auditoria/recovery.

## Tipos de dados

### Preferências

| Necessidade          | Use                                  | Evite                              |
| -------------------- | ------------------------------------ | ---------------------------------- |
| Texto                | `TEXT`                               | `VARCHAR(n)` arbitrário, `CHAR(n)` |
| Timestamp            | `TIMESTAMPTZ`                        | `TIMESTAMP` (sem timezone)         |
| Data pura            | `DATE`                               | `TEXT`                             |
| Hora pura            | `TIME`                               | `TEXT`                             |
| Money (alta precisão)| `NUMERIC(p,s)` ou `BIGINT` em cents  | `FLOAT`, `DOUBLE PRECISION`, `REAL`|
| Booleano             | `BOOLEAN`                            | `INTEGER` 0/1, `TEXT` 'Y'/'N'      |
| JSON                 | `JSONB`                              | `JSON`, `TEXT`                     |
| UUID / PK ordenável  | `UUID` com `uuidv7()` (default)      | `BIGSERIAL`; `TEXT` para UUID      |
| ID textual ordenável | `TEXT` (ULID) — só se BC já usa ULID | `BIGSERIAL`                        |
| Identificador moeda  | `CHAR(3)` (ISO 4217)                 | `TEXT` livre                       |

### Por que TEXT > VARCHAR(n)

`VARCHAR(n)` não tem ganho de performance em Postgres — é checado em runtime. Limites arbitrários geram migrations dolorosas quando o domínio cresce. Quando o limite é uma invariante real do domínio (ex: código de país de 2 caracteres), use `CHECK (length(country_code) = 2)` ou um `DOMAIN`.

### Por que TIMESTAMPTZ sempre

`TIMESTAMP` (sem timezone) é uma armadilha — armazena o instante como wall-clock e silenciosamente interpreta no fuso da sessão. `TIMESTAMPTZ` armazena UTC e converte na borda. Toda coluna temporal usa `TIMESTAMPTZ`. Sem exceção.

### Custom DOMAIN para invariantes reutilizáveis

```sql
CREATE DOMAIN email AS TEXT
  CHECK (VALUE ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

CREATE DOMAIN currency_code AS CHAR(3)
  CHECK (VALUE ~ '^[A-Z]{3}$');
```

Use DOMAIN quando a mesma invariante reaparece em múltiplas tabelas. Não use para constraints específicas de uma tabela — use CHECK inline.

## Enums

### Duas opções legítimas

**Opção A — TEXT + CHECK (padrão do projeto):**

```sql
status TEXT NOT NULL CHECK (status IN ('PENDING', 'PAID', 'CANCELLED'))
```

**Opção B — ENUM nativo:**

```sql
CREATE TYPE order_status AS ENUM ('PENDING', 'PAID', 'CANCELLED');
status order_status NOT NULL
```

### Quando usar cada uma

- **TEXT + CHECK é o default.** Adicionar/remover valores é uma migration trivial (DROP CONSTRAINT + CREATE CONSTRAINT). Permite evolução natural do domínio.
- **ENUM nativo** apenas quando o conjunto de valores é matematicamente fechado e jamais mudará (ex: dias da semana). ENUM nativo permite `ALTER TYPE ... ADD VALUE`, mas **remover** ou **renomear** valores é caro e perigoso.

Em caso de dúvida → TEXT + CHECK.

## Nullability

`NOT NULL` é o **default**. NULL é a exceção e exige justificativa semântica (campo genuinamente opcional, não-aplicável em certos casos).

- Toda coluna nasce `NOT NULL` no DDL inicial. Remover `NOT NULL` depois exige PR explícito.
- Quando NULL é semanticamente válido, documente o significado no comentário da coluna:

```sql
COMMENT ON COLUMN orders.cancelled_at IS 'NULL quando o pedido não foi cancelado.';
```

- Defaults explícitos quando viável (`DEFAULT NOW()`, `DEFAULT FALSE`, `DEFAULT 0`). Reduz dependência de aplicação para invariantes.

## Constraints

### Hierarquia de uso

| Constraint  | Quando aplicar                                                          |
| ----------- | ----------------------------------------------------------------------- |
| `NOT NULL`  | Default. Toda coluna salvo justificativa.                               |
| `UNIQUE`    | Invariante de unicidade do domínio (email, slug, código).               |
| `CHECK`     | Invariante de coluna ou cross-column (`CHECK (start_at < end_at)`).     |
| `FOREIGN KEY` | Sempre que relacionamento entre tabelas existe.                       |
| `EXCLUDE`   | Invariantes complexos com sobreposição de ranges (booking overlap).     |

### Exemplos canônicos

```sql
-- Unique composto
ALTER TABLE memberships
  ADD CONSTRAINT memberships_user_id_org_id_key UNIQUE (user_id, org_id);

-- Check cross-column
ALTER TABLE events
  ADD CONSTRAINT events_start_before_end_check CHECK (start_at < end_at);

-- Exclude overlap
ALTER TABLE bookings
  ADD CONSTRAINT bookings_room_overlap_excl
  EXCLUDE USING gist (room_id WITH =, period WITH &&);
```

## Tenant isolation

Em sistemas multi-tenant, **toda tabela de domínio** carrega:

```sql
tenant_id TEXT NOT NULL
```

- `tenant_id` participa do primeiro segmento dos índices compostos quando a maioria das queries filtra por tenant.
- Unique constraints incluem `tenant_id` quando a unicidade é por tenant: `UNIQUE (tenant_id, email)`.
- **Row-Level Security** quando aplicável:

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY orders_tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id', true));
```

Ver `@rules/security` para a disciplina de configuração de `app.tenant_id` na conexão.

Tabelas operacionais globais (migrations, system events) podem omitir `tenant_id` — documente explicitamente.

## Índices

### Quando criar

- Em **toda FK** (Postgres não cria automático).
- Em colunas frequentemente filtradas, ordenadas ou agregadas em queries quentes.
- Em colunas únicas (UNIQUE constraint cria índice implicitamente).

### Tipos especializados

| Tipo                  | Quando usar                                                       |
| --------------------- | ----------------------------------------------------------------- |
| **B-tree** (default)  | Igualdade, ranges, ordenação em tipos escalares.                  |
| **Partial**           | Subconjunto frequente (`WHERE deleted_at IS NULL`, `WHERE is_active`). |
| **Covering** (`INCLUDE`) | Index-only scans evitando heap access.                         |
| **GIN**               | JSONB, arrays, tsvector (full-text search).                       |
| **BRIN**              | Colunas naturalmente correlacionadas com ordem física (timestamps em append-only). |
| **GiST**              | Ranges, geometrias, EXCLUDE constraints.                          |

### Exemplos

```sql
-- B-tree composto
CREATE INDEX orders_tenant_id_status_idx ON orders(tenant_id, status);

-- Partial
CREATE INDEX orders_active_partial_idx
  ON orders(tenant_id, placed_at) WHERE deleted_at IS NULL;

-- Covering
CREATE INDEX orders_user_id_covering_idx
  ON orders(user_id) INCLUDE (status, total_cents);

-- GIN em JSONB
CREATE INDEX events_payload_gin_idx ON events USING gin (payload);

-- BRIN em append-only
CREATE INDEX events_created_at_brin_idx ON events USING brin (created_at);
```

### Produção

Sempre `CREATE INDEX CONCURRENTLY` em ambientes com tráfego. Ver `@rules/migration` para a disciplina completa de DDL não-bloqueante.

## Particionamento

Considere particionar quando:

- Tabela ultrapassa ~10M linhas e tem padrão natural de ranges (tempo, tenant).
- Dados quentes recentes e frios históricos têm acessos drasticamente diferentes.
- Arquivamento/expurgo se beneficia de `DROP PARTITION`.

Padrão: `PARTITION BY RANGE (created_at)` mensal ou semanal:

```sql
CREATE TABLE events (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  payload JSONB NOT NULL
) PARTITION BY RANGE (created_at);

CREATE TABLE events_2026_05 PARTITION OF events
  FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
```

Particularidades de ferramentas (pg_partman, automação de criação de partições) vivem em `@stacks/database/postgres`.

## Money pattern

### Duas opções padronizadas

**Cents em BIGINT (default para sistemas transacionais):**

```sql
amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
currency CHAR(3) NOT NULL
```

**NUMERIC quando cálculos exigem fração decimal explícita:**

```sql
amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
currency CHAR(3) NOT NULL
```

Cada bounded context **documenta sua escolha** na primeira tabela monetária e mantém consistência interna. Nunca `FLOAT`/`DOUBLE PRECISION` para money — perda de precisão é certa.

`currency` sempre `CHAR(3)` ISO 4217 (`'USD'`, `'BRL'`). Nunca armazenado como número.

## JSONB

Use para:

- Payloads de eventos (`outbox_events.payload`).
- Configurações flexíveis cujo schema varia legitimamente por tenant/feature.
- Metadados extensíveis que não justificam colunas dedicadas.

**Não** use JSONB como substituto para modelagem relacional quando os campos têm schema estável e são consultados/filtrados/joinados.

`JSONB` > `JSON` sempre — `JSON` armazena texto puro, não é indexável eficientemente, e não tem operadores nativos performáticos.

Indexe JSONB com GIN quando há queries de path:

```sql
CREATE INDEX events_payload_gin_idx ON events USING gin (payload);
CREATE INDEX events_payload_user_id_idx ON events ((payload->>'user_id'));
```

## Vector columns

Embeddings residem em tabela separada por default (não infle tabelas de domínio com vetores). Ver `@stacks/database/pgvector` para extensão e `@contracts/pgvector` para a doutrina específica de modelagem vetorial.

```sql
-- Exemplo de referência cruzada — detalhes em @contracts/pgvector
CREATE TABLE document_embeddings (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  embedding vector(1536) NOT NULL,
  model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

## Triggers

**Minimize triggers.** Lógica de negócio vive na aplicação, não no banco. Exceções aceitas:

1. **`updated_at` automático** (trigger `BEFORE UPDATE` setando `NEW.updated_at := NOW()`).
2. **Audit trigger** em tabelas críticas escrevendo no schema `audit` (mudanças de schema separadas da regra de negócio).

Triggers que aplicam regras de domínio, derivam valores de negócio, ou disparam side effects (notificações, integrações) são proibidos. Esses comportamentos vivem em código de aplicação onde são testáveis, versionáveis e observáveis.

## Views

### `<entity>_active`

Padrão para entidades soft-delete. Aplicação consome `<entity>_active`; acesso à tabela base é exceção.

### `v_<purpose>`

Views de abstração para queries recorrentes ou junções complexas. Prefixo `v_` deixa a natureza explícita.

### MATERIALIZED VIEW

Use quando custo de recomputação justifica armazenamento. Documente sempre a estratégia de refresh (cron, trigger por evento, refresh manual sob demanda):

```sql
CREATE MATERIALIZED VIEW mv_daily_revenue AS
  SELECT date_trunc('day', placed_at) AS day, SUM(total_cents) AS revenue_cents
  FROM orders_active
  GROUP BY 1;

-- Refresh: cron diário às 03:00 UTC via Cloud Scheduler.
```

## Eventos de domínio

`LISTEN/NOTIFY` **não é event bus crítico**. Ver `@contracts/events` para a doutrina geral. Em Postgres, o padrão sancionado é **outbox**:

```sql
CREATE TABLE outbox_events (
  -- eventId do envelope (@contracts/events): ULID em TEXT, não uuidv7 de entidade
  id text PRIMARY KEY,
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,           -- string opaca (uuid ou ULID do aggregate)
  event_name text NOT NULL,
  payload jsonb NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX outbox_events_unpublished_partial_idx
  ON outbox_events(occurred_at) WHERE published_at IS NULL;
```

Um relay consome `published_at IS NULL`, publica em Pub/Sub/Kafka, e marca `published_at = NOW()`. Garante atomicidade entre mudança de domínio e emissão de evento.

## Versionamento de schema

Migrations gerenciadas por Drizzle Kit (ver `@stacks/database/postgres` para configuração e workflow). Cada migration:

- Tem hash committado no controle de versão.
- É **idempotente** sempre que possível (`CREATE TABLE IF NOT EXISTS`, `DROP CONSTRAINT IF EXISTS`).
- Respeita `@rules/migration` (não-bloqueante, `CONCURRENTLY` em índices, backfill em batches).

Schema `migrations` é reservado ao tracking de versões. Não criar tabelas de domínio nele.

## Exemplo canônico completo

```sql
CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT uuidv7(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('PENDING', 'PAID', 'CANCELLED')),
  total_cents bigint NOT NULL CHECK (total_cents >= 0),
  currency char(3) NOT NULL,
  placed_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL,
  updated_by text NOT NULL,
  deleted_at timestamptz,
  deleted_by text,
  CONSTRAINT orders_soft_delete_consistency_check
    CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);

CREATE INDEX orders_tenant_id_user_id_idx ON orders(tenant_id, user_id);
CREATE INDEX orders_placed_at_idx ON orders(placed_at);
CREATE INDEX orders_active_partial_idx
  ON orders(tenant_id, status) WHERE deleted_at IS NULL;

CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE VIEW orders_active AS
  SELECT * FROM orders WHERE deleted_at IS NULL;
```

## Aplicação correta vs incorreta

### Correto

```sql
id uuid PRIMARY KEY DEFAULT uuidv7()                 -- PK ordenável (default PG 18)
created_at timestamptz NOT NULL DEFAULT now()        -- TZ + default
amount_cents bigint NOT NULL CHECK (amount_cents >= 0)  -- money em cents
status text NOT NULL CHECK (status IN (...))         -- enum flexível
tenant_id uuid NOT NULL                              -- multi-tenant
CREATE INDEX orders_user_id_idx ON orders(user_id);  -- FK indexada
```

### Incorreto

```sql
id BIGSERIAL PRIMARY KEY                             -- sequencial exposto
created_at TIMESTAMP                                  -- sem timezone, sem default
price FLOAT                                           -- money em float
status VARCHAR(20)                                    -- VARCHAR arbitrário, sem CHECK
-- (sem tenant_id em tabela multi-tenant)
-- (sem índice em user_id FK)
```

## Anti-patterns

Os seguintes padrões são **proibidos** sem justificativa documentada e aprovada em PR:

- `BIGSERIAL` ou `SERIAL` como PK exposta via API.
- `VARCHAR(n)` com `n` arbitrário sem invariante de domínio real.
- `TIMESTAMP` sem timezone em qualquer coluna.
- `FLOAT`, `DOUBLE PRECISION`, `REAL` para valores monetários.
- Tabelas sem `tenant_id` em sistema multi-tenant.
- FK sem índice próprio.
- Ausência de soft-delete em entidades que exigem auditoria histórica.
- Naming inconsistente entre snake_case, camelCase e PascalCase no mesmo schema.
- Constraints com nome default genérico (`tbl_check`, `tbl_check1`).
- `created_at` sem `DEFAULT NOW()`.
- JSONB usado como dump para campos que merecem modelagem relacional estável.
- ENUM nativo para conjuntos de valores que evoluem com o domínio.
- Migration criando índice sem `CONCURRENTLY` em ambiente com tráfego.
- Trigger executando lógica de negócio (cálculos derivados, side effects, integrações).
- `LISTEN/NOTIFY` como event bus para eventos de domínio críticos.
- Mistura de UUID e ULID como PK no mesmo bounded context sem critério explícito.
- Colunas booleanas com nomes negativos (`not_active`, `is_not_deleted`).
- `TIMESTAMP WITHOUT TIME ZONE` "porque sempre usamos UTC mesmo" — TIMESTAMPTZ não custa nada e elimina a classe inteira de bugs.

## Referências cruzadas

- `@stacks/database/postgres` — versão, extensões, drivers, Drizzle Kit, workflow de migrations.
- `@stacks/database/pgvector` — extensão pgvector, índices HNSW/IVFFlat, operadores.
- `@rules/data-modeling` — princípios agnósticos (normalização, identidade, invariantes).
- `@rules/migration` — disciplina de DDL não-bloqueante, backfill, rollback.
- `@rules/security` — RLS, exposição de IDs, secrets de conexão.
- `@contracts/pgvector` — doutrina de modelagem vetorial.
- `@contracts/events` — modelagem de eventos, outbox, naming.
- `@contracts/schemas` — convenções gerais de schemas formais entre componentes.
