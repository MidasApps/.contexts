---
title: Atomic Design
type: architecture
status: active
last_updated: 2026-05-20
upstream: https://atomicdesign.bradfrost.com/
---

# Atomic Design

Atomic Design é uma metodologia de organização de **componentes de interface** formalizada por Brad Frost em 2013 e consolidada no livro homônimo publicado em 2016. Propõe que toda interface seja decomposta em cinco níveis hierárquicos de granularidade visual e funcional — **atoms**, **molecules**, **organisms**, **templates** e **pages** — inspirados na metáfora da química: partículas elementares (átomos) se combinam em estruturas mais complexas (moléculas, organismos) que por sua vez compõem entidades completas. O objetivo declarado é dar ao time uma linguagem comum para discutir UI, e ao código uma estrutura previsível para construir, manter e evoluir um design system.

Atomic Design não é um modelo de arquitetura de aplicação. Não responde "como organizo o código do produto inteiro" — responde "como decomponho minha biblioteca visual em peças reutilizáveis e de qual nível cada peça é". Por isso opera em um eixo diferente de @architecture/fsd e @architecture/feature-based, que organizam código por **contexto de negócio**. Atomic Design organiza código por **granularidade de composição visual**, e pode coexistir com qualquer modelo de arquitetura de aplicação que delegue a construção de UI a uma biblioteca compartilhada.

## Conceito canônico

### Os cinco níveis

Brad Frost define a hierarquia da metáfora atômica em cinco estágios. Cada nível é construído a partir do anterior — o que torna a metodologia uma proposta de **composição bottom-up**.

**1. Atoms.** Os blocos elementares da interface, indivisíveis no contexto da aplicação. Um atom não pode ser quebrado em pedaços menores sem perder utilidade funcional. Exemplos canônicos: um `Button`, um `Input`, um `Label`, um `Icon`, uma cor, uma tipografia. Atoms são abstratos e neutros — não carregam contexto de negócio. Um `Button` é um atom; um `BuyNowButton` específico de produto não é.

**2. Molecules.** Combinações pequenas e relativamente simples de atoms que funcionam juntos como uma unidade. A regra prática é que molecules têm **uma única responsabilidade clara**. Exemplos canônicos: um campo de busca (`Input` + `Button` + `Label`), um item de lista com avatar e nome (`Avatar` + `Text`), um par `Label` + `Input` com mensagem de erro. Molecules existem porque atoms isolados raramente são reutilizados — o que se reutiliza é a combinação coesa deles.

**3. Organisms.** Seções relativamente complexas e independentes da interface, formadas pela composição de molecules e/ou atoms (e ocasionalmente outros organisms menores). Diferente de molecules, organisms não têm responsabilidade única estrita — eles compõem um pedaço autossuficiente de UI, como um header de aplicação, um card de produto com imagem, título, descrição, preço e botão de ação, um formulário de login completo, uma lista de comentários, uma sidebar de navegação. Organisms começam a carregar contexto: um `ProductCard` é um organism do domínio de produto, mesmo que sua estrutura interna seja reutilizável.

**4. Templates.** Layouts em nível de página que organizam organisms, molecules e atoms em uma estrutura coerente, **mas sem conteúdo real**. Templates definem o esqueleto: onde fica o header, onde fica a área de conteúdo principal, onde ficam as colunas laterais, qual o espaçamento entre as seções. Conteúdo é representado por placeholders. Um template é o que Brad Frost chama de "wireframe vivo" — código real renderizando estrutura, mas com dados genéricos ou vazios.

**5. Pages.** Instâncias concretas de templates preenchidas com **conteúdo real** (texto real, imagens reais, dados reais do produto). Pages são a manifestação final do que o usuário vê. Servem também como ponto de validação do design system: quando o conteúdo real entra no template, o time descobre se as escolhas feitas nos níveis anteriores resistem à realidade (textos longos demais, imagens com proporções inesperadas, listas vazias, estados de erro).

