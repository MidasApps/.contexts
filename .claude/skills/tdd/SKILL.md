---
name: tdd
description: "Use ao praticar test-driven development (red-green-refactor). Keywords: TDD, test first, red green refactor."
---
# Test-Driven Development (TDD)

Ciclo curto **red → green → refactor**: escreva o teste que falha, faça passar com o mínimo de código, refatore com confiança. Carregue ao iniciar feature nova com requisitos claros.

## Essência
- **Red:** escreva um teste que captura UM comportamento desejado; rode → falha (ainda não implementado).
- **Green:** escreva o código mais simples possível que faça passar. Sem polish.
- **Refactor:** com testes verdes, melhore design (extrair, renomear, remover duplicação). Rodar testes a cada mudança.
- Ciclos curtos: minutos, não horas. Se travou > 10 min sem passar, reduza o escopo do teste.
- Escolas: classical (state-based) vs mockist/London (interaction-based). **Default do projeto: classical**, com fakes em memória nos ports driven, assertando resultado e não chamadas; mockist só quando a interação é o próprio resultado.
- Teste é especificação executável — escrito do ponto de vista do consumidor da API.

## Procedimento mínimo
1. Definir próximo comportamento pequeno e observável.
2. Escrever teste colocado ao lado do código (`foo.test.ts`; `.spec.ts` só e2e em `e2e/`); rodar → red.
3. Implementar mínimo para passar; rodar → green.
4. Refatorar produção E teste; rodar → ainda green.
5. Repetir até a feature estar completa.

## Anti-patterns
- Escrever todos os testes antes de qualquer código → não é TDD, é test-first-batch.
- Pular refactor → débito acumula, testes ficam acoplados a implementação.
- Mockar tudo → teste verifica mocks, não comportamento.
- Teste que testa implementação (private method) → testar via interface pública.

## Mini-exemplo
```ts
// 1) red
it("returns total for cart with 2 items", () => {
  expect(cartTotalMinor([{ priceMinor: 1000, quantity: 2 }, { priceMinor: 500, quantity: 1 }])).toBe(2500);
});
// 2) green (mínimo)
export const cartTotalMinor = (items: CartItem[]) => items.reduce((sum, i) => sum + i.priceMinor * i.quantity, 0);
// 3) refactor: extrair, renomear se necessário
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/practices/tdd.md`
