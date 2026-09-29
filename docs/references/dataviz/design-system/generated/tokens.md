# Tokens

> Variaveis CSS do projeto. Extraido de `globals.css` (Tailwind CSS v4 + OKLCh).

---

## Projeto

| Campo | Valor |
|-------|-------|
| Nome | Liquid DataViz |
| Tipo | Dashboard de dados (DataViz) + Canvas AI Page Builder |
| Plataforma | Web (desktop-first, responsivo para mobile) |
| CSS Engine | Tailwind CSS v4 com `@theme` e OKLCh color space |
| Themes | Light + Dark (toggle via `next-themes`, default = dark) |

---

## Cores

> Todas as cores usam OKLCh (`oklch(L C H)`) em `globals.css` via `@theme`.
> Os valores na tabela são do tema **dark** (default). O tema **light** sobrescreve
> as mesmas variáveis sob `[data-theme="light"]` em `globals.css`.

### Base

| Token | OKLCh | Hex aprox. | Uso |
|-------|-------|------------|-----|
| `--color-background` | oklch(3.5% 0.005 280) | `#060608` | Fundo principal (quase preto) |
| `--color-foreground` | oklch(100% 0 0) | `#FFFFFF` | Texto principal |
| `--color-muted` | oklch(13% 0 0) | `#212121` | Fundos secundarios, cards elevados |
| `--color-muted-foreground` | oklch(62% 0 0) | `#9E9E9E` | Texto secundario |

### Acoes

| Token | OKLCh | Hex aprox. | Uso |
|-------|-------|------------|-----|
| `--color-primary` | oklch(75.5% 0.14 50) | `#F3A169` | Acoes principais, links, destaques, accent cor da marca |
| `--color-primary-foreground` | oklch(0% 0 0) | `#000000` | Texto sobre primary |
| `--color-secondary` | oklch(42% 0.03 150) | `#576558` | Acoes secundarias, categorias (olive) |
| `--color-secondary-foreground` | oklch(100% 0 0) | `#FFFFFF` | Texto sobre secondary |
| `--color-accent` | oklch(75.5% 0.14 50 / 0.15) | — | Destaques, hover (primary 15% opacidade) |
| `--color-accent-foreground` | oklch(75.5% 0.14 50) | `#F3A169` | Texto sobre accent |

### Estados

| Token | OKLCh | Hex aprox. | Uso |
|-------|-------|------------|-----|
| `--color-destructive` | oklch(55% 0.22 25) | `#DE3B3B` | Erros, acoes destrutivas, indicadores negativos |
| `--color-destructive-foreground` | oklch(100% 0 0) | `#FFFFFF` | Texto sobre destructive |
| `--color-success` | oklch(60% 0.15 155) | `#48A868` | Sucesso, indicadores positivos |
| `--color-success-foreground` | oklch(100% 0 0) | `#FFFFFF` | Texto sobre success |
| `--color-warning` | oklch(75.5% 0.14 50) | `#F3A169` | Alertas, atencao (reutiliza primary) |
| `--color-warning-foreground` | oklch(0% 0 0) | `#000000` | Texto sobre warning |

### Superficies

| Token | OKLCh | Hex aprox. | Uso |
|-------|-------|------------|-----|
| `--color-card` | oklch(7% 0.003 280) | `#141414` | Fundo de cards, widgets, KPI blocks |
| `--color-card-foreground` | oklch(100% 0 0) | `#FFFFFF` | Texto em cards |
| `--color-popover` | oklch(9% 0.003 280) | `#1A1A1A` | Fundo de popovers/dropdowns |
| `--color-popover-foreground` | oklch(100% 0 0) | `#FFFFFF` | Texto em popovers |

### Cores hardcoded recorrentes (fora dos tokens)

> Cores usadas diretamente no codigo com `bg-[...]` / `text-[...]`. Candidatas a virar tokens semanticos.

