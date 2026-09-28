# Test-Driven Development (TDD)

> Disciplina de desenvolvimento em que cada linha de código de produção nasce em resposta a um teste que falhou. O teste vem antes; o código segue para fazer o teste passar; o refactor consolida o resultado mantendo a barra verde.

TDD não é uma técnica de teste — é uma técnica de design conduzida por testes. Os testes são o subproduto observável; o produto real é o desenho que emerge ao usar o código antes de escrevê-lo.

Este documento descreve a prática canônica formulada por Kent Beck em *Test Driven Development: By Example* (2002), refinada por Robert C. Martin (Three Laws), e expandida em ambiente outside-in por Freeman & Pryce em *Growing Object-Oriented Software, Guided by Tests* (2009).

---

## O ciclo Red-Green-Refactor

TDD opera em ciclos curtos de três passos, executados em ordem rigorosa:

### 1. Red — escreva um teste que falha

Antes de qualquer linha de produção, escreva um teste que descreva o próximo comportamento desejado. Rode. O teste deve falhar — e falhar pelo motivo certo (a feature não existe ainda, não porque o teste está mal escrito). Se passar de primeira, ou a feature já existe, ou o teste não está realmente exercitando o que afirma.

### 2. Green — faça passar com o mínimo necessário

Escreva a menor quantidade de código de produção possível para o teste passar. "Mínimo" é literal: hardcode o valor de retorno, retorne uma constante, embuta a resposta direto na função. A meta nesta fase não é elegância — é atravessar a barra verde o mais rápido possível.

### 3. Refactor — limpe sem mudar comportamento

Com a barra verde protegendo, refatore. Elimine duplicação, melhore nomes, extraia funções, generalize. A cada microalteração, rode os testes. Se a barra ficar vermelha, desfaça e refaça menor. O refactor é onde o design emerge — pular esta etapa colapsa TDD em "test-after disfarçado".

O ciclo dura segundos a minutos, não horas. Se um ciclo está demorando, o passo (especialmente o teste) está grande demais.

---

## As três leis de TDD

Formuladas por Robert C. Martin como invariantes do ciclo:

1. **Não escreva código de produção sem antes ter um teste falhando.**
2. **Não escreva mais de um teste do que o suficiente para falhar — não compilar conta como falha.**
3. **Não escreva mais código de produção do que o suficiente para fazer o teste falhante passar.**

As três leis encurtam o ciclo a alguns segundos. Quem segue rigorosamente nunca tem mais que um teste vermelho ativo e nunca tem mais que algumas linhas não cobertas.

---

## Técnicas de implementação dentro do Green

Kent Beck identifica três estratégias para sair do vermelho:

- **Fake it (till you make it)** — retorne uma constante. Use quando o caminho até a implementação real ainda não está claro. Cada teste adicional pressiona o fake a generalizar.
- **Triangulação** — escreva dois ou mais testes com inputs diferentes que forçam a generalização. Útil quando a forma da abstração é incerta.
- **Obvious Implementation** — quando a implementação é trivial e óbvia, escreva-a direto. Aplicar fake-it para somar dois inteiros é teatro.

A escolha entre as três é tática. Iniciantes em TDD devem favorecer fake-it; experientes alternam conforme o risco percebido.

---

## A ToDo list de testes

Antes (e durante) o ciclo, mantenha uma lista informal dos testes que pretende escrever. À medida que descobre novos comportamentos ou edge cases durante o trabalho, anote-os na lista — não pare o ciclo atual para escrevê-los. Quando o ciclo fechar, escolha o próximo item.

Esta lista é o instrumento mais subestimado da prática: ela exterioriza a memória de trabalho e impede que o desenvolvedor tente segurar três comportamentos simultaneamente na cabeça.

No stack do projeto, a ToDo list materializa-se via `test.todo()` e `describe.todo()` do Vitest, mantendo a lista versionada junto ao código. Veja `@stacks/testing/vitest`.

---

