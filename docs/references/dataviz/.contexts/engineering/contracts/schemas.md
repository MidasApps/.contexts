---
title: Convenções de modelagem para schemas
type: contracts
scope: schemas zod compartilhados (boundaries, naming, organização, versionamento, sharing client/server)
status: active
last_updated: 2026-05-20
---

# Convenções de modelagem para schemas

Este documento prescreve **como modelar schemas Zod** que atravessam fronteiras do sistema (client/server, módulo/módulo, serviço/serviço, sistema/IA). Não substitui regras de implementação (`@rules/validation`), nem o manual da ferramenta (`@stacks/validation/zod@4`), nem convenções de fronteiras específicas (`@contracts/api`, `@contracts/firebase-firestore`, `@contracts/postgres`, `@contracts/events`). Aqui ficam as convenções de **forma e organização** dos próprios schemas.

## 1. Filosofia

- Schema é **single source of truth** da forma de um dado. Toda tipagem derivada vive como `z.infer<typeof Schema>` — ver `@stacks/validation/zod@4`.
- **Nunca** declarar `interface` ou `type` paralela a um schema. O schema define a forma; o tipo é consequência.
- Schema existe para ser **executado** na borda (parse/safeParse) e **inferido** no interior do código. Os dois usos compartilham a mesma definição.
- A forma de um dado **na fronteira** (wire) é separável da sua forma **no domínio**. Quando divergem, modele dois schemas e uma camada de mapper.

## 2. Localização canônica

| Natureza do schema | Localização |
|---|---|
| Compartilhado entre client e server | `src/contracts/<context>/` |
| Interno de uma feature (não cruza fronteira) | `src/features/<feature>/schemas.ts` |
| Derivado de tabela Drizzle | Próximo da definição da tabela, via `drizzle-zod` |
| Evento de domínio | `src/contracts/events/` |
| Primitivos compartilhados | `src/contracts/primitives/` |

Regra de bolso: **se mais de uma feature, package ou camada importa o schema, ele pertence a `src/contracts/`.** Schemas internos jamais devem ser importados por outra feature — se for necessário, **promova** para contracts.

## 3. Naming

### Schemas

- PascalCase com sufixo `Schema`: `UserSchema`, `OrderSchema`, `OrderEventSchema`.
- Tipo inferido tem o **mesmo nome sem o sufixo**: `type User = z.infer<typeof UserSchema>`.

### Variantes por boundary

| Variante | Uso |
|---|---|
| `<Entity>Schema` | Forma canônica de domínio |
| `Create<Entity>InputSchema` | Input de criação (vindo de API/form) |
| `Update<Entity>InputSchema` | Input de atualização (campos opcionais) |
| `<Entity>OutputSchema` | Forma estável que o cliente vê |
| `<Entity>ListItemSchema` | Forma reduzida em listagens |
| `<Entity>DbSchema` | Forma derivada da DB (Drizzle) |
| `<Event>Schema` | Forma de evento de domínio |

Exemplos válidos: `CreateOrderInputSchema`, `UserListItemSchema`, `OrderPlacedEventSchema`.
Exemplos inválidos: `userSchema` (camelCase), `IUser` (notação húngara), `OrderType` (sem sufixo `Schema`), `OrderDTO` (vocabulário fora da convenção).

## 4. Organização por bounded context

Cada bounded context (ver `@architecture/ddd`) possui seu próprio pacote de schemas em `src/contracts/<context>/`. Comunicação **cross-context** acontece por contract schemas explícitos, nunca por importação direta da forma de domínio interno de outro contexto.

```
src/contracts/
├── primitives/          # EmailSchema, UrlSchema, IsoDateTimeSchema, MoneySchema...
├── users/               # UserIdSchema, UserSchema, UserOutputSchema...
├── orders/              # OrderIdSchema, OrderSchema, CreateOrderInputSchema...
├── billing/             # PaymentSchema, InvoiceSchema...
└── events/              # OrderPlacedEventSchema, UserRegisteredEventSchema...
```

## 5. Estrutura típica de arquivo

