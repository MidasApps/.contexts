---
title: Hexagonal Architecture (Ports & Adapters)
type: architecture
status: active
last_updated: 2026-05-20
upstream: https://alistair.cockburn.us/hexagonal-architecture/
---

# Hexagonal Architecture

Hexagonal Architecture, também conhecida como **Ports & Adapters**, é um estilo arquitetural formulado por Alistair Cockburn no início dos anos 2000 e publicado em sua forma canônica em 2005. Propõe uma única ideia central com consequências profundas: **a lógica de aplicação e o domínio de negócio devem ser isolados de todos os detalhes de I/O e de tecnologia que vivem em volta** — bancos de dados, frameworks web, message brokers, sistemas de arquivos, APIs externas, interfaces de usuário. O isolamento é obtido por uma fronteira explícita composta por interfaces (chamadas **ports**) cuja implementação concreta vive em **adapters** intercambiáveis.

A metáfora do hexágono é deliberadamente neutra — Cockburn escolheu seis lados não porque existam seis tipos de port, mas para evitar a sugestão visual de "topo" e "base" que diagramas em camadas horizontais carregam. Cada lado do hexágono é uma porta possível; o número real depende do sistema. O núcleo é o domínio + aplicação; o exterior é tudo que se acopla a tecnologia concreta.

Hexagonal Architecture é um **parente próximo** de @architecture/clean-architecture: ambos isolam o domínio com inversão de dependência. A diferença essencial é que Hexagonal apresenta o isolamento como **uma única fronteira bidirecional** (ports/adapters em qualquer lado do hexágono), enquanto Clean Architecture decompõe o interior em camadas concêntricas adicionais (entities, use cases, interface adapters, frameworks & drivers). Para o tratamento detalhado das camadas concêntricas e da regra de dependência radial, ver @architecture/clean-architecture. Este documento permanece em Hexagonal puro.

## Conceito canônico

### O hexágono e seu núcleo

O sistema é representado como um hexágono. Dentro do hexágono vive o **núcleo da aplicação**: o domínio de negócio (entidades, regras invariantes, conceitos do problema) e a camada de aplicação (use cases, serviços de aplicação, orquestração de fluxos). Esse núcleo é escrito em linguagem de propósito geral (TypeScript puro, no caso deste projeto) e **não importa nada** de frameworks web, ORMs, SDKs de cloud, clientes HTTP ou bibliotecas de UI.

Fora do hexágono vivem os **adapters**: pedaços de código que conhecem detalhes concretos de tecnologia. Um controller HTTP de Next.js, um repositório que fala com Postgres, um cliente que chama uma API externa, um job que escuta uma fila — todos são adapters.

A fronteira entre núcleo e adapters é feita de **ports**.

### Ports

Um port é uma **interface declarada no núcleo** que descreve uma necessidade em termos de domínio, sem referência a tecnologia. Ports são o vocabulário pelo qual o núcleo conversa com o mundo exterior — em ambas as direções.

Cockburn distingue dois tipos de port:

| Tipo de port | Sinônimos | Direção | Quem chama quem |
|---|---|---|---|
| **Driving** | Primary, inbound, "uso da aplicação" | Mundo → núcleo | O adapter chama o port; o núcleo executa |
| **Driven** | Secondary, outbound, "dependência da aplicação" | Núcleo → mundo | O núcleo chama o port; o adapter executa |

**Driving ports** descrevem o que a aplicação **faz** — são a API pública do núcleo, expressa como casos de uso. Exemplos típicos: `RegisterUser`, `PlaceOrder`, `GenerateMonthlyReport`. Em TypeScript, um driving port pode ser uma interface, uma classe abstrata, ou diretamente a assinatura de uma função de use case exportada.

**Driven ports** descrevem o que a aplicação **precisa** do mundo — são as dependências do núcleo, expressas em vocabulário de domínio. Exemplos típicos: `UserRepository`, `EmailSender`, `PaymentGateway`, `Clock`. O nome do port nunca menciona a tecnologia: é `UserRepository`, nunca `PostgresUserRepository`.

### Adapters

Um adapter é a **implementação concreta** de um port em uma tecnologia específica. Espelhando a divisão dos ports:

- **Driver adapters** (primary): traduzem entradas do mundo exterior em chamadas a driving ports. Um handler de rota HTTP que extrai o body do request, valida, monta o input do use case e invoca um driving port é um driver adapter. Outros exemplos: handler de Server Action no Next.js, comando de CLI, job agendado, consumidor de fila.
- **Driven adapters** (secondary): implementam driven ports em uma tecnologia específica. `PostgresUserRepository implements UserRepository`. `ResendEmailSender implements EmailSender`. `FirestoreOrderRepository implements OrderRepository`. Outros exemplos: gateway HTTP para API externa, publisher de fila, sistema de arquivos.

A simetria é deliberada: do ponto de vista do núcleo, **todo adapter é substituível**. Trocar Postgres por Firestore exige uma nova classe que implementa `UserRepository`; o núcleo não sabe e não precisa saber.

### Regra de dependência

A regra fundamental de Hexagonal é unidirecional e simples:

1. **Adapters dependem do núcleo.** Drivers importam driving ports para chamá-los; drivens importam interfaces de driven port para implementá-las.
2. **O núcleo nunca depende de adapters.** Nenhum import do núcleo aponta para fora do hexágono.
3. **A dependência conceitual "núcleo → infraestrutura" é invertida via port.** O núcleo precisa persistir um usuário, mas não chama Postgres — chama `UserRepository`, que é uma interface dele mesmo. A implementação concreta é injetada do lado de fora na composition root.

Essa regra é a aplicação direta do **Dependency Inversion Principle** ao limite entre aplicação e infraestrutura.

### Composition root

Como o núcleo não conhece adapters concretos, alguém precisa montar o sistema: instanciar adapters, conectá-los aos ports correspondentes e disponibilizar o resultado para o entry point. Esse ponto é a **composition root** — geralmente um único arquivo (ou pequeno conjunto de arquivos) próximo ao entry point da aplicação que faz a fiação. Em uma app Next.js, a composition root tipicamente vive próximo aos handlers de rota ou em um módulo de bootstrap dedicado. Em uma Cloud Function, próximo ao export do handler.

A composition root é o único lugar onde código de aplicação encontra código de infraestrutura concretamente. Tudo a montante (handlers) e tudo a jusante (use cases, domínio) conhece apenas ports.

### Testabilidade como consequência direta

A simetria ports/adapters torna o núcleo testável sem infraestrutura. Em testes unitários de use cases, basta substituir cada driven adapter por uma implementação **fake** ou **in-memory** que satisfaça o port. Um `InMemoryUserRepository` que guarda usuários em um `Map<string, User>` é suficiente para exercitar a maioria dos casos de uso em milissegundos. Testes de adapter (que validam que `PostgresUserRepository` se comporta como `UserRepository` promete) são separados — em geral integration tests com banco real.

Esse benefício é frequentemente citado como o principal **payoff** da arquitetura: a velocidade e estabilidade dos testes de núcleo crescem dramaticamente, e a confiança em refatorar o domínio aumenta na mesma proporção.

### Relação com DDD

Hexagonal Architecture **não exige** Domain-Driven Design e DDD **não exige** Hexagonal. Os dois são frequentemente combinados porque DDD descreve **o que vai dentro do núcleo** (entidades, agregados, value objects, domain services, bounded contexts) e Hexagonal descreve **como o núcleo se isola do resto**. Combinar é natural: ports em DDD costumam corresponder a interfaces de repository (para agregados) e a interfaces de serviços de aplicação. Para o vocabulário tático e estratégico de DDD ver @architecture/ddd.

## Como o time adotou

A aplicação combina Next.js 16 (frontend + Server Actions + route handlers), Firebase Functions (jobs e webhooks), Firestore e Postgres (persistência heterogênea por contexto) e múltiplos SDKs de IA (OpenAI, Gemini, Vercel AI SDK). Esse leque de tecnologias torna o isolamento por ports/adapters particularmente valioso: o mesmo use case pode precisar de uma persistência diferente em contextos diferentes, e os SDKs de IA evoluem rapidamente o suficiente para que trocar provedor seja uma possibilidade concreta.

### Localização no projeto