A relação entre template e page é deliberada e particularmente importante: **template é estrutura, page é instância de estrutura com conteúdo**. Essa separação permite que o design system seja validado com múltiplos cenários de conteúdo sem reescrita.

### Critérios para classificar um componente em cada nível

A linha entre níveis adjacentes — especialmente molecule e organism — é a fonte mais comum de confusão. Os critérios operacionais que a literatura derivou ao longo dos anos:

| Nível | Critério principal |
|---|---|
| Atom | Indivisível na prática. Não há sub-partes reutilizáveis. Neutro de domínio. |
| Molecule | Combinação pequena de atoms com **uma** responsabilidade clara. Se faz duas coisas distintas, é organism. |
| Organism | Seção autossuficiente. Pode ser colocado em uma página e fazer sentido sozinho. Pode carregar contexto de domínio. |
| Template | Esqueleto de página sem conteúdo real. Define posicionamento, não preenchimento. |
| Page | Template instanciado com dados reais do produto, em um cenário concreto. |

Critérios secundários frequentemente úteis:

- **Reutilização esperada.** Atoms e molecules costumam ser reutilizados em muitos lugares; organisms em alguns; templates em poucos; pages em nenhum (cada página é única).
- **Acoplamento a domínio.** Atoms e molecules são neutros; organisms podem ser neutros ou de domínio; templates são estruturais; pages são intrinsecamente de domínio.
- **Tamanho do componente.** Não é critério primário, mas é correlacionado: atoms cabem em poucas dezenas de linhas; molecules em algumas dezenas; organisms passam de cem com frequência.

### Papel de tokens de design

Embora a formulação original de Brad Frost de 2013 não cite tokens explicitamente, a prática moderna posiciona **design tokens** abaixo dos atoms — como uma camada zero. Tokens são valores primitivos de design (cores, espaçamentos, tamanhos de fonte, raios de borda, durações de animação) tipicamente expressos como variáveis CSS, constantes TypeScript ou entradas em um arquivo de configuração. Atoms consomem tokens; nada abaixo de atoms consome diretamente valores hardcoded.

A introdução dessa camada não altera a metodologia — apenas torna explícito que existe um substrato primitivo que dá consistência visual a todos os atoms.

### Direção da composição

A composição em Atomic Design é estritamente bottom-up: um nível só compõe níveis estritamente inferiores. Atoms não usam molecules; molecules não usam organisms; organisms podem usar organisms menores apenas se a hierarquia interna preservar o sentido (e mesmo essa permissão é debatida na comunidade). Pages não são reutilizadas por templates. Essa direção mantém o grafo de composição acíclico e permite que cada nível seja testado e documentado em isolamento.

## Como o time adotou

A aplicação consome componentes de UI de duas origens: **primitives de bibliotecas externas** (shadcn/ui e Radix UI) e **componentes próprios** construídos sobre esses primitives. Atomic Design é aplicado como modelo organizador da **biblioteca de UI compartilhada**, não da aplicação como um todo.

### Localização no projeto

A biblioteca de UI vive em `src/shared/ui/` (sob a convenção de @architecture/feature-based) ou em `src/shared/ui/` da camada `shared` (sob a convenção de @architecture/fsd — ver @architecture/fsd). Em ambos os casos, é dentro dessa pasta de UI compartilhada que Atomic Design opera. Componentes específicos de feature **não** vivem aqui — eles ficam dentro de suas próprias features e consomem desta biblioteca.

A estrutura interna adotada:

```
src/shared/ui/
  tokens/                # camada zero — design tokens
    colors.ts
    spacing.ts
    typography.ts
  atoms/
    Button/
    Input/
    Label/
    Icon/
    Text/
  molecules/
    SearchField/
    FormField/         # Label + Input + ErrorMessage
    AvatarWithName/
  organisms/
    Header/
    Sidebar/
    DataTable/
    LoginForm/
  templates/
    DashboardLayout/
    AuthLayout/
    MarketingLayout/
```