| Cor | Uso recorrente |
|-----|---------------|
| `#F3A169` | Selection state (ring, badges, toolbar selected), tambem e `--color-primary` |
| `#F3A169/10`, `/20`, `/30` | Backgrounds e borders de selecao (canvas blocks, selection bar, tabs) |
| `#1e1e2e` | Surface de toolbars, modais floating (entre card e popover) |
| `white/[0.06]`, `white/[0.08]`, `white/[0.12]` | Borders sutis, hovers, separadores |
| `white/20`, `white/30`, `white/40`, `white/50` | Texto com opacidades variadas |
| `red-400`, `red-500`, `red-600` | Delete buttons e confirmacoes |

### Bordas e Focus

| Token | OKLCh | Hex aprox. | Uso |
|-------|-------|------------|-----|
| `--color-border` | oklch(16% 0.005 280) | `#2E2E2E` | Bordas gerais |
| `--color-input` | oklch(20% 0.005 280) | `#383838` | Borda de inputs |
| `--color-ring` | oklch(75.5% 0.14 50) | `#F3A169` | Focus ring (primary) |

### Cores para Charts

| Token | OKLCh | Hex aprox. | Uso |
|-------|-------|------------|-----|
| `--color-chart-1` | oklch(75.5% 0.14 50) | `#F3A169` | Informacao primaria (Orange) |
| `--color-chart-2` | oklch(42% 0.03 150) | `#576558` | Informacao secundaria (Olive) |
| `--color-chart-3` | oklch(82% 0.10 50) | `#F7C4A0` | Variacao clara do orange |
| `--color-chart-4` | oklch(52% 0.05 150) | `#6B8A6C` | Variacao clara do olive |
| `--color-chart-5` | oklch(60% 0.10 50) | `#C4864D` | Variacao escura do orange |
| `--color-chart-6` | oklch(45% 0 0) | `#737373` | Neutro para dados terciarios |
| `--color-chart-7` | oklch(62% 0 0) | `#9E9E9E` | Neutro claro |
| `--color-chart-8` | oklch(52% 0.06 50) | `#A17A52` | Tom terroso complementar |

---

## Tipografia

### Familias

| Token | Valor | Uso |
|-------|-------|-----|
| `--font-sans` | `'Inter', system-ui, -apple-system, sans-serif` | Interface, UI, corpo de texto |
| `--font-display` | `'Manrope', 'Inter', system-ui, sans-serif` | Headlines, titulos de pagina, KPIs grandes |
| `--font-mono` | `'JetBrains Mono', 'Fira Code', monospace` | Codigo, valores numericos em tabelas |

### Tamanhos

| Token | Valor | Line-height | Uso |
|-------|-------|-------------|-----|
| `text-xs` | 0.75rem (12px) | 1rem (16px) | Labels pequenos, badges, toolbar buttons |
| `text-sm` | 0.875rem (14px) | 1.25rem (20px) | Texto secundario, celulas de tabela |
| `text-base` | 1rem (16px) | 1.5rem (24px) | Texto padrao, corpo |
| `text-lg` | 1.125rem (18px) | 1.75rem (28px) | Subtitulos de secoes |
| `text-xl` | 1.25rem (20px) | 1.75rem (28px) | Titulos de cards/widgets |
| `text-2xl` | 1.5rem (24px) | 2rem (32px) | Titulos de pagina |
| `text-3xl` | 1.875rem (30px) | 2.25rem (36px) | KPIs, numeros grandes |
| `text-4xl` | 2.25rem (36px) | 2.5rem (40px) | Hero KPIs (Manrope) |
| `text-[9px]` | 9px | — | Micro badges (selecao de blocos) |
| `text-[10px]` | 10px | — | Labels de toolbar, filtros de pagina canvas |
| `text-[11px]` | 11px | — | Chips, status indicators |

### Pesos

| Token | Valor | Uso |
|-------|-------|-----|
| `font-normal` | 400 | Texto corrido, celulas de tabela |
| `font-medium` | 500 | Enfase leve, headers de tabela, tabs, toolbar labels |
| `font-semibold` | 600 | Labels, botoes, titulos de cards, modal headers |
| `font-bold` | 700 | Titulos de pagina, KPIs de destaque, selection badges |

### Letter Spacing

