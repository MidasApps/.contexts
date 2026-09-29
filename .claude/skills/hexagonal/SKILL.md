---
name: hexagonal
description: "Use ao aplicar ports-and-adapters para isolar domínio de infraestrutura. Keywords: hexagonal, ports, adapters, clean boundaries."
---
# Hexagonal Architecture (Ports & Adapters)

Isola o **core de domínio** das tecnologias externas (DB, HTTP, fila, UI). Domínio define **ports** (interfaces); infraestrutura provê **adapters** que implementam essas ports.

## Essência
- **Core/domain:** entidades, casos de uso, regras de negócio. Sem dependência de framework/DB.
- **Port (driving):** `type` que o mundo usa para entrar no domínio (`CreateOrderUseCase`).
- **Port (driven):** `type` que o domínio usa para sair (`OrderRepository`).
- **Adapter (driving):** HTTP controller, CLI, queue consumer — chama port driving.
- **Adapter (driven):** postgresOrderRepository, s3StorageAdapter — implementa port driven.
- **Dependency inversion:** core depende só de portas. Adapters dependem do core. Composition root liga tudo.
- Testes do domínio rodam **sem** infraestrutura (fakes em memória de port driven).

## Procedimento mínimo
1. Identificar domínio: lógica que mudaria se trocasse DB? Vai em `src/services/<context>/domain/` (árvore de referência: `@.contexts/engineering/architecture/feature-based.md`).
2. Definir ports (`type`) em `application/ports/{driving,driven}/` para cada I/O externa.
3. Implementar adapter em `adapters/{driving,driven}/`; `src/app/v1/<resource>/route.ts` só re-exporta o driving adapter.
4. Composition root (`composition.ts` do contexto) instancia adapters e injeta no caso de uso.
5. Testar caso de uso com adapter fake/in-memory.

## Anti-patterns
- Caso de uso importando `pg` direto → injetar `OrderRepository`.
- Entidade com `@Column` do ORM → entidade pura; DTO de persistência separado.
- Adapter chamando outro adapter direto → passar pelo caso de uso.

## Mini-exemplo
```ts
// application/ports/driven/order-repository.ts
export type OrderRepository = { save(o: Order): Promise<void>; findById(id: OrderId): Promise<Order | null> };

// application/use-cases/create-order.ts
export const makeCreateOrder = (deps: { repo: OrderRepository; clock: Clock }) =>
  async (input: CreateOrderInput): Promise<Order> => { /* pure */ };

// adapters/driven/postgres-order-repository.ts: export const postgresOrderRepository: OrderRepository = { ... }
// composition.ts: export const createOrder = makeCreateOrder({ repo: postgresOrderRepository, clock: realClock })
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/architecture/hexagonal.md`