A camada `pages` da metodologia **não vive** dentro de `src/shared/ui/`. Pages no sentido Atomic correspondem ao conteúdo real renderizado pelas features e pelas rotas — esse papel é absorvido pela camada de roteamento do Next.js 16 (App Router) e pelas features que renderizam dentro dela. Manter pages Atomic dentro da biblioteca de UI compartilhada introduziria acoplamento de domínio em uma área que deve permanecer neutra.

### Integração com shadcn/ui e Radix UI

A biblioteca @stacks/frontend/shadcn-ui distribui componentes diretamente como código no projeto (não como dependência), o que significa que os componentes da shadcn/ui chegam ao código como arquivos editáveis. A política adotada é:

- Componentes **primitivos** distribuídos pela shadcn/ui (`Button`, `Input`, `Label`, `Checkbox`, `Switch`, `Avatar`, `Badge`, `Separator`) são tratados como **atoms** e instalados em `src/shared/ui/atoms/`.
- Componentes **compostos** da shadcn/ui (`Dialog`, `Popover`, `Dropdown`, `Tabs`, `Tooltip`, `Toast`) — que são wrappers sobre primitives de @stacks/frontend/radix-ui contendo gatilho + conteúdo + handlers — são tratados como **molecules** quando representam um padrão de interação reutilizável simples, e como **organisms** quando agregam estrutura maior (ex.: um `Command` com input + lista + grupos).
- Primitives diretos da @stacks/frontend/radix-ui consumidos sem wrapper da shadcn/ui (raro neste projeto) também moram em `atoms/`, com o entendimento de que são átomos sem skin opinada.

O critério de divisão entre molecule e organism, quando aplicado a componentes vindos da shadcn/ui, segue os critérios canônicos: responsabilidade única vs. agregação de múltiplas responsabilidades.

### Convenções de naming

- Cada componente da biblioteca de UI vive em uma pasta própria com `PascalCase`: `atoms/Button/`, `molecules/SearchField/`.
- Dentro de cada pasta, o arquivo principal é nomeado igual à pasta: `Button.tsx`.
- Variantes e subcomponentes vivem na mesma pasta como arquivos auxiliares (`Button.variants.ts`, `Button.stories.tsx` se aplicável).
- Atoms e molecules são **neutros de domínio** no naming: `Button`, não `SubmitButton`; `Card`, não `ProductCard`. Nomes que mencionam domínio sinalizam que o componente pertence a uma feature, não à biblioteca compartilhada.
- Organisms podem carregar contexto quando justificado, mas se carregam, devem permanecer dentro de uma feature, não em `shared/ui/organisms/`.

### Tokens e Tailwind CSS 4

A camada zero (tokens) é implementada via configuração do @stacks/frontend/tailwind@4 e variáveis CSS. Cores semânticas (`bg-background`, `text-foreground`, `border-border`), escalas de espaçamento, tipografia e raios de borda são definidos uma vez em CSS e consumidos por todos os níveis acima. Atoms não recebem valores hardcoded — apenas classes que referenciam tokens.

### Critérios para promover um componente da feature para a biblioteca

Um componente nasce dentro de uma feature e é promovido para `src/shared/ui/` quando passa em três testes:

1. **Neutralidade de domínio.** O componente, depois de removida qualquer prop ou texto específico, descreve uma estrutura visual reutilizável sem referência a entidades de negócio.
2. **Reutilização efetiva.** Ao menos uma segunda feature pediria por este componente, ou o componente representa um padrão visual recorrente do produto.
3. **Estabilidade.** A API do componente está madura o suficiente para não mudar a cada nova feature consumidora.

Componentes que falham em qualquer um dos três permanecem dentro da feature de origem.

### Pages e templates na prática

