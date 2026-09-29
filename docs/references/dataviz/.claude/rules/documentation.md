---
paths: ["**/*.ts","**/*.tsx"]
---
# Documentation — ativa em TypeScript

Documenta exports públicos (API surface) com JSDoc, mantém README de feature/módulo, exemplos executáveis. Não documenta o óbvio.

## Princípios
- JSDoc obrigatório em export público (função, classe, tipo) que cruza módulo/pacote.
- `@param`, `@returns`, `@throws`, `@example` quando aplicável. Não duplicar tipo já no TS.
- README por feature/módulo quando tem mais de 3-4 arquivos: propósito, entrypoints, exemplos.
- Exemplos em JSDoc/README devem compilar e refletir API atual.
- Comentários inline explicam **por quê**, não **o quê**.
- Sem comentário "zumbi" (comentado-out, TODO antigo, ASCII art).
- Doc de decisão (trade-off, alternativa rejeitada) vai em ADR (skill `decisions`), não em comentário longo.

## Checklist (aplicar a todo turn)
- [ ] Export público novo tem JSDoc com 1-line summary + `@param`/`@returns` quando útil.
- [ ] README de feature atualizado se entrypoint mudou.
- [ ] Sem comentários `// foo` redundantes com nome de função.
- [ ] Exemplos no doc batem com a API atual.
- [ ] Decisão importante referencia ADR.

## Anti-patterns
- `/** Gets the user */ function getUser()` → comentário sem informação extra; remover ou enriquecer.
- README do módulo defasado com nome de função antigo → atualizar ou apagar.
- TODO de 2 anos sem owner → resolver ou converter em issue.

## Mini-exemplo
```ts
/**
 * Charges a customer using the saved default payment method.
 * Idempotent when `idempotencyKey` is provided.
 *
 * @throws {InsufficientFundsError} when the card is declined for funds.
 * @example
 *   await chargeCustomer({ customerId, amountCents: 1990, idempotencyKey: "ord_123" });
 */
export async function chargeCustomer(args: ChargeArgs): Promise<Charge> { ... }
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/documentation.md`
