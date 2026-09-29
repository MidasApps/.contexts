---
title: Domain-Driven Design
type: architecture
status: active
last_updated: 2026-05-20
upstream: https://www.domainlanguage.com/ddd/
---

# Domain-Driven Design

Domain-Driven Design (DDD) é uma abordagem de modelagem de software introduzida por Eric Evans em 2003 no livro *Domain-Driven Design: Tackling Complexity in the Heart of Software* e expandida por Vaughn Vernon em *Implementing Domain-Driven Design* (2013). Diferente de modelos arquiteturais puramente estruturais — que respondem "onde mora cada arquivo" — DDD é uma **abordagem completa** que combina dois eixos inseparáveis: o **estratégico**, que organiza grandes pedaços de um sistema em torno de fronteiras de significado do negócio, e o **tático**, que oferece um vocabulário de blocos de construção (entities, value objects, aggregates, repositories, domain services, domain events) para expressar regras de domínio dentro de cada fronteira.

A tese central de Evans é simples e ambiciosa: **o coração do software complexo é o modelo do domínio**, e a única forma sustentável de domar essa complexidade é cultivar uma linguagem compartilhada e precisa entre desenvolvedores e especialistas do negócio, materializando-a no código. Quando o código fala a mesma língua que o negócio, conversas viram modelos, modelos viram tipos, e tipos viram código que reflete diretamente a realidade que ele automatiza.

DDD não substitui modelos estruturais — pelo contrário, costuma **preencher o interior** de modelos como @architecture/hexagonal e @architecture/clean-architecture com vocabulário rico. Onde Hexagonal define a fronteira exterior do núcleo, DDD descreve o que vive dentro dele. Onde @architecture/clean-architecture organiza camadas concêntricas em uma única aplicação, DDD oferece o eixo estratégico que justifica quando uma aplicação deveria virar duas.

O framework deste projeto — **Domain-Driven Context (DDC)** — é nomeado em tributo direto a DDD: a unidade fundamental de organização de contextos aqui é o **bounded context**, herdeiro semântico do conceito homônimo de Evans.

## Conceito canônico

DDD se organiza em dois eixos complementares: **strategic design** e **tactical design**. Ambos são necessários; nenhum é suficiente sozinho.

### Strategic Design

O design estratégico trata da decomposição de um sistema em pedaços com significado próprio. É o trabalho de cartografia: identificar onde uma língua começa e onde termina, quais partes do negócio são centrais e quais são acessórias, e como diferentes partes do sistema se relacionam entre si.

#### Ubiquitous Language

A **linguagem ubíqua** é uma linguagem compartilhada entre desenvolvedores e especialistas de domínio, usada **em todos os artefatos** do projeto: conversas, documentos, diagramas, código, banco de dados, logs. Quando o especialista de domínio diz "pedido aprovado", o código tem um conceito chamado `Order.approve()`, não `setStatus(2)`. Quando o sistema persiste o evento, a tabela ou collection chama-se `orders` com um campo `status: 'approved'`, não `tbl_pedidos_v2` com `flag_int_3`.

A linguagem ubíqua é viva: à medida que o entendimento do domínio evolui, a linguagem evolui, e o código deve evoluir com ela. Termos imprecisos ou inconsistentes são bugs de modelagem, não detalhes estilísticos.

#### Bounded Context

Um **bounded context** é uma fronteira explícita dentro da qual um modelo (e portanto uma linguagem ubíqua) é consistente e tem significado único. Fora dessa fronteira, o mesmo termo pode significar algo diferente — e tudo bem, porque a fronteira é explícita.

O exemplo clássico de Evans: a palavra "Customer" em um contexto de Vendas significa uma coisa (lead, pipeline, oportunidade), em um contexto de Cobrança significa outra (CNPJ, dados de pagamento, histórico de inadimplência), e em um contexto de Suporte significa outra ainda (tickets, contato preferencial, SLA). Tentar criar uma única classe `Customer` que atende todos os contextos produz a abominação conhecida como **God Object** — uma entidade que carrega campos relevantes para todos e relevantes para ninguém em particular.

