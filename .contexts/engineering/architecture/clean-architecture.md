---
title: Clean Architecture
type: architecture
status: active
last_updated: 2026-05-20
upstream: https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
---

# Clean Architecture

Clean Architecture é um estilo arquitetural sintetizado por Robert C. Martin ("Uncle Bob") em 2012, formalizado no livro *Clean Architecture: A Craftsman's Guide to Software Structure and Design* (2017). Não é uma invenção original — é a destilação explícita de uma família de modelos arquiteturais convergentes que vinham sendo descritos sob nomes diferentes desde o início dos anos 2000: **Hexagonal Architecture** (Alistair Cockburn, 2005), **Onion Architecture** (Jeffrey Palermo, 2008), **DCI** (Reenskaug & Coplien) e o próprio **Boundary-Control-Entity** (Jacobson). Uncle Bob observou que todos esses modelos compartilham um conjunto idêntico de invariantes essenciais e propôs Clean Architecture como articulação canônica desse conjunto.

A tese central é simples e operacional: **a arquitetura deve manter o software independente de frameworks, UI, banco de dados e qualquer agente externo**, de forma que essas decisões possam ser tomadas — e revertidas — tarde, sem impacto sobre a lógica de negócio. O mecanismo para alcançar essa independência é uma combinação rígida de **camadas concêntricas** com uma **regra de dependência** que aponta sempre para dentro.

Clean Architecture é parente próximo de @architecture/hexagonal: ambos invertem dependências para isolar o domínio de tecnologia. A diferença é de granularidade: Hexagonal apresenta o interior como **um único núcleo** (domínio + aplicação) cercado por uma fronteira de ports/adapters; Clean **decompõe** esse interior em **quatro camadas concêntricas explícitas**, separando regras de negócio corporativas (Entities) de regras de aplicação (Use Cases) e tratando a tradução para o mundo exterior como uma camada dedicada (Interface Adapters). Para um time que já opera em Hexagonal, Clean é o passo natural quando o domínio cresce a ponto de exigir distinção formal entre o que é regra do **negócio em si** (sobreviveria mesmo se o software não existisse) e o que é regra **desta aplicação específica** (existe porque automatizamos esse processo aqui).

## Conceito canônico

### Motivação: independência

Uncle Bob enumera quatro independências que Clean Architecture preserva, todas decorrentes da regra de dependência:

| Independência | O que significa | Por que importa |
|---|---|---|
| **De frameworks** | O domínio não depende de Next.js, Express, Spring, Nest, etc. Frameworks são detalhes externos. | Trocar de framework não exige reescrever regras de negócio. |
| **De UI** | A lógica não muda quando a apresentação muda (web → mobile → CLI → API). | A mesma regra serve múltiplos delivery mechanisms. |
| **De banco de dados** | O domínio não conhece Postgres, Firestore, MongoDB, Redis. Persistência é detalhe externo. | Troca de banco vira troca de adapter, não de modelo. |
| **De agentes externos** | O domínio não conhece SDKs de IA, gateways de pagamento, serviços de email. | O negócio sobrevive a mudanças de fornecedor. |

A quinta independência implícita é **independência para teste**: o domínio pode ser exercitado sem nenhuma das tecnologias acima estar presente. Esse é o payoff prático mais imediato.

### As quatro camadas concêntricas

Clean Architecture organiza o software em quatro anéis concêntricos. Do centro para fora:

```
                ┌────────────────────────────────────────┐
                │  Frameworks & Drivers                  │
                │  (Web, DB, Devices, External APIs)     │
                │  ┌──────────────────────────────────┐  │
                │  │  Interface Adapters              │  │
                │  │  (Controllers, Presenters,       │  │
                │  │   Gateways, Mappers)             │  │
                │  │  ┌────────────────────────────┐  │  │
                │  │  │  Use Cases                 │  │  │
                │  │  │  (Application Business     │  │  │
                │  │  │   Rules)                   │  │  │
                │  │  │  ┌──────────────────────┐  │  │  │
                │  │  │  │  Entities            │  │  │  │
                │  │  │  │  (Enterprise         │  │  │  │
                │  │  │  │   Business Rules)    │  │  │  │
                │  │  │  └──────────────────────┘  │  │  │
                │  │  └────────────────────────────┘  │  │
                │  └──────────────────────────────────┘  │
                └────────────────────────────────────────┘

                  ◄────── dependências apontam para dentro ──────
```

#### Anel 1 — Entities (Enterprise Business Rules)

**Entities encapsulam as regras de negócio mais gerais, de mais alto nível, que sobreviveriam mesmo se este software específico não existisse.** Uma entity pode ser um objeto com métodos, um conjunto de funções puras ou um agregado de tipos — o que importa é que represente conceitos do negócio que existem independentemente da aplicação.