Templates Atomic ficam em `src/shared/ui/templates/` quando representam layouts de página verdadeiramente reutilizáveis e neutros (ex.: `DashboardLayout` com header + sidebar + slot de conteúdo). Pages Atomic, por sua vez, não vivem na biblioteca de UI — são absorvidas pelos arquivos `page.tsx` do Next.js App Router e pelos componentes raiz de cada feature, que consomem templates e os preenchem com conteúdo real.

## Critérios de aplicação

### Quando Atomic Design se aplica bem

- Projetos com **design system maduro ou em consolidação**, onde múltiplos consumidores (várias features, várias aplicações, ou múltiplos times) precisam compartilhar uma linguagem visual consistente.
- Bases onde a marca exige consistência visual rigorosa e há retorno em centralizar a decisão sobre como cada peça visual se comporta.
- Projetos que mantêm uma biblioteca de UI documentada (Storybook, catálogo interno) onde a hierarquia atoms/molecules/organisms dá estrutura de navegação clara.
- Times com designers e engenheiros colaborando próximos, onde a linguagem comum dos cinco níveis acelera comunicação sobre decisões visuais.

### Quando Atomic Design gera fricção sem retorno

- Aplicações pequenas com poucas telas e sem ambição de design system explícito. Forçar a hierarquia de cinco níveis em uma base com vinte componentes é overhead sem ganho.
- Protótipos descartáveis e provas de conceito.
- Bases que consomem componentes prontos (shadcn/ui inteiro, MUI, Chakra) sem customização significativa — não há decomposição própria a fazer.
- Equipes muito pequenas (um ou dois engenheiros) onde a "linguagem comum" não tem outro interlocutor para se beneficiar.

### Coexistência com modelos de arquitetura de aplicação

Atomic Design **não compete** com @architecture/fsd, @architecture/feature-based, @architecture/hexagonal, @architecture/ddd ou @architecture/clean-architecture. Opera em outra dimensão. A combinação típica adotada neste projeto:

- **@architecture/feature-based** (ou @architecture/fsd quando a base crescer) organiza o código do produto por contexto de negócio.
- **Atomic Design** organiza a **biblioteca de UI compartilhada** dentro de `shared/ui/`.
- Features consomem atoms, molecules, organisms e templates da biblioteca compartilhada; o que é específico de domínio permanece na feature.

Essa divisão preserva a coesão por feature (mudanças de produto ficam concentradas em uma pasta) e a coesão por composição visual (mudanças de design system ficam concentradas em `shared/ui/`).

## Trade-offs reconhecidos

- **Linha tênue entre molecule e organism.** O critério "responsabilidade única" é interpretável. Times investem energia recorrente em discussões de classificação que nem sempre afetam o resultado. Calibrar com poucos exemplos canônicos internos resolve a maior parte dos casos.
- **Risco de sobre-engenharia.** Forçar cada componente a se encaixar em um dos cinco níveis cria pastas inflacionadas e classificações artificiais. Quando uma feature precisa de um componente que não cabe natural em nenhum nível neutro, a resposta correta é deixá-lo dentro da feature, não criar uma molecule sintética para acomodá-lo.
- **Brittleness ao misturar com features.** Se atoms e molecules começam a aceitar props que carregam conceitos de domínio (`Button variant="buyNow"`, `Card type="product"`), a fronteira entre biblioteca neutra e código de feature se dissolve. O custo aparece quando outra feature precisa do mesmo atom sem aquele conceito embutido.
- **A linha entre template e page é cultural.** A separação só entrega valor se o time efetivamente mantém templates sem conteúdo real e instancia pages como estágio distinto. Quando o time pula direto para pages, templates viram dead code.
- **Tokens vs atoms é fronteira nova.** A metodologia original não previa tokens. Bases que evoluíram antes dessa convenção podem ter atoms misturando tokens dentro do código — refatorar para extrair tokens é trabalho dedicado.

## Variantes modernas

A formulação de 2013 evoluiu com a prática da indústria. As variantes mais relevantes:

- **Token-driven Atomic Design.** Adiciona explicitamente a camada zero de tokens abaixo de atoms. Adotada neste projeto via Tailwind 4 e variáveis CSS.
- **Headless + styled separation.** Atoms são fornecidos por bibliotecas headless (@stacks/frontend/radix-ui), que entregam comportamento e acessibilidade sem estilo; o estilo é aplicado em uma camada intermediária (shadcn/ui patterns, ou wrappers próprios). Atoms compostos passam a ter duas responsabilidades separáveis: comportamento (headless) e aparência (styled).
- **Compound components em organisms.** Organisms complexos são expostos como compound components (`<Card>`, `<Card.Header>`, `<Card.Body>`, `<Card.Footer>`), preservando flexibilidade de composição interna sem multiplicar props.

Essas variantes não substituem a metodologia original — refinam-na. A hierarquia de cinco níveis permanece.

## Anti-patterns

- **Forçar todo componente a se encaixar nos cinco níveis.** Criar uma pasta `molecules/` que só existe para abrigar componentes que não couberam confortavelmente em outro lugar. Quando um componente não tem classificação natural, o sinal é que talvez não pertença à biblioteca compartilhada.
- **Atoms acoplados a domínio.** `atoms/ProductPriceLabel`, `atoms/UserAvatar`. Atoms são neutros por construção. Se carrega domínio, é organism (ou pertence à feature).
- **Hierarquia rígida quebrando reuso.** Recusar mover um componente entre níveis ("isso virou organism mas a pasta diz que é molecule") em vez de reclassificar quando a evolução do componente exige. A hierarquia serve ao código, não o contrário.
- **Pages dentro da biblioteca compartilhada.** Promover pages para `src/shared/ui/pages/` arrasta conteúdo real e contexto de domínio para a área neutra. Pages vivem nas features e nas rotas do App Router.
- **Importações em zigue-zague.** Atoms importando de molecules, molecules importando de organisms. A direção da composição é estritamente bottom-up; violações são sinal de classificação errada.
- **Componente único repetido em múltiplos níveis.** A mesma peça visual existindo como atom e como variante de molecule simultaneamente, com pequenas diferenças. A resposta correta é parametrizar o atom, não duplicá-lo em outro nível.
- **Templates virando componentes invisíveis.** Templates que nunca são consumidos diretamente por uma page e existem apenas para "completar a metodologia". Se nenhuma page consome um template, o template não tem motivo para existir.
- **Tokens hardcoded dentro de atoms.** `bg-[#FF6600]` dentro de `atoms/Button.tsx`. Atoms só consomem tokens; valores literais quebram a camada zero.

## Referências cruzadas

- Para modelos que organizam código de aplicação por contexto de negócio: @architecture/feature-based e @architecture/fsd. Atomic Design opera em eixo ortogonal e coexiste com qualquer um dos dois.
- Stack de UI compartilhada que materializa a metodologia: @stacks/frontend/shadcn-ui e @stacks/frontend/radix-ui.
- Stack de tokens e utilitários visuais: @stacks/frontend/tailwind@4.
- Regras de implementação de componentes (props, acessibilidade, variants): @rules/code-review, @rules/accessibility.
- Documentação canônica original: https://atomicdesign.bradfrost.com/

## Aspectos intencionalmente omitidos

- Convenções específicas de Storybook ou catálogos de componentes não fazem parte deste documento — vivem nas práticas de documentação de UI quando aplicável.
- Regras de naming de variantes (tipo `size`, `intent`, `tone`) não estão escopadas aqui; pertencem a regras de implementação de componentes.
- A escolha entre compound components e props planas para organisms complexos não é decisão arquitetural — é decisão de design de API por componente, tratada caso a caso.
- Decisões sobre quais componentes da shadcn/ui instalar e quando custom-builds são preferidos a primitives da @stacks/frontend/radix-ui são registradas como decisions dedicadas quando relevantes.