## Escolas: Classical (Chicago/Detroit) vs Mockist (London)

TDD bifurcou-se historicamente em duas escolas com diferenças relevantes de estilo. Não são mutuamente exclusivas — coexistem no mesmo projeto, escolhidas por camada.

### Classical / Chicago / Detroit (Kent Beck, Martin Fowler)

- **Testa por valor real.** A asserção compara o estado retornado/observável com o esperado.
- **Colaboradores são reais ou substituídos por fakes/in-memory** (não mocks). Um repositório real, ou uma implementação in-memory que respeita o mesmo contrato.
- **Direção típica: inside-out** ou outside-in com fakes. Começa-se das unidades de domínio mais internas e cresce-se para fora.
- **Refactor mais livre.** Como os testes verificam comportamento observável, alterar internals raramente quebra testes.

### Mockist / London (Steve Freeman, Nat Pryce)

- **Testa por interação.** A asserção verifica que o objeto sob teste chamou seus colaboradores com os argumentos certos, na ordem certa.
- **Colaboradores são mockados.** Cada teste isola a unidade verificando apenas seu próprio comportamento.
- **Direção típica: outside-in puro.** Começa-se do teste de aceitação (acceptance test) que define o caso de uso e descobre-se as colaborações necessárias descendo de fora para dentro.
- **Pressão de design mais forte sobre interfaces.** Mocks expõem dependências e forçam ports explícitos — sinergia natural com arquitetura hexagonal (@architecture/hexagonal).

### Quando usar qual

| Contexto | Escola preferida |
|---|---|
| Lógica de domínio pura (cálculos, regras, transformações) | Classical |
| Componentes React e UI | Classical (testar comportamento, não chamadas) |
| Use cases de aplicação coordenando ports | Mockist (verifica orquestração) |
| Adapters (repositórios, gateways) integrados | Classical com fakes/testcontainers |
| Fluxo end-to-end outside-in | Mockist no top, classical no fundo |

A regra prática: **classical para código com comportamento observável; mockist para código cujo trabalho é coordenar**.

---

## Quando aplicar TDD

TDD entrega ROI quando pelo menos uma das condições é verdadeira:

- **Lógica não trivial** com múltiplas ramificações, edge cases ou invariantes a preservar.
- **Refactor de código legado**, onde os testes funcionam como rede de segurança antes da modificação (técnica derivada: characterization tests para legados, depois TDD para extensões).
- **Código longevo**, que será mantido e estendido por meses ou anos.
- **Domain logic e use cases** das camadas internas da arquitetura hexagonal (@architecture/hexagonal, @architecture/clean-architecture).
- **Bugfixes** — escreva primeiro um teste que reproduz o bug, depois corrija. O teste vira regressão permanente.

## Quando NÃO aplicar TDD

A disciplina é deliberada, não dogmática. Há contextos onde TDD gera fricção sem retorno:

- **Spikes e protótipos exploratórios** cujo destino é o lixo. Aprenda primeiro; reescreva sob TDD se a ideia sobreviver.
- **Exploração de API externa desconhecida.** Use um script imperativo curto para entender a API, depois TDD a integração definitiva.
- **Código de configuração trivial** sem lógica condicional.
- **Design ainda muito incerto** no nível conceitual. TDD aperta o ciclo dentro de uma direção dada — não substitui a fase de pensar sobre o problema.
- **Migrations one-shot** e scripts descartáveis.

A heurística: se você não consegue articular o próximo teste, não está pronto para TDD ainda — pense primeiro.

---

## TDD como ferramenta de design

A confusão mais cara sobre TDD é tratá-lo como "técnica de teste". Os testes são o instrumento; o produto é o design.

Escrever o teste antes força:

- **Baixo acoplamento** — código difícil de testar é código difícil de usar. Se construir o objeto exige sete dependências, o teste expõe a dor antes do código de produção sofrer dela.
- **Alta coesão** — testes pequenos pressionam unidades pequenas com responsabilidades claras.
- **Dependency injection natural** — colaboradores chegam por parâmetro porque o teste precisa substituí-los. Singletons globais morrem na primeira tentativa de teste.
- **Interfaces estreitas** — o teste consome só o que precisa, revelando quando o contrato está inflado.