A solução do DDD é deixar cada contexto ter **sua própria** definição de `Customer`, com sua própria forma, suas próprias regras, sua própria persistência se necessário. Os contextos se comunicam por contratos explícitos (eventos, APIs, anti-corruption layers), não por compartilhamento de modelo.

#### Context Mapping

O **context map** é o diagrama (mental ou formalizado) que descreve como bounded contexts se relacionam entre si. Evans catalogou nove padrões de relação, cada um com implicações organizacionais e técnicas:

| Padrão | Descrição | Quando aparece |
|---|---|---|
| **Partnership** | Dois times coordenam evolução conjunta; sucesso ou fracasso mútuo | Contextos profundamente interdependentes do mesmo produto |
| **Shared Kernel** | Subconjunto pequeno e estável de modelo compartilhado entre dois contextos | Quando duplicação é mais custosa que coordenação |
| **Customer / Supplier** | Um contexto upstream serve outro downstream; downstream tem voz nas prioridades | Contextos sequenciais na cadeia de valor |
| **Conformist** | Downstream aceita o modelo do upstream sem tradução | Quando upstream é externo ou não-negociável e a tradução não compensa |
| **Anticorruption Layer (ACL)** | Downstream traduz o modelo do upstream para preservar a pureza do seu próprio | Integração com sistemas legados ou parceiros externos cujo modelo é tóxico |
| **Open-Host Service** | Upstream publica uma API estável projetada para múltiplos consumidores | Quando o número de consumidores justifica protocolo público |
| **Published Language** | Linguagem comum bem-documentada (geralmente formato de evento ou schema) | Em conjunto com Open-Host Service ou para integrações multi-contexto |
| **Separate Ways** | Os contextos não se integram — coexistem sem se falar | Quando o custo de integração supera o valor |
| **Big Ball of Mud** | Reconhecimento honesto de uma região sem fronteiras claras | Para isolar a desordem e impedir que contamine contextos novos |

Mapear contextos é trabalho estratégico contínuo: muda quando o negócio muda, quando o time muda, quando a tecnologia muda.

#### Subdomains

Domínios reais não são uniformes em valor. DDD distingue três tipos de subdomínio:

- **Core domain.** Onde o negócio se diferencia. É o coração competitivo. Merece o maior investimento de modelagem, os melhores desenvolvedores, e a aplicação plena do tactical design.
- **Supporting subdomain.** Necessário para o negócio funcionar mas não diferencial. Vale modelagem cuidadosa, mas não obsessiva.
- **Generic subdomain.** Resolvido por qualquer empresa do setor da mesma forma (autenticação, billing, envio de email transacional). Idealmente comprado ou usado como SaaS; modelagem mínima.

A decisão de onde investir esforço de DDD é estratégica: aplicar tactical design pleno em um subdomínio genérico é desperdício; usar bibliotecas prontas no core domain é abdicar da diferenciação.

#### Ferramentas de descoberta

Identificar bounded contexts e linguagem ubíqua não é trabalho de um arquiteto solitário — é trabalho colaborativo. Duas técnicas se consolidaram:

- **Event Storming** (Alberto Brandolini): workshop em que stakeholders mapeiam eventos de domínio em ordem cronológica em uma parede infinita de post-its laranjas, depois identificam comandos, atores, agregados e bounded contexts emergentes. Particularmente útil em descoberta inicial e em sistemas legados que precisam ser mapeados.
- **Domain Storytelling** (Stefan Hofer e Henning Schwentner): especialistas narram histórias concretas do negócio enquanto um facilitador desenha o fluxo. Foco em casos reais, vocabulário emergente e atores explícitos.

Ambas são técnicas de elicitação, não de design: produzem matéria-prima para modelagem, não modelos prontos.

### Tactical Design

O design tático oferece um catálogo de blocos de construção para implementar o modelo de cada bounded context com fidelidade. Os blocos são padrões reconhecidos, com responsabilidades e fronteiras precisas.

#### Entity

Uma **entity** é um objeto cuja identidade importa mais que seus atributos. Duas entities com os mesmos atributos são **diferentes** se têm identidades diferentes; a mesma entity continua sendo a mesma ao longo do tempo mesmo quando seus atributos mudam. Um `Order` com `id: 42` hoje e amanhã é o mesmo pedido, mesmo que tenha trocado de status, recebido itens novos e mudado de endereço.

