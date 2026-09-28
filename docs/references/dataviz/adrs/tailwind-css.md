# Architecture Decision Records — Tailwind CSS v4.x

Tailwind CSS v4.0, lançado em **22 de janeiro de 2025**, representa uma reescrita completa do framework. As decisões documentadas abaixo capturam as escolhas arquiteturais fundamentais que moldaram esta versão, baseadas em blog posts oficiais de Adam Wathan, release notes no GitHub, e no upgrade guide oficial. Os ADRs cobrem desde a migração do engine para Rust até a adoção de OKLCH e cascade layers nativos.

---

## ADR-001: Reescrita parcial do engine em Rust (Oxide Engine)

**Status:** Aceita e implementada (v4.0.0 — Janeiro 2025)

**Contexto:** O engine do Tailwind CSS v3.x era inteiramente escrito em JavaScript/TypeScript, executando sobre Node.js. As operações mais custosas — escanear milhares de arquivos de template, extrair nomes de classes e parsear CSS — eram inerentemente limitadas pelo modelo single-threaded do JavaScript. Em projetos grandes como o site do Tailwind CSS, builds completos levavam **960ms** e rebuilds incrementais **35–44ms**. A equipe identificou que o scanning de arquivos e o parsing de CSS eram altamente paralelizáveis e representavam os maiores gargalos de performance.

Adam Wathan descreveu a motivação: *"The new engine is a ground-up rewrite, using everything we know about the framework now to better model the problem space, making things faster with a lot less code."*

**Decisão:** Migrar as partes mais custosas e paralelizáveis do framework para **Rust**, mantendo o core de geração de CSS em TypeScript para preservar extensibilidade. Especificamente: o scanning de templates (extração de classes), a detecção de conteúdo, e um parser CSS customizado foram reescritos em Rust. O parser CSS customizado utiliza estruturas de dados projetadas especificamente para o caso de uso do Tailwind, sendo **mais de 2x mais rápido que o PostCSS** para parsing.

Wathan explicou a estratégia no podcast Tuple: *"Rust has concurrency and JavaScript does not... So that instantly makes that 12 times faster or something compared to how it would be in JavaScript, and then also just way faster because it's faster to do the same work even single threaded."*

**Consequências:**

- **Full builds 3.78x mais rápidos** (378ms → 100ms no Catalyst UI kit)
- **Rebuilds incrementais com novo CSS 8.8x mais rápidos** (44ms → 5ms)
- **Rebuilds sem novo CSS 182x mais rápidos** (35ms → 192µs) — completam em microssegundos
- **Footprint instalado 35% menor** que o v3, apesar de incluir pacotes nativos Rust
- A extensibilidade via TypeScript foi preservada para o sistema de plugins
- Complexidade adicional no build toolchain por requerer binários nativos compilados por plataforma
- O engine foi originalmente planejado como release v3.x, mas a magnitude das mudanças justificou a designação v4.0

**Alternativas consideradas:**

- **Manter tudo em JavaScript/TypeScript:** Descartada por limitar fundamentalmente o paralelismo e a performance de operações I/O-intensivas
- **Reescrita completa em Rust:** Descartada para preservar a extensibilidade do ecossistema de plugins em JS/TS. A decisão de manter o core de geração de CSS em TypeScript foi deliberada
- **Uso de Workers/threads em Node.js:** Insuficiente — o overhead de serialização entre threads e as limitações do model de memória compartilhada do Node.js não ofereciam os mesmos ganhos que Rust nativo
- **Go ou C++:** Não mencionados publicamente; Rust foi escolhido por suas garantias de memory safety sem garbage collection e pelo ecossistema crescente de ferramentas CSS (Lightning CSS)

---

## ADR-002: Adoção do Lightning CSS como única dependência de processamento

**Status:** Aceita e implementada (v4.0.0)

**Contexto:** No Tailwind v3, o pipeline de CSS dependia de múltiplos plugins PostCSS configurados manualmente pelo desenvolvedor: `postcss-import` para resolver `@import`, `autoprefixer` para vendor prefixes, plugins de nesting, e opcionalmente `postcss-preset-env` para compatibilidade. Essa fragmentação gerava complexidade de configuração, conflitos entre plugins, e overhead de performance por processar o CSS múltiplas vezes através de plugins JavaScript separados.

**Decisão:** Integrar o **Lightning CSS** (desenvolvido por Devon Govett / equipe do Parcel, escrito em Rust) como **a única dependência externa** do engine. Lightning CSS substitui inteiramente `postcss-import`, `autoprefixer`, plugins de nesting, e transforms de syntax moderna. O Tailwind v4 se torna uma ferramenta "all-in-one" de processamento CSS.

Adam Wathan na comunicação oficial: *"We're making Tailwind more of an all-in-one CSS processing tool by integrating Lightning CSS, which means that things like importing other CSS files, nesting, vendor prefixes, and syntax transforms for future CSS features will just work — no need to install or configure any additional tooling."*

**Consequências:**

