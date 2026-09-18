# Behavior-Driven Development (BDD)

> Disciplina colaborativa de desenvolvimento em que software é construído a partir de exemplos concretos de comportamento de negócio, descobertos em conversa entre as pessoas que querem o sistema, as que vão construí-lo e as que vão testá-lo. Os exemplos são formulados em linguagem ubíqua compartilhada e, quando úteis, automatizados como testes executáveis que vivem como documentação sempre verificada.

BDD não é uma sintaxe (Gherkin) nem uma ferramenta (Cucumber). É uma prática de conversa estruturada cujo subproduto observável são cenários executáveis. Confundir BDD com "escrever Given-When-Then" colapsa a disciplina em teatro de tooling — é o erro mais comum sobre a prática.

Este documento descreve o BDD formulado por Dan North em "Introducing BDD" (2006), refinado por Liz Keogh nas decadas seguintes, expandido por Gojko Adzic em *Specification by Example* (2011) e formalizado em ferramenta por Matt Wynne e Aslak Hellesøy em *The Cucumber Book* (2012).

---

## Origem: BDD como reframing de TDD

Dan North propôs BDD após anos ensinando TDD (@practices/tdd) e observando padrões recorrentes de confusão pedagógica entre desenvolvedores novos à prática:

- "Por onde começar?" — desenvolvedores não sabiam que primeiro teste escrever.
- "O que testar?" — confundiam testar implementação com testar comportamento.
- "Como nomear o teste?" — nomes como `testCalculate` ou `testUserService` não comunicavam nada.
- "Quando parei?" — não sabiam quando a feature estava completa.

A intuição central de North: **substituir a palavra "test" por "should"** ("nomear comportamentos, não testes") forçava o desenvolvedor a articular *o que o sistema deveria fazer*, não *qual unidade exercitar*. O reframing parecia cosmético mas reorientava toda a prática: o ponto de partida deixava de ser uma classe e passava a ser um comportamento desejado por alguém.

BDD herda integralmente o ciclo de feedback curto de TDD. A diferença está na linguagem em que os exemplos são formulados e no público da conversa que os produz.

---

## Os três níveis de BDD

A prática moderna, sintetizada por Liz Keogh e Matt Wynne, organiza-se em três níveis sequenciais. Pular qualquer nível degrada o resto.

### 1. Discovery — a conversa dos três amigos

O artefato primário de BDD não é um teste, é uma conversa. O ritual canônico é o **three amigos meeting**, reunindo três perspectivas:

- **Business / Product** — sabe *o que* se quer e *por quê*.
- **Development** — sabe *como* construir e *o que custa*.
- **Test / QA** — sabe *como pode falhar* e *o que verificar*.

A conversa explora exemplos concretos: "me dá um caso onde isso acontece", "e se for zero?", "e se o usuário não tiver permissão?". Os exemplos expõem regras de negócio que ninguém tinha articulado, ambiguidades em requisitos e edge cases invisíveis no texto da história.

A técnica formalizada de Matt Wynne para esta conversa é o **Example Mapping**:

- **Story** (amarelo) — a história de usuário sob discussão.
- **Rules** (azul) — regras de negócio que governam a história.
- **Examples** (verde) — exemplos concretos que ilustram cada regra.
- **Questions** (vermelho) — perguntas não respondidas durante a sessão.

Uma sessão saudável termina com regras claras, exemplos suficientes por regra e perguntas registradas para resolução assíncrona. Uma história com muitas perguntas vermelhas não está pronta para entrar em sprint.

### 2. Formulation — exemplos viram especificação

Os exemplos descobertos são reescritos em linguagem ubíqua (@architecture/ddd) compartilhada entre business, dev e QA. A escrita aqui é deliberada: nomes de conceitos, ações e estados devem refletir o vocabulário do bounded context, não a estrutura interna do código.

Gherkin (Given-When-Then) é a notação convencional, mas opcional. O ponto é a linguagem ubíqua estruturada, não a sintaxe específica.

Formato canônico:

```gherkin
Feature: Aprovação de pedido acima do limite

  Como gerente comercial
  Quero aprovar pedidos acima do limite do vendedor
  Para garantir margem mínima em vendas de grande valor

  Background:
    Given existe uma política de margem mínima de 10%

  Scenario: Pedido dentro do limite do vendedor aprovado automaticamente
    Given o vendedor "Ana" tem limite de R$ 50.000
    When ela registra um pedido de R$ 30.000 com margem de 15%
    Then o pedido fica com status "aprovado"

  Scenario Outline: Pedidos acima do limite exigem aprovação gerencial
    Given o vendedor tem limite de <limite>
    When ele registra um pedido de <valor> com margem de <margem>%
    Then o pedido fica com status "<status>"

    Examples:
      | limite      | valor       | margem | status                |
      | R$ 50.000   | R$ 80.000   | 12     | aguardando aprovação  |
      | R$ 50.000   | R$ 80.000   | 8      | rejeitado             |
```

Elementos da gramática Gherkin:

- **Feature** — nome do comportamento de negócio agrupado, com narrativa opcional em formato "Como/Quero/Para".
- **Scenario** — um exemplo concreto.
- **Given** — contexto pré-existente, sem ação do usuário.
- **When** — a ação específica cujo efeito está sendo verificado. **Um único** When por cenário é o ideal.
- **Then** — o resultado observável esperado.
- **And / But** — continuação de Given/When/Then, sem mudar o passo.
- **Background** — Given comum a todos os cenários da feature.
- **Scenario Outline + Examples** — cenário parametrizado por uma tabela de exemplos.
- **Tags** (`@smoke`, `@regression`, `@wip`) — metadados para filtragem de execução.

### 3. Automation — exemplos viram testes vivos

Os cenários formulados são conectados a código (glue code, step definitions) que os executa contra o sistema real. A automação não é o produto — é o que mantém a especificação honesta. Cenários não automatizados envelhecem em silêncio; cenários automatizados quebram quando o sistema diverge.

A regra prática: **se o cenário não pode ser automatizado, talvez ele não tenha sido formulado em linguagem comportamental** — esteja descrevendo implementação, UI ou processo interno.

---

## Regras de escrita do Gherkin

A diferença entre Gherkin útil e Gherkin que vira passivo de manutenção mora na disciplina de escrita.

### Declarativo, não imperativo

**Errado (imperativo, acoplado à UI):**

```gherkin
When I click on the "Login" button
And I type "ana@empresa.com" in the email field
And I type "senha123" in the password field
And I click on "Submit"
Then I see the dashboard page
```

**Certo (declarativo, comportamental):**

```gherkin
When Ana logs in with valid credentials
Then she sees her dashboard
```

O imperativo registra como clicar; o declarativo registra o que aconteceu. UI muda; comportamento de negócio sobrevive.

### Linguagem ubíqua, não jargão técnico

`Given um JWT válido no header Authorization` é Gherkin contaminado. `Given Ana está autenticada` é Gherkin de negócio. A camada de step definitions absorve a tradução.

### Um When por cenário

Múltiplos Whens indicam que o cenário está testando uma sequência ao invés de um comportamento. Quebre em cenários separados ou converta o primeiro When em Given.

### Cenários atômicos e independentes

Cada cenário precisa rodar isoladamente. Dependência implícita entre cenários (cenário B só funciona se A rodou antes) inviabiliza paralelização e debugging.

### Reserve Gherkin para comportamento de negócio

Validação de input trivial, comportamento técnico de baixo nível, formatação de campos — nada disso merece Gherkin. Vai em teste unitário direto (@practices/tdd). Gherkin é caro: cada cenário consome conversa, formulação e glue code.

---

## BDD e DDD: linguagem ubíqua como ponte

BDD e Domain-Driven Design se reforçam estruturalmente (@architecture/ddd). A linguagem ubíqua de um bounded context é exatamente o vocabulário que os cenários BDD precisam usar para serem entendidos por business. Cenários expõem regras de domínio que muitas vezes não aparecem no código até que alguém pergunte "e se?".