Exemplos: as regras de cálculo de juros compostos em um banco existiriam mesmo sem o sistema; as regras de validade de um CPF existem fora de qualquer aplicação específica; as regras de cobrança de imposto sobre uma operação são do negócio, não do software.

Entities **nunca** mudam por causa de:
- Mudança de framework
- Mudança de UI
- Mudança de banco de dados
- Mudança de fluxo da aplicação (esse seria um use case mudando)

Entities mudam **apenas** quando as regras do **negócio em si** mudam.

#### Anel 2 — Use Cases (Application Business Rules)

**Use cases encapsulam as regras de negócio específicas desta aplicação.** Orquestram fluxos: recebem input, carregam entities via ports de saída, invocam métodos de domínio, persistem mudanças, retornam output. As regras que vivem aqui só existem porque **este software** automatiza um processo específico.

Exemplo: a regra "ao registrar um usuário, enviar email de boas-vindas e criar um workspace default" é regra **desta aplicação** — outra empresa do mesmo setor poderia automatizar isso de forma diferente. Já a regra "um usuário tem email único" é provavelmente regra de negócio (entity).

Use cases **mudam** quando o fluxo da aplicação muda. **Não mudam** quando UI, banco ou framework mudam.

Cada use case típico é composto por:

- **Input Boundary** (input port): interface que descreve o use case, do ponto de vista de quem chama. Recebe um **Request Model** (DTO) e retorna nada (efeitos via output) ou um valor.
- **Interactor**: a implementação do use case. Orquestra entities e portas de saída.
- **Output Boundary** (output port): interface que descreve para onde o resultado é enviado. Recebe um **Response Model** (DTO).
- **Presenter** (no anel de Interface Adapters): implementa o Output Boundary; formata o resultado para a entrega.

#### Anel 3 — Interface Adapters

**Interface Adapters traduzem entre o formato conveniente para use cases/entities e o formato conveniente para agentes externos.** Vivem aqui:

- **Controllers**: recebem input do mundo exterior (HTTP request, mensagem de fila, evento agendado), montam o Request Model e invocam o use case via Input Boundary.
- **Presenters**: recebem o Response Model do use case e formatam para o canal de saída (JSON, HTML, ViewModel para UI).
- **Gateways**: implementam interfaces declaradas no anel de Use Cases para acesso a recursos externos (repositórios, clientes HTTP, publishers de evento). Não confundir com o termo "gateway" usado em outros contextos.
- **Mappers**: traduzem entre o modelo do domínio e modelos específicos de banco, API externa ou SDK.

#### Anel 4 — Frameworks & Drivers

**O anel mais externo é onde vivem os detalhes substituíveis: frameworks, banco de dados, devices, interfaces externas.** Uncle Bob é deliberado em chamar essa camada de "detalhes": Next.js é detalhe, Postgres é detalhe, o cliente da OpenAI é detalhe. Em Clean Architecture, **detalhes são o que pode ser trocado sem reescrever o negócio**.

Esse anel raramente contém código próprio — em geral é o framework executando, o driver do banco rodando, o SDK do provedor sendo chamado. O código que escrevemos aqui é a **cola** mínima entre o framework e o anel de Interface Adapters.

### A Regra de Dependência

A regra fundamental de Clean Architecture é uma única frase:

> **Source code dependencies must point only inward.**

Traduzindo:

1. Código no anel **N** pode importar de qualquer anel **mais interno** (N-1, N-2, ...).
2. Código no anel **N** **nunca** importa de um anel **mais externo**.
3. Nenhum nome, função, classe, variável ou conceito de um anel externo pode aparecer no código de um anel interno.

Consequência direta: **Entities não importam Use Cases. Use Cases não importam Interface Adapters. Interface Adapters não importam Frameworks & Drivers.** O fluxo de controle pode atravessar essas fronteiras nos dois sentidos, mas o **fluxo de dependência** (quem importa quem) é sempre radial e centrípeto.

Quando o fluxo de controle precisa ir de um anel interno para um externo (use case precisa persistir uma entity, por exemplo), a **inversão de dependência** entra em cena: o anel interno declara uma **interface** (input/output boundary, repository port, gateway port), e o anel externo **implementa** essa interface. O anel interno depende da abstração; a implementação é injetada na composition root.

Essa é a aplicação direta do **Dependency Inversion Principle** ao limite entre camadas — exatamente o mesmo mecanismo usado por @architecture/hexagonal entre núcleo e adapters, apenas aplicado em mais fronteiras simultaneamente.

### DTOs cruzando fronteiras

Quando dados atravessam uma fronteira entre anéis, eles **não** atravessam como entities ou objetos do domínio. Atravessam como **estruturas de dados simples** (Data Transfer Objects, Request Models, Response Models, ViewModels). Os motivos:

1. **Entities encapsulam regras de negócio.** Vazá-las para anéis externos vaza o coração do negócio. Um controller que recebe `Order` inteiro perdeu o controle sobre o que faz com ele.
2. **A forma conveniente do anel externo difere da do interno.** O banco quer linhas; o use case quer agregados; o controller quer payload achatado. Forçar um único formato para todas as camadas é o caminho para o god object.
3. **Mudanças em entities não devem propagar para fora.** Se um campo interno do `Order` é renomeado, o JSON da API não deveria mudar automaticamente.

DTOs são planos, frequentemente imutáveis, sem comportamento — apenas dados nomeados. Em TypeScript, são `type` ou `interface` puros, ou objetos validados por @stacks/validation/zod@4 no ponto de entrada/saída.

### Input e Output Boundaries

A formulação canônica de Uncle Bob para um use case é particularmente explícita sobre as duas direções do fluxo:

- **Input Boundary**: declarada no anel de Use Cases. Define a assinatura `execute(request: RequestModel): void` (ou retorno explícito quando síncrono). O controller no anel externo **conhece** essa interface e a invoca.
- **Output Boundary**: também declarada no anel de Use Cases. Define `present(response: ResponseModel): void`. O Interactor **invoca** essa interface; o Presenter no anel externo a implementa.

A simetria é deliberada: o use case **não retorna** o resultado para quem chamou — ele envia o resultado para um Output Boundary que ele conhece apenas como interface. Quem orquestra (controller + presenter) é responsável por amarrar a saída ao destino final.

Em práticas modernas com TypeScript, essa estrutura é frequentemente **flexibilizada**: o use case retorna um valor (mais idiomático em linguagens com Promise) e o presenter é invocado pelo controller sobre o valor de retorno. A pureza acadêmica do double-dispatch é sacrificada em troca de ergonomia, sem perder a substância da separação. Ver "Como o time adotou".

### Screaming Architecture

Uncle Bob deriva um princípio complementar de Clean Architecture: a estrutura de pastas do projeto **deve gritar o domínio**, não o framework. Abrir o repositório de um sistema bancário deveria revelar pastas como `accounts/`, `transfers/`, `loans/`, `compliance/` — não `controllers/`, `services/`, `repositories/`, `models/`. A organização técnica é detalhe; o domínio é a tese do software.

Essa intuição é compartilhada por @architecture/feature-based e @architecture/fsd, que organizam código por feature de negócio em vez de por papel técnico. Clean Architecture e Screaming Architecture são complementares: Clean diz **como cada feature se estrutura internamente** (anéis concêntricos); Screaming diz que **o nível superior do código revela o negócio**.

### Composition Root

Como anéis internos não conhecem implementações concretas, alguém precisa instanciar adapters, presenters, gateways e amarrá-los aos boundaries. Esse ponto é a **composition root** — um ponto único (ou poucos pontos locais) próximo ao entry point onde toda a fiação acontece. O conceito é idêntico ao tratado em @architecture/hexagonal.

### Variantes contemporâneas

#### Onion Architecture

Predecessora direta de Clean (Jeffrey Palermo, 2008). Propõe quase o mesmo: anéis concêntricos, domínio no centro, dependências apontando para dentro. A diferença prática é principalmente terminológica e de granularidade: Onion costuma falar em "Domain Model", "Domain Services", "Application Services" e "Infrastructure"; Clean explicita o anel de "Interface Adapters" com Controllers/Presenters/Gateways. Para fins práticos, Onion e Clean são intercambiáveis na maioria dos projetos.

#### Clean Architecture "lite"

Aplicação pragmática que adota a regra de dependência e a separação Entities/Use Cases, mas relaxa formalidades como Input/Output Boundary explícitos como interfaces separadas, double-dispatch presenter, e múltiplos DTOs por use case. É a forma dominante na prática moderna em TypeScript — e a adotada neste projeto.

## Como o time adotou

A aplicação opera com Next.js 16, Firebase Functions, Postgres, Firestore e múltiplos SDKs de IA. Esse leque torna a regra de dependência particularmente valiosa: cada uma dessas tecnologias evolui em ritmo próprio, e o investimento em proteger o domínio dessas mudanças paga em prazo curto.

O time **não adota Clean Architecture como default**. A configuração arquitetural padrão para features de domínio rico é **@architecture/hexagonal com vocabulário tático de @architecture/ddd**. Clean Architecture é aplicada quando:

