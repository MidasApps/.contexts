---
name: bdd
description: Use ao escrever specs em given-when-then (Cucumber, Gherkin). Keywords: BDD, given when then, behavior, gherkin.
allowed-tools: Read, Edit, Write, Grep, Glob, Bash
---
# Behavior-Driven Development (BDD)

Especifica comportamento em linguagem natural (Gherkin: **Given/When/Then**) compartilhada entre dev, QA e produto. Cada cenário vira teste executável.

## Essência
- **Feature → Scenario → Given/When/Then.** `Given` = contexto; `When` = ação; `Then` = resultado observável.
- Escrito do ponto de vista do usuário, em domínio de negócio — sem detalhes de UI/HTTP.
- **Step definitions** mapeiam frases para código (Cucumber, Playwright BDD, vitest-cucumber).
- **Examples table** (`Scenario Outline`) para variações da mesma regra.
- Cenários são independentes — sem ordem.
- BDD complementa TDD: TDD guia design interno, BDD descreve comportamento externo.

## Procedimento mínimo
1. Conversar com PM/QA; escrever cenários em `.feature` antes de implementar.
2. Cada cenário = um Scenario único e auto-explicativo.
3. Implementar step definitions (`Given("user is logged in", ...)`).
4. Rodar; cenários pendentes → implementar feature até passarem.
5. Manter `.feature` versionado — vira documentação viva.

## Anti-patterns
- Cenário com detalhe de UI (`When user clicks #submit-btn`) → falar em ação (`When user submits the form`).
- `Given` enorme reconstruindo todo o sistema → usar fixtures/factories.
- Step duplicado com fraseado diferente → consolidar.

## Mini-exemplo
```gherkin
Feature: Cart checkout
  Scenario: Discount applied for first purchase
    Given a new customer with an empty cart
    And the cart has 2 items totaling 100 BRL
    When the customer checks out
    Then a 10% first-purchase discount is applied
    And the final total is 90 BRL
```

---
**Detalhes/convenções específicas do projeto:** `@.contexts/engineering/practices/bdd.md`