- **Instalação simplificada:** Desenvolvedores não precisam mais instalar ou configurar `postcss-import`, `autoprefixer`, ou outros plugins de transformação
- **Handling nativo de `@import`:** Resolução de imports CSS embutida
- **Vendor prefixing automático:** Não requer configuração separada
- **Transforms de CSS moderno:** Funcionalidades como `oklch()`, media query ranges, e nesting são transpilados automaticamente para browsers mais antigos dentro dos targets suportados
- **Minificação integrada:** Handled internamente pelo Lightning CSS
- **Quebra de compatibilidade com plugins PostCSS** que dependiam de acesso ao AST intermediário entre transformações
- **Incompatibilidade com preprocessadores:** Sass, Less e Stylus **não são compatíveis** com v4. Wathan: *"Think of Tailwind CSS itself as your preprocessor."*
- PostCSS continua suportado via `@tailwindcss/postcss`, mas não é mais o caminho primário

**Alternativas consideradas:**

- **Manter PostCSS como base:** Descartada por ser fundamentalmente JavaScript-based, impondo overhead de performance e exigindo múltiplos plugins separados
- **Desenvolver parser/transformer CSS interno completo:** Parcialmente adotada (parser customizado em Rust), mas o Lightning CSS já fornecia transformações maduras de alta qualidade
- **SWC CSS:** Menos maduro no processamento de CSS na época da decisão; Lightning CSS tinha melhor cobertura de features CSS modernas
- **esbuild CSS processing:** Limitado em comparação com Lightning CSS para transformações CSS avançadas

---

## ADR-003: Configuração CSS-first substituindo tailwind.config.js

**Status:** Aceita e implementada (v4.0.0)

**Contexto:** Desde o Tailwind v1 até o v3, toda a configuração do framework — cores, espaçamento, breakpoints, fontes, plugins — era definida em um arquivo JavaScript (`tailwind.config.js`). Isso criava uma dissonância conceitual: **o framework era fundamentalmente CSS, mas configurado em JavaScript**. Desenvolvedores precisavam fazer context-switching entre CSS e JS, e os valores de configuração não eram acessíveis diretamente no CSS sem funções helper como `theme()` ou `resolveConfig()`. Com a evolução de CSS custom properties (variáveis CSS) para maturidade completa em browsers modernos, a barreira técnica para configuração nativa em CSS foi eliminada.

Adam Wathan definiu o objetivo: *"A major goal of Tailwind CSS v4.0 is making the framework feel CSS-native, and less like a JavaScript library."*

**Decisão:** Substituir `tailwind.config.js` por configuração diretamente no CSS usando a nova diretiva **`@theme`**. Toda a personalização do framework — design tokens, cores, breakpoints, fontes, animações — é definida como CSS custom properties dentro de `@theme`. O arquivo JavaScript de configuração **não é mais auto-detectado**, mas pode ser carregado explicitamente via `@config "./tailwind.config.js"` para migração incremental.

A instalação simplificou para uma única linha CSS:
```css
@import "tailwindcss";
```

Em vez das três diretivas `@tailwind` do v3 (`base`, `components`, `utilities`).

**Consequências:**

- **Zero context-switching:** Configuração e estilos vivem no mesmo arquivo CSS
- **Um arquivo a menos no projeto:** Elimina `tailwind.config.js` na configuração padrão
- **Design tokens como CSS custom properties nativas:** Todos os valores de `@theme` são emitidos como variáveis CSS no `:root`, acessíveis em qualquer lugar via `var(--color-brand-500)` — inline styles, animation libraries (Framer Motion), e CSS customizado
- **Theming em runtime:** Mudanças de tema (dark mode, cores de marca) podem acontecer sem rebuild
- **Eliminação de `resolveConfig()`:** Não é mais necessário para acessar valores do tema em JavaScript
- **Migração incremental suportada:** `@config` e `@plugin` coexistem com `@theme` e `@utility`, permitindo migração gradual
- **Três opções de config JS não suportadas em v4:** `corePlugins`, `safelist`, e `separator` foram removidas (sem equivalentes diretos no novo sistema)
- **Curva de aprendizado:** Desenvolvedores acostumados com JS config precisam aprender as convenções de namespaces de variáveis CSS (`--color-*`, `--font-*`, `--breakpoint-*`, etc.)

**Alternativas consideradas:**

- **Manter JS config como padrão com CSS como opção:** Descartada — a equipe queria que CSS-first fosse a experiência padrão, não uma alternativa
- **JSON/YAML config:** Não mencionada publicamente; provavelmente descartada por não oferecer as vantagens de runtime das CSS custom properties
- **Manter `@tailwind` directives:** Substituídas por `@import "tailwindcss"` para alinhar com padrões CSS nativos
- **TypeScript config:** Já suportado em v3 mas gerava a mesma dissonância conceitual; mover para CSS eliminava a necessidade de qualquer tipo de JavaScript para configuração

---

## ADR-004: Sistema de theming via @theme e CSS custom properties

**Status:** Aceita e implementada (v4.0.0)

**Contexto:** No Tailwind v3, o sistema de `theme` em `tailwind.config.js` definia tokens de design que eram internamente consumidos pelo framework para gerar utility classes. Esses valores não eram diretamente acessíveis como CSS custom properties — para usá-los fora de classes utilitárias, desenvolvedores precisavam de `theme()` no CSS ou `resolveConfig()` em JavaScript. Além disso, estender o tema (`theme.extend`) vs. sobrescrevê-lo era uma fonte constante de confusão.

