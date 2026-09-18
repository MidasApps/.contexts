---
name: hexagonal
description: Use ao aplicar ports-and-adapters para isolar domínio de infraestrutura. Keywords: hexagonal, ports, adapters, clean boundaries.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Hexagonal Architecture (Ports & Adapters)

Isola o **core de domínio** das tecnologias externas (DB, HTTP, fila, UI). Domínio define **ports** (interfaces); infraestrutura provê **adapters** que implementam essas ports.

## Essência
- **Core/domain:** entidades, casos de uso, regras de negócio. Sem dependência de framework/DB.
- **Port (driving):** interface que o mundo usa para entrar no domínio (`CreateOrderUseCase`).
- **Port (driven):** interface que o domínio usa para sair (`OrderRepository`).
- **Adapter (driving):** HTTP controller, CLI, queue consumer — chama port driving.
- **Adapter (driven):** PostgresOrderRepository, S3StorageAdapter — implementa port driven.
- **Dependency inversion:** core depende só de portas. Adapters dependem do core. Composition root liga tudo.
- Testes do domínio rodam **sem** infraestrutura (mocks de port driven).

## Procedimento mínimo
1. Identificar domínio: lógica que mudaria se trocasse DB? Vai em `domain/`.
2. Definir ports: interface em `domain/ports/` para cada I/O externa.
3. Implementar adapter em `infrastructure/<tech>/`.
4. Composition root (`main.ts`/`app.ts`) instancia adapters e injeta no caso de uso.
5. Testar caso de uso com adapter fake/in-memory.

## Anti-patterns
- Caso de uso importando `pg` direto → injetar `OrderRepository`.
- Entidade com `@Column` do ORM → entidade pura; DTO de persistência separado.
- Adapter chamando outro adapter direto → passar pelo caso de uso.

## Mini-exemplo
```ts
// domain/ports/OrderRepository.ts
export interface OrderRepository { save(o: Order): Promise<void>; findById(id: OrderId): Promise<Order | null>; }

// domain/usecases/createOrder.ts
export const createOrder = (deps: { repo: OrderRepository; clock: Clock }) =>
  async (input: CreateOrderInput): Promise<Order> => { /* pure */ };

// infrastructure/postgres/PgOrderRepository.ts implements OrderRepository
// app.ts: createOrder({ repo: new PgOrderRepository(pool), clock: realClock })
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/architecture/hexagonal.md`