A identidade é, em geral, um identificador estável atribuído na criação (UUID, ULID, número incremental). Entities têm ciclo de vida: nascem, evoluem, podem ser arquivadas ou removidas.

#### Value Object

Um **value object** é um objeto cuja igualdade depende exclusivamente de seus atributos. Dois objetos `Money(100, 'BRL')` são iguais — não importa se foram criados em momentos diferentes ou por código diferente; o que importa é o valor que carregam. Value objects são tipicamente **imutáveis**: para "mudar" um, cria-se outro.

Exemplos canônicos: `Money`, `DateRange`, `Email`, `CPF`, `Address`, `Coordinates`, `Percentage`. Em TypeScript, value objects costumam ser implementados com **branded types** combinados com **schemas Zod** que validam invariantes na construção. Ver @rules/validation e regras de modelagem de dados para o padrão concreto.

A distinção entre entity e value object é uma decisão de modelagem, não uma propriedade intrínseca: "endereço" pode ser value object em um contexto (parte de um cliente, sem identidade própria) e entity em outro (gerenciado, com histórico, com identidade própria).

#### Aggregate e Aggregate Root

Um **aggregate** é um cluster de entities e value objects tratados como **uma unidade de consistência transacional**. Toda mudança que envolve invariantes do aggregate acontece dentro de uma transação que abrange o aggregate inteiro.

Cada aggregate tem uma **aggregate root**: uma entity que é o **único ponto de entrada** para o aggregate. Código externo nunca toca diretamente uma entity interna; passa pela root, que protege os invariantes. Um `Order` (root) com seus `OrderItem` (internos) é um aggregate clássico: ninguém adiciona um item diretamente à coleção de itens — chama-se `order.addItem(...)`, e essa operação valida que o pedido ainda aceita itens, que o item respeita limites de quantidade, que o total recalculado não excede um limite, etc.

Regras de Vernon sobre aggregates, condensadas:

1. **Proteja invariantes verdadeiros dentro de fronteiras de consistência.** Se duas regras precisam ser verdadeiras simultaneamente após uma transação, elas pertencem ao mesmo aggregate.
2. **Desenhe aggregates pequenos.** Aggregates gigantes geram contenção, lock contention, leituras pesadas e dificuldade de modelagem. Quanto menor, melhor — desde que invariantes sejam preservados.
3. **Referencie outros aggregates por ID, não por referência direta.** Um `Order` não carrega o objeto `Customer` inteiro; carrega `customerId`. Buscar o cliente é responsabilidade de quem orquestra, não do pedido.
4. **Use eventual consistency entre aggregates.** O que acontece em outro aggregate como consequência desta operação é modelado como evento de domínio publicado, não como parte da mesma transação.

#### Repository

Um **repository** é uma abstração que oferece persistência **para um aggregate inteiro**, em vocabulário de domínio. Sua interface vive no domínio; sua implementação concreta vive nos adapters — o que casa perfeitamente com o tratamento de driven ports em @architecture/hexagonal.

Repositórios falam de aggregates: `OrderRepository.findById(orderId): Promise<Order | null>`, `OrderRepository.save(order: Order): Promise<void>`. Não falam de tabelas, queries SQL, índices Firestore ou paginação de baixo nível — esses detalhes são internos do adapter.

Um repositório por aggregate é a regra. Repositório que cruza aggregates ou que retorna pedaços parciais costuma ser sinal de modelagem que precisa ser revista (ou de uso legítimo de **read model** separado — ver CQRS abaixo).

#### Domain Service

Um **domain service** é um pedaço de lógica de domínio que **não pertence naturalmente a nenhuma entity ou value object** porque envolve múltiplos conceitos. Exemplo clássico: cálculo de frete que combina origem, destino, peso, dimensões e regras de promoção — não é responsabilidade do `Order`, nem do `Address`, nem do `ShippingPolicy` isoladamente. Vira um `ShippingCalculator` (domain service) sem estado, com método puro.

Domain services são parte do domínio, não da infraestrutura. Vivem ao lado das entities. Não devem ser confundidos com application services.