1. O domínio cresce a ponto de exigir distinção formal entre regras corporativas (Entities) e regras de aplicação (Use Cases). O "núcleo" do hexágono começa a misturar invariantes do negócio com orquestrações específicas, e a separação em dois anéis internos clareia o modelo.
2. O mesmo domínio é exposto por **múltiplos delivery mechanisms** (Next.js + Cloud Functions + CLI/job + futuramente API pública). Ter o anel de Interface Adapters explícito ajuda a manter os controllers/presenters de cada delivery em pé de igualdade.
3. A feature tem **horizonte de manutenção longo** e justifica o boilerplate adicional.

Para features que não satisfazem nenhum desses critérios, @architecture/hexagonal puro é mais econômico e suficiente.

### Localização no projeto

Quando Clean Architecture se aplica, ela vive **dentro do recorte de uma feature**, mantendo a organização por contexto promovida por @architecture/feature-based e @architecture/fsd. A estrutura interna canônica:

```
src/features/<feature>/
  domain/                              # Anel 1 — Entities (Enterprise Business Rules)
    entities/
      order.ts                         # entity com métodos de negócio
      orderItem.ts
    valueObjects/
      money.ts
      orderStatus.ts
    services/
      pricingPolicy.ts                 # domain service (lógica que cruza entities)
    events/
      orderPlaced.ts                   # domain events (quando aplicável)
  application/                         # Anel 2 — Use Cases (Application Business Rules)
    ports/
      input/                           # Input Boundaries
        placeOrder.ts                  # interface do use case
        cancelOrder.ts
      output/                          # Output Boundaries / Gateways
        orderRepository.ts             # interface de persistência
        emailSender.ts                 # interface de gateway externo
        paymentGateway.ts
    useCases/
      placeOrder.ts                    # Interactor — implementa Input Boundary
      cancelOrder.ts
    dto/
      placeOrderRequest.ts             # Request Model
      placeOrderResponse.ts            # Response Model
  adapters/                            # Anel 3 — Interface Adapters
    controllers/
      placeOrderController.ts          # invocado por Next.js route/action
      placeOrderFunctionHandler.ts     # invocado por Firebase Function
    presenters/
      placeOrderJsonPresenter.ts       # formata Response → JSON
    gateways/
      postgresOrderRepository.ts       # implementa OrderRepository
      firestoreOrderRepository.ts      # alternativa
      resendEmailSender.ts             # implementa EmailSender
      stripePaymentGateway.ts          # implementa PaymentGateway
  infrastructure/                      # Anel 4 — Frameworks & Drivers (cola mínima)
    postgresClient.ts                  # configuração do driver
    firebaseAdmin.ts
  composition.ts                       # fiação local
  index.ts                             # public API
```

O leitor atento perceberá que os anéis 1 e 2 são essencialmente o **núcleo do hexágono** descrito em @architecture/hexagonal, agora **explicitamente fatiados** em dois anéis. O anel 3 corresponde aos adapters de @architecture/hexagonal, separados em controllers (driving), presenters (saída formatada) e gateways (driven). O anel 4 corresponde aos drivers concretos das tecnologias.

### Naming adotado

- **Entities**: nomeadas pelo conceito de negócio: `Order`, `Customer`, `Invoice`. Métodos descrevem operações de negócio: `order.approve()`, `order.cancel(reason)`, `invoice.markAsPaid(payment)`.
- **Use Cases**: nomeados como verbo + objeto no padrão `<Action><Entity>`: `PlaceOrder`, `CancelOrder`, `RegisterUser`, `GenerateMonthlyReport`. O arquivo do use case (interactor) tem o mesmo nome em camelCase: `placeOrder.ts`.
- **Input/Output DTOs**: `<UseCase>Request` e `<UseCase>Response`. Ex.: `PlaceOrderRequest`, `PlaceOrderResponse`.
- **Controllers**: `<UseCase>Controller` ou `<UseCase><Channel>Handler`: `PlaceOrderController` (genérico) ou `PlaceOrderRouteHandler`, `PlaceOrderFunctionHandler` quando o canal é parte do nome.
- **Presenters**: `<UseCase><Format>Presenter`: `PlaceOrderJsonPresenter`, `PlaceOrderHtmlPresenter`.
- **Gateways** (repositórios e gateways de serviço): `<Technology><Concept>Repository` ou `<Technology><Concept>Gateway`. Ex.: `PostgresOrderRepository`, `ResendEmailSender`, `OpenAICompletionGateway`. O nome da **interface** que essas classes implementam **não** contém tecnologia — vive no anel de Use Cases: `OrderRepository`, `EmailSender`, `CompletionGateway`.

A regra é a mesma de @architecture/hexagonal: **o nome do port nunca contém o nome de uma tecnologia; o nome do adapter sempre contém**.

### Use case "lite" em TypeScript

A forma canônica do livro envolve Input Boundary, Interactor, Output Boundary e Presenter como interfaces e classes separadas, com double-dispatch. Na prática TypeScript do projeto, a versão idiomática é:

Input Boundary (port no anel de Use Cases):

```typescript
// application/ports/input/placeOrder.ts
import type { PlaceOrderRequest } from '../../dto/placeOrderRequest';
import type { PlaceOrderResponse } from '../../dto/placeOrderResponse';

export type PlaceOrder = (request: PlaceOrderRequest) => Promise<PlaceOrderResponse>;
```

Output ports (gateways no anel de Use Cases):

```typescript
// application/ports/output/orderRepository.ts
import type { Order, OrderId } from '../../../domain/entities/order';

export interface OrderRepository {
  findById(id: OrderId): Promise<Order | null>;
  save(order: Order): Promise<void>;
}
```

Interactor (use case no anel de Use Cases):

```typescript
// application/useCases/placeOrder.ts
import type { PlaceOrder } from '../ports/input/placeOrder';
import type { OrderRepository } from '../ports/output/orderRepository';
import type { EmailSender } from '../ports/output/emailSender';
import { Order } from '../../domain/entities/order';

export const makePlaceOrder = (deps: {
  orders: OrderRepository;
  email: EmailSender;
}): PlaceOrder => {
  return async (request) => {
    // Regras de aplicação: orquestração
    const order = Order.create(request);          // ← regra corporativa vive na Entity
    await deps.orders.save(order);
    await deps.email.sendOrderConfirmation(order);
    return { orderId: order.id, total: order.total };
  };
};
```

Controller (anel de Interface Adapters, lado de entrada):

```typescript
// adapters/controllers/placeOrderRouteHandler.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { placeOrder } from '../../composition';

const RequestSchema = z.object({
  customerId: z.string().uuid(),
  items: z.array(z.object({
    sku: z.string(),
    quantity: z.number().int().positive(),
  })),
});

export async function POST(req: Request) {
  const parsed = RequestSchema.parse(await req.json());
  const response = await placeOrder(parsed);
  return NextResponse.json(response);
}
```

Gateway (anel de Interface Adapters, lado de saída):

```typescript
// adapters/gateways/postgresOrderRepository.ts
import type { OrderRepository } from '../../application/ports/output/orderRepository';
import type { Order, OrderId } from '../../domain/entities/order';
import { db } from '../../infrastructure/postgresClient';

export const PostgresOrderRepository: OrderRepository = {
  async findById(id: OrderId) { /* SQL → Order */ },
  async save(order: Order) { /* Order → SQL */ },
};
```

Composition root local (`composition.ts`):

```typescript
import { makePlaceOrder } from './application/useCases/placeOrder';
import { PostgresOrderRepository } from './adapters/gateways/postgresOrderRepository';
import { ResendEmailSender } from './adapters/gateways/resendEmailSender';

export const placeOrder = makePlaceOrder({
  orders: PostgresOrderRepository,
  email: ResendEmailSender,
});
```

A separação **Input Boundary explícita como tipo de função** + **Interactor como factory** + **Output Ports como interfaces** preserva a essência da forma canônica sem o overhead do double-dispatch literal. Presenters dedicados aparecem apenas quando há mais de um formato de saída para o mesmo use case — em projetos majoritariamente JSON, o controller faz o papel de presenter implicitamente.

### Integração com Next.js 16

A superfície de entrada do Next.js é inteiramente **anel 3 (Interface Adapters) + anel 4 (Frameworks & Drivers)**:

- **Route handlers** (`app/api/.../route.ts`) e **Server Actions** são controllers. Extraem input, validam com @stacks/validation/zod@4, invocam o use case, formatam a resposta.
- **Server Components** que renderizam dados consomem use cases de leitura e passam o resultado pronto para a UI. O componente em si não conhece o use case — recebe ViewModel.
- **Client Components** que disparam mutações invocam Server Actions, que invocam controllers, que invocam use cases.
- O **runtime do Next.js** (request handling, file-based routing, streaming, edge runtime) é puro anel 4 — detalhe substituível.

### Integração com Firebase Functions

Cada Cloud Function exportada é um controller no anel de Interface Adapters, com o runtime do Firebase Functions ocupando o anel 4:

- **Webhooks HTTP** (`onRequest`): controller HTTP, simétrico aos route handlers do Next.js.
- **Triggers Firestore** (`onDocumentCreated`, etc.): controller de evento; transforma o snapshot em Request Model.
- **Scheduled functions** (`onSchedule`): controller de tempo; invoca o use case sem input externo.

O mesmo use case é frequentemente compartilhado entre Next.js e Functions — o que muda é o controller que o invoca.

### Persistência heterogênea (Postgres e Firestore)