```ts
// src/contracts/orders/order.ts
import { z } from 'zod';
import { UserIdSchema } from '../users';

export const OrderIdSchema = z.string().min(26).brand<'OrderId'>();
export type OrderId = z.infer<typeof OrderIdSchema>;

export const OrderStatusSchema = z.enum(['PENDING', 'PAID', 'CANCELLED']);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const OrderSchema = z.object({
  id: OrderIdSchema,
  userId: UserIdSchema,
  status: OrderStatusSchema,
  totalCents: z.number().int().nonnegative(),
  currency: z.string().length(3),
  placedAt: z.string().datetime({ offset: false }),
  createdAt: z.string().datetime({ offset: false }),
  updatedAt: z.string().datetime({ offset: false }),
});
export type Order = z.infer<typeof OrderSchema>;
```

Regras estruturais:

- IDs, enums e tipos auxiliares declarados **antes** do schema agregador.
- Tipo inferido **imediatamente abaixo** da declaração do schema (mantém visibilidade local da dupla schema/tipo).
- Imports de outros contracts via path relativo dentro de `src/contracts/`; nunca via `import type` (precisamos do valor runtime).

## 6. Branded types para IDs

Todo identificador de entidade é um branded type. Isso impede troca acidental entre `UserId` e `OrderId` em chamadas, mesmo que ambos sejam strings em runtime. Ver `@rules/data-modeling`.

```ts
export const UserIdSchema = z.string().min(26).brand<'UserId'>();
export type UserId = z.infer<typeof UserIdSchema>;

export const OrderIdSchema = z.string().min(26).brand<'OrderId'>();
export type OrderId = z.infer<typeof OrderIdSchema>;
```

- Aplicar a IDs de entidade, tenant, sessão, request, idempotency keys.
- **Não** aplicar a strings comuns sem semântica de identidade (nomes, descrições, slugs livres).

## 7. Primitivos compartilhados

Em `src/contracts/primitives/`:

```ts
export const EmailSchema = z.string().email().toLowerCase().trim();
export const UrlSchema = z.string().url();
export const IsoDateTimeSchema = z.string().datetime({ offset: false });
export const CurrencySchema = z.string().length(3).toUpperCase();
export const MoneySchema = z.object({
  amountCents: z.number().int().nonnegative(),
  currency: CurrencySchema,
});
```

- Primitivo é importado, **nunca duplicado**. Se aparecer divergência (`z.string().email()` solto em dois lugares), promova ao primitivo.
- Primitivos não carregam regra de negócio — apenas forma do valor.

## 8. Schemas por boundary

A mesma entidade pode aparecer em múltiplas formas ao longo da cadeia. Modele cada forma como schema distinto e ligue por mappers:

| Camada | Schema | Característica |
|---|---|---|
| API input | `Create<Entity>InputSchema` | Permissivo no aceite (`trim`, `coerce` quando seguro), estrito no que valida; opcionais com `default` |
| API output | `<Entity>OutputSchema` | Forma estável e versionável que o cliente vê; pode omitir campos internos |
| Domain | `<Entity>Schema` | Forma canônica interna; usa branded types e enums fortes |
| DB row | `<Entity>DbSchema` | Derivado via `drizzle-zod`; reflete colunas, tipos da DB |
| Event | `<Event>Schema` | Forma imutável do evento de domínio |

A regra é: **uma forma por fronteira**. Misturar shape de domínio com shape de wire no mesmo schema é anti-pattern.

## 9. Transform, parse e defense-in-depth

- Input externo (HTTP body, query, form, webhook, evento) atravessa `.parse` ou `.safeParse` **na borda**, antes de qualquer lógica.
- Output externo (response HTTP, payload de evento publicado, structured output enviado a sistema externo) atravessa `.parse` do schema de output **antes da serialização**.
- Nunca confie em tipos vindos do interior sem schema na fronteira de saída — defense-in-depth.

## 10. Sharing client/server

- Schemas em `src/contracts/` são importados livremente por client (Next.js Client Components, Server Actions chamadas de cliente, route handlers) e server.
- **Nunca duplicar** um schema entre client e server. Se um schema só faz sentido em um lado, ele não é contract — viva em feature.
- **Nunca** declarar tipo sem schema correspondente para algo que cruza a fronteira client/server.

## 11. Versionamento de schemas

| Mudança | Tipo | Ação |
|---|---|---|
| Adicionar campo opcional | Aditiva | Sem version bump |
| Adicionar campo com `default` | Aditiva | Sem version bump |
| Relaxar enum (novo valor) | Aditiva | Sem version bump em produtores; consumidores devem aceitar unknown |
| Remover campo | Breaking | Schema paralelo `V2` + deprecation timeline |
| Mudar tipo de campo | Breaking | Schema paralelo `V2` + migração de consumidores |
| Tornar campo opcional em required | Breaking | Schema paralelo `V2` |

