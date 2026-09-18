---
title: Feature-Based Architecture
type: architecture
status: active
last_updated: 2026-05-20
---

# Feature-Based Architecture

Feature-Based Architecture — também referenciada na literatura como **package by feature** ou **vertical slicing** — é um modelo de organização de código fonte que agrupa arquivos pela funcionalidade de negócio que eles entregam, em vez de agrupá-los pela natureza técnica que possuem. A unidade primária de modularização é a **feature**: um recorte vertical do produto que reúne, sob um mesmo diretório, todos os artefatos necessários para que aquela funcionalidade exista — UI, estado, chamadas de API, tipos, hooks, testes, estilos.

A premissa central é que a coesão por contexto de negócio supera a coesão por tipo técnico para a maioria das aplicações de produto. Quando uma mudança no produto raramente atravessa apenas uma camada técnica (alterar um botão sem alterar o hook que ele chama, ou alterar uma rota sem alterar o componente que ela renderiza), agrupar o código por tipo técnico espalha a mudança por múltiplas pastas distantes. Agrupar por feature concentra a mudança em um único diretório.

Feature-Based Architecture é um estilo informal e flexível: não há autoridade canônica única, não há lista fixa de camadas, e não há regra de dependência formalizada. As convenções são acordadas internamente pelo time, e a metodologia se assume mais como princípio organizador do que como framework prescritivo.

## Conceito canônico

### Package by feature vs package by layer

O contraste fundamental está entre duas estratégias de raiz para organizar uma base de código:

**Package by layer** — agrupa por natureza técnica:

```
src/
  components/
    LoginForm.tsx
    ProductCard.tsx
    CheckoutSummary.tsx
  hooks/
    useAuth.ts
    useProducts.ts
    useCheckout.ts
  services/
    authService.ts
    productService.ts
    checkoutService.ts
  types/
    auth.ts
    product.ts
    checkout.ts
```

**Package by feature** — agrupa por contexto de negócio:

```
src/
  features/
    auth/
      LoginForm.tsx
      useAuth.ts
      authService.ts
      types.ts
    products/
      ProductCard.tsx
      useProducts.ts
      productService.ts
      types.ts
    checkout/
      CheckoutSummary.tsx
      useCheckout.ts
      checkoutService.ts
      types.ts
```

Os mesmos arquivos existem em ambas as estruturas. A diferença é puramente de **onde mora cada arquivo** — e essa diferença molda como o código evolui ao longo do tempo.

### Princípios operacionais

A literatura sobre Feature-Based (em particular os escritos de Kent C. Dodds, Dan Abramov, e a documentação histórica de bases React/Vue/Angular de produto) converge em quatro princípios:

**Colocation.** Arquivos que mudam juntos moram juntos. Quando alterar a feature `checkout` exige tocar UI, hook, serviço e tipos, todos esses arquivos estão em `features/checkout/` e a mudança não cruza fronteiras de diretório.

**Alta coesão dentro da feature.** Cada feature concentra tudo o que é necessário para entendê-la em isolamento. Um desenvolvedor novo deve conseguir abrir `features/auth/` e formar um modelo mental da funcionalidade sem precisar caçar arquivos em quatro pastas distintas.

**Baixo acoplamento entre features.** Features se conhecem o mínimo possível. Quando precisam compartilhar comportamento ou dados, o caminho preferido é extrair o compartilhado para uma área neutra (tipicamente `shared/` ou equivalente) em vez de criar imports cruzados entre features.

**Feature como unidade de change.** Adicionar, remover, ativar via feature flag, ou refatorar uma funcionalidade afeta um diretório. A fronteira da feature é também a fronteira de revisão, de teste, e (quando aplicável) de ownership.

### Estrutura interna típica de uma feature

A estrutura interna não é prescrita formalmente, mas a convenção de mercado mais comum decompõe a feature em sub-pastas por natureza técnica **local à feature**:

```
features/checkout/
  ui/               # ou components/
    CheckoutSummary.tsx
    PaymentForm.tsx
  hooks/
    useCheckout.ts
    useDiscount.ts
  api/              # ou services/
    createOrder.ts
    fetchCart.ts
  types.ts          # ou types/
  tests/            # opcional — testes podem ficar ao lado dos arquivos
  index.ts          # ponto de entrada (opcional)
```

