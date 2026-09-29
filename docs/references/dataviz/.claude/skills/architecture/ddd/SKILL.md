---
name: ddd
description: Use ao modelar domínio com agregados, entidades, value objects, bounded contexts. Keywords: DDD, domain-driven, aggregate, bounded context.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Domain-Driven Design (DDD)

Modelar software a partir do **domínio do negócio**, usando linguagem ubíqua compartilhada com especialistas. Estratégico (bounded contexts, context map) e tático (entidades, VOs, agregados, repositórios).

## Essência
- **Linguagem ubíqua:** termo do código = termo do negócio. Sem traduções mentais.
- **Bounded context:** fronteira onde um modelo tem um significado consistente. Mesmo nome (`Order`) pode ter shape diferente em contexts diferentes.
- **Entity:** identidade estável ao longo do tempo (`Order` com `OrderId`).
- **Value Object:** definido por valor, imutável, sem identidade (`Money`, `Address`).
- **Aggregate:** cluster de entidades + VOs com **root**. Consistência transacional vive na boundary do aggregate. Referência entre aggregates é por ID.
- **Repository:** uma per aggregate root. Devolve aggregate completo.
- **Domain event:** algo relevante que aconteceu (`OrderPlaced`). Acopla contexts via mensageria.
- **Anti-corruption layer (ACL):** traduz modelo externo no seu — protege seu contexto.

## Procedimento mínimo
1. Conversar com especialista; mapear termos em **glossário ubíquo**.
2. Identificar bounded contexts; desenhar **context map** (relações: shared kernel, customer-supplier, ACL).
3. Em cada context, modelar aggregates: raiz + invariantes que devem ser mantidas juntas.
4. VOs para conceitos sem identidade (Money, Email, DateRange).
5. Repository por aggregate root. Eventos para comunicar mudanças relevantes.

## Anti-patterns
- Aggregate gigante "User" que sabe tudo → quebrar por context (BillingUser, AuthUser).
- Entidade anêmica (só getters/setters, lógica em service) → mover comportamento pra entidade.
- Referência por objeto entre aggregates → usar ID.
- Compartilhar modelo entre contexts sem ACL → vazamento de modelo.

## Mini-exemplo
```ts
class Money { constructor(readonly cents: number, readonly currency: Currency) {} add(o: Money){ /*...*/ } }
class Order { // aggregate root
  private constructor(readonly id: OrderId, private items: OrderItem[], private status: OrderStatus){}
  static place(input: PlaceOrderInput): { order: Order; events: OrderPlaced[] } { /* invariants */ }
  ship(): OrderShipped { if (this.status !== "paid") throw new InvalidTransition(); /*...*/ }
}
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/architecture/ddd.md`