Em projetos com múltiplos bounded contexts, cada contexto pode ter sua própria suíte de features, escritas no vocabulário daquele contexto. Cruzamento entre contextos vira cenário de integração entre contextos, explicitando o anti-corruption layer.

---

## Outside-In: a filosofia complementar

BDD adota naturalmente o estilo outside-in: começar pelo cenário de aceitação que descreve a jornada do usuário, descer até as unidades necessárias para satisfazer aquele cenário. O ciclo macro de BDD envolve um ciclo micro de TDD por dentro:

1. Escreve-se o cenário de aceitação (Gherkin). Falha (vermelho macro).
2. Para fazer o cenário passar, identifica-se a primeira unidade necessária.
3. Aplica-se TDD mockist (@practices/tdd) sobre essa unidade até o ciclo micro fechar.
4. Volta-se ao cenário de aceitação. Ainda vermelho? Identifica-se a próxima unidade. Repete.
5. Quando o cenário fica verde, a feature está pronta.

Este loop duplo é o que Freeman & Pryce formalizaram em *Growing Object-Oriented Software, Guided by Tests* sem usar o nome BDD — a coincidência metodológica entre BDD e mockist TDD é direta.

---

## Specification by Example

Gojko Adzic, em *Specification by Example* (2011), generalizou BDD além de Gherkin e Cucumber. As cinco práticas-chave do livro:

1. **Derive scope from goals** — exemplos saem de objetivos de negócio, não de uma lista pronta de features.
2. **Specify collaboratively** — discovery em equipe cross-functional, não escrita solo por um analista.
3. **Illustrate using examples** — exemplos concretos substituem requisitos abstratos.
4. **Refine the specification** — exemplos viram especificação enxuta em linguagem ubíqua.
5. **Automate validation without changing specifications** — automação preserva o texto, adicionando uma camada de glue.

Living documentation: a especificação executável que sempre reflete o sistema real, porque CI a verifica a cada build. Documentação que mente é pior que ausente; living documentation não pode mentir sem quebrar o build.

---

## Quando aplicar BDD

BDD entrega ROI quando *todas* as condições abaixo são verdadeiras:

- **Produto com regras de negócio significativas** — pricing, eligibility, workflow de aprovação, cálculos regulatórios. Onde a regra é o produto.
- **Stakeholders de negócio engajados e disponíveis** — PM, domain experts, business analysts efetivamente comparecem às sessões de discovery. Sem eles, BDD vira teatro Gherkin escrito por desenvolvedores.
- **Time cross-functional** — dev e QA na mesma sala (ou call) com business. Não funciona com QA terceirizado downstream.
- **Linguagem ubíqua emergindo** — o domínio tem vocabulário suficientemente rico para sustentar cenários comportamentais. Vide @architecture/ddd.

## Quando NÃO aplicar BDD

A disciplina é cara em coordenação. Há contextos onde gera fricção sem retorno:

- **CRUD trivial** sem regras de negócio. Cenários viram `Given um usuário / When eu deleto / Then o usuário não existe mais` — overhead puro.
- **Equipe sem stakeholder de negócio engajado.** Sem o "amigo" business, a conversa colapsa e o Gherkin vira pseudo-código mal escrito.
- **Bibliotecas e infraestrutura sem domínio rico.** Frameworks internos, adapters de banco, clients HTTP — TDD direto serve melhor.
- **Spikes e protótipos.** Sem requisitos estáveis, formular cenários é prematuro.
- **Time pequeno onde dev e PM são a mesma pessoa.** A conversa dos três amigos pressupõe perspectivas distintas; sem elas, o ritual perde força.

A heurística: se você consegue articular o cenário sozinho sem precisar perguntar nada a ninguém, BDD provavelmente não vai pagar o custo. Use TDD.

---

## Trade-offs honestos

BDD tem custos reais que precisam ser registrados, não escondidos:

- **Glue code de manutenção.** Cada Given/When/Then precisa de uma step definition. Refactor de domínio costuma propagar para o glue.
- **Sincronização de vocabulário.** Quando o domínio renomeia um conceito, Gherkin precisa acompanhar — ou diverge silenciosamente.
- **Fragilidade quando cenários acoplam UI.** Cenários imperativos contra UI quebram a cada mudança visual. Esta é a causa mais comum de abandono de BDD em produto — e quase sempre evitável escrevendo declarativo.
- **Custo de coordenação das sessões.** Three amigos meeting custa tempo de três pessoas. Histórias triviais não justificam o custo.
- **Tooling Gherkin/Cucumber adiciona uma camada.** Outra DSL, outro runner, outro relatório. Em times pequenos sem audiência não-técnica, vale considerar BDD-style com Vitest puro (descreve `Feature` / `Scenario` em `describe`/`it`) sem o overhead.

---

## Prática concreta no stack do projeto

### Cenários de aceitação como E2E em Playwright

Para fluxos de negócio cross-feature que tocam UI real, escreva o Feature em Gherkin e automatize com `@cucumber/cucumber` + Playwright (@stacks/testing/playwright). Glue code traduz steps declarativos em interações de página via Page Objects.

```ts
// features/order-approval.feature → step definitions
Given("o vendedor {string} tem limite de {money}", async (name, limit) => {
  await seedSeller({ name, limit });
});

When("ele registra um pedido de {money} com margem de {int}%", async (value, margin) => {
  await ordersPage.createOrder({ value, margin });
});

Then("o pedido fica com status {string}", async (status) => {
  await expect(ordersPage.lastOrderStatus()).toHaveText(status);
});
```

### Cenários de domínio como integration tests em Vitest

Para regras de negócio puras ou orquestrações sem UI, o mesmo cenário pode rodar em Vitest (@stacks/testing/vitest) contra a application layer diretamente, com Firebase Emulator Suite (@stacks/database/firebase-firestore) ou testcontainers Postgres (@stacks/database/postgres) como infraestrutura. Mais rápido, mais estável, ainda válido como living documentation.

### BDD-style sem Cucumber

Quando o público dos cenários é exclusivamente técnico, `describe`/`it` do Vitest emula Gherkin sem o custo do framework dedicado:

```ts
describe("Feature: Aprovação de pedido acima do limite", () => {
  describe("Scenario: Pedido dentro do limite aprovado automaticamente", () => {
    it("given vendedor com limite, when registra dentro do limite, then aprovado", async () => {
      // ...
    });
  });
});
```

Esta forma preserva a disciplina de pensar em comportamentos sem pagar o overhead de Gherkin. Reserve Cucumber para quando há audiência não-técnica lendo os cenários.

### Distribuição na pirâmide de testes

- **Topo (poucos cenários E2E)** — fluxos críticos cross-feature, jornadas de aceitação. Gherkin + Playwright.
- **Meio (cenários de integração)** — regras de negócio contra adapters reais (emulators, testcontainers). Gherkin ou BDD-style em Vitest.
- **Base (unidades)** — TDD clássico/mockist sem Gherkin. Veja `@practices/tdd`.

---

## Anti-patterns

Práticas que se vestem de BDD sem sê-lo:

- **"BDD = Gherkin".** Escrever Gherkin sem a conversa dos três amigos. Vira cosmético sobre TDD comum, sem o ganho de descoberta.
- **Cenários imperativos passo-a-passo via UI.** "Clico aqui, digito ali, espero por isso". Quebra a cada redesign e não comunica regra de negócio.
- **Cenários escritos sem stakeholder.** Desenvolvedor escreve sozinho o que acha que é a regra. O artefato perde o propósito — capturar o entendimento comum.
- **Given monstro com setup técnico.** `Given um JWT assinado com RS256 contendo claim X e cookie de sessão Y...` — isto é orquestração técnica, não contexto de negócio. Esconda no glue code.
- **Testar implementação no When.** `When o repositório chama save com o objeto X` — é mockist TDD travestido, sem valor de negócio.
- **Specs que viram regression-only.** Cenários nunca mais lidos, nunca mais atualizados, executados em CI apenas para virar verde. Perdeu-se a documentação viva — virou massa morta executável.
- **Glue code com lógica de negócio.** Step definitions que computam, ramificam, decidem. A lógica precisa estar no sistema; o glue só traduz.
- **Tags `@skip`/`@wip` esquecidas.** Cenários desabilitados acumulando indicam disciplina degradada.