A coexistência entre Postgres e Firestore se acomoda naturalmente em Clean: cada um vira um conjunto de gateways no anel 3 implementando os mesmos ports declarados no anel 2. Trocar persistência para um contexto específico é trocar o gateway na composition root. Ver @stacks/database/firebase-firestore e @stacks/database/postgres para os manuais concretos de cada banco.

### SDKs de IA como gateways

Chamadas a OpenAI, Gemini e Vercel AI SDK vivem em gateways no anel 3, implementando interfaces declaradas no anel 2 (`CompletionGateway`, `EmbeddingGateway`, `ImageGenerationGateway`). O use case fala "preciso gerar uma completion"; o gateway concreto sabe se o provedor é OpenAI ou Gemini. Ver @stacks/ai/vercel-ai-sdk, @stacks/ai/openai, @stacks/ai/gemini.

### Relação com @architecture/hexagonal e @architecture/ddd

A relação com os outros dois modelos arquiteturais centrais do projeto merece tratamento explícito porque costuma confundir quem está começando:

- **Clean vs Hexagonal**: Clean é **uma elaboração** de Hexagonal. Toda Clean Architecture **é** uma Hexagonal Architecture com camadas internas explicitadas. A escolha entre os dois é uma decisão de **granularidade**: se a distinção entre Entities (regras corporativas) e Use Cases (regras de aplicação) clareia o modelo, Clean paga o boilerplate; se essa distinção é artificial para o domínio em questão, Hexagonal puro é suficiente. **Default do projeto: Hexagonal. Upgrade para Clean: feature por feature, quando justificado.**

- **Clean vs DDD**: ortogonais e complementares. Clean é **estrutural** — diz como o código se organiza em anéis e como as dependências fluem. DDD é uma **abordagem completa** — diz como modelar o domínio (tactical) e como decompor o sistema em bounded contexts (strategic). Clean acomoda naturalmente o vocabulário tático de DDD: Entities de Clean comportam-se como Aggregates e Entities de DDD; Repositories de DDD são gateways no anel 3 de Clean; Domain Services de DDD vivem no anel 1; Application Services de DDD são os Use Cases (anel 2). Clean **não cobre** o lado estratégico de DDD (bounded contexts, context mapping, ubiquitous language) — para isso, ver @architecture/ddd.

A combinação típica em uma feature complexa do projeto: **estrutura de anéis de Clean + vocabulário tático de DDD + bounded context como recorte de feature herdado de @architecture/ddd e @architecture/feature-based**.

## Critérios de aplicação

### Quando Clean Architecture se aplica bem

- **Lógica de aplicação rica e em camadas conceituais distintas.** O domínio tem regras corporativas (existiriam fora do software) **e** regras de aplicação (específicas deste software) suficientemente densas para justificar a separação em dois anéis.
- **Múltiplos delivery mechanisms para o mesmo domínio.** Next.js + Firebase Functions + CLI + futura API pública compartilhando os mesmos use cases. O anel de Interface Adapters explícito mantém os controllers em pé de igualdade.
- **Longa expectativa de vida do código.** Quanto maior o horizonte, mais paga a disciplina de isolamento de detalhes. Clean foi desenhada explicitamente para sistemas com longevidade.
- **Time grande ou distribuído.** Fronteiras explícitas entre camadas reduzem disputas sobre onde colocar código e protegem partes do sistema de mudanças acidentais.
- **Alta cobertura de testes desejada.** O payoff em testes unitários é imediato — o anel 1 e 2 testam-se sem nenhuma infraestrutura.
- **Risco real de troca de stack.** Quando há possibilidade concreta de trocar banco, framework, provedor de IA ou gateway, o investimento em Clean rende em curto prazo.

### Quando Clean Architecture gera fricção sem retorno

- **CRUDs.** Telas administrativas sem regras de negócio relevantes pagam boilerplate de quatro anéis para nenhum ganho. Acessar o banco diretamente do route handler é honesto nesse caso.
- **Scripts e jobs simples.** Tarefas pontuais sem lógica complexa não têm domínio a isolar.
- **MVPs e protótipos.** Quando o objetivo é validar uma hipótese rapidamente, a cerimônia atrasa o feedback do mercado.
- **Features puramente de UI.** Componentes sem backend significativo, ou consumindo leitura simples, não justificam quatro anéis.
- **Domínio sem distinção real entre regras corporativas e de aplicação.** Se toda regra é "fluxo desta tela", a separação Entities/Use Cases é artificial — Hexagonal puro é mais honesto.
- **Time sem familiaridade.** A curva é real. Uma Clean mal-construída é pior que um Hexagonal bem-construído.

### Coexistência com outros modelos