Note que isso reintroduz uma estrutura tipo-técnica, mas **restrita ao escopo da feature**. A diferença para package-by-layer é que `features/checkout/hooks/` só contém hooks de checkout — não há acúmulo cross-feature em uma pasta `hooks/` global.

Bases menores podem dispensar essa decomposição interna e manter os arquivos da feature em um único nível:

```
features/checkout/
  CheckoutSummary.tsx
  PaymentForm.tsx
  useCheckout.ts
  createOrder.ts
  types.ts
```

A escolha entre decompor ou não internamente é uma chamada do time baseada no tamanho médio das features.

### Áreas compartilhadas

Praticamente toda adoção real de Feature-Based reserva uma ou mais pastas para código que não pertence a nenhuma feature específica:

- `shared/` ou `common/` — utilitários, design system primitivo, tipos genéricos, configuração de cliente HTTP, helpers que não fazem referência a um domínio.
- `lib/` — abstrações de mais baixo nível ainda, frequentemente wrappers de bibliotecas externas.

O critério para um arquivo morar em `shared/` em vez de em uma feature é que ele **não mencione um conceito de negócio**. Um helper de formatação de data é shared; um helper que sabe como formatar o status de um pedido é da feature de pedidos.

### O que Feature-Based não define

Feature-Based, no sentido informal, deliberadamente **não define**:

- Uma lista fechada de pastas raiz permitidas.
- Uma regra de dependência entre features (qual feature pode importar de qual).
- Uma fronteira pública obrigatória por feature (existe `index.ts`? sim, não, depende do time).
- Camadas globais hierarquicamente ordenadas.
- Convenções de naming impostas pela metodologia.

Cada uma dessas decisões é deixada para o time. É justamente nesse ponto que Feature-Based se diferencia de @architecture/fsd, que formaliza todos eles.

## Como o time adotou

A aplicação organiza o código frontend dentro de `src/` seguindo o estilo Feature-Based em conjunto com o App Router do Next.js 16. A adoção é leve: não há regra de dependência mecanicamente enforce, e não há fronteira pública obrigatória por feature.

### Mapeamento Next.js App Router ↔ Feature-Based

O App Router do Next.js 16 reserva a pasta `app/` (na raiz ou em `src/app/`) para o roteamento baseado em sistema de arquivos. Essa pasta é tratada como **superfície fina de roteamento**: cada `page.tsx`, `layout.tsx`, `loading.tsx` e `error.tsx` é um arquivo de composição enxuto que importa o que precisa de `src/features/` e renderiza.

A regra prática é que nenhuma lógica de negócio mora em `src/app/`. Páginas servem como entrypoints; o conteúdo real vive nas features.

Estrutura resultante:

```
src/
  app/                        # Next.js App Router (apenas roteamento)
    layout.tsx
    page.tsx                  # importa features/home
    checkout/
      page.tsx                # importa features/checkout
    dashboard/
      page.tsx                # importa features/dashboard
  features/
    home/
      ui/
      hooks/
      index.ts
    auth/
      ui/
      hooks/
      api/
      types.ts
      index.ts
    checkout/
      ui/
      hooks/
      api/
      types.ts
      index.ts
    dashboard/
      ui/
      hooks/
      api/
      index.ts
  shared/
    ui/                       # design system primitivo
    lib/                      # helpers neutros
    api/                      # cliente HTTP base, instâncias Firebase/Postgres
    types/                    # tipos cross-domain
```

### Convenções de naming

- Features em `kebab-case`, descritivas e curtas: `auth`, `checkout`, `user-profile`, `product-search`.
- Componentes React dentro de `ui/` em `PascalCase`.
- Hooks em `camelCase` com prefixo `use`: `useAuth.ts`, `useCheckout.ts`.
- Arquivos de tipos como `types.ts` na raiz da feature, ou em `types/` quando há fragmentação útil.
- Quando a feature expõe ponto de entrada agregado, é via `index.ts` na raiz da feature — mas não há obrigatoriedade.

### Critérios para criar uma nova feature

Uma nova pasta sob `features/` é criada quando:

- Existe uma funcionalidade nomeável do produto que tem ciclo de vida próprio.
- O conjunto de arquivos envolvidos é grande o suficiente para sofrer com o espalhamento (geralmente mais que três arquivos relacionados).
- A funcionalidade tem fronteira clara em relação a outras — se a divisão exige inventar o nome, provavelmente ainda não é uma feature.

