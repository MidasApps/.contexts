# Clean Code

> Disciplina de craft em que o desenvolvedor trata legibilidade, expressividade e manutenibilidade do código como responsabilidades de primeira ordem, não como subproduto opcional do trabalho de fazer a feature funcionar. Código que funciona é o piso; código que comunica intenção a outro humano (ou agente) meses depois é o teto.

Clean Code é uma postura sustentada — uma forma de tratar cada função, cada nome, cada arquivo — não uma checklist mecânica aplicada ao final do trabalho. É uma prática contínua que opera entre o ciclo verde de TDD (@practices/tdd) e o próximo commit, refinando o que já passa nos testes para que continue inteligível em seis meses.

Este documento descreve a tradição canônica formulada por Robert C. Martin em *Clean Code* (2008), refinada e tensionada por contribuições de Kent Beck (*Smalltalk Best Practice Patterns*, 1996; *Tidy First?*, 2024), Martin Fowler (*Refactoring*, 1999/2018), Michael Feathers (*Working Effectively with Legacy Code*, 2004), Sandi Metz (*Practical Object-Oriented Design*, 2012) e John Ousterhout (*A Philosophy of Software Design*, 2018). Inclui deliberadamente a postura crítica do projeto sobre quando os princípios passam de heurística útil a dogma improdutivo.

---

## Os princípios centrais

Clean Code organiza-se ao redor de algumas heurísticas mutuamente reforçantes. Nenhuma delas é absoluta; todas operam em tensão com o contexto.

### Nomes significativos

Nomes são o instrumento primário de comunicação no código. Um nome bem escolhido elimina a necessidade de comentário; um nome mal escolhido força o leitor a abrir a implementação para entender a chamada.

Heurísticas canônicas:

- **Intention-revealing.** `daysSinceLastPayment` em vez de `d`, `dlp`, `days`.
- **Pronunceáveis.** `generationTimestamp` em vez de `genymdhms`. Código é lido em voz alta em revisão e em pair programming.
- **Searchable.** Nomes únicos o suficiente para que `grep` retorne o ponto certo. Constantes em vez de literais mágicos quando aparecem em múltiplos lugares.
- **Sem disinformation.** Não chamar de `accountList` algo que não é uma lista. Não usar `l` (que parece `1`) nem `O` (que parece `0`).
- **Sem prefixos húngaros nem decorações.** `m_name`, `strName`, `iCount` são ruído. TypeScript tem tipos; o nome não precisa repeti-los.
- **Substantivos para coisas, verbos para ações.** `Customer`, `loadCustomer`. Não `customerData` para a classe, nem `customer` para o método.
- **Vocabulário do domínio.** Nomes vindos da linguagem ubíqua (@architecture/ddd), não de jargão técnico genérico (`DataManager`, `InfoProcessor`).

### Funções pequenas, fazendo uma coisa

A heurística mais citada de Clean Code é também a mais maltratada. A formulação original: uma função deve fazer uma coisa, fazê-la bem, fazê-la apenas. Operacionalmente:

- **Single Level of Abstraction.** Dentro de uma função, todas as linhas devem operar no mesmo nível conceitual. Misturar manipulação de string com chamada de banco e cálculo de regra de negócio numa só função força o leitor a reconstruir três modelos mentais simultaneamente.
- **Estrutura descendente.** Funções de alto nível chamam funções de médio nível, que chamam funções de baixo nível. O leitor desce a profundidade conforme precisa de detalhe.
- **Número mínimo de argumentos.** Zero é ideal; um é bom; dois é aceitável; três exige justificativa; quatro ou mais é quase sempre sinal de que falta uma estrutura (parameter object) que agrupe o que pertence junto.
- **Command-Query Separation (CQS).** Uma função ou *faz algo* (command, retorna `void` ou um identificador da ação) ou *responde algo* (query, sem efeitos). Misturar os dois (`getOrCreate`, `saveAndReturn`) confunde o local de raciocínio.
- **Sem flag parameters booleanas.** `render(true)` não comunica nada. Separe em duas funções (`renderHidden`, `renderVisible`) ou nomeie o parâmetro num objeto (`render({ visible: true })`).
- **Side effects explícitos.** Se a função muta estado, persiste, dispara evento ou faz I/O, o nome precisa anunciar. `validateAndPersist` é honesto; `validate` que silenciosamente persiste é traição.