#### Application Service

Um **application service** orquestra um caso de uso completo: recebe input, carrega aggregates via repositories, chama métodos de domínio (entities, value objects, domain services), persiste mudanças, publica eventos. Não contém lógica de negócio — apenas coordena. É exatamente o que @architecture/hexagonal chama de "use case" no driving port.

A separação é estrita: lógica de **o que** acontece com os dados é responsabilidade do domínio (entity, value object, domain service); lógica de **como o fluxo é orquestrado** (carregar, chamar, persistir, publicar) é responsabilidade da application.

#### Domain Event

Um **domain event** é um fato imutável que aconteceu no domínio e tem significado para o negócio: `OrderPlaced`, `PaymentApproved`, `InventoryReserved`, `CustomerOnboarded`. Eventos são nomeados no passado, são imutáveis (não se cancela um evento — emite-se outro evento que o compensa), e carregam **apenas os dados necessários para que consumidores entendam o que aconteceu**.

Vernon distingue duas categorias:

- **Domain events (internos).** Publicados e consumidos **dentro** do mesmo bounded context. Geralmente conectam aggregates do mesmo contexto via eventual consistency.
- **Integration events.** Publicados **para fora** do bounded context, atravessando fronteiras. Costumam ter schema mais conservador, versionamento explícito e ser parte de uma published language (ver Context Mapping acima).

Distingui-los importa: um domain event interno pode carregar referências por ID local; um integration event não pode assumir que o consumidor compartilha o mesmo modelo.

#### Factory

Uma **factory** encapsula a lógica de criação de aggregates ou entities quando a construção é não-trivial (validação cruzada, inicialização de invariantes, criação de identidade). Pode ser método estático na própria entity (`Order.create(...)`), classe dedicada, ou função. Existe para garantir que **nunca exista um aggregate em estado inválido** após criação.

#### Specification

Uma **specification** é um objeto que encapsula uma regra booleana sobre uma entity ou aggregate (`order.matches(unpaidAndOverdueSpec)`). Útil quando a mesma regra aparece em vários lugares (filtro de repositório, validação, escolha de fluxo) — extraí-la em specification evita duplicação e dá nome ao conceito.

#### CQRS

**Command Query Responsibility Segregation** é um padrão arquitetural complementar a DDD: separa o modelo de escrita (commands, que modificam aggregates) do modelo de leitura (queries, otimizadas para apresentação). O modelo de escrita é o aggregate canônico; o modelo de leitura pode ser denormalizado, pré-computado, materializado em uma view ou em um banco diferente, atualizado por consumo dos domain events.

CQRS não é obrigatório em DDD. Vale a pena quando a complexidade de leitura diverge significativamente da de escrita (relatórios pesados, dashboards, full-text search). Em domínios simples, é overhead.

#### Event Sourcing

**Event Sourcing** persiste o aggregate como uma sequência ordenada de events em vez de como uma snapshot do estado atual. O estado é derivado, a qualquer momento, replicando os eventos. Casado com CQRS, oferece auditoria total, viagem no tempo e possibilidade de derivar múltiplas projeções.

Event Sourcing é uma opção, não uma exigência de DDD. Adiciona complexidade significativa (versionamento de eventos, snapshots, replay, projeções) e costuma só valer a pena em domínios onde história importa mais que estado atual (financeiro, regulado, auditável).

## Como o time adotou

DDD não é adotado como abordagem **uniforme** no projeto — é aplicado **seletivamente**, na proporção da complexidade do domínio que cada parte do sistema enfrenta. Em features que são essencialmente CRUDs ou superfícies de apresentação, DDD seria overhead. Em features que envolvem regras de negócio ricas, fluxos com múltiplas etapas e vocabulário próprio do negócio, DDD é a abordagem default.

### Localização no projeto

A modelagem DDD vive **dentro** do recorte de cada feature, dentro do hexágono definido por @architecture/hexagonal, casada com a organização por contexto promovida por @architecture/feature-based e @architecture/fsd. A estrutura interna canônica para uma feature com domínio rico:

```
src/features/<feature>/
  domain/                          # tactical design vive aqui
    entities/
      order.ts                     # Entity: Order (aggregate root)
      orderItem.ts                 # Entity interna do aggregate Order
    valueObjects/
      money.ts                     # Value Object
      orderStatus.ts
      orderId.ts                   # branded type
    services/
      pricingPolicy.ts             # Domain Service
      shippingCalculator.ts
    events/
      orderPlaced.ts               # Domain Event
      orderShipped.ts
    specifications/
      eligibleForDiscount.ts       # Specification (quando aplicável)
  application/                     # application services / use cases
    ports/
      driven/
        orderRepository.ts         # interface do Repository
      driving/
        placeOrder.ts              # interface do use case
    useCases/
      placeOrder.ts                # Application Service
  adapters/
    driven/
      firestoreOrderRepository.ts  # implementação concreta do Repository
  composition.ts
  index.ts
```

A simetria com @architecture/hexagonal é deliberada: `domain/` é o coração do hexágono, `application/` é a camada que orquestra, `adapters/` são as implementações concretas.

### Bounded Contexts no projeto

Cada feature de domínio rico é candidata a virar um bounded context próprio. Algumas heurísticas práticas:

- Se o **mesmo termo de negócio** tem significados diferentes em duas features (`User` no contexto de autenticação versus `User` no contexto de billing), são **dois bounded contexts distintos**. Cada um define seu próprio `User`, não há herança nem compartilhamento de tipo.
- Se duas features evoluem por motivos diferentes (cadência de release diferente, especialistas de negócio diferentes, equipes diferentes), são candidatas a bounded contexts distintos.
- Se duas features são na verdade duas facetas do mesmo conceito sob o mesmo vocabulário, são o **mesmo bounded context** mesmo que vivam em pastas diferentes por conveniência.

Quando dois bounded contexts precisam conversar, a integração acontece por:

- **Eventos de domínio publicados** (preferido para acoplamento fraco e evolução independente). Eventos são publicados em uma camada de mensageria (Firebase Pub/Sub, EventArc, Postgres LISTEN/NOTIFY, dependendo do contexto). Ver futuro `@contracts/events` para o formato canônico de eventos publicados.
- **APIs HTTP/RPC** com schema explícito (quando há necessidade síncrona). Ver @contracts/schemas para convenções de modelagem de payloads.
- **Anticorruption layer (ACL)** quando o contexto downstream consome um modelo externo (sistema legado, parceiro, SaaS) que não casa com seu vocabulário. A ACL traduz; o domínio downstream nunca vê o modelo de fora.

### Ubiquitous Language no código TypeScript

A linguagem ubíqua se materializa principalmente em três lugares:

1. **Nomes de tipos e funções.** `Order.approve()`, `Customer.findByDocument()`, `Payment.refund()`. Métodos descrevem operações de negócio, não operações técnicas.
2. **Tipos branded para identidades e value objects.** `type OrderId = string & { readonly __brand: 'OrderId' }`. Impedem mistura acidental entre identidades de aggregates diferentes e dão peso semântico a tipos primitivos. Ver @rules/validation e regras de data modeling.
3. **Schemas Zod que validam invariantes de value objects.** `const Money = z.object({ amount: z.number().positive(), currency: z.enum(['BRL', 'USD']) }).brand<'Money'>()`. A construção de um value object **falha** se os invariantes não forem satisfeitos — não existe `Money` inválido em circulação. Ver @stacks/validation/zod@4.

A regra é dura: **se a linguagem ubíqua diz X, o código diz X**. Renomear um conceito de negócio sem renomear todos os lugares onde ele aparece no código é dívida técnica imediata.

### Aggregates e persistência heterogênea

O projeto usa Firestore e Postgres em coexistência. A persistência de um aggregate respeita o seguinte:

- **Um aggregate, uma transação.** Salvar um `Order` com seus `OrderItem` acontece em uma única transação. Em Postgres, transação relacional. Em Firestore, `runTransaction` ou batched writes. Ver @stacks/database/firebase-firestore e @stacks/database/postgres para o vocabulário concreto.
- **Cross-aggregate consistency é eventual.** Quando `OrderPlaced` precisa diminuir estoque no aggregate `Inventory`, isso acontece como reação ao evento, em outra transação, possivelmente com retries.
- **Repositórios respeitam o vocabulário do domínio, não o do banco.** `OrderRepository.findActiveByCustomer(customerId): Promise<Order[]>`, não `OrderRepository.runQuery(where: WhereClause)`.