**Decisão:** Implementar o sistema **`@theme`** onde design tokens são definidos como CSS custom properties com namespaces semânticos. Cada namespace mapeia diretamente para famílias de utility classes:

| Namespace | Utilities geradas |
|-----------|-------------------|
| `--color-*` | `bg-*`, `text-*`, `border-*`, `fill-*`, etc. |
| `--font-*` | `font-*` (font-family) |
| `--text-*` | `text-*` (font-size) |
| `--breakpoint-*` | Responsive variants (`sm:`, `md:`, `lg:`) |
| `--spacing-*` | `px-*`, `mt-*`, `w-*`, `h-*`, `gap-*` |
| `--radius-*` | `rounded-*` |
| `--shadow-*` | `shadow-*` |
| `--animate-*` | `animate-*` |
| `--ease-*` | `ease-*` |

A mecânica de **extend vs. override** foi simplificada: adicionar novas variáveis CSS funciona como `extend`; para sobrescrever um namespace inteiro, usa-se `--color-*: initial;` antes de redefinir. Para um tema completamente customizado, `--*: initial;` remove todos os defaults.

Variações adicionais: `@theme inline { ... }` emite o valor literal em vez de referenciar a variável CSS (necessário quando variáveis referenciam outras variáveis); `@theme static { ... }` força a geração de todas as variáveis mesmo se não utilizadas.

**Consequências:**

- **Todos os design tokens acessíveis em runtime** via `var(--color-*)` — elimina necessidade de `resolveConfig()`
- **Compartilhamento de temas simplificado:** Basta importar um arquivo CSS com `@theme` entre projetos
- **Keyframes de animação** definidos dentro de `@theme` junto com `--animate-*`
- **A função `theme()` é deprecated** — substituída por `var()` em quase todos os contextos, exceto em media queries onde variáveis CSS não funcionam (usa-se `theme(--breakpoint-xl)`)
- **Ecossistema de terceiros simplificado:** Bibliotecas podem consumir tokens Tailwind como CSS custom properties padrão, sem acoplamento com APIs JavaScript do Tailwind
- **Overhead de variáveis CSS no `:root`:** Todas as variáveis do tema são emitidas no CSS final, o que pode aumentar o tamanho do bundle em projetos com muitos tokens

**Alternativas consideradas:**

- **Design tokens em JSON (seguindo o padrão W3C Design Tokens):** Mais portável entre ferramentas mas sem as vantagens de runtime
- **CSS Houdini Custom Properties registradas:** Parcialmente adotado — `@property` é usado internamente para tipagem de propriedades (e.g., para permitir transição de gradientes), mas não como mecanismo primário de theming
- **Manter o modelo JS com emissão automática de CSS variables:** Adicionaria complexidade sem a simplicidade do modelo CSS-first

---

## ADR-005: Detecção automática de conteúdo substituindo o array `content`

**Status:** Aceita e implementada (v4.0.0)

**Contexto:** Uma das maiores fontes de frustração no Tailwind v3 era o array `content` no `tailwind.config.js`. Desenvolvedores precisavam especificar manualmente todos os caminhos de arquivos contendo classes Tailwind. Esquecer um caminho resultava em classes sendo purgadas em produção; monorepos exigiam padrões glob complexos. Adam Wathan reconheceu o problema: *"You know how you always had to configure that annoying content array in Tailwind CSS v3?"*

**Decisão:** Implementar **detecção automática de conteúdo** com dois modos de operação:

1. **PostCSS/CLI:** Crawl automático de todo o projeto usando heurísticas inteligentes — respeita `.gitignore`, ignora extensões binárias (imagens, vídeos, zips), e a partir do v4.1 ignora `node_modules` por padrão
2. **Plugin Vite:** Utiliza o **module graph** do Vite, que sabe exatamente quais arquivos são realmente usados pelo projeto

Para casos especiais, a diretiva `@source` permite ajustes: `@source "../node_modules/@my-company/ui-lib"` adiciona caminhos; `@source not "path"` exclui caminhos; `source(none)` desabilita completamente a auto-detecção.

A funcionalidade de `safelist` do v3 foi substituída por `@source inline("class1 class2")`.

**Consequências:**

- **Zero configuração** para a maioria dos projetos — funciona out-of-the-box
- **Eliminação de bugs de purge** causados por caminhos faltantes no `content`
- **Detecção perfeita no Vite** sem falsos positivos ou negativos via module graph
- **`@source`** fornece escape hatch explícito para edge cases
- **Heurísticas podem falhar** em setups não-convencionais (e.g., arquivos gerados dinamicamente fora do diretório raiz)
- **Opção `safelist` removida** — `@source inline()` é menos ergonômico para listas longas de classes safe-listed
- **Opção `content`** do JS config não existe mais; projetos que dependiam de padrões glob complexos precisam usar `@source`

**Alternativas consideradas:**

- **Manter `content` array como padrão com auto-detecção como opt-in:** Descartada para maximizar a simplificação de DX
- **Análise estática de AST (parse JS/TS/JSX para extrair strings):** Muito lenta e frágil com expressões dinâmicas; heurísticas baseadas em regex + module graph são mais pragmáticas
- **Configuração por convenção (e.g., só escanear `src/`):** Muito restritivo para a diversidade de estruturas de projeto no ecossistema

---