**Esta é a área onde Clean Code mais frequentemente vira dogma.** A seção de crítica abaixo trata dela em detalhe.

### Erros como cidadãos de primeira classe

- **Exceções (ou Result types) preferíveis a return codes.** Return codes são fáceis de ignorar; exceções e tipos discriminados forçam tratamento no caller.
- **Caminho feliz visível.** O fluxo principal não deve ficar afogado em três níveis de `try/catch` ou de checagens defensivas. Onde possível, extraia o tratamento para wrappers nas fronteiras (@rules/error-handling).
- **Não retornar `null`/`undefined` quando um objeto vazio, lista vazia ou Result explícito comunica melhor.** `null` propaga `null` checks por todo o código que consome o retorno.
- **Não passar `null`/`undefined` como argumento.** Se opcional, marque explicitamente; em TypeScript, isso é tipo-encoded.

Regras imperativas operacionais vivem em `@rules/error-handling`. Este documento descreve a postura cultural; aquele documento descreve os guarda-corpos.

### Comentários como falha em expressar via código

A postura de Martin é radical: todo comentário é uma falha. O código deveria ter sido claro o suficiente para dispensar a explicação em prosa. A postura do projeto é menos absoluta — alguns comentários são legítimos:

**Comentários úteis:**
- Explicação do **porquê** (decisão de tradeoff, restrição externa, motivo regulatório), não do *o quê*.
- TODO/FIXME com referência a issue rastreável.
- Avisos sobre consequências não-óbvias (`// não chamar dentro de transação`).
- Docstrings de API pública (interfaces, funções exportadas, contratos).
- Referência a algoritmo ou paper externo (`// algoritmo de Boyer-Moore, ver Knuth vol 3, p. 408`).

**Comentários ruins (a maioria):**
- Repetição do nome do método em prosa (`// calculates total — function calculateTotal()`).
- Código comentado deixado "por garantia". Use git history.
- Histórico de mudanças em comentário (use blame).
- Comentário desatualizado que descreve comportamento antigo.
- Comentário de seção em arquivo gigante (`// === HELPERS ===`) — sinal de que o arquivo deveria ser dividido.

Quando estiver tentado a escrever um comentário, pergunte primeiro: o nome poderia ser melhor? A função poderia ser extraída com nome significativo? O parâmetro poderia ser nomeado por tipo? Frequentemente sim, e o comentário some.

Para regras operacionais sobre quando e como documentar, veja `@rules/documentation`.

### DRY com moderação

Don't Repeat Yourself é o princípio mais perigoso quando tomado ao pé da letra. A formulação original (Hunt & Thomas, *The Pragmatic Programmer*) é sobre *conhecimento*: cada peça de conhecimento deve ter uma única representação autoritativa no sistema. Não sobre *strings idênticas*.

Operacionalmente, o projeto adota uma postura intermediária:

- **Rule of three.** Duplicação aceitável até a terceira ocorrência. Na terceira, considere abstrair. Antes da terceira, a "abstração" provavelmente é prematura.
- **Duplicação preferível a abstração errada.** Sandi Metz: "duplication is far cheaper than the wrong abstraction". Uma duplicação local custa edits redundantes; uma abstração errada cria acoplamento entre features que não compartilham conhecimento real, e cada mudança em uma força ginástica na outra.
- **WET (Write Everything Twice) deliberado** em camadas adjacentes que evoluem independentemente. Modelos de domínio, DTOs de API e schemas de banco são frequentemente similares mas têm ciclos de vida distintos — fundi-los acopla decisões que deveriam ser independentes.
- **DRY de fato é sobre conhecimento, não código.** Uma regra de negócio deve viver em um lugar; o código que a aplica em três telas distintas pode parecer duplicado sem sê-lo.

Antes de extrair, pergunte: as duas ocorrências representam *o mesmo conhecimento* ou apenas *aparência similar com propósito distinto*? Se a resposta for a segunda, deixe duplicado.

### Boy-scout rule

> Deixe o trecho de código um pouco mais limpo do que o encontrou.

Refactor incremental como parte natural de cada PR de feature, não como projeto separado. Renomear uma variável obscura, extrair uma função pequena cujo nome ilumina o bloco, remover um comentário desatualizado — operações de minutos que se acumulam ao longo de meses.