Para wire formats persistentes (eventos, APIs públicas, dados serializados em DB), inclua discriminador de versão:

```ts
export const OrderPlacedEventV1Schema = z.object({
  schemaVersion: z.literal(1),
  // ...
});

export const OrderPlacedEventV2Schema = z.object({
  schemaVersion: z.literal(2),
  // ...
});

export const OrderPlacedEventSchema = z.discriminatedUnion('schemaVersion', [
  OrderPlacedEventV1Schema,
  OrderPlacedEventV2Schema,
]);
```

## 12. Discriminated unions

Tipos polimórficos usam `z.discriminatedUnion`, nunca `z.union` simples — performance superior e mensagens de erro mais úteis.

```ts
export const ShapeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('CIRCLE'), radius: z.number().positive() }),
  z.object({ kind: z.literal('SQUARE'), side: z.number().positive() }),
  z.object({ kind: z.literal('RECT'), width: z.number().positive(), height: z.number().positive() }),
]);
```

O campo discriminador é sempre uma string literal em SCREAMING_SNAKE_CASE quando representa estado/tipo de domínio.

## 13. Refinements compartilhados

Refinements reusáveis ficam em `src/contracts/primitives/refinements.ts` como funções nomeadas:

```ts
export const refineNonEmpty = <T extends z.ZodTypeAny>(schema: T) =>
  schema.refine((v) => Array.isArray(v) ? v.length > 0 : !!v, { message: 'must not be empty' });

export const refineUniqueArray = <T>(getKey: (item: T) => string) =>
  (arr: T[]) => new Set(arr.map(getKey)).size === arr.length;
```

Anti-pattern: `.refine(...)` inline duplicado em vários schemas.

## 14. Mensagens de erro

- Mensagens user-facing usam chaves i18n, não strings literais — ver `@rules/internationalization`.
- Definir `errorMap` global no bootstrap para mensagens default consistentes.
- Mensagens de schema em contratos internos (não user-facing) podem ser strings em inglês curtas e factuais.

## 15. OpenAPI export

Schemas que servem APIs HTTP são anotados com `.describe()` e, quando aplicável, `.openapi()` via `@asteasolutions/zod-to-openapi`. Ver `@practices/sdd`.

```ts
export const OrderSchema = z.object({
  id: OrderIdSchema.describe('Unique order identifier'),
  status: OrderStatusSchema.describe('Current order status'),
  // ...
}).openapi('Order');
```

- `operationId` é nomeado em camelCase: `createOrder`, `listOrders`, `getOrderById`.
- Tags agrupam por bounded context.

## 16. JSON Schema export para IA

Para structured outputs e tool params consumidos por LLMs (ver `@stacks/ai/vercel-ai-sdk`), exporte JSON Schema via `zod-to-json-schema`:

```ts
import { generateObject } from 'ai';
import { OrderSummarySchema } from '@/contracts/orders';

const { object } = await generateObject({
  model,
  schema: OrderSummarySchema,
  prompt: '...',
});
```

Schemas usados em prompts de IA devem ter `.describe()` em **todos** os campos — o describe vira parte do prompt que o modelo lê.

## 17. Drizzle integration

Ver `@stacks/database/postgres`. Schemas de DB são derivados, não escritos à mão:

```ts
import { createSelectSchema, createInsertSchema } from 'drizzle-zod';
import { users } from './tables';

export const UserDbSchema = createSelectSchema(users);
export const UserInsertDbSchema = createInsertSchema(users);
export type UserDb = z.infer<typeof UserDbSchema>;
```

Mapper converte `UserDb` → `User` (forma canônica de domínio). Nunca retorne `UserDb` direto a partir de camadas acima do repositório.

## 18. Firestore integration

Ver `@contracts/firebase-firestore`. Schema canônico é aplicado nas duas direções via converter:

```ts
import { FirestoreDataConverter } from 'firebase-admin/firestore';
import { UserSchema, type User } from '@/contracts/users';

export const userConverter: FirestoreDataConverter<User> = {
  toFirestore: (u) => UserSchema.parse(u),
  fromFirestore: (snap) => UserSchema.parse(snap.data()),
};
```

## 19. Schema-as-API