Para contextos onde aggregates não casam bem com a forma natural do banco (ex.: aggregate relacional pesado em Firestore), a modelagem do aggregate deve ser revista — Firestore costuma exigir aggregates menores e referências por ID mais agressivas.

### Domain events e mensageria

Eventos de domínio publicados externamente seguem convenções específicas de payload, naming e versionamento — tratadas em `@contracts/events` (a ser definido). Em síntese:

- Nome no passado, em PascalCase: `OrderPlaced`, `PaymentApproved`.
- Payload mínimo: identificadores e dados essenciais; não é DTO inteiro do aggregate.
- Versionamento explícito quando o evento atravessa bounded contexts.
- Metadados padronizados: `eventId`, `occurredAt`, `aggregateId`, `aggregateType`, `version`.

Domain events internos (dentro do mesmo contexto) podem ser mais leves: tipos TypeScript locais consumidos em-process, sem mensageria externa.

### Light DDD vs Heavy DDD

Na prática, o projeto opera predominantemente em **light DDD** (também chamado de "DDD lite"): adota o vocabulário tático (entity, value object, aggregate, repository, domain service, domain event, application service) e a noção estratégica de bounded context, mas **não exige** Event Sourcing, **não exige** CQRS para todos os contextos, e **não exige** ACL elaborada para integrações simples.

Heavy DDD pleno (CQRS + Event Sourcing + saga orchestration + read models materializados) é aplicado pontualmente, em contextos onde o payoff justifica. A decisão de subir o nível é tratada como @decisions específica do contexto, não como default global.

## Critérios de aplicação

### Quando DDD se aplica bem

- **Domínios complexos com regras ricas.** Lógica de negócio com invariantes, fluxos multi-etapa, decisões dependentes de múltiplas entidades, vocabulário próprio do negócio que precisa ser preservado.
- **Acesso a especialistas de domínio.** A linguagem ubíqua só funciona se houver alguém com conhecimento profundo do negócio que possa conversar com o time. Sem esse interlocutor, DDD vira ficção.
- **Time disposto a investir em modelagem.** DDD exige conversas, revisões de modelo, refatoração contínua de vocabulário. Times que tratam modelagem como overhead não vão extrair valor.
- **Sistemas com longevidade significativa.** O retorno do investimento em modelo aparece em prazo médio a longo. Em horizonte curto, o custo costuma superar o benefício.
- **Necessidade de evolução independente entre partes do sistema.** Bounded contexts justificam-se quando partes precisam evoluir em ritmos e direções diferentes — o que costuma exigir tanto fronteiras de código quanto fronteiras organizacionais.

### Quando DDD gera fricção sem retorno

- **CRUDs simples.** Telas administrativas que listam, criam, editam e removem registros sem regras de negócio relevantes não têm domínio rico a modelar. Aplicar DDD pleno aqui é cerimônia pura.
- **Projetos pequenos e protótipos.** Quando o objetivo é validar uma hipótese rapidamente, a modelagem cuidadosa atrasa.
- **Equipes que não engajam com domínio.** Se não há diálogo com especialistas e os desenvolvedores derivam o modelo de telas e tabelas, a "linguagem ubíqua" será um nome bonito para um modelo técnico disfarçado.
- **Subdomínios genéricos.** Autenticação, billing transacional padrão, envio de email transacional, captcha — comprar ou usar SaaS é melhor que modelar.
- **Sistemas sem complexidade real.** Nem todo sistema é complexo; alguns são apenas grandes. Tamanho não é complexidade.

### Coexistência com outros modelos

