---
title: Feature-Sliced Design
type: architecture
status: active
last_updated: 2026-07-13
upstream: https://feature-sliced.design/
---

# Feature-Sliced Design

Feature-Sliced Design (FSD) é uma metodologia arquitetural para aplicações frontend, oficializada pela comunidade homônima e mantida em `feature-sliced.design`. Propõe uma estrutura hierárquica explícita do código baseada em três dimensões ortogonais — **camadas** (layers), **fatias** (slices) e **segmentos** (segments) — e em uma regra de dependência estrita que torna o grafo de imports unidirecional. O objetivo declarado é tornar o código previsível, escalável e resistente a acoplamento acidental em aplicações de médio a grande porte.

FSD difere de abordagens mais livres como Feature-Based Architecture (que organiza por funcionalidade sem hierarquia formal) e de Atomic Design (que organiza componentes por granularidade visual, não por contexto de negócio). Em FSD a hierarquia é semântica — uma camada não é mais "atômica" que outra, é mais ou menos especializada em relação ao domínio da aplicação.

## Conceito canônico

### As três dimensões

FSD organiza o código em três níveis de granularidade encaixados:

```
src/
  <layer>/           # 1. Camada — escopo e responsabilidade
    <slice>/         # 2. Slice — recorte vertical de domínio
      <segment>/     # 3. Segment — natureza técnica do código
```

Cada caminho `layer/slice/segment` responde, respectivamente, às perguntas: **qual o escopo deste código?**, **a qual recorte de negócio ele pertence?**, e **qual sua natureza técnica?**.

### Camadas (layers)

As camadas são fixas e definidas pela metodologia. Em ordem decrescente de especialização (da mais alta para a mais baixa):

| Camada | Propósito |
|---|---|
| `app` | Composição global da aplicação: providers, roteamento de alto nível, configuração de estilo, instanciação de stores globais, error boundaries de topo. |
| `processes` | **Deprecated** desde 2023. Processos de negócio multi-página (ex.: checkout multi-step). A metodologia oficial recomenda hoje absorver esse conteúdo em `pages` ou `widgets`. |
| `pages` | Composição de tela completa. Cada slice de `pages` representa uma rota navegável da aplicação. |
| `widgets` | Blocos compostos e independentes de UI que agregam features e entities para formar uma região completa da interface (header, sidebar, feed). |
| `features` | Interações que entregam valor ao usuário — verbos do produto (autenticar, comentar, filtrar, favoritar). |
| `entities` | Conceitos de domínio (substantivos do produto): usuário, produto, post. Carregam o modelo de dados e a UI básica de cada entidade. |
| `shared` | Código reutilizável que não pertence ao domínio: utilitários, design system primitivo, configuração de cliente HTTP, tipos genéricos. |

### Slices

Dentro de cada camada (exceto `app` e `shared`, que não possuem slices), o código é particionado em **slices** — recortes verticais de um domínio específico. Um slice é coeso por contexto de negócio, não por natureza técnica.

```
entities/
  user/
  product/
  order/
features/
  auth-by-email/
  filter-products/
  add-to-cart/
```

`app` é uma camada singular sem slices. `shared` também não possui slices: seu conteúdo é organizado diretamente por segments.

### Segments

Dentro de cada slice, o código é organizado por **segments**, que descrevem a natureza técnica do arquivo:

| Segment | Conteúdo |
|---|---|
| `ui` | Componentes React, estilos, markup. |
| `model` | Estado, stores, lógica de negócio, schemas, tipos do domínio do slice. |
| `lib` | Helpers, utilitários e abstrações internas ao slice. |
| `api` | Interação com serviços externos: chamadas HTTP, mappers de DTO, queries. |
| `config` | Constantes, feature flags locais, enums de configuração. |

Segments não são obrigatórios em conjunto. Um slice pode conter apenas `ui` e `model`, ou apenas `api`. A metodologia permite criar segments customizados quando necessário, mantendo a convenção do plural-singular descritivo.