A postura do projeto adiciona uma restrição importante: **boy-scout rule não autoriza refactor cosmético em escopo desproporcional ao PR**. Trocar todos os `function` por `const arrow` em arquivos não tocados pela feature polui o diff, dificulta revisão e mistura intenções. O escopo é o trecho que você está tocando para a feature — mais alguns metros ao redor quando a relação é óbvia.

Quando o refactor cresce, separe (ver `@practices/tdd` sobre refactor sob barra verde, e Kent Beck *Tidy First?* sobre tidy commits separados de feature commits).

### Classes e módulos pequenos

- **Single Responsibility Principle (SRP).** Uma classe (ou módulo) deve ter uma única razão para mudar. Operacionalmente: quando você descreve o que ela faz, conjunção "e" é alerta — "salva no banco e envia email" é duas razões.
- **Alta coesão.** O que está junto no arquivo é o que muda junto. Métodos que operam sobre dados diferentes ou em contextos diferentes pertencem a módulos diferentes.
- **Baixo acoplamento.** Dependências entradas pela interface, não pela implementação concreta. Em arquitetura hexagonal (@architecture/hexagonal), isso é estrutural; em código sem ports formais, é responsabilidade do design local.
- **Law of Demeter.** Um objeto fala com seus vizinhos imediatos, não com vizinhos de vizinhos. `order.customer.address.zipCode` é um cheiro — o objeto sabe demais sobre a estrutura interna de outros.

### Formatação consistente

Indentação, espaçamento, ordem de imports, uso de blank lines — uniformes em todo o codebase. Não para que cada estilo seja "o melhor", mas para que o leitor não gaste atenção decodificando inconsistências.

No projeto, formatação é automatizada (ver `@processes/git`, `@rules/development`); este documento não repete as regras concretas.

---

## A postura crítica do projeto

Clean Code é influente e útil. Também é, em partes, dogmático e em outras partes simplesmente errado. A postura do projeto é trata-lo como **herança valiosa, não infalível**.

### Funções pequenas demais fragmentam contexto

A heurística "funções com 4–6 linhas" produz, em código real, fragmentação que prejudica leitura local. Uma função extraída cujo único leitor é a função que a chamava, e cujo nome apenas repete em prosa o que o corpo faz, não comunica nada — apenas força o leitor a saltar entre arquivos para reconstruir mentalmente um fluxo que estava claro embutido.

John Ousterhout (*A Philosophy of Software Design*, 2018) formula a contraposição: prefira **deep modules** — funções e classes com interfaces estreitas e implementações substanciais. Uma função de 60 linhas cuja interface (nome + parâmetros + retorno) cabe numa linha pode ser mais limpa que dez funções de 6 linhas cuja única função é parcelar o que estava junto.

A postura do projeto:

- **Extrair função quando o nome novo ilumina algo.** Se `validateAddress` substitui dez linhas de checagens diversas e o nome anuncia honestamente o que faz, extraia. Se a função extraída se chama `doStep1`, `helperFn`, `processData` ou tem que ser nomeada repetindo seu próprio corpo, mantenha inline.
- **Não extrair para satisfazer contagem de linhas.** Métrica de tamanho é proxy, não objetivo.
- **Preferir interface estreita sobre tamanho pequeno.** Uma função pode ser longa se ela é a única que precisa ser longa — o resto do sistema enxerga apenas seu nome.

### SRP é difícil e frequentemente over-aplicado

"Uma classe, uma responsabilidade" parece simples mas depende de como você define responsabilidade. Se a granularidade é "um único método público", SRP vira sinônimo de "uma classe por função" — produzindo proliferação de classes wrappers cuja única função é hospedar um método.

A postura do projeto:

- **SRP é sobre razão para mudar, não sobre número de métodos.** Uma classe `Order` com quinze métodos pode satisfazer SRP se todos esses métodos mudam pelos mesmos motivos (mudança de regra de domínio de pedido).
- **Não criar interface ou classe para satisfazer princípio.** Interface só faz sentido com pelo menos dois implementadores plausíveis (presente ou futuro próximo concreto).
- **Tolerar acoplamento local em troca de simplicidade.** Em features pequenas, separar em camadas formais com classes injetadas pode introduzir mais complexidade do que resolve.

### Críticas históricas relevantes

