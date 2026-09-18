---
paths: ["app/**","src/server/**","**/*.action.ts"]
---
# Caching — ativa em server/app

Cache é decisão consciente: defina TTL/tag, planeje invalidação, evite stampede. Default conservador; cache só onde mede.

## Princípios
- Camadas: CDN/edge → framework (Next data cache, `unstable_cache`) → app memory (LRU) → DB. Mais perto do user = mais cuidado com invalidação.
- Em Next 16: `fetch()` com `cache: "force-cache"` + `next: { tags: [...] }`; `unstable_cache(fn, key, { tags, revalidate })` para funções não-fetch.
- Invalidação por tag: `revalidateTag("user:123")` após mutation.
- TanStack Query (client): `staleTime` define quando vira "stale"; `gcTime` quando sai da memória.
- Cache key inclui TODOS os inputs (tenant, locale, role). Cache key incompleto → vazamento entre usuários.
- Stampede: use `unstable_cache` ou lock por chave; nunca N requests simultâneas recomputando o mesmo.
- Negative cache (404, erro) com TTL curto se a operação é cara.
- Sem cache de dado sensível em CDN/edge sem `Cache-Control: private` ou auth check.

## Checklist (aplicar a todo turn)
- [ ] TTL/tag definido conscientemente para cada cache novo.
- [ ] Mutation correspondente chama `revalidateTag`/`invalidateQueries`.
- [ ] Cache key inclui dimensão de tenant/locale/role.
- [ ] Dado privado NÃO em CDN público.
- [ ] Sem `cache: "no-store"` por hábito quando dá pra cachear.

## Anti-patterns
- Cache infinito sem invalidação → bug que aparece depois.
- Cache key só com `id` quando há multi-tenant → vazamento.
- `useQuery` sem `staleTime` em dado quase-estático → refetch desnecessário.
- Revalidar TUDO em vez de uma tag → custo + cache miss massivo.

## Mini-exemplo
```ts
const getUser = unstable_cache(
  async (id: UserId) => db.users.find(id),
  ["user"],
  { tags: (id) => [`user:${id}`], revalidate: 3600 }
);
// após update:
revalidateTag(`user:${id}`);
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/caching.md`