---

## Critérios de saúde da prática

Sinais de que BDD está saudável no time:

- Sessões de discovery acontecem antes do desenvolvimento começar, com PM/business presentes.
- Example Maps acumulam regras claras e poucas perguntas vermelhas ao final.
- Cenários escritos em linguagem que um stakeholder de negócio lê sem tradução.
- Refactor de UI não quebra cenários (sinal de cenários declarativos).
- Cenários servem como referência viva durante discussões de produto.
- Cobertura de cenários cresce com features de negócio, não com cobertura técnica.

Sinais de degradação:

- Gherkin escrito por dev solo na hora de implementar.
- Steps cada vez mais imperativos e cheios de detalhes de UI.
- Cenários com tags `@skip` acumulando.
- PM/business nunca mais leu um cenário desde a última sprint review.
- Glue code virou o triplo do tamanho da feature.
- "Vamos parar com Cucumber" virou pauta recorrente sem ação.

---

## Diferenciação rápida

- **TDD** (@practices/tdd) — disciplina técnica de design conduzido por testes, unidades pequenas, ciclo Red-Green-Refactor em linguagem de programação. Audiência: desenvolvedor.
- **BDD** (este documento) — disciplina colaborativa de descoberta de comportamento de negócio, cenários em linguagem ubíqua compartilhada. Audiência: business + dev + QA.
- **SDD** (@practices/sdd) — disciplina centrada em especificação executável como artefato de design upfront, com ênfase em contratos formais e geração derivada. Audiência: arquitetos e desenvolvedores; o ponto de partida é a spec, não a conversa.
- **Clean Code** (@practices/clean-code) — princípios de qualidade aplicáveis com ou sem BDD.

BDD e TDD coabitam: BDD molda os cenários de aceitação no topo da pirâmide; TDD molda as unidades que fazem cada cenário passar. BDD e SDD se sobrepõem em "specs executáveis", mas divergem na ênfase: BDD parte da conversa, SDD parte da spec formal como entregável de design.

---

## Referências canônicas

- Dan North — *Introducing BDD* (dannorth.net/introducing-bdd/, 2006). O artigo fundador.
- Liz Keogh — *Behaviour-Driven Development* (lizkeogh.com), série de posts sobre exemplos, regras e linguagem.
- Gojko Adzic — *Specification by Example* (Manning, 2011). Generalização além de Cucumber.
- Gojko Adzic — *Bridging the Communication Gap* (Neuri, 2009). Antecedente direto.
- Matt Wynne & Aslak Hellesøy — *The Cucumber Book*, 2ª ed. (Pragmatic Bookshelf, 2017). Tooling formalizado.
- Matt Wynne — *Example Mapping* (cucumber.io/blog/bdd/example-mapping-introduction/). A técnica de discovery.
- Steve Freeman & Nat Pryce — *Growing Object-Oriented Software, Guided by Tests* (Addison-Wesley, 2009). Outside-in como base.

---

## Referências cruzadas no projeto

- `@practices/tdd` — ciclo micro que opera dentro do loop BDD outside-in.
- `@practices/sdd` — prática vizinha, distinção por ponto de partida (conversa vs. spec).
- `@practices/clean-code` — princípios complementares de qualidade.
- `@architecture/ddd` — linguagem ubíqua e bounded contexts como infraestrutura conceitual do BDD.
- `@architecture/hexagonal` — ports/adapters expõem onde cenários de aceitação se conectam ao domínio.
- `@rules/testing` — regras enforce de isolamento, determinismo e naming aplicáveis a toda a suíte.
- `@stacks/testing/vitest` — runner para cenários em BDD-style sem Cucumber e para o ciclo TDD interno.
- `@stacks/testing/playwright` — runner E2E para cenários de aceitação automatizados via UI.
- `@stacks/database/firebase-firestore` — Firebase Emulator Suite como infraestrutura para cenários de integração.
- `@stacks/database/postgres` — testcontainers para cenários de integração contra Postgres real.