- Com @architecture/hexagonal: **Clean é o passo seguinte natural** quando Hexagonal puro deixa de ser suficiente. As duas arquiteturas **não coexistem na mesma feature** — escolhe-se uma. No projeto, coexistem **entre features**: features simples ficam em Hexagonal; features que justificam, ficam em Clean.
- Com @architecture/ddd: **complementares e tipicamente combinadas**. Vocabulário tático de DDD (Entity, Value Object, Aggregate, Repository, Domain Event, Domain Service, Application Service) mapeia diretamente para os anéis de Clean. Strategic design de DDD (bounded contexts) determina **se** uma feature é grande o suficiente para justificar Clean.
- Com @architecture/feature-based e @architecture/fsd: **complementares**. Esses modelos respondem **como organizar features no espaço**; Clean responde **como cada feature se estrutura internamente em anéis**. Aplicar ambos simultaneamente é a configuração canônica do projeto.
- Com @architecture/atomic-design: **ortogonal**. Atomic organiza biblioteca de UI compartilhada; Clean organiza núcleo de aplicação. Convivem sem fricção.

## Trade-offs reconhecidos

- **Boilerplate significativo.** Cada use case carrega Input Boundary, DTOs de request/response, Interactor, ports de output, gateways implementando esses ports, controller, opcionalmente presenter. Para domínio simples, é quatro arquivos por um.
- **Mapeamento explícito entre camadas.** Entity → DTO → JSON do controller; payload → DTO → Entity. Cada fronteira exige um mapper. A duplicação aparente é o preço da independência — mas é duplicação real, e precisa ser justificada caso a caso.
- **Indireção que esconde fluxo linear.** Seguir "route handler → controller → use case → port → gateway → SQL" exige saltar entre múltiplos arquivos. A clareza estrutural custa em legibilidade linear.
- **Risco de "Clean teatro".** Aplicar todos os anéis sem que o domínio justifique gera código que **parece** Clean mas é cerimônia vazia: use cases que apenas repassam para gateways, entities anêmicas, presenters que apenas serializam JSON. O sintoma é "tirei o use case e nada de negócio se perdeu".
- **Tentação de over-engineering.** A elegância conceitual dos quatro anéis seduz times a aplicar a arquitetura mesmo onde não há domínio rico. A defesa é o critério "essa feature tem **regras corporativas distintas de regras de aplicação**?" — se não, Hexagonal puro.
- **Curva de aprendizado.** Distinguir Entity (anel 1) de Use Case (anel 2) exige prática. O erro comum é colocar lógica de aplicação dentro da Entity (Entity sabe sobre fluxo) ou regras de negócio dentro do Use Case (Use Case acumula validação de invariantes que pertencem à Entity).
- **Ergonomia de double-dispatch presenter em TypeScript.** A forma canônica do livro é desconfortável em código async/await idiomático. A versão "lite" adotada sacrifica pureza por ergonomia — registrado aqui para que ninguém leia o livro e ache que está fazendo "errado".

## Anti-patterns

- **Entity anêmica.** Entity que é apenas container de dados (`get`/`set`), com toda a lógica vivendo em "services" ou no use case. O anel 1 vira nome bonito para tipos de dados. Entity deve ter métodos que expressam operações de negócio com invariantes.
- **Use case fininho.** Use case que apenas chama `repository.save(input)` e retorna `input`. Se removê-lo não muda nada, não há regra de aplicação real ali — o repository é chamado direto pelo controller, ou a feature não justifica Clean.
- **Vazamento de tipos de framework no domínio.** `import { NextRequest } from 'next/server'` em `application/` ou `domain/`. `import { Timestamp } from 'firebase-admin/firestore'` em uma entity. `import { Prisma } from '@prisma/client'` em qualquer anel interno. Cada uma dessas é violação direta da regra de dependência. Detectar via lint (path-scoped imports) ou code review.
- **Vazamento de tipos de banco no domínio.** Entity que tem campos `created_at: Timestamp` ou métodos que retornam `QueryDocumentSnapshot`. O domínio fala TypeScript puro; tradução acontece no anel 3. Ver @rules/data-modeling.
- **Camadas demais para problemas simples.** Tela administrativa de listagem de usuários implementada como `ListUsersController → ListUsersUseCase → UserRepository → UserPostgresGateway → SQL`. Se a feature é "SELECT * FROM users" formatado em JSON, o boilerplate é cerimônia vazia.
- **Presenter duplicando DTO sem ganho.** Quando o Response Model do use case já é JSON-serializable e o único formato de saída é JSON, criar um Presenter dedicado apenas para `return res` é puro overhead. Use o controller diretamente; introduza presenter quando houver mais de um formato.
- **Framework dentro do core.** Decorators de Nest em entities, hooks de React em use cases, middlewares de Express em portas. Cada um apaga a justificativa da arquitetura.
- **Composition root distribuída.** Gateways sendo instanciados dentro de controllers, ou ainda pior, dentro de use cases. A fiação vive em um único arquivo por feature — caso contrário, trocar gateway exige caçada na base inteira.
- **Use case importando gateway concreto.** `import { PostgresOrderRepository }` dentro de `useCases/placeOrder.ts`. Use case importa **interface**, nunca implementação. A composition root injeta.
- **Anel 3 dependendo do anel 4 explicitamente.** Controller importando direto do driver do banco em vez de usar o gateway. A camada de Interface Adapters protege as camadas internas dos drivers — pular essa proteção descaracteriza a arquitetura.
- **Onion + Clean + Hexagonal misturados sem critério.** Pasta `domain/` no estilo Onion, controllers no estilo MVC, ports no estilo Hexagonal, sem coerência sobre qual modelo está sendo seguido. Escolher um e ser consistente é mais importante que escolher o "correto".
- **Tactical pattern como objetivo.** Aplicar `Presenter`, `Interactor`, `Input/Output Boundary` porque o livro descreve, sem que o problema justifique. Os blocos são ferramentas; o critério é "isso clareia o modelo?".
- **Migração massiva sem decisão registrada.** Reescrever features inteiras para Clean sem @decisions explícita registrando motivação e trade-offs. A escolha entre Hexagonal e Clean é decisão arquitetural pesada — merece ADR quando aplicada em larga escala.