### Critérios para extrair para `shared/`

Um arquivo deixa uma feature para morar em `shared/` quando:

- É consumido por duas ou mais features e não pertence semanticamente a nenhuma delas.
- Não menciona nenhum conceito de domínio específico — apenas tipos primitivos, utilitários técnicos, ou abstrações neutras.

Quando dois consumidores existem mas o artefato é semanticamente de uma feature específica (ex.: um tipo `User` usado por `auth` e `profile`), o caminho preferido é manter o tipo em sua feature de origem e importar dela, não promover para `shared/`.

### Imports entre features

Não há regra de dependência formal enforce, mas a convenção observada é minimizar imports cruzados entre features. Quando uma feature precisa de comportamento de outra, há três caminhos em ordem de preferência:

1. Extrair o comportamento compartilhado para `shared/`.
2. Compor as duas features em uma página (a página em `src/app/` importa de ambas e coordena).
3. Como último recurso, importar diretamente — registrando que essa dependência existe.

A ausência de regra mecânica significa que a disciplina é mantida via revisão de código, não via lint. Quando o número de imports cruzados começa a passar de poucos casos isolados, o sinal é que a base está pedindo uma evolução para @architecture/fsd.

## Critérios de aplicação

### Quando Feature-Based se aplica bem

- Aplicações de produto de **porte pequeno a médio** — dezenas de features, não centenas.
- Times **pequenos a médios** (até cerca de dez desenvolvedores ativos no frontend) onde as convenções podem ser sustentadas culturalmente sem ferramentas de enforcement.
- Monolitos modulares onde a previsibilidade do grafo de imports não é crítica ainda, mas a colocation já entrega ganho perceptível.
- Bases em estágio de produto onde o vocabulário de features está estabilizando — features novas são adicionadas com frequência e não há ainda pressão para hierarquizar formalmente.
- Projetos que querem o benefício de organização vertical sem pagar o custo de aprender e impor uma metodologia formal.

### Quando Feature-Based gera fricção sem retorno

- Bases muito grandes (centenas de slices ou múltiplos domínios maiores) onde a ausência de regra de dependência permite acoplamento cruzado que custa caro para desfazer depois.
- Times grandes (acima de dez desenvolvedores ativos) onde convenções não escritas perdem coerência e cada nova pessoa adiciona uma interpretação ligeiramente diferente.
- Aplicações onde a previsibilidade absoluta do grafo de imports é requisito (sistemas que sofrem refatorações automatizadas em larga escala, por exemplo).
- Pacotes de biblioteca pura sem UI composta, onde "feature" não tem ancoragem semântica.

### Coexistência e diferenças em relação a outros modelos

**Em relação a @architecture/fsd.** FSD pode ser visto como uma formalização opinativa de Feature-Based. Ambos organizam por contexto de negócio vertical, mas FSD adiciona: camadas globais nomeadas e ordenadas (`app`, `pages`, `widgets`, `features`, `entities`, `shared`), regra de dependência direcional explícita, fronteira pública obrigatória por slice via `index.ts`, e proibição de imports entre slices da mesma camada. Feature-Based deixa todas essas decisões em aberto. A migração natural de uma base Feature-Based, quando ela cresce, é absorver a estrutura de FSD incrementalmente.

**Em relação a Layered Architecture (package by layer).** Feature-Based é a antítese estrutural. Onde Layered agrupa por natureza técnica e cria pastas globais (`components/`, `services/`, `hooks/`), Feature-Based agrupa por contexto de negócio e distribui essas naturezas técnicas dentro de cada feature. As duas estratégias podem coexistir parcialmente — é comum ver uma pasta `shared/` que internamente é organizada por layer (`shared/ui/`, `shared/lib/`, `shared/api/`), enquanto o restante da base é Feature-Based.

**Em relação a @architecture/atomic-design.** Atomic Design opera no eixo de **granularidade visual de componentes** (atoms, molecules, organisms, templates, pages), não no eixo de **contexto de negócio**. Os dois modelos não competem: uma feature pode internamente organizar seus componentes seguindo princípios atomic se o time achar útil. Atomic responde "qual o tamanho deste componente?"; Feature-Based responde "a qual funcionalidade ele pertence?".