## ADR-006: Adoção de CSS cascade layers nativos

**Status:** Aceita e implementada (v4.0.0)

**Contexto:** No Tailwind v3, o framework "sequestrava" a diretiva `@layer` do CSS para criar pseudo-layers de build-time (`@layer base`, `@layer components`, `@layer utilities`). Essas layers eram processadas pelo Tailwind em build-time e não utilizavam o mecanismo nativo de `@layer` do CSS. Isso gerava **problemas de especificidade**: CSS de terceiros sem layers poderia inadvertidamente sobrescrever utilities do Tailwind, e a ordem de declaração entre component styles e utility styles era frágil.

Wathan explicou: *"We're using real @layer rules now, which solves a ton of specificity problems we've wrestled with in the past."*

**Decisão:** Adotar **CSS cascade layers nativos** com a seguinte hierarquia:

```css
@layer theme, base, components, utilities;
```

Como `@layer` agora é CSS nativo (não mais "sequestrado" pelo Tailwind), a diretiva para definir custom utilities foi renomeada para **`@utility`** (substituindo `@layer utilities { ... }` e `@layer components { ... }`). Custom utilities definidas com `@utility` são automaticamente ordenadas por contagem de propriedades — utilities multi-property (como `.btn` com padding, border-radius, background) são ordenadas antes de utilities single-property, permitindo que classes Tailwind como `bg-red-500` as sobrescrevam naturalmente.

**Consequências:**