## Referências cruzadas

- Modelos arquiteturais relacionados: @architecture/hexagonal (parente próximo; Clean é elaboração com camadas concêntricas adicionais), @architecture/ddd (vocabulário tático preenche os anéis 1 e 2; strategic design determina quando uma feature merece Clean).
- Modelos arquiteturais ortogonais que coexistem: @architecture/feature-based, @architecture/fsd (organizam features no espaço; Clean organiza o interior de cada feature), @architecture/atomic-design (organiza biblioteca de UI).
- Stacks que tipicamente aparecem no anel 4 (Frameworks & Drivers): @stacks/frontend/next@16, @stacks/backend/firebase-functions, @stacks/database/firebase-firestore, @stacks/database/postgres, @stacks/ai/vercel-ai-sdk, @stacks/ai/openai, @stacks/ai/gemini.
- Stacks que tipicamente atravessam a fronteira (validação de Request Model no controller): @stacks/validation/zod@4.
- Regras de implementação que aplicam disciplina sobre código Clean: @rules/code-review, @rules/error-handling, @rules/validation, @rules/testing, @rules/data-modeling.
- Documentação canônica original:
  - Robert C. Martin. "The Clean Architecture" (2012). https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html
  - Robert C. Martin. *Clean Architecture: A Craftsman's Guide to Software Structure and Design* (2017).
  - Jeffrey Palermo. "The Onion Architecture" (2008) — predecessora.
  - Alistair Cockburn. "Hexagonal Architecture" (2005) — irmã mais velha; ver @architecture/hexagonal.

## Aspectos intencionalmente omitidos

- O mecanismo geral de inversão de dependência por ports/adapters em sua forma mínima pertence a @architecture/hexagonal. Este documento o assume e detalha apenas o que Clean acrescenta (decomposição em quatro anéis explícitos).
- O vocabulário tático de DDD (Aggregate, Value Object, Repository pattern, Domain Event, Anti-Corruption Layer) e o estratégico (Bounded Context, Context Map, Ubiquitous Language) pertencem a @architecture/ddd. Este documento referencia mas não redefine.
- O detalhamento da forma canônica de double-dispatch Presenter com chamada explícita ao Output Boundary é mencionado mas não aprofundado — a versão "lite" adotada não a usa, e a versão canônica está plenamente coberta no livro de Uncle Bob.
- Estratégias específicas de mapeamento entre Entity e DTO (manual, com biblioteca de mapper, com schema Zod compartilhado) são tratadas em @rules/data-modeling, não aqui.
- Convenções específicas de teste por anel (testes unitários de Entity, testes de use case com fake gateways, testes de integração de gateway com banco real) pertencem às práticas de teste do projeto.
- Padrões de propagação e mapeamento de erros entre anéis (exceptions de gateway → erros de domínio → respostas de controller) são tratados em @rules/error-handling.
- A escolha entre use case como função (`makePlaceOrder` retornando função) ou como classe (`class PlaceOrderUseCase`) é estilística e tratada em regras de implementação.
- Variantes adjacentes que coexistem na literatura (Boundary-Control-Entity de Jacobson, DCI de Reenskaug, Functional Core/Imperative Shell de Gary Bernhardt) não são detalhadas — quando relevantes, aparecem como @decisions específicas.
- Estratégias de migração incremental de uma base sem Clean para Clean (ou de Hexagonal para Clean) não estão escopadas — viram @decisions dedicadas quando o caso surge.