- **Dan Abramov — "Goodbye, Clean Code" (overreacted.io, 2020).** Relata caso em que aplicação rigorosa de DRY criou abstração que se tornou prisão; cada feature que divergia tinha que distorcer a abstração. A lição: abstrair tarde, viver com duplicação até que o conhecimento real apareça.
- **John Ousterhout — *A Philosophy of Software Design* (2018).** Argumenta diretamente contra o ideal de funções pequenas, propondo deep modules. Recomendado como contrapeso obrigatório.
- **Kent Beck — *Tidy First?* (2024).** Refina Clean Code reconhecendo que refactor de qualidade é uma prática econômica com timing — tidyings devem ser feitos quando pagam (antes de feature que se beneficia deles), não como obrigação contínua. Defende separar commits de tidy de commits de feature, decisão também adotada no projeto (@processes/git).
- **Sandi Metz — palestras "All the Little Things" e "The Wrong Abstraction" (2014).** Demonstra empiricamente que abstração prematura é mais cara que duplicação tolerada.

### Postura operacional do projeto

A síntese:

- **Aplique os princípios com discernimento, não com checklist.**
- **Priorize legibilidade contextual sobre regras mecânicas.** A pergunta correta é "outra pessoa entenderá este trecho?", não "este trecho satisfaz a regra X?".
- **Em caso de dúvida, escolha código menos abstrato.** Abstração tem custo de leitura permanente; duplicação tem custo de edit eventual. O segundo é frequentemente menor.
- **Reconheça quando uma regra está sendo aplicada contra seu propósito.** Extrair função que não comunica nada, criar interface sem segundo implementador, deduplicar conhecimento que não é o mesmo — todos são clean code virando contra si mesmo.
- **Use Clean Code como vocabulário compartilhado, não como autoridade.** Quando alguém diz "isso fere SRP", a resposta correta é discutir se a razão de mudar é mesmo uma só, não recitar a regra.

---

## Quando aplicar Clean Code

Clean Code é prática permanente, mas sua intensidade varia com o contexto:

- **Sempre em código longevo de domínio e application** — é onde a maior parte do custo de manutenção se acumula.
- **Sempre em interfaces públicas** (APIs, contratos exportados, schemas) — o custo de comunicação ruim multiplica-se por cada consumidor.
- **Sempre em código que será mantido por outra pessoa** — o que é virtualmente todo código que sobrevive.
- **Particularmente em código consumido por agentes de IA** — LLMs raciocinam melhor sobre nomes intencionais, funções coerentes e estrutura previsível. Clean Code dobra como redução de alucinação.
- **Em refactor sob barra verde** — TDD (@practices/tdd) e Clean Code coabitam: o ciclo Refactor é exatamente onde os princípios se aplicam.

## Quando NÃO aplicar Clean Code

A disciplina é deliberada, não dogmática:

- **Spikes e protótipos exploratórios.** Código de descoberta tem ciclo curto; aplicar princípios é cerimônia desperdiçada.
- **Scripts one-shot** de migração ou ferramenta interna usados uma vez.
- **Bug fix urgente em produção.** Faça o fix mínimo seguro; refactor para clean code depois, em PR separado.
- **Quando o "fix" cosmético polui o diff e dificulta revisão da feature.** Separe em commit ou PR de tidy (Kent Beck *Tidy First?*).
- **Quando uma regra está sendo aplicada contra o leitor real do código.** Se a função extraída piora a legibilidade local, não extraia.

A heurística: aplique se o código sobreviverá amanhã e será lido por alguém que não é você hoje.

---

## Prática concreta no stack do projeto

### TypeScript

TypeScript amplifica retorno de Clean Code porque o sistema de tipos absorve parte do trabalho que comentários e nomes faziam em linguagens dinâmicas.

- **Branded types** para identificadores e valores semânticos: `UserId`, `Email`, `Cents` em vez de `string` e `number` genéricos. Reduz disinformation no chamador.
- **Discriminated unions** para Result e estados: `type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }` torna fluxo de erro inspeção exhaustiva pelo compilador.
- **Funções puras preferenciais.** Em lógica de domínio, recebem dados e retornam dados; side effects empurrados para fronteiras.
- **Módulos pequenos coesos** preferíveis a arquivos com múltiplas classes não-relacionadas.
- **`readonly` por padrão** em estruturas de dados de domínio; mutação explícita quando necessária.

Veja `@stacks/language/typescript@7` para convenções específicas da versão.

### React 19 com Server Components

A separação server/client introduzida em Next.js 16 (@stacks/frontend/next@16) e React 19 (@stacks/frontend/react@19) é uma oportunidade natural de aplicar Clean Code estrutural:

