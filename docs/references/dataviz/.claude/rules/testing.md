# Testing — regra sempre-ativa

Cobre comportamento, não implementação. Pirâmide: muitos unit, alguns integration, poucos e2e. Feedback rápido, sem flakiness, sem interdependência.

## Princípios
- Pirâmide: **unit** (puro, ms) → **integration** (DB/HTTP local) → **e2e** (browser/fluxo real). Inverter custa caro.
- AAA: **A**rrange → **A**ct → **A**ssert. Um conceito por teste.
- Nome descreve comportamento: `it("returns 404 when order not found")`, não `it("test1")`.
- Testa via interface pública (output, side effect observável) — não acessa private/mock interno.
- Mock só **boundaries externas** (HTTP, DB quando lento, clock, random). Nunca mock do próprio código sob teste.
- Determinístico: sem `Date.now()`, sem `Math.random()`, sem ordem dependente — injete clock/uuid.
- Cada teste é independente: pode rodar isolado e em qualquer ordem. Sem `beforeAll` que vaza estado.
- Falha de teste descreve o problema; sem assertion de "valor X = X".

## Checklist (aplicar a todo turn)
- [ ] Teste novo para comportamento novo / regressão de bug.
- [ ] Nome descreve "o que faz" — leitura em inglês claro.
- [ ] Sem `expect(spy).toHaveBeenCalled()` quando dá pra assertar resultado.
- [ ] Sem `await sleep(...)` para esperar async → usar `waitFor`/polling determinístico.
- [ ] Fixtures isoladas por teste (factory > shared fixture mutável).
- [ ] CI roda dentro do orçamento; unit em < 1s.

## Anti-patterns
- Snapshot gigante que ninguém lê → assertar campos relevantes.
- `it.skip` deixado no main → remover ou consertar.
- Testar getter/setter trivial → não testa nada.
- Mock de tudo → teste só verifica si mesmo.

## Mini-exemplo
```ts
it("rejects order with empty items", async () => {
  const res = await createOrder({ tenantId: t, items: [] });
  expect(res).toEqual({ ok: false, code: "INVALID_INPUT" });
});
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/testing.md`