TDD é uma força de design exercida continuamente. Por isso a frase de Beck: "TDD não é sobre testes; é sobre design e feedback."

---

## Prática concreta no stack do projeto

### Domínio puro (TypeScript)

Vitest + classical. Sem mocks, sem fakes — funções e classes de domínio recebem dados e retornam dados.

```ts
// domain/pricing/calculate-discount.test.ts
describe("calculateDiscount", () => {
  test.todo("returns zero when subtotal below threshold");
  test.todo("applies 10% above threshold");
  test.todo("caps discount at maxDiscount");

  test("returns zero when subtotal below threshold", () => {
    expect(calculateDiscount({ subtotal: 50, threshold: 100 })).toBe(0);
  });
});
```

### Use cases (application layer)

Mockist quando a função do use case é orquestrar ports. Mocks dos ports definidos pela arquitetura hexagonal.

```ts
// application/orders/place-order.test.ts
test("persists order and emits OrderPlaced event", async () => {
  const orderRepo = { save: vi.fn() };
  const eventBus = { publish: vi.fn() };
  await placeOrder({ orderRepo, eventBus }, validInput);
  expect(orderRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: "placed" }));
  expect(eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({ type: "OrderPlaced" }));
});
```

### Adapters (Postgres, Firestore)

Classical com infra real isolada. Testcontainers para Postgres (@stacks/database/postgres); Firebase Emulator Suite para Firestore (@stacks/database/firebase-firestore). Fakes in-memory para suites rápidas de domínio.

### Componentes React

Classical via React Testing Library. **Testar comportamento observável pelo usuário**, nunca implementação interna. Veja `@rules/testing` para regras enforce de naming, isolamento e determinismo aplicáveis a toda a suíte.

### E2E

Playwright (@stacks/testing/playwright) raramente é dirigido por TDD puro — costuma seguir o modelo de acceptance tests da escola London no topo da pirâmide, com TDD clássico nas camadas inferiores.

---

## Relação com a arquitetura

TDD floresce em sistemas com ports e adapters bem definidos (@architecture/hexagonal). A razão é estrutural: ports são exatamente os pontos onde fakes ou mocks substituem o mundo real. Em arquitetura sem ports explícitos, TDD obriga a inventá-los — daí a expressão de Freeman & Pryce de que "TDD é uma ferramenta de descoberta de arquitetura".

Em Clean Architecture (@architecture/clean-architecture), as camadas internas (entities, use cases) são candidatas naturais a TDD; camadas externas (frameworks, drivers) podem usar TDD com fakes ou ficar fora do ciclo, testadas por integração.

Em Feature-Sliced Design (@architecture/fsd), TDD se aplica naturalmente dentro de cada slice — entities e features têm fronteiras claras que facilitam o teste isolado.

---

## Anti-patterns

Práticas que se vestem de TDD sem sê-lo:

- **Test-after disfarçado.** Escrever o código primeiro, depois o teste, e chamar de TDD. Falta o passo Red genuíno — o teste nunca pressionou o design.
- **Testes acoplados a implementação.** Asserções sobre nomes de métodos privados, ordem de chamadas internas, estrutura de objetos não-públicos. Quebra a qualquer refactor e bloqueia evolução.
- **Mock-heavy sem comportamento real.** Tudo é mock, nada exercita lógica de verdade. O teste verifica que o objeto chamou seus mocks — não que faz o que deveria fazer.
- **Pular o refactor.** Ciclo Red-Green-Red-Green sem Refactor acumula dívida e degrada o design que TDD deveria proteger.
- **Refactor que muda comportamento.** Se durante o refactor um teste falha e a resposta é "ajustar o teste", não foi refactor — foi mudança de comportamento sem novo teste primeiro.
- **Testes grandes demais.** Um teste que verifica cinco comportamentos não pode falhar com clareza. Quebre em testes menores.
- **Ignorar a ToDo list.** Tentar segurar de cabeça os próximos cinco testes. Anote.

