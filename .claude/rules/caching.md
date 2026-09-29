---
paths: ["app/**","src/app/**","src/services/**","src/**/api/**","**/actions.ts","next.config.*"]
---
# Caching — ativa em server/app

Cache é decisão consciente: defina TTL/tag, planeje invalidação, evite stampede. Default conservador; cache só onde mede. Nenhuma rota é cacheada por inferência.

## Princípios
- Camadas: CDN/HTTP (`Cache-Control`) → framework (Next 16 Cache Components) → memória/Redis → DB. Mais perto do usuário = mais cuidado com invalidação.
- Next 16 (`cacheComponents: true`): `'use cache'` + `cacheTag(...)` + `cacheLife(...)` em função/componente. `unstable_cache` só em código sem Cache Components (ver `@.contexts/engineering/stacks/frontend/next@16.md`).
- Invalidação: `updateTag(tag)` em Server Action (read-your-writes); `revalidateTag(tag, "max")` para stale-while-revalidate (a forma de 1 argumento está deprecated); `revalidatePath(path)` só quando a tag não cobre.
- Chave inclui TODOS os inputs que mudam a resposta (tenant, locale, role). Chave incompleta → vazamento entre tenants.
- Stampede: lock/coalescing por chave; nunca N requests recomputando o mesmo valor.
- Negative cache (404, erro) com TTL curto quando a operação é cara.
- Dado privado nunca em CDN compartilhado: `Cache-Control: private` ou `no-store`.

## Checklist (aplicar a todo turn)
- [ ] TTL/tag definido conscientemente para cada cache novo.
- [ ] Mutation correspondente chama `updateTag`/`revalidateTag(tag, "max")`.
- [ ] Tag/chave inclui `tenantId` (e locale/role quando mudam a resposta).
- [ ] Dado privado NÃO em CDN público.
- [ ] Sem `cache: "no-store"` por hábito quando dá pra cachear.

## Anti-patterns
- Cache infinito sem invalidação → bug que aparece depois.
- Chave só com `id` em multi-tenant → vazamento.
- Revalidar tudo (`revalidatePath("/")`) em vez de uma tag → custo + cache miss massivo.

## Mini-exemplo
```ts
// src/views/order/api/get-cached-order.ts — cache na borda; o use case não conhece next/cache
import { cacheLife, cacheTag } from "next/cache";
import { getOrder } from "@/services/orders/composition";

export const getCachedOrder = async (tenantId: TenantId, orderId: OrderId) => {
  "use cache"; // args serializáveis viram a chave: tenantId entra nela
  cacheTag(`tenant:${tenantId}:order:${orderId}`);
  cacheLife("hours");
  return getOrder({ tenantId, orderId });
};

// Server Action após a mutation:
updateTag(`tenant:${tenantId}:order:${orderId}`);
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/caching.md`