- Com @architecture/hexagonal: **complementar e frequentemente combinado**. DDD preenche o interior do hexágono (domínio + application) com vocabulário tático/estratégico; Hexagonal define como o núcleo se isola do resto. Esta é a configuração padrão do projeto para features com domínio rico.
- Com @architecture/clean-architecture: **complementar**. Clean organiza camadas concêntricas internas (entities / use cases / interface adapters / frameworks); DDD descreve **o que** vai em cada camada quando o domínio justifica. A diferença essencial frente a Clean é o eixo: **Clean é tática arquitetural** (regra de dependência radial, separação de camadas internas); **DDD é abordagem completa** (estratégica + tática), com peso significativo no eixo estratégico que Clean não cobre.
- Com @architecture/feature-based e @architecture/fsd: **complementar**. Esses modelos respondem **como organizar features no espaço do código**; DDD oferece o critério de **o que** é uma feature/contexto e por que esta fronteira é traçada aqui.
- Com @architecture/atomic-design: **ortogonal**. Atomic organiza biblioteca de UI; DDD organiza modelo de domínio. Convivem sem interferência.

## Trade-offs reconhecidos

- **Curva de aprendizado.** O vocabulário de DDD é abundante e específico. Times sem familiaridade prévia gastam meses até naturalizar a distinção entre entity e value object, ou entre application service e domain service. O investimento é real e antecipado.
- **Terminologia abundante e às vezes confusa.** "Service" significa três coisas diferentes (domain service, application service, infrastructure service). "Repository" tem definição estrita que difere do uso casual em outros frameworks. Disciplina de vocabulário é parte do trabalho.
- **Overhead em domínios simples.** Aplicar DDD pleno onde não há complexidade real produz código mais difícil de ler e manter, com camadas que não pagam seu próprio custo.
- **Fronteiras de bounded context são decisões pesadas.** Errar a fronteira (juntar dois contextos que deveriam estar separados, ou separar dois que são o mesmo) gera dívida arquitetural cara. Ferramentas como Event Storming reduzem o risco mas não eliminam.
- **Tensão com performance em aggregates grandes.** A disciplina de carregar o aggregate inteiro para qualquer operação pode causar gargalhos. A resposta canônica é manter aggregates pequenos; quando não é possível, costuma indicar modelagem que precisa ser revista ou separação em read model (CQRS).
- **Compromisso organizacional.** Bounded contexts só funcionam se as fronteiras forem respeitadas tanto no código quanto na organização do time. Em times pequenos com tudo misturado, a fronteira tende a ser violada.

## Anti-patterns

- **Anemic Domain Model.** Entities que são apenas containers de dados (`get`/`set`) sem comportamento, enquanto toda a lógica vive em "services" externos. É o uso mais comum equivocado de DDD — adota-se o vocabulário sem a substância. Entities devem ter métodos que expressam operações de negócio.
- **Repository virando DAO CRUD.** Repository com `getById`, `getAll`, `update`, `delete` genéricos sem vocabulário de domínio é um DAO disfarçado. Repositories falam de aggregates inteiros e usam linguagem de domínio nos métodos (`findActiveByCustomer`, `archiveExpiredOrders`).
- **Aggregates gigantes.** Aggregate que carrega centenas de entities internas, ou que precisa ser carregado inteiro para qualquer operação por causa de invariantes verdadeiros e falsos misturados. Sinal de modelagem que precisa ser fatiada — frequentemente em múltiplos aggregates pequenos comunicando-se por eventos.
- **Domain Events com payload de DTO inteiro.** Evento `OrderPlaced` carregando o objeto `Order` completo, com todos os campos. Eventos devem carregar **apenas** o essencial para o consumidor entender o que aconteceu — o resto, se necessário, busca por ID.
- **Vazamento de framework no domínio.** Anotações de ORM, decorators de Nest, tipos do Next, classes de SDK em código de `domain/`. Sinal de fronteira hexagonal violada e DDD comprometido. O domínio deve ser código de propósito geral, isolado de tecnologia.
- **Modelar entidades como tabelas.** Começar pela estrutura do banco e derivar o modelo é o oposto de DDD. O modelo nasce da conversa com o domínio; o banco serve o modelo, não o contrário.
- **Bounded context fictício.** Pasta chamada `customers/` com modelo gigante usado por toda a aplicação não é bounded context — é namespace. Bounded context exige fronteira **real**: vocabulário próprio, integração explícita com outros contextos, possibilidade de evolução independente.
- **Ubiquitous language só no diagrama.** Vocabulário acordado em workshop que não aparece no código (porque o código usa termos técnicos, abreviações ou termos do banco) é teatro. A linguagem precisa atravessar do post-it até o nome do método.
- **Shared kernel descontrolado.** Pasta `shared/domain/` que cresce até virar o modelo monolítico que DDD tenta evitar. Shared kernel só funciona quando é pequeno, estável e governado conjuntamente.
- **Tactical pattern como objetivo final.** Aplicar `Specification`, `Factory`, `Value Object`, `Domain Service` porque o livro descreve, sem que o problema os justifique. Os blocos táticos são ferramentas; o critério é "isso esclarece o modelo?", não "isso aparece no Evans?".
- **CQRS prematuro.** Adotar separação de modelo de leitura e escrita em todos os contextos antes de haver divergência real entre necessidades de leitura e escrita. Vira camada extra sem retorno.
- **Event Sourcing como default.** Persistir tudo como sequência de eventos em domínios onde história não importa para o negócio. O custo (versionamento, snapshots, replay, projeções) é grande; só compensa quando o requisito é real.
- **Anticorruption Layer fina demais.** ACL que apenas renomeia campos do sistema externo sem traduzir conceitos. Se o modelo externo é tóxico, a tradução precisa ser semântica, não cosmética.