A separação entre núcleo e adapters vive dentro do recorte de cada feature, não em pastas globais de "domain" e "infrastructure" no nível raiz. Isso preserva a coesão por contexto de negócio promovida por @architecture/feature-based / @architecture/fsd e evita o anti-pattern clássico de "tudo do domínio numa pasta gigante separada de tudo da infra numa outra pasta gigante".

A estrutura interna canônica adotada para uma feature de backend ou um módulo com lógica de negócio rica:

```
src/features/<feature>/
  domain/                        # núcleo — entidades, value objects, regras invariantes
    user.ts
    order.ts
    pricing.ts
  application/                   # núcleo — use cases e ports
    ports/
      driving/
        registerUser.ts          # interface ou assinatura do use case
        placeOrder.ts
      driven/
        userRepository.ts        # interface UserRepository
        emailSender.ts           # interface EmailSender
        paymentGateway.ts        # interface PaymentGateway
    useCases/
      registerUser.ts            # implementa o driving port; depende de driven ports
      placeOrder.ts
  adapters/                      # fora do hexágono — implementações concretas
    driving/
      registerUserRoute.ts       # route handler Next.js que invoca o use case
      placeOrderAction.ts        # Server Action
    driven/
      postgresUserRepository.ts  # implements UserRepository
      firestoreUserRepository.ts # alternativa
      resendEmailSender.ts       # implements EmailSender
      stripePaymentGateway.ts    # implements PaymentGateway
  composition.ts                 # fiação local da feature
  index.ts                       # public API
```

Features que são puramente UI (sem lógica de negócio rica, sem necessidade de troca de infra) **não** seguem a estrutura ports/adapters — Hexagonal só é aplicado onde paga. Ver "Critérios de aplicação" abaixo.

### Convenções de naming

- **Driving ports** são nomeados pelo caso de uso em forma verbal: `RegisterUser`, `PlaceOrder`, `GenerateMonthlyReport`. Quando o use case é implementado como função, a função é o port; quando como classe, a interface declara o método `execute`.
- **Driven ports** são nomeados em vocabulário de domínio, **sem menção a tecnologia**: `UserRepository`, `EmailSender`, `PaymentGateway`, `Clock`. Não existe `PostgresUserRepository` no port — só no adapter.
- **Driver adapters** são nomeados pela tecnologia de entrada: `registerUserRoute.ts`, `placeOrderAction.ts`, `monthlyReportCron.ts`.
- **Driven adapters** combinam tecnologia + nome do port: `PostgresUserRepository`, `FirestoreUserRepository`, `ResendEmailSender`, `OpenAICompletionGateway`.

A regra de ouro: **o nome do port nunca contém o nome de uma tecnologia; o nome do adapter sempre contém**.

### Exemplo concreto em TypeScript

Port (vive no núcleo, em `application/ports/driven/userRepository.ts`):

```typescript
import type { User, UserId } from '../../../domain/user';

export interface UserRepository {
  findById(id: UserId): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  save(user: User): Promise<void>;
}
```

Use case (vive no núcleo, em `application/useCases/registerUser.ts`):

```typescript
import type { UserRepository } from '../ports/driven/userRepository';
import type { EmailSender } from '../ports/driven/emailSender';
import { User } from '../../domain/user';

export interface RegisterUserInput {
  email: string;
  name: string;
}

export const makeRegisterUser = (deps: {
  users: UserRepository;
  email: EmailSender;
}) => {
  return async (input: RegisterUserInput): Promise<User> => {
    const existing = await deps.users.findByEmail(input.email);
    if (existing) throw new Error('email already registered');

    const user = User.create(input);
    await deps.users.save(user);
    await deps.email.sendWelcome(user);
    return user;
  };
};
```

Adapter driven (vive em `adapters/driven/postgresUserRepository.ts`):

```typescript
import type { UserRepository } from '../../application/ports/driven/userRepository';
import type { User, UserId } from '../../domain/user';
import { db } from '@/shared/infrastructure/postgres';

export const PostgresUserRepository: UserRepository = {
  async findById(id: UserId) { /* SQL */ },
  async findByEmail(email: string) { /* SQL */ },
  async save(user: User) { /* SQL */ },
};
```

Adapter driver (vive em `adapters/driving/registerUserRoute.ts`):