- **Utilities sempre vencem:** Cascade layers garantem que utilities sobrescrevam component styles independentemente de source order, eliminando uma classe inteira de bugs de especificidade
- **Simplificação interna:** Wathan: *"Many of these features have even simplified Tailwind internally, reducing the surface area for bugs and making the framework easier for us to maintain."*
- **Incompatibilidade com CSS de terceiros sem layers:** Este é o trade-off mais significativo. CSS de terceiros (WordPress themes, Drupal styles, bibliotecas UI) que não usa `@layer` terá **precedência** sobre CSS em qualquer cascade layer — incluindo utilities do Tailwind. Isso gerou problemas reais documentados em issues do GitHub (e.g., Livewire/Flux #783, discussão #13188)
- **`@layer utilities` e `@layer components`** no CSS do usuário não funcionam mais como mecanismo do Tailwind — devem ser substituídos por `@utility`
- **Opt-out possível** mas com ressalvas: Wathan alertou que "there are downsides because we've adjusted the specificity of a few things with the assumption that things would be in layers"
- **Terceiros precisaram adaptar:** Bibliotecas como Clerk adicionaram opções `cssLayerName` para funcionar com o sistema de layers do v4

**Alternativas consideradas:**

- **Manter o sistema pseudo-layer de build-time:** Descartada — não resolvia problemas reais de especificidade com CSS externo e não aproveitava avanços da plataforma CSS
- **Cascade layers opcionais (opt-in):** Descartada porque muitas otimizações internas e decisões de especificidade dependem de layers estarem ativas
- **`@scope` como alternativa:** Não mencionada; `@scope` resolve problemas diferentes (encapsulamento de escopo vs. prioridade de cascade)

---

## ADR-007: Migração do color palette para OKLCH

**Status:** Aceita e implementada (v4.0.0)

**Contexto:** O color palette padrão do Tailwind v3 utilizava valores **rgb/hex** limitados ao gamut sRGB. Displays modernos (MacBook Pro, iPhone, monitores P3) suportam um gamut de cores significativamente mais amplo que o sRGB. O espaço de cor **OKLCH** (Oklab Lightness Chroma Hue), proposto por Björn Ottosson em 2020, resolve duas limitações fundamentais: (1) uniformidade perceptual — diferenças numéricas iguais em lightness produzem diferenças perceptuais iguais, ao contrário de HSL; (2) suporte a wide gamut, permitindo expressar cores P3 e Rec.2020 que hex/rgb não conseguem representar.

Wathan: *"We've upgraded the entire default color palette from rgb to oklch, taking advantage of the wider gamut to make the colors more vivid in places where we were previously limited by the sRGB color space."*

**Decisão:** Migrar todo o palette padrão de **22 famílias de cores × 11 shades** (50–950) de rgb para **oklch**. Gradientes passam a usar interpolação **OKLAB** por padrão (produzindo mid-tones mais vívidos entre matizes distantes), com modificadores para controlar o modo de interpolação (`bg-linear-to-r/oklch`, `bg-linear-to-r/srgb`). Opacity modifiers agora usam `color-mix()` em vez de variáveis CSS internas:

```css
.bg-blue-500\/50 {
  background-color: color-mix(in oklab, var(--color-blue-500) 50%, transparent);
}
```

A equipe tentou manter o balanço visual entre cores: *"We've tried to keep the balance between all the colors the same as it was in v3, so even though we've refreshed things across the board, it shouldn't feel like a breaking change."*

No v4.2, paletas adicionais foram introduzidas: `mauve`, `olive`, `mist`, `taupe`.

**Consequências:**

- **Cores mais vívidas** onde antes limitadas pelo sRGB, especialmente em ranges de azul, verde e violeta
- **Gradientes perceptualmente melhores** com interpolação OKLAB por padrão
- **Manipulação de cor mais previsível:** Ajustar lightness/chroma/hue independentemente produz resultados mais intuitivos
- **Incompatibilidade com browsers antigos:** OKLCH não é transpilado porque `@property` e `color-mix()` (dos quais v4 depende) também requerem browsers modernos. Isso gerou reports de "botões invisíveis em dispositivos iOS não tão antigos" (GitHub Discussion #15356)
- **v4.1 melhorou graceful degradation** com fallbacks para browsers mais antigos, mas o target mínimo permanece Safari 16.4+
- **Opacity via `color-mix()`** permite ajustar opacidade de qualquer valor de cor, incluindo CSS variables e `currentColor` — impossível no modelo v3 baseado em `--tw-*-opacity`

**Alternativas consideradas:**

- **Manter rgb/hex:** Descartada — limita artificialmente a vividez de cores em displays modernos
- **HSL:** Descartada — não é perceptualmente uniforme (amarelo em L=50% parece muito mais claro que azul em L=50%)
- **CIE LCH:** Descartada em favor de OKLCH — CIE LCH tinha um bug onde azul parecia roxo ao ajustar lightness
- **Fornecer dual palettes (sRGB + P3):** Adicionaria complexidade desnecessária ao sistema de theming
- **Transpilar OKLCH para rgb:** Tecnicamente impossível preservar cores wide-gamut; e `color-mix()` e `@property` já impõem o mesmo requirement de browser

---

## ADR-008: Plugin Vite first-party e reestruturação de pacotes

**Status:** Aceita e implementada (v4.0.0)

**Contexto:** No Tailwind v3, `tailwindcss` era simultaneamente o pacote core e o plugin PostCSS. Não havia plugin oficial para Vite — o framework era integrado exclusivamente via PostCSS. Com o Vite se tornando o bundler dominante no ecossistema frontend (Laravel, SvelteKit, Nuxt, React Router, SolidJS), havia uma oportunidade de integração mais profunda que o PostCSS não permitia.

Wathan: *"Using the Vite plugin, we rely on the module graph. This is amazing because we know exactly what files you're actually using, so it's maximally performant, and with no false positives or negatives."*

**Decisão:** Reestruturar o framework em **pacotes separados por responsabilidade**:

- **`tailwindcss`** — core engine (não é mais um plugin PostCSS diretamente)
- **`@tailwindcss/postcss`** — plugin PostCSS dedicado
- **`@tailwindcss/vite`** — plugin Vite first-party
- **`@tailwindcss/cli`** — CLI dedicado
- **`@tailwindcss/browser`** — build compatível com browser
- **`@tailwindcss/upgrade`** — ferramenta de migração automatizada
- **`@tailwindcss/webpack`** — plugin webpack oficial (adicionado no v4.2)

O plugin Vite oferece performance superior ao PostCSS por integrar-se diretamente com o module graph do Vite, eliminando scanning heurístico de arquivos.

**Consequências:**

- **Melhor performance para usuários Vite:** Integração com module graph elimina falsos positivos/negativos na detecção de conteúdo
- **HMR mais rápido:** Integração mais profunda com hot module replacement do Vite
- **Separação de concerns clara:** Cada pacote tem responsabilidade bem definida
- **Breaking change na instalação:** `tailwindcss` não é mais um plugin PostCSS; projetos existentes precisam instalar `@tailwindcss/postcss` ou `@tailwindcss/vite`
- **`postcss-import` e `autoprefixer` devem ser removidos** da configuração PostCSS (causam conflitos)
- **Experiência tier-2 para não-Vite:** Projetos que não usam Vite (webpack, Parcel) ficaram inicialmente sem plugin oficial dedicado até v4.2 (webpack)
- **Configuração simplificada para Vite:** Apenas `tailwindcss()` no array de plugins — sem PostCSS config necessário

**Alternativas consideradas:**

- **Manter `tailwindcss` como plugin PostCSS unificado:** Descartada — a separação permite otimizações específicas por bundler
- **Plugin genérico de bundler (Unplugin):** Não mencionado publicamente; plugins específicos permitem otimizações mais profundas (e.g., module graph do Vite)
- **Apenas CLI sem plugins de bundler:** Insuficiente para integração com HMR e dev servers modernos

---

## ADR-009: Sistema de plugins CSS-native (@utility e @custom-variant)

**Status:** Aceita e implementada (v4.0.0)

**Contexto:** No Tailwind v3, custom utilities e variants eram definidos exclusivamente via API JavaScript em plugins: `addUtilities()`, `addComponents()`, `matchUtilities()`, `addVariant()`. Para adicionar uma utility simples, um desenvolvedor precisava criar um arquivo JavaScript, importar a API do plugin, e registrar a utility programaticamente. Custom styles dentro de `@layer utilities { ... }` funcionavam mas dependiam do mecanismo pseudo-layer do Tailwind (não CSS nativo) e não se integravam completamente com o sistema de variants.

**Decisão:** Introduzir diretivas CSS nativas para definição de utilities e variants, substituindo a necessidade da API JavaScript para a maioria dos casos:

**`@utility`** substitui `addUtilities()`, `addComponents()`, e `@layer utilities/components`:
```css
@utility btn {
  border-radius: 0.5rem;
  padding: 0.5rem 1rem;
  background-color: ButtonFace;
}
```

**`@custom-variant`** substitui `addVariant()`:
```css
@custom-variant theme-midnight (&:where([data-theme="midnight"] *));
```

**`@variant`** permite aplicar variants Tailwind a blocos CSS arbitrários:
```css
.element {
  background: white;
  @variant dark { background: black; }
}
```

Plugins JavaScript legacy continuam suportados via diretiva **`@plugin`**:
```css
@plugin "@tailwindcss/typography";
```

Custom utilities definidas com `@utility` são automaticamente **ordenadas por contagem de propriedades** — utilities multi-property (componentes) são ordenadas antes no CSS, permitindo que utilities single-property do Tailwind as sobrescrevam.

**Consequências:**

- **Utilities customizadas funcionam com todos os variants** automaticamente (hover, focus, responsive, dark mode, etc.)
- **Definição declarativa** em CSS — sem necessidade de JavaScript para custom utilities e variants simples
- **Sorting automático inteligente:** Multi-property utilities (componentes) podem ser sobrescritas por single-property Tailwind utilities naturalmente
- **`@apply` continua funcionando** para inlining de utility classes em CSS customizado
- **`@reference`** necessário em Vue/Svelte `<style>` blocks e CSS modules para acessar theme variables e utilities definidas em outros arquivos
- **Plugins JS legados requerem `@plugin`:** Não são mais auto-detectados via config
- **APIs JS do plugin (`addBase()`, `addUtilities()`, etc.) ainda funcionam** via `@plugin` mas são consideradas legado
- **Ecossistema de plugins precisou adaptar:** DaisyUI e outros plugins de theming precisaram de rewrites significativos

**Alternativas consideradas:**

- **Manter API JS como caminho primário:** Descartada — inconsistente com a filosofia CSS-first
- **Eliminar completamente suporte a plugins JS:** Descartada para não quebrar o ecossistema existente; `@plugin` serve como bridge
- **Web Components / Shadow DOM para encapsulamento:** Escopo diferente; `@utility` resolve definição de utilities, não encapsulamento

---

## ADR-010: Targeting exclusivo de browsers modernos

**Status:** Aceita e implementada (v4.0.0)

**Contexto:** A decisão de adotar `@property`, `color-mix()`, cascade layers nativos, e OKLCH impõe requirements mínimos de browser. Essas features CSS não podem ser polyfilled ou transpiladas de forma equivalente para browsers mais antigos. A equipe enfrentou a escolha entre manter backward compatibility com browsers legacy (como o v3 fazia) ou abraçar features modernas da plataforma web para uma melhor experiência de desenvolvimento.

**Decisão:** Definir como **browsers mínimos suportados: Safari 16.4+, Chrome 111+, Firefox 128+**. Projetos que precisam suportar browsers mais antigos devem permanecer no **Tailwind v3.4**, que continuará disponível.

O v4.1 adicionou melhorias de degradação para browsers mais antigos (fallbacks para cores oklab em Safari/Firefox mais antigos), mas sem alterar o target mínimo.

**Consequências:**

- **Acesso a `@property`:** Permite registrar CSS custom properties com tipos (e.g., `<color>`), habilitando transição de gradientes e validação de valores
- **Acesso a `color-mix()`:** Permite opacity modifiers em qualquer cor, incluindo `currentColor` e variáveis CSS
- **Acesso a cascade layers nativos:** Resolve problemas históricos de especificidade
- **Acesso a OKLCH:** Cores wide-gamut para displays P3
- **Exclusão de usuários em browsers antigos:** Reports de "botões invisíveis" em iOS devices (Safari < 16.4). Wathan respondeu no GitHub que a decisão era deliberada e que browsers antigos que não suportam `color-mix()` e `@property` também não suportariam OKLCH, então transpilar apenas OKLCH não resolveria os problemas
- **v3.4 como alternativa explícita:** A equipe mantém v3.4 como opção recomendada para projetos com requirements de legacy browser support
- **Crítica da comunidade:** DevClass reportou preocupações de que *"browser compatibility is a concern... developers will be cautious about early adoption in production."* Desenvolvedores criticaram que os requirements de browser não foram suficientemente destacados nas release notes iniciais

**Alternativas consideradas:**

- **Polyfills/fallbacks automáticos para todas as features:** Tecnicamente impossível para `@property` e cascade layers; degradação significativa de funcionalidade
- **Modo de compatibilidade legacy (dual output):** Adicionaria complexidade significativa ao engine e aumentaria tamanho de output
- **Transpilar OKLCH para rgb com perda de gamut:** Parcialmente viável mas inconsistente — `color-mix()` e `@property` ainda falhariam, tornando a transpilação de OKLCH insuficiente
- **Release incremental de features modernas:** Descartada — as features são interdependentes (e.g., opacity modifiers dependem de `color-mix()`, que depende dos mesmos browsers que suportam OKLCH)

---

## ADR-011: Mudança na sintaxe de prefix (tw:flex em vez de tw-flex)

**Status:** Aceita e implementada (v4.0.0)

**Contexto:** No Tailwind v3, prefixes eram configurados como prefixo de string separado por hífen (e.g., `tw-flex`, `tw-bg-red-500`, `hover:tw-bg-red-600`). Esta sintaxe criava ambiguidade com valores negativos e era inconsistente com a sintaxe de variants (que usam `:`).

**Decisão:** Mudar a sintaxe de prefix para usar **dois-pontos**, tratando o prefix como um variant:

- v3: `tw-flex tw-bg-red-500 hover:tw-bg-red-600`
- v4: `tw:flex tw:bg-red-500 tw:hover:bg-red-600`

Configuração via CSS: `@import "tailwindcss" prefix(tw);`

Theme variables são definidas sem prefix, mas as variáveis CSS geradas incluem o prefix (e.g., `--tw-color-*`).

**Consequências:**

- **Consistência sintática:** Prefix usa mesma notação que variants (`:`)
- **Eliminação de ambiguidade** com valores negativos
- **Breaking change em todos os templates** de projetos que usam prefixes — necessário find-and-replace extensivo
- **Tool de migração automatizado** cobre esta mudança

**Alternativas consideradas:**

- **Manter sintaxe com hífen:** Descartada por ambiguidade
- **Prefix como atributo HTML data:** Escopo muito diferente do problema

---

## ADR-012: Valores dinâmicos de utility e escala de spacing unificada

**Status:** Aceita e implementada (v4.0.0)

**Contexto:** No Tailwind v3, utilities de espaçamento aceitavam apenas valores explicitamente definidos na configuração (e.g., `mt-4` funcionava porque `4` = `1rem` estava no tema, mas `mt-17` não existia por padrão). Grid columns eram limitadas a `grid-cols-1` até `grid-cols-12`. Data attributes precisavam de configuração explícita. Qualquer valor fora do padrão requeria arbitrary values com colchetes: `mt-[4.25rem]`.

**Decisão:** Derivar valores de spacing **dinamicamente** de uma única variável `--spacing`:

```css
:root { --spacing: 0.25rem; }
.mt-8 { margin-top: calc(var(--spacing) * 8); }
.w-17 { width: calc(var(--spacing) * 17); }
```

Isso significa que **qualquer valor numérico funciona** para utilities de espaçamento, grid columns, e similares — sem configuração. Data attributes booleanos também funcionam automaticamente: `data-current:opacity-100`.

**Consequências:**

- **Qualquer valor de spacing funciona:** `px-29`, `w-17`, `gap-13` — sem arbitrary values
- **Grid columns de qualquer tamanho:** `grid-cols-15`, `grid-cols-23`
- **Data attributes sem configuração:** `data-current:opacity-100`, `data-active:bg-blue-500`
- **Simplificação da configuração:** A maioria dos projetos não precisa mais customizar a escala de spacing
- **Mudança conceitual:** O sistema passa de "lookup table de valores permitidos" para "fórmula matemática com qualquer input"
- **Ferramenta de upgrade simplifica arbitrary values** que não são mais necessários (e.g., `mt-[4.25rem]` → `mt-17` se equivalente)

**Alternativas consideradas:**

- **Expandir a lookup table padrão:** Sempre haverá valores faltando; a abordagem baseada em fórmula é mais completa
- **Eliminar a escala de spacing fixa completamente:** Descartada — a variável `--spacing` ainda define o multiplicador base, mantendo consistência no design system

---

## ADR-013: Mudanças em valores default (border color, ring, cursor, placeholders)

**Status:** Aceita e implementada (v4.0.0)

**Contexto:** O Tailwind v3 definia valores default opinados para várias utilities que divergiam dos defaults do browser: `border` usava `gray-200` (browser default: `currentColor`), `ring` era `3px blue-500` (sem equivalente nativo), e `placeholder` era `gray-400`. Esses defaults opinados do v3 frequentemente introduziam inconsistências de cor — um projeto usando `zinc` como gray primário teria borders em `gray-200` por default, misturando escalas de cinza inadvertidamente.

Wathan explicou a mudança de border: *"We made this change to make it harder to accidentally introduce a wrong gray into your project if you're using zinc or slate or something else as your main gray."*

**Decisão:** Alinhar defaults com comportamentos nativos do browser e simplificar para consistência:

| Utility | v3 Default | v4 Default | Rationale |
|---------|-----------|-----------|-----------|
| `border` color | `gray-200` | `currentColor` | Alinha com default CSS nativo, evita wrong gray |
| `ring` | 3px `blue-500` | 1px `currentColor` | Ring usado como border alternativa, não focus ring |
| `placeholder` | `gray-400` | Texto atual em 50% opacity | Funciona com qualquer cor de texto |
| `button` cursor | `pointer` | `default` | Alinha com default do browser |
| `dialog` margins | Não resetadas | Resetadas para 0 | Consistência com reset de outros elementos |
| `hover` variant | Sempre aplica | Só quando `@media (hover: hover)` | Evita hover "sticky" em touch devices |

Variáveis de compatibilidade disponíveis para projetos que precisam do comportamento v3:
```css
@theme {
  --default-ring-width: 3px;
  --default-ring-color: var(--color-blue-500);
}
```

Adicionalmente, o modificador `!important` mudou de posição (`!bg-red-500` → `bg-red-500!`), e a ordem de stacking de variants mudou de right-to-left para **left-to-right** para alinhar com a leitura natural de CSS.

**Consequências:**

- **Menos "wrong grays" acidentais** — borders, rings e placeholders herdam a cor contextual
- **Melhor experiência mobile:** `hover` variant não dispara em taps em touch devices
- **Variáveis de compatibilidade** permitem restaurar comportamento v3 durante migração
- **Breaking change visual:** Projetos existentes podem ter aparência diferente após upgrade sem ajustes — especialmente borders (que ficam mais escuras com `currentColor` vs `gray-200`)
- **Hover customizável:** `@custom-variant hover (&:hover);` restaura comportamento v3 para hover

**Alternativas consideradas:**

- **Manter todos os defaults v3 e oferecer opt-in para novos defaults:** Descartada — Wathan preferiu "a tool that generates the diff" sobre "a configuration option staring you in the face saying you're using the old version"
- **Configuração granular de defaults:** Parcialmente implementada via variáveis `--default-*`, mas apenas para ring

---

## ADR-014: Remoção de compatibilidade com Sass, Less e Stylus

**Status:** Aceita e implementada (v4.0.0)

**Contexto:** Alguns projetos utilizavam Tailwind v3 em conjunto com preprocessadores CSS como Sass, Less, ou Stylus. Essa combinação sempre foi frágil — a sintaxe `@apply` conflitava com features de Sass, nesting tinha semântica diferente, e as funções `theme()` do Tailwind colidiam com construtos dos preprocessadores. Com o Lightning CSS fornecendo nesting nativo, `@import` handling, e transforms de CSS moderno, a necessidade de preprocessadores externos foi eliminada.

**Decisão:** **Não suportar** Sass, Less ou Stylus no Tailwind v4. A posição oficial: *"Think of Tailwind CSS itself as your preprocessor."*

**Consequências:**

- **Eliminação de conflitos de sintaxe** entre Tailwind e preprocessadores
- **Pipeline de CSS simplificado:** Uma ferramenta em vez de duas/três
- **Projetos legados com Sass** precisam migrar styles para CSS vanilla ou manter preprocessador separado do pipeline Tailwind
- **Nesting CSS nativo** (suportado pelo Lightning CSS) cobre o caso de uso mais comum de Sass

**Alternativas consideradas:**

- **Manter compatibilidade parcial:** Descartada — o custo de manutenção e os conflitos de sintaxe não justificavam o suporte
- **Modo de compatibilidade com Sass:** Adicionaria complexidade significativa ao pipeline Lightning CSS

---

## ADR-015: Mudança nos seletores de space-between e divide

**Status:** Aceita e implementada (v4.0.0)

**Contexto:** No Tailwind v3, as utilities `space-y-*` e `divide-y-*` usavam o seletor `:not([hidden]) ~ :not([hidden])` (sibling combinator universal com exclusão de hidden). Este seletor causava **problemas sérios de performance em páginas grandes** porque o browser precisava avaliar a relação entre todos os siblings, mesmo os não adjacentes.

**Decisão:** Mudar o seletor para `:not(:last-child)` com `margin-bottom` em vez de `margin-top`:

- v3: `.space-y-4 > :not([hidden]) ~ :not([hidden]) { margin-top: 1rem; }`
- v4: `.space-y-4 > :not(:last-child) { margin-bottom: 1rem; }`

A recomendação oficial é migrar gradualmente para `flex`/`grid` com `gap` utilities.

**Consequências:**

- **Performance significativamente melhor** em páginas com muitos siblings
- **Mudança de margin-top para margin-bottom:** Pode afetar layouts que dependiam do margin collapse específico com margin-top
- **Elementos hidden (com atributo)** agora recebem margin (seletor não os exclui mais); mas o comportamento com `hidden` é coberto pela mudança separada onde `hidden` attribute tem prioridade sobre display classes

**Alternativas consideradas:**

- **`:first-child` com margin-top**: Equivalente funcional mas `margin-bottom` no `:not(:last-child)` é mais previsível para adição dinâmica de elementos
- **Deprecar completamente em favor de `gap`:** Considerado para o futuro, mas space-between ainda tem casos de uso válidos com elementos de tamanho variável

---

## Sumário das decisões e seus impactos

O Tailwind CSS v4.x representa uma **aposta deliberada no futuro da plataforma web** em detrimento de backward compatibility com browsers legacy. As 15 decisões arquiteturais documentadas formam um sistema coerente: Rust para performance, Lightning CSS para unificação, CSS-first para DX, e CSS moderno (cascade layers, `@property`, OKLCH, `color-mix()`) para resolver problemas que o v3 contornava com hacks de build-time.

O trade-off central é claro: **performance e elegância arquitetural em exchange por browser support restrito e esforço de migração significativo.** A ferramenta automatizada `npx @tailwindcss/upgrade` mitiga parte do custo de migração, mas projetos complexos — especialmente aqueles com CSS de terceiros sem cascade layers ou targets de browser legacy — enfrentam desafios substanciais. A disponibilidade contínua do v3.4 como alternativa estável é a válvula de segurança explícita da equipe para este trade-off.

A progressão de v4.0 → v4.1 → v4.2 mostra maturação contínua: o v4.1 endereçou graceful degradation para browsers mais antigos e adicionou text-shadow/mask utilities; o v4.2 trouxe o plugin webpack oficial e paletas de cores expandidas — evidenciando que decisões como "Vite-first" e "OKLCH-only" estão sendo suavizadas iterativamente sem reverter as decisões arquiteturais fundamentais.