tRPC, Server Actions (Next.js) e Route Handlers consomem schemas **diretamente** para input validation. Não há "tipo de input" separado do schema:

```ts
'use server';

import { CreateOrderInputSchema } from '@/contracts/orders';

export async function createOrder(raw: unknown) {
  const input = CreateOrderInputSchema.parse(raw);
  // input está validado e tipado
}
```

## 20. Eval / AI schemas

Ver `@stacks/ai/vercel-ai-sdk`. Schemas para structured output de LLM:

- Vivem em `src/contracts/<context>/` se reutilizados; em `src/features/<feature>/schemas.ts` se efêmeros.
- Sempre com `.describe()` em todos os campos.
- Preferir tipos primitivos a complex unions — modelos LLMs lidam pior com unions profundas.
- Para evals, fixar schema da resposta esperada e usar diff estrutural.

## 21. Testes

Ver `@rules/testing`.

- Cada schema em contract tem teste com pelo menos um fixture válido e dois inválidos (caso de borda + caso óbvio).
- Invariantes de schemas com regras numéricas, formatos ou refinements são cobertos por property-based testing via `fast-check`.
- Fixtures válidos de schemas em contracts ficam em `src/contracts/<context>/__fixtures__/` para reuso entre testes.

## 22. Performance

- Schemas são declarados em escopo de módulo, **uma única vez**. Nunca dentro de função/handler.
- `discriminatedUnion` sempre quando há tag discriminadora — não use `union` para tipos polimórficos.
- Refinements custosos (regex pesado, validação de I/O) só na borda, nunca em schemas usados em loops internos.

## 23. Migrações de wire format

Para qualquer schema em uso por consumidores externos (clients web, mobile, integrações, eventos persistidos):

1. Introduzir novo campo/forma como **aditivo**.
2. Produtores começam a emitir ambos (legado + novo) durante janela de coexistência.
3. Consumidores migram para o novo, mantendo aceite do legado.
4. Após telemetria confirmar uso zero do legado, marcar como deprecated.
5. Remover legado em release major com nota explícita.

Nunca pule etapas — deletar campo em wire format sem deprecation quebra clients em produção.

## 24. Anti-patterns

Aplicação errada — evite:

- `interface User` + `UserSchema` paralelos. Use `type User = z.infer<typeof UserSchema>`.
- Schemas duplicados entre client e server.
- Schemas inline dentro de handler (re-criação a cada request, perde reuso, polui telemetria).
- IDs de entidade sem branded type.
- `.passthrough()` em wire format público (vaza estrutura inesperada).
- Validar duas vezes a mesma forma na mesma cadeia sem motivo (defense-in-depth tem lugar; ruído tem outro).
- Schema em OpenAPI export sem `.describe()`.
- Mesmo schema cobrindo forma de domínio e forma de wire.
- `z.union([...])` quando existe campo discriminador — use `z.discriminatedUnion`.
- Versionamento ad hoc sem `schemaVersion` em wire formats persistentes.
- Schema interno de feature consumido por outra feature sem promoção a `src/contracts/`.
- `z.any()` por preguiça. Use `unknown` + narrowing — ver `@rules/validation`.
- Lançar `ZodError` diretamente ao cliente externo. Envelope de erro padronizado em `@contracts/api`.
- Tipo declarado manualmente "para não importar Zod no client" — Zod é leve, schema é único.
- Schema sem `.describe()` quando usado em prompt de LLM.

## 25. Referências cruzadas

- `@rules/validation` — regras imperativas sobre quando e como validar.
- `@stacks/validation/zod@4` — manual da ferramenta, sintaxe correta da versão.
- `@rules/data-modeling` — regras gerais de modelagem de dados, incluindo branded types.
- `@contracts/api` — convenções de modelagem de APIs HTTP (paths, status, envelope de erro).
- `@contracts/firebase-firestore` — convenções de modelagem de coleções e documentos Firestore.
- `@contracts/postgres` — convenções de modelagem de tabelas Postgres.
- `@contracts/events` — convenções de modelagem de eventos de domínio.
- `@architecture/ddd` — bounded contexts e fronteiras semânticas.
- `@stacks/ai/vercel-ai-sdk` — uso de schemas em structured outputs e tools.
- `@stacks/database/postgres` — Drizzle e derivação de schemas via `drizzle-zod`.
- `@practices/sdd` — schema-driven development e geração de OpenAPI.