### Public API por slice

Cada slice expõe um arquivo `index.ts` (e/ou `index.tsx`) que funciona como sua **public API**. Apenas o que é exportado por esse arquivo pode ser consumido por outros slices ou camadas. O interior do slice — submódulos e arquivos privados — não deve ser importado diretamente de fora.

```
features/auth-by-email/
  ui/
    LoginForm.tsx
  model/
    store.ts
    schema.ts
  api/
    login.ts
  index.ts          <-- public API: re-exporta apenas o que é consumível
```

Essa fronteira é a base de toda a regra de dependência da metodologia.

### A regra de dependência

A regra fundamental de FSD é direcional e tem três cláusulas:

1. **Camadas superiores podem importar de camadas inferiores.** `pages` pode importar de `widgets`, `features`, `entities`, `shared`. `features` pode importar de `entities` e `shared`. E assim sucessivamente.
2. **Camadas inferiores nunca importam de camadas superiores.** `entities` nunca importa de `features`. `shared` nunca importa de `entities`.
3. **Slices da mesma camada não se importam entre si.** `features/auth-by-email` não importa de `features/filter-products`. Para coordenar features, suba uma camada (compor em `widgets` ou `pages`).

Essas três cláusulas garantem que o grafo de dependências seja unidirecional e que cada slice seja substituível sem efeito cascata lateral.

## Como o time adotou

A aplicação organiza o código frontend dentro de `src/` seguindo a hierarquia oficial de FSD adaptada ao Next.js 16 com App Router. A adaptação central é o relacionamento entre a camada `pages` de FSD e a pasta `app/` do Next.

### Mapeamento Next.js App Router ↔ FSD

O App Router do Next.js 16 reserva a pasta `app/` (na raiz ou em `src/app/`) para o roteamento baseado em sistema de arquivos. Isso colide nominalmente com a camada `app` de FSD. A convenção adotada resolve a colisão da seguinte forma:

- A pasta `src/app/` do Next.js é tratada como **superfície de roteamento**, não como camada FSD. Cada `page.tsx`, `layout.tsx`, `loading.tsx` e `error.tsx` é um arquivo fino de composição que importa um slice da camada FSD `pages` e o renderiza.
- A camada FSD `app` (composição global) vive em `src/app-providers/` ou `src/app-shell/` para evitar a colisão de nomes. Lá moram providers globais, instanciação de stores, error boundaries de topo e configuração de estilo.
- A camada FSD `pages` vive em `src/pages/` (ou `src/views/` quando há preferência por desambiguar). Cada slice de `pages` representa o conteúdo lógico de uma rota e exporta o componente que `src/app/<rota>/page.tsx` consome.

Estrutura resultante:

```
src/
  app/                        # Next.js App Router (roteamento)
    layout.tsx
    page.tsx                  # importa src/pages/home
    dashboard/
      page.tsx                # importa src/pages/dashboard
  app-providers/              # FSD layer "app" renomeada
    providers.tsx
    index.ts
  pages/                      # FSD layer "pages"
    home/
      ui/
      model/
      index.ts
    dashboard/
      ui/
      model/
      index.ts
  widgets/
  features/
  entities/
  shared/
```

### Convenções de naming

- Slices em `kebab-case`, descritivos e curtos: `auth-by-email`, `add-to-cart`, `user-profile`.
- Componentes React dentro de `ui/` em `PascalCase`: `LoginForm.tsx`, `ProductCard.tsx`.
- Stores e schemas em `camelCase`: `useAuthStore.ts`, `userSchema.ts`.
- Public API sempre via `index.ts` na raiz do slice.

### Segments adotados

O time usa os cinco segments oficiais (`ui`, `model`, `lib`, `api`, `config`) sem extensão. Não há criação de segments customizados na base atual. Slices podem conter um subconjunto dos segments — não há obrigatoriedade de comportamento exaustivo.

### Limites observados