| Token | Valor | Uso |
|-------|-------|-----|
| `tracking-tighter` | -0.04em | Headlines Manrope (brand: -4%) |
| `tracking-tight` | -0.02em | Headings Inter |
| `tracking-normal` | 0em | Texto padrao |
| `tracking-wide` | 0.025em | Labels uppercase, badges |

---

## Espacamento

> Tailwind v4: `--spacing: 0.25rem` como unidade base. Classes usam multiplos: `p-4` = 1rem.

| Token | Valor | Uso |
|-------|-------|-----|
| `space-0.5` | 0.125rem (2px) | Micro gaps internos, toolbar indicator line |
| `space-1` | 0.25rem (4px) | Gaps minimos, padding de badges, toolbar gaps |
| `space-2` | 0.5rem (8px) | Padding interno de celulas, gaps de icones |
| `space-3` | 0.75rem (12px) | Gap padrao entre elementos |
| `space-4` | 1rem (16px) | Padding de cards, gap de secoes |
| `space-5` | 1.25rem (20px) | Espacamento entre widgets |
| `space-6` | 1.5rem (24px) | Blocos maiores, padding de sidebar, canvas page padding |
| `space-8` | 2rem (32px) | Separacao entre secoes da pagina |
| `space-10` | 2.5rem (40px) | Padding de pagina |
| `space-12` | 3rem (48px) | Gaps grandes de layout |

---

## Bordas

### Radius

| Token | Valor | Uso |
|-------|-------|-----|
| `--radius-sm` | 0.25rem (4px) | Badges, chips, elementos pequenos |
| `--radius-md` | 0.5rem (8px) | Botoes, inputs, selects |
| `--radius-lg` | 0.75rem (12px) | Cards, widgets, modais, toolbars, canvas blocks |
| `--radius-xl` | 1rem (16px) | Cards grandes, containers, delete modal |
| `--radius-full` | 9999px | Avatares, tags pill, selection badges, active tab indicator |

### Border Width

| Token | Valor | Uso |
|-------|-------|-----|
| `border` | 1px | Padrao (bordas de cards, inputs, tabelas) |
| `border-2` | 2px | Enfase (tab ativa, focus forte) |
| `border-l-[3px]` | 3px | Drag & drop indicators |

---

## Sombras

| Token | Valor | Uso |
|-------|-------|-----|
| `--shadow-sm` | `0 1px 2px 0 rgba(0, 0, 0, 0.3)` | Cards (sutil em dark) |
| `--shadow-md` | `0 4px 6px -1px rgba(0, 0, 0, 0.4)` | Popovers, dropdowns, selection badges |
| `--shadow-lg` | `0 10px 15px -3px rgba(0, 0, 0, 0.5)` | Modais, AI sidebar |
| `--shadow-card` | dark: `0 4px 24px rgba(0,0,0,0.2)` · light: `0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)` | Elevação de cards/widgets (KpiCard, ChartWidget, Card). Glow ambiente no dark, sombra sutil no light. Use via `shadow-[var(--shadow-card)]` |
| `shadow-2xl` | Tailwind default | Delete confirm modal |

> Nota: Em dark mode, bordas finas (`--color-border`) e `border-white/[0.12]` sao mais eficazes que sombras. Backdrop blur (`backdrop-blur-sm`) e usado em toolbars e selection bars para transparencia.

---

## Motion

> Principios Liquid: "Fluidez" (transicoes naturais) e "Evaporacao" (desaparecimento suave).

### Duracoes

| Token | Valor | Uso |
|-------|-------|-----|
| `duration-150` | 150ms | Hover, focus, micro-interacoes, toolbar show/hide, tab transitions |
| `duration-200` | 200ms | Block card transitions, accordion, drag states |
| `duration-300` | 300ms | Canvas panel crossfade (welcome <-> canvas), fade-in, slide-up |
| `duration-400` | 400ms | Modais, sidebar AI, transicoes de pagina |
| `duration-600` | 600ms | Animacoes de entrada de dados/charts |

### Easing