```typescript
import { NextResponse } from 'next/server';
import { registerUser } from '../../composition';

export async function POST(req: Request) {
  const body = await req.json();
  const user = await registerUser({ email: body.email, name: body.name });
  return NextResponse.json({ id: user.id });
}
```

Composition root local (`composition.ts`):

```typescript
import { makeRegisterUser } from './application/useCases/registerUser';
import { PostgresUserRepository } from './adapters/driven/postgresUserRepository';
import { ResendEmailSender } from './adapters/driven/resendEmailSender';

export const registerUser = makeRegisterUser({
  users: PostgresUserRepository,
  email: ResendEmailSender,
});
```

A escolha entre `PostgresUserRepository` e `FirestoreUserRepository` se faz aqui — substituir um pelo outro é uma linha de código, sem mudança no núcleo.

### Integração com Next.js 16

A superfície de entrada do Next.js é tratada inteiramente como **adapters driver**:

- **Route handlers** (`app/api/.../route.ts`) e **Server Actions** funcionam como driver adapters HTTP. Extraem dados do request, validam com @stacks/validation/zod@4, invocam o use case e formatam a resposta. Não contêm lógica de negócio.
- **Server Components** que renderizam dados consomem use cases de leitura (driving ports de query) e passam o resultado para a UI. A UI propriamente dita (componentes) não conhece nem use cases nem adapters — recebe dados prontos.
- **Client Components** que disparam mutações invocam Server Actions, que por sua vez invocam use cases.

### Integração com Firebase Functions

Cada Cloud Function exportada é um driver adapter:

- **Webhooks HTTP** (`onRequest`): driver adapter HTTP, simétrico aos route handlers do Next.js.
- **Triggers Firestore** (`onDocumentCreated`, etc.): driver adapter de evento; recebe o snapshot, monta o input do use case e dispara.
- **Scheduled functions** (`onSchedule`): driver adapter de tempo; invoca o use case sem input externo.

Use cases compartilhados entre Next.js e Functions vivem em pacotes compartilhados ou em features replicadas, sempre preservando que **o use case é o mesmo** — apenas os driver adapters mudam.

### Persistência heterogênea

A coexistência de Firestore e Postgres no projeto é exatamente o cenário em que Hexagonal paga melhor. Cada bounded context escolhe sua persistência sem contaminar o domínio:

- Contextos com leitura/escrita transacional e queries relacionais complexas usam `Postgres<X>Repository`.
- Contextos com escrita orientada a documento, alta cardinalidade e listening em tempo real usam `Firestore<X>Repository`.
- O use case que coordena ambos depende dos dois ports e recebe os dois adapters via composition root — sem saber em qual banco cada um vive.

### SDKs de IA como driven adapters

Chamadas a OpenAI, Gemini e outros provedores ficam atrás de driven ports do tipo `CompletionGateway`, `EmbeddingGateway`, `ImageGenerationGateway`. Cada provedor recebe um adapter (`OpenAICompletionGateway`, `GeminiCompletionGateway`). O núcleo invoca o port pelo seu papel — "preciso gerar uma completion para este prompt" — sem saber qual modelo está por trás. Trocar OpenAI por Gemini para uma feature específica vira uma troca na composition root. Ver @stacks/ai/vercel-ai-sdk, @stacks/ai/openai, @stacks/ai/gemini para os manuais de cada stack.

### Composition root: localização

A composition root é local por feature (`features/<feature>/composition.ts`) em vez de global. Isso preserva isolamento entre features e evita que um módulo central conheça todos os adapters do projeto. Composition global só aparece quando há providers verdadeiramente compartilhados (cliente Postgres único, cliente Firebase Admin único, cliente de telemetria) — esses vivem em `src/shared/infrastructure/` e são consumidos pelas compositions locais.

## Critérios de aplicação

### Quando Hexagonal se aplica bem