**Em relação a @architecture/hexagonal e @architecture/ddd.** Esses dois modelos endereçam organização de backend e domínio (portas/adaptadores, agregados, bounded contexts) e não competem com Feature-Based. Uma feature frontend pode consumir, via seu segment de api, um backend organizado em ports-and-adapters sem fricção conceitual.

**Em relação a @architecture/clean-architecture.** Clean Architecture impõe camadas concêntricas com regra de dependência (interno não conhece externo). Pode ser aplicada **dentro de uma feature** quando essa feature tem complexidade interna suficiente — a feature como um todo continua sendo a unidade de Feature-Based, mas seu interior segue camadas clean.

## Trade-offs reconhecidos

- **Definição de feature é negociável.** Diferentemente de FSD, não há autoridade externa para resolver disputas sobre se algo é uma feature, parte de outra feature, ou conceito compartilhado. Discussões sobre "isso é uma feature ou um pedaço da feature X?" são recorrentes e dependem de calibragem do time.
- **Código compartilhado precisa de critério.** Sem regra formal, a tentação de jogar arquivos em `shared/` "por garantia" é constante. O time precisa exercer julgamento ativo sobre quando promover algo a shared e quando mantê-lo dentro de uma feature.
- **Features que crescem demais.** Uma feature pode acumular responsabilidades a ponto de virar mini-aplicação interna. Quando isso acontece, a refatoração para dividi-la em sub-features (ou migrar para FSD com slices mais granulares) é trabalhosa porque os imports já se entrelaçaram internamente.
- **Disciplina depende de revisão humana.** A ausência de regra de dependência mecânica significa que imports cruzados entre features se acumulam silenciosamente se a revisão de código não os flagrar. O custo aparece tarde, quando a tentativa de remover uma feature revela que ela está costurada em outras três.
- **Limite superior de escala.** O modelo entrega bem em escala pequena e média e começa a sofrer em escala grande. Saber identificar o momento de evoluir para um modelo mais formal (tipicamente FSD ou modularização explícita em pacotes) é parte da operação do modelo.

## Anti-patterns

- **Pasta `features/` virando dump.** Cada arquivo solto sob `features/` sem agrupar em uma feature nomeada — `features/Button.tsx`, `features/useFetch.ts`. Se algo não pertence a uma feature específica, pertence a `shared/`.
- **`shared/` virando lixeira.** Tudo que "parece útil" é jogado em `shared/`. O resultado é uma pasta gigante sem coesão interna que ninguém mais consegue navegar. A regra é estrita: shared só recebe o que **não menciona domínio** e é **efetivamente consumido por múltiplos lugares**.
- **Sub-features escondidas dentro de uma feature gigante.** Uma `features/checkout/` que internamente já é dividida em `payment/`, `shipping/`, `confirmation/`, cada um com seus próprios `ui/`, `hooks/`, `api/`. Isso é sinal de que `checkout` deveria virar uma pasta agregadora com features irmãs (ou migrar para um modelo com hierarquia formal).
- **Imports cruzados sem critério.** `features/checkout/` importando direto de `features/auth/internals/...`. Mesmo sem regra formal, isso é acoplamento que dificulta remover ou substituir features. Quando precisa acontecer, deve ser via ponto de entrada consciente da feature consumida.
- **Lógica de negócio em `src/app/`.** Aproveitar a pasta de roteamento do Next para colocar componentes complexos, hooks ou serviços. A pasta `app/` é superfície fina; tudo de produto vive em `features/`.
- **Mistura de package-by-layer e package-by-feature no nível raiz.** `src/components/` coexistindo com `src/features/` sem critério. O resultado é confusão sobre onde procurar um arquivo. Layer só sobrevive **dentro** de uma feature ou dentro de `shared/`, nunca no nível raiz junto com `features/`.

## Referências cruzadas

- Para a versão formalizada com camadas e regra de dependência: @architecture/fsd.
- Regras de implementação que sustentam disciplina de feature: @rules/code-review.
- Convenções de estado dentro de uma feature: @rules/state-management.

## Aspectos intencionalmente omitidos

- Convenções de teste por feature (colocation de testes, naming de arquivos de teste) não estão escopadas aqui — vivem nas práticas de teste do projeto.
- Diretrizes de migração entre Feature-Based e Feature-Sliced Design não estão escopadas neste documento; quando aplicável, são tratadas em decisão dedicada.
- Convenções de feature flag e de ativação/desativação de features em runtime não fazem parte do modelo arquitetural — pertencem a documentação de operação.
