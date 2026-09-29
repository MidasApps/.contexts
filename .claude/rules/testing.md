# Testing — regra sempre-ativa

Cobre comportamento, não implementação. Troféu: integração primeiro, unit para lógica pura, poucos e2e. Feedback rápido, sem flakiness, sem interdependência.

## Princípios
- Troféu: **integration** (maior fatia; DB/HTTP local, fakes em memória para ports) + **unit** (lógica pura, ms) + poucos **e2e** (browser/fluxo real, em `e2e/`, `.spec.ts`). Testes colocados: `foo.test.ts` ao lado do código.
- AAA: **A**rrange → **A**ct → **A**ssert. Um conceito por teste.
- Nome descreve comportamento: `it("returns 404 when order not found")`, não `it("test1")`.
- Testa via interface pública (output, side effect observável) — não acessa private/mock interno.
- Ports driven → **fakes em memória**; integração com banco real efêmero (emulator/container), nunca query mockada. Mock só para boundary que não pode ser chamada (e-mail, gateway de pagamento). Nunca mock do próprio código sob teste.
- Determinístico: sem `Date.now()`, sem `Math.random()`, sem ordem dependente — injete clock/uuid.
- Cada teste é independente: pode rodar isolado e em qualquer ordem. Sem `beforeAll` que vaza estado.
- Falha de teste descreve o problema; sem assertion de "valor X = X".

## Checklist (aplicar a todo turn)
- [ ] Teste novo para comportamento novo / regressão de bug.
- [ ] Nome descreve "o que faz" — leitura em inglês claro.
- [ ] Sem `expect(spy).toHaveBeenCalled()` quando dá pra assertar resultado.
- [ ] Sem `await sleep(...)` para esperar async → usar `waitFor`/polling determinístico.
- [ ] Dados de teste por factory (nada de `__fixtures__/` compartilhado e mutável); nada de `__tests__/` ou `tests/` espelhado.
- [ ] CI roda dentro do orçamento; unit em < 1s.

## Anti-patterns
- Snapshot gigante que ninguém lê → assertar campos relevantes.
- `it.skip` deixado no main → remover ou consertar.
- Testar getter/setter trivial → não testa nada.
- Mock de tudo → teste só verifica si mesmo.

## Mini-exemplo
```ts
// src/services/orders/application/use-cases/place-order.test.ts
it("rejects an order without items", async () => {
  const placeOrder = makePlaceOrder({ orders: makeInMemoryOrderRepository(), clock: fixedClock("2026-01-01T00:00:00Z") });
  const result = await placeOrder(buildPlaceOrderInput({ items: [] }));
  expect(result).toMatchObject({ ok: false, error: { code: "ORDER_WITHOUT_ITEMS" } });
});
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/testing.md`