| Token | Valor | Uso |
|-------|-------|-----|
| `--ease-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | Padrao geral |
| `--ease-in` | `cubic-bezier(0.5, 0, 1, 1)` | Saida de elementos |
| `--ease-out` | `cubic-bezier(0, 0, 0.17, 1)` | Entrada de elementos, fade-in, slide-up, canvas crossfade |
| `--ease-in-out` | `cubic-bezier(0.4, 0, 0.17, 1)` | Movimento continuo, transicoes de pagina |

### Animacoes registradas

| Token | Valor | Uso |
|-------|-------|-----|
| `--animate-fade-in` | fade-in 0.3s ease-out | Entrada geral |
| `--animate-slide-up` | slide-up 0.3s ease-out | Cards, widgets entrando |
| `--animate-scale-in` | scale-in 0.2s ease-out | Popovers, menus |
| `--animate-slide-in-right` | slide-in-right 0.25s ease-out | Sidebar AI abrindo |
| `--animate-slide-in-left` | slide-in-left 0.25s ease-out | Navigation sidebar |
| `--animate-accordion-down` | accordion-down 0.2s ease-out | Accordion expandindo |
| `--animate-accordion-up` | accordion-up 0.2s ease-out | Accordion colapsando |

---

## Opacidade

| Token | Valor | Uso |
|-------|-------|-----|
| `opacity-0` | 0 | Elementos ocultos (toolbar hidden, crossfade inactive) |
| `opacity-50` | 0.5 | Blocos nao selecionados quando ha selecao ativa |
| `opacity-100` | 1 | Elementos visiveis (toolbar shown) |
| `bg-black/50` | 50% | Backdrop de modais (delete confirm) |
| `white/[0.06]` | 6% | Hover backgrounds sutis |
| `white/[0.08]` | 8% | Filter badges backgrounds |
| `white/[0.12]` | 12% | Borders de toolbars e modais floating |

---

## Container e Densidade

| Elemento | Valor | Nota |
|----------|-------|------|
| Nav sidebar width | 320px (`w-80`) | Sidebar com conversas e chat |
| Canvas grid | 3 colunas | Grid de blocos com colSpan 1/2/3 |
| Canvas page padding | 24px (`px-6`) | Padding horizontal das paginas |
| Canvas block gap | 16px (`gap-4`) | Gap entre blocos no grid |
| Toolbar height | ~28px | py-1 + conteudo |
| Toolbar hover zone | 12px (`before:-top-3`) | Pseudo-element invisivel para manter hover |
| Tab height | ~36px | py-2.5 + text-xs |
| Button height (toolbar) | 20-24px | Botoes compactos: h-4/h-5 w-4/w-5 |
| Modal max width | 384px (`max-w-sm`) | Delete confirm modal |
| Selection badge | 20px (`h-5 w-5`) | Badge circular com numero |

---

## Breakpoints

| Token | Valor | Uso |
|-------|-------|-----|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop — Explore page requer min lg (gate) |
| `xl` | 1280px | Desktop grande |
| `2xl` | 1536px | Desktop com sidebar AI aberta |

---

## Iconografia

| Propriedade | Valor |
|-------------|-------|
| Biblioteca | Lucide React |
| Icones usados (canvas) | X, Square, GripVertical, GripHorizontal, Columns2, Columns3, RectangleHorizontal, RefreshCw, Calendar, Building2, Sparkles, Send, Loader2, Plus, Pin, PinOff, Trash2, MoreHorizontal, BrainCircuit, ChevronsLeft, Monitor |
| Tamanho padrao | 20px (`h-5 w-5`) |
| Tamanho small | 12-14px (`h-3 w-3`, `h-3.5 w-3.5`) — toolbar buttons |
| Tamanho large | 24px (`h-6 w-6`) |
| Stroke width | 1.5px (padrao), 2px (icones de acao como X) |
| Estilo | Outline, monocromatico |
| Cor padrao | `text-white/30` (toolbar), `text-muted-foreground` (nav) |
| Cor ativa | `text-[#F3A169]` (selecao), `text-white/60` (hover), `text-red-400` (delete hover) |