- **Server Components** concentram fetch e composição de UI puramente apresentacional. Funções de servidor ficam pequenas, focadas em data shaping.
- **Client Components** ficam restritos a comportamento interativo. Lógica de estado em hooks coesos com nomes que descrevem o que o estado representa, não a forma técnica (`useFormState` é genérico; `useCheckoutWizardState` comunica).
- **Evitar abstrações prematuras em hooks e componentes.** Um hook compartilhado entre dois componentes pode ser legítimo; entre seis componentes com requisitos divergentes, frequentemente vira a "wrong abstraction" descrita por Metz.
- **Composição clara via children.** Em vez de prop drilling profundo, componentes compostos com slots explícitos.

### Camada de dados (Postgres, Firestore)

- **Nomes do domínio em entidades e tabelas/coleções**, não DAO genéricos. `OrderRepository`, não `OrderDAO` ou `DataManager`. Veja `@architecture/ddd` e `@contracts/schemas`.
- **Funções de query com nomes que descrevem a intenção**, não a forma SQL: `findActiveOrdersForCustomer`, não `selectOrdersWhereStatusEquals`.
- **Migrations versionadas e nomeadas pela intenção**, não pela mecânica.

### Código de IA generativa

Componentes que orquestram LLM (@stacks/ai/vercel-ai-sdk, @stacks/ai/mastra-sdk) beneficiam-se especialmente de Clean Code:

- **System prompts versionados como artefatos legíveis**, não literais espalhados.
- **Tools com nomes que descrevem capacidade**, não implementação.
- **Funções de evaluation e fallback nomeadas pela intenção comportamental.**

---

## Anti-patterns

Práticas que se vestem de Clean Code sem sê-lo, ou aplicações que ferem o próprio propósito:

- **Extrair função apenas para reduzir linhas.** Função extraída sem nome iluminador, chamada uma única vez, com efeito de espalhar o que estava unido. Métrica de tamanho satisfeita; legibilidade pior.
- **Classes pequenas sem coesão.** Vinte classes wrappers, cada uma com um método, satisfazendo SRP formal mas dispersando lógica que mudava junto.
- **Nomes excessivamente curtos** (`fn`, `tmp`, `x`) **ou excessivamente longos** (`processIncomingMessagePayloadAfterValidationAndBeforePersistence`). O ponto justo é o nome que comunica sem virar parágrafo.
- **Comentário que repete o nome do método.** `// loads the user` acima de `function loadUser()`. Ruído puro.
- **DRY agressivo entre features sem conhecimento compartilhado real.** Duas features divergentes forçadas em uma abstração comum porque "três linhas eram parecidas". Cada mudança em uma força distorção na outra.
- **Refactor cosmético misturado a feature.** Commit que troca aspas em arquivo inteiro junto com mudança de lógica de checkout. Revisão impossível.
- **Aplicar Clean Code como performance social.** Code review onde a maior parte dos comentários é sobre tamanho de função ou nome estético, não sobre correção ou design.
- **Considerar Clean Code "concluído".** A prática é permanente; código limpo hoje envelhece. Boy-scout rule é contínua.
- **Tratar Clean Code como substituto de design.** Nomes bonitos em arquitetura errada continuam sendo arquitetura errada.

---

## Critérios de saúde da prática

Sinais de que Clean Code está saudável no time:

- Pull requests de feature contêm pequenos tidyings localmente relacionados, não refactor desproporcional.
- Code review discute correção, design e legibilidade — sem virar caça a violações de regras formais.
- Nomes do domínio (linguagem ubíqua) aparecem consistentemente do código de UI ao de banco.
- Funções e módulos crescem ou encolhem conforme a forma do problema, não conforme métrica arbitrária.
- Comentários do codebase têm propósito (porquê, restrição, referência), não são glosa de código.
- Quando um membro do time defende uma escolha de design contra uma regra de Clean Code, a discussão acontece com argumentos concretos sobre legibilidade contextual, não sobre autoridade.

Sinais de degradação:

- "Refactor para Clean Code" virou PR separado recorrente, sem feature, e ninguém revisa de fato.
- Code reviews ficam dominadas por discussão de estilo e tamanho, não de design.
- Proliferação de classes/funções com nomes vagos (`Helper`, `Util`, `Manager`, `Processor`) — sinal de SRP mal aplicado.
- Comentários `// TODO: clean this up later` acumulam sem nunca virarem ação.
- Nomes inconsistentes entre camadas — `customer` em UI, `user_account` em banco, `clientData` em API — sinal de que linguagem ubíqua se rompeu.