- **Lógica de negócio rica.** Features com regras invariantes não-triviais, fluxos com várias etapas, decisões dependentes de múltiplas entidades. O isolamento permite expressar essas regras em código limpo, testável e legível.
- **Possibilidade real de troca de infraestrutura.** Persistência heterogênea entre contextos (Firestore + Postgres simultaneamente no projeto), múltiplos provedores de IA, gateways externos com alternativas legítimas (Stripe vs outro processador, Resend vs SendGrid).
- **Alta cobertura de testes desejada.** O payoff em velocidade e estabilidade dos testes unitários é imediato e duradouro.
- **Times com múltiplas pessoas tocando o mesmo módulo.** A fronteira explícita reduz acoplamento acidental e disputas sobre onde colocar código.
- **Sistemas com longevidade.** Quanto maior o horizonte de manutenção, maior o retorno do isolamento — frameworks mudam, SDKs mudam, bancos mudam.

### Quando Hexagonal gera fricção sem retorno

- **CRUDs simples.** Telas que apenas listam, criam, editam e removem registros sem regras de negócio relevantes pagam o overhead de ports/adapters sem ganho. Acessar o banco diretamente do route handler é honesto nesse caso.
- **Protótipos e provas de conceito.** Quando a meta é validar uma hipótese e o código pode ser descartado, a cerimônia atrasa.
- **Features puramente de UI.** Componentes que não falam com o backend, ou apenas consomem leitura simples, não têm núcleo a isolar.
- **Um único adapter possível na prática.** Se a tecnologia subjacente está cravada pelo restante do ecossistema e não há alternativa real (e nem testes que se beneficiariam de fake), o port vira indireção pura.
- **Times sem familiaridade.** A curva de aprendizado real existe — uma feature mal-construída em Hexagonal é pior que uma feature bem-construída em estilo direto.

### Coexistência com outros modelos

- Com @architecture/feature-based e @architecture/fsd: complementar. Esses modelos respondem **como organizar features no espaço**; Hexagonal responde **como isolar o núcleo de uma feature**. Aplicar ambos ao mesmo tempo é a configuração padrão deste projeto.
- Com @architecture/ddd: complementar e frequentemente combinado. DDD preenche o interior do hexágono com vocabulário tático e estratégico; Hexagonal define a fronteira exterior. Ver @architecture/ddd.
- Com @architecture/clean-architecture: parentes próximos. Clean expande o interior do hexágono em camadas concêntricas adicionais e formaliza a regra de dependência radialmente. Quando o time precisa de mais granularidade interna do que "domínio + aplicação + ports", a transição natural é para Clean. Ver @architecture/clean-architecture.
- Com @architecture/atomic-design: ortogonal. Atomic organiza biblioteca de UI compartilhada; Hexagonal organiza núcleo de negócio. Convivem sem fricção.

## Trade-offs reconhecidos

- **Ceremony.** Cada feature em Hexagonal carrega ports, adapters e composition mesmo quando o caso é simples. O custo é fixo por feature e aparece como múltiplos arquivos onde antes haveria um. Calibrar onde aplicar é a defesa principal.
- **Indireção que esconde fluxo.** Para um leitor que abre o código pela primeira vez, seguir "route handler → port → use case → port → adapter → tecnologia" exige saltar entre arquivos. A clareza do isolamento custa em legibilidade linear.
- **Risco de ports anêmicos.** Quando um port apenas re-expõe a API de um ORM ou SDK sem traduzir para o vocabulário do domínio (`UserRepository.runQuery(sql: string)`), a abstração é ilusória — o domínio passa a depender semanticamente do banco mesmo sem importá-lo.
- **Composition root frágil.** Em projetos grandes, a composition root pode crescer descontroladamente. Mitigar com composition local por feature, como adotado.
- **Tentação de criar ports para tudo.** Cada chamada a uma função utility não precisa virar port. Ports protegem fronteiras com I/O ou com decisões de tecnologia substituíveis; código puro de domínio não precisa de port.
- **Dificuldade de mapear bancos não relacionais.** Repositórios em Firestore podem não casar perfeitamente com a abstração de `Repository` clássica (que pressupõe agregados bem definidos). O port precisa ser desenhado em termos do contexto, não copiado do livro.

## Anti-patterns

