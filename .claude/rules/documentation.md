---
paths: ["**/*.ts","**/*.tsx"]
---
# Documentation — ativa em TypeScript

Documenta o PORQUÊ: TSDoc em exports consumidos por outros módulos, README em pacote publicável/app executável, ADR para decisão com alternativas. Não documenta o óbvio.

## Princípios
- TSDoc em export (função, classe, tipo) consumido por outro módulo/pacote; nunca em função privada de módulo.
- `@param`, `@returns`, `@throws`, `@example` quando aplicável. Não duplicar tipo já no TS.
- README na raiz de cada pacote publicável e app executável (propósito, pré-requisitos, comandos runnable); nunca em pasta que só agrupa arquivos (`utils/`, `helpers/`).
- Exemplos em TSDoc/README devem compilar e refletir API atual; `@example` em utilitário genérico reutilizado.
- Comentários inline explicam **por quê**, não **o quê**.
- Sem comentário "zumbi" (comentado-out, TODO antigo, ASCII art).
- Doc de decisão (trade-off, alternativa rejeitada) vai em ADR (`.contexts/engineering/decisions/`, skill `decisions`); o código referencia `// see ADR NNNN`. ADR aceito não é editado: novo ADR supersede.

## Checklist (aplicar a todo turn)
- [ ] Export público novo tem TSDoc com 1-line summary + `@param`/`@returns`/`@throws` quando útil.
- [ ] README do pacote/app atualizado se comando ou entrypoint mudou.
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
 *   await chargeCustomer({ customerId, amountMinor: 1990, currency: "BRL", idempotencyKey: "01J8Z3K4M5N6P7Q8R9S0T1V2W3" });
 */
export const chargeCustomer = async (args: ChargeArgs): Promise<Charge> => { ... };
```

---
**Detalhes específicos deste projeto:** `@.contexts/engineering/rules/documentation.md`