---

## Diferenciação rápida

Clean Code coabita com práticas e regras vizinhas; confundi-las dilui as quatro.

- **TDD** (@practices/tdd) — disciplina de ciclo Red-Green-Refactor. Clean Code é o que se aplica no passo Refactor. Coabitam: TDD garante comportamento; Clean Code garante forma.
- **BDD** (@practices/bdd) — disciplina de descoberta colaborativa de comportamento via cenários. Clean Code é ortogonal — independente de como o comportamento foi descoberto, o código que o realiza pode ser limpo ou sujo.
- **SDD** (@practices/sdd) — disciplina de especificação precedendo implementação. Clean Code se aplica ao código que satisfaz a spec; spec pode estar limpa e código sujo, ou vice-versa.
- **Refactoring** (Fowler) — técnica específica de transformação preservando comportamento. Clean Code é o critério de qualidade que orienta para onde refatorar; Refactoring é o mecanismo seguro de chegar lá.
- **Rules imperativas** (`@rules/development`, `@rules/error-handling`, `@rules/documentation`) — guarda-corpos enforce. Clean Code é a postura cultural; rules são onde a postura vira regra atômica verificável.

Clean Code não substitui nem é substituído por nenhuma das vizinhas. Opera ao lado delas.

---

## Referências canônicas

- Robert C. Martin — *Clean Code: A Handbook of Agile Software Craftsmanship* (Prentice Hall, 2008). A formulação original e mais influente.
- Kent Beck — *Smalltalk Best Practice Patterns* (Prentice Hall, 1996). Anterior a Martin, contém muitas das heurísticas em formato de patterns.
- Kent Beck — *Tidy First? A Personal Exercise in Empirical Software Design* (O'Reilly, 2024). Refina Clean Code com economia de timing e separação de tidy commits.
- Martin Fowler — *Refactoring: Improving the Design of Existing Code* (2ª ed., Addison-Wesley, 2018). Catálogo de transformações seguras que materializam os princípios.
- Michael Feathers — *Working Effectively with Legacy Code* (Prentice Hall, 2004). Aplicação de Clean Code a código sem testes.
- Sandi Metz — *Practical Object-Oriented Design in Ruby / POODR* (Addison-Wesley, 2012, 2ª ed. 2018). Tratamento operacional de SRP, coesão e acoplamento; palestras sobre duplicação como contrapeso a DRY agressivo.
- John Ousterhout — *A Philosophy of Software Design* (Yaknyam Press, 2018). Contraponto importante sobre deep modules e tamanho de função.
- Dan Abramov — "Goodbye, Clean Code" (overreacted.io, 2020). Crítica empírica relevante sobre DRY e abstração prematura.
- Andrew Hunt & David Thomas — *The Pragmatic Programmer* (Addison-Wesley, 1999, 2ª ed. 2019). Formulação original de DRY como princípio de conhecimento.

---

## Referências cruzadas no projeto

- `@practices/tdd` — Clean Code aplicado no passo Refactor do ciclo Red-Green-Refactor.
- `@practices/bdd` — prática complementar de descoberta de comportamento; ortogonal a Clean Code.
- `@practices/sdd` — Clean Code aplicado ao código que satisfaz a spec.
- `@rules/development` — regras imperativas sobre estilo, estrutura e organização de código.
- `@rules/documentation` — regras imperativas sobre quando e como documentar; complementa a postura sobre comentários.
- `@rules/error-handling` — regras imperativas sobre tratamento de erros como cidadão de primeira classe.
- `@rules/testing` — regras imperativas aplicáveis tanto a testes quanto a código produtivo.
- `@architecture/ddd` — linguagem ubíqua como fonte natural de nomes intention-revealing.
- `@architecture/hexagonal` — ports e adapters fornecem fronteiras naturais para SRP e baixo acoplamento.
- `@architecture/clean-architecture` — camadas e regras de dependência reforçam estruturalmente os princípios.
- `@stacks/language/typescript@7` — recursos da linguagem que amplificam retorno de Clean Code (branded types, discriminated unions, readonly).
- `@stacks/frontend/react@19` e `@stacks/frontend/next@16` — composição server/client como aplicação estrutural dos princípios.
- `@processes/git` — separação entre commits de tidy e commits de feature (Kent Beck *Tidy First?*).