- **Anemic ports.** Ports que apenas espelham a API de um ORM ou SDK, sem tradução para vocabulário de domínio (`UserRepository.find(filter: PrismaWhereInput)`, `Storage.bucket(name).file(path).save(buffer)`). O port deve falar a língua do domínio, não a língua da infra.
- **Adapters vazando para o domínio.** Tipos do ORM, classes do SDK ou exceptions específicas de tecnologia aparecendo em entities ou use cases. Sinal de que a fronteira foi violada. Adapters devem mapear ida e volta para tipos do domínio.
- **Domínio importando framework.** `import { NextRequest } from 'next/server'` dentro de `application/` ou `domain/`. É a violação mais grave — apaga toda a justificativa da arquitetura. Detectar via lint ou path-scoped review.
- **Ports demais para CRUD trivial.** Criar `ListUsers`, `GetUser`, `CreateUser`, `UpdateUser`, `DeleteUser` como driving ports em uma feature que é literalmente uma tela de admin sem regras. O CRUD direto é honesto.
- **Composition root distribuída.** Adapters sendo instanciados dentro de route handlers ou dentro de use cases. A fiação tem que viver em um só lugar por feature; caso contrário, trocar adapter exige caçada por toda a base.
- **Use case chamando adapter concreto.** `import { PostgresUserRepository }` dentro de `useCases/registerUser.ts`. Use case importa **port**, nunca **adapter**. A composition root injeta o adapter.
- **Port com nome de tecnologia.** `PostgresRepository`, `FirebaseStorage`, `OpenAIClient` como nome de port. Sinal de que o port foi desenhado de fora para dentro (a partir da tecnologia) em vez de dentro para fora (a partir da necessidade do domínio).
- **Wrapper sem inversão.** Criar `MyDatabase` que apenas encapsula o cliente do banco mas é importado diretamente pelo use case (sem injeção). Não há inversão — só uma camada extra de função.
- **Testar adapter como se fosse use case.** Testes que sobem banco real para validar `registerUser` end-to-end são integration tests legítimos, mas não substituem o teste unitário do use case com `InMemoryUserRepository`. Ambos têm papel; confundi-los desperdiça o payoff.
- **Múltiplos níveis de port sobre o mesmo recurso.** `UserRepository` que internamente chama `UserDataSource` que internamente chama `UserApiClient`. Cada camada adicional sem justificativa concreta soma custo sem ganho.

## Referências cruzadas

- Modelos arquiteturais relacionados: @architecture/clean-architecture (parente próximo com camadas concêntricas adicionais), @architecture/ddd (preenche o interior do hexágono com vocabulário tático/estratégico).
- Modelos arquiteturais ortogonais que coexistem: @architecture/feature-based, @architecture/fsd (organizam features no espaço), @architecture/atomic-design (organiza biblioteca de UI).
- Stacks que tipicamente aparecem como adapters: @stacks/frontend/next@16, @stacks/backend/firebase-functions, @stacks/database/firebase-firestore, @stacks/database/postgres, @stacks/ai/vercel-ai-sdk, @stacks/ai/openai, @stacks/ai/gemini.
- Stacks que tipicamente atravessam o port (validação de input do driver adapter): @stacks/validation/zod@4.
- Regras de implementação que aplicam disciplina sobre código Hexagonal: @rules/code-review, @rules/error-handling, @rules/validation, @rules/testing.
- Documentação canônica original: https://alistair.cockburn.us/hexagonal-architecture/

## Aspectos intencionalmente omitidos

- O detalhamento de camadas concêntricas adicionais (entities / use cases / interface adapters / frameworks & drivers) pertence ao tratamento de @architecture/clean-architecture, não a este documento.
- O vocabulário tático de DDD (aggregate, value object, domain event, repository pattern, anti-corruption layer) e o estratégico (bounded context, context map, ubiquitous language) pertence a @architecture/ddd.
- Convenções específicas de teste por tipo de port (fakes vs mocks vs stubs, integration vs unit, contract testing entre port e adapter) não são definidas aqui — vivem nas práticas de teste do projeto.
- Padrões de propagação de erro entre adapter e núcleo (mapeamento de exceptions de infra para erros de domínio) são tratados em @rules/error-handling.
- A escolha entre use case como função (`makeRegisterUser`) ou como classe (`class RegisterUserUseCase`) é estilística e tratada em regras de implementação, não aqui.
- Estratégias de migração incremental de uma base sem Hexagonal para Hexagonal não estão escopadas — quando aplicável, são registradas como decisions dedicadas.