---

## Mitos comuns

- **"TDD garante 100% de cobertura."** Não é o objetivo nem é verdade automática. Cobertura é subproduto; a meta é confiança no design.
- **"TDD é mais lento."** No curto prazo, sim. No prazo de manutenção (a maior parte da vida de qualquer código), inverte-se — bugs descobertos cedo, refactor seguro, design exposto a uso real.
- **"TDD substitui design upfront."** Não. TDD opera dentro de uma direção arquitetural já decidida. Continua sendo necessário decidir camadas, fronteiras e modelos antes (@architecture/hexagonal, @decisions).
- **"TDD não funciona para UI / async / legado."** Funciona com técnicas adaptadas: Testing Library para UI, fakes determinísticos para async, characterization tests + seams para legado.
- **"Se não há mock, não é TDD de verdade."** A escola classical prova o contrário — mocks são uma opção, não um requisito.

---

## Critérios de saúde da prática

Sinais de que TDD está saudável no time:

- Ciclos Red-Green-Refactor de minutos, não horas.
- Pull requests onde commits de teste precedem commits de produção (visível no histórico).
- Refactors frequentes sem medo, com a suíte verde como evidência.
- Bugs reproduzidos como teste antes do fix.
- Testes que continuam passando após refactor de internals.

Sinais de degradação:

- Suíte vermelha tolerada por mais de algumas horas.
- Testes desabilitados/skipados acumulando.
- Cobertura caindo silenciosamente.
- PRs onde os testes parecem ter sido escritos após o código (estrutura espelhando 1:1 a implementação).

---

## Diferenciação rápida

- **TDD** (este documento) — disciplina técnica, unidade pequena, ciclo Red-Green-Refactor, linguagem de programação.
- **BDD** (@practices/bdd) — disciplina de comportamento de negócio, linguagem Given-When-Then, envolve stakeholders não-técnicos, foco em cenários executáveis.
- **SDD** (@practices/sdd) — disciplina de especificação formal precedendo implementação, foco em contratos e formalização.
- **Clean Code** (@practices/clean-code) — princípios de qualidade aplicáveis com ou sem TDD.

TDD e BDD não competem — coabitam. BDD molda os acceptance tests no topo; TDD molda as unidades no fundo.

---

## Referências canônicas

- Kent Beck — *Test Driven Development: By Example* (Addison-Wesley, 2002). A formulação original do ciclo.
- Steve Freeman & Nat Pryce — *Growing Object-Oriented Software, Guided by Tests* (Addison-Wesley, 2009). A escola London formalizada.
- Robert C. Martin — *Clean Code* (cap. 9) e *Clean Coder* (cap. 4), formulação das três leis.
- Martin Fowler — "Mocks Aren't Stubs" (martinfowler.com/articles/mocksArentStubs.html). Análise comparativa das escolas.
- Michael Feathers — *Working Effectively with Legacy Code* (Prentice Hall, 2004). TDD aplicado a código sem testes.

---

## Referências cruzadas no projeto

- `@rules/testing` — regras imperativas sobre estrutura de testes (AAA, isolamento, determinismo, naming).
- `@architecture/hexagonal` — ports e adapters como infraestrutura natural para TDD.
- `@architecture/clean-architecture` — camadas internas como alvo prioritário de TDD.
- `@stacks/testing/vitest` — runner padrão para suites unitárias e de integração rápidas.
- `@stacks/testing/playwright` — runner E2E, raramente dirigido por TDD puro.
- `@stacks/database/postgres` — uso de testcontainers para adapters de Postgres.
- `@stacks/database/firebase-firestore` — Firebase Emulator Suite para testes de adapter.
- `@practices/bdd` — prática complementar para o nível de comportamento de negócio.