- A camada `processes` não é utilizada — segue a recomendação oficial pós-deprecation. Fluxos multi-etapa moram em `widgets` ou em uma sequência de páginas coordenadas via roteamento.
- A camada `shared` não recebe lógica de domínio. Qualquer tipo, schema ou função que mencione um conceito de negócio (usuário, produto, pedido) pertence a `entities`, não a `shared`.
- Compartilhamento entre features da mesma camada acontece exclusivamente através de uma camada inferior (em geral `entities` ou `shared`) ou subindo para `widgets`.

## Critérios de aplicação

### Quando FSD se aplica bem

- Aplicações frontend de médio a grande porte, com múltiplos domínios coexistindo (autenticação, catálogo, checkout, dashboard administrativo).
- Times com mais de um desenvolvedor ativo no frontend, onde acoplamento acidental entre áreas distintas causa fricção recorrente.
- Projetos com expectativa de longevidade onde a previsibilidade do grafo de imports importa mais que velocidade inicial de scaffolding.
- Bases de código onde features podem ser ativadas, desativadas ou substituídas com frequência (feature flags, A/B tests, migrações graduais).

### Quando FSD gera fricção sem retorno

- Protótipos descartáveis e provas de conceito de curta duração.
- Aplicações single-page com escopo trivial (uma ou duas telas, um único domínio raso).
- Pacotes de biblioteca pura (sem UI composta), onde a hierarquia de camadas não tem ancoragem semântica.

### Coexistência com outros modelos

FSD opera no eixo de **organização de código frontend** e não impede que outros modelos arquiteturais convivam em camadas adjacentes. A camada `api` de um slice pode falar com um backend organizado segundo @architecture/hexagonal ou @architecture/ddd sem conflito conceitual. Componentes dentro do segment `ui/` de um slice podem ser construídos seguindo princípios de @architecture/atomic-design para sua decomposição visual interna, desde que a fronteira do slice continue sendo a unidade de composição externa.

A diferença essencial em relação a @architecture/feature-based é que FSD impõe **camadas formais e regra de dependência** — Feature-Based deixa essa estrutura implícita. Em relação a @architecture/atomic-design, FSD organiza por **contexto de negócio**, não por **granularidade visual** — um átomo Atomic é uma classificação por tamanho/complexidade, um slice FSD é uma classificação por recorte de domínio.

## Trade-offs reconhecidos

- **Overhead inicial.** Scaffolding de slice e public API por arquivo `index.ts` introduz fricção em mudanças triviais. O retorno aparece quando o número de slices passa de algumas dezenas.
- **Curva de aprendizado.** Times sem familiaridade prévia gastam algumas semanas internalizando a regra de dependência e a divisão correta entre `features` e `entities`. A confusão mais comum é colocar lógica de feature em entity, ou criar entities anêmicas que poderiam morar em `shared`.
- **Tensão com convenções de framework.** No Next.js App Router, a colisão entre `app/` Next e `app` FSD exige a adaptação descrita acima. Em outros frameworks a colisão é mais branda.
- **Granularidade de slices.** Não há regra mecânica para decidir quando dividir uma feature grande em duas slices. A metodologia recomenda dividir quando uma slice começa a acumular múltiplas responsabilidades não relacionadas, mas a chamada permanece humana.

## Referências cruzadas

- Regras de implementação que aplicam disciplina sobre código FSD: @rules/development, @rules/code-review.
- Convenções de estado dentro do segment `model/`: @rules/state-management.
- Documentação oficial canônica: https://feature-sliced.design/docs

## Aspectos intencionalmente omitidos

- O conceito de "cross-import" via `@x` notation (workaround oficial para casos raros onde entidades precisam se conhecer mutuamente) não é coberto neste documento — o time evita o cenário reestruturando o slice em vez de usar o escape hatch.
- Convenções de teste por slice não são definidas aqui; vivem nas práticas de teste do projeto.
- Diretrizes de migração incremental de uma base legacy para FSD não estão escopadas — quando aplicável, são tratadas em decisão dedicada.