## Referências cruzadas

- Modelos arquiteturais complementares: @architecture/hexagonal (DDD preenche o interior do hexágono), @architecture/clean-architecture (Clean é tática arquitetural; DDD é abordagem completa estratégica + tática).
- Modelos arquiteturais ortogonais que coexistem: @architecture/feature-based, @architecture/fsd (organizam features no espaço; DDD oferece o critério de fronteira), @architecture/atomic-design (organiza biblioteca de UI).
- Stacks que tipicamente aparecem na implementação tática: @stacks/language/typescript@7 (branded types para identidades e value objects), @stacks/validation/zod@4 (validação de invariantes na construção de value objects), @stacks/database/firebase-firestore e @stacks/database/postgres (implementação de repositories), @stacks/backend/firebase-functions (publishers e consumers de domain events).
- Contratos relacionados: @contracts/schemas (modelagem de payloads de APIs entre bounded contexts), `@contracts/events` (formato canônico de eventos publicados — a ser definido).
- Regras de implementação que aplicam disciplina sobre código DDD: @rules/validation (invariantes de value objects), @rules/error-handling (mapeamento de erros de adapter para erros de domínio), @rules/data-modeling (naming e estrutura de tipos do domínio).
- Documentação canônica:
  - Eric Evans. *Domain-Driven Design: Tackling Complexity in the Heart of Software* (2003).
  - Vaughn Vernon. *Implementing Domain-Driven Design* (2013).
  - Alberto Brandolini. *Introducing EventStorming* (2021).
  - Site de referência: https://www.domainlanguage.com/ddd/

## Aspectos intencionalmente omitidos

- O detalhamento mecânico de **como** isolar o domínio de tecnologia (ports, adapters, composition root, regra de dependência) pertence a @architecture/hexagonal, não a este documento.
- O detalhamento de camadas concêntricas internas (entities / use cases / interface adapters / frameworks & drivers) e da regra de dependência radial pertence a @architecture/clean-architecture.
- O **formato canônico de domain events publicados** (envelope, metadados, versionamento, naming) pertence a `@contracts/events` (a ser definido), não a este documento.
- O **formato canônico de schemas de API** que servem como published language entre bounded contexts pertence a @contracts/schemas.
- Convenções específicas sobre branded types, schemas Zod e validação de invariantes vivem em @rules/validation e em regras de data modeling, não aqui.
- Padrões específicos de saga, orquestração de processos longos e compensating actions não são tratados aqui — quando aplicáveis, viram @decisions ou documentos específicos por contexto.
- Estratégias de migração incremental de uma base não-DDD para DDD não estão escopadas — são registradas como @decisions dedicadas quando o caso aparecer.
- A escolha entre Event Sourcing e state-based persistence é decisão de contexto, registrada em @decisions quando relevante.
- Convenções de teste específicas para aggregates, domain services e application services pertencem às práticas de teste do projeto, não a este documento.
