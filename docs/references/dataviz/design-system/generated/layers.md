# Layers FSD

> Regras de classes por camada. O que usar e o que evitar.

---

## Resumo

| Camada | Responsabilidade |
|--------|------------------|
| `shared/` | Primitivos visuais (ui components, hooks, lib, stores, config) |
| `entities/` | Dados de negocio |
| `features/` | Interacoes (auth, canvas-orchestrator, ai-agents) |
| `widgets/` | Composicoes (NavSidebar, AppBar, KpiCard, ChartWidget, GlobalFilters, AISidebar) |
| `pages/` | Layout macro (page-specific UI: explore/, dashboard/) |

---

## shared/

| Categoria | Permitido | Evitar |
|-----------|-----------|--------|
| Cores | Variaveis semanticas (`bg-background`, `text-foreground`) | `bg-white`, `text-gray-*`, hex direto |
| Spacing | `p-*` (padding interno) | `m-*` (margin externa) |
| Position | `relative` | `fixed`, `absolute`, `sticky` |
| Z-index | Nenhum | Qualquer z-index |
| Width | `w-auto`, `w-full` | `w-[px]` fixo |
| Layout | `flex`, `inline-flex` | `grid` de pagina |
| Transition | `transition-colors` | Animacoes complexas |

---

## entities/

| Categoria | Permitido | Evitar |
|-----------|-----------|--------|
| Cores | Variaveis semanticas | Hardcoded |
| Spacing | `p-*`, `gap-*` interno | `m-*` externa |
| Position | `relative` | `fixed`, `sticky` |
| Z-index | Ate `z-10` | Acima |
| Dimensao | `aspect-*`, `min-h-*` | `w-[px]`, `h-[px]` fixos |
| Texto | `truncate`, `line-clamp-*` | Overflow livre |
| Imagem | `object-cover`, `object-contain` | Distorcao |

---

## features/

| Categoria | Permitido | Evitar |
|-----------|-----------|--------|
| Cores | Semanticas + `destructive`, `success` | Hardcoded |
| Spacing | `p-*`, `gap-*`, `space-y-*` | `m-*` externa |
| Position | `relative` | `fixed`, `sticky` |
| Z-index | Ate `z-10` | Acima |
| Width | `w-full` | `w-[px]` fixo |
| Estados | `disabled:`, `loading:` | Sem feedback visual |
| Focus | `focus-visible:ring-*` | Sem focus ring |

---

## widgets/

| Categoria | Permitido | Evitar |
|-----------|-----------|--------|
| Cores | Variaveis semanticas | Hardcoded |
| Spacing | `gap-*`, `p-*` de secao | `m-*` externa |
| Position | `relative`, `sticky` | `fixed` |
| Z-index | Ate `z-40` | Acima |
| Layout | `grid`, `flex`, `columns` | -- |
| Overflow | `overflow-x-auto`, `overflow-y-auto` | -- |
| Responsivo | `grid-cols-1 md:grid-cols-2` | Layout fixo |

---

## pages/

| Categoria | Permitido | Evitar |
|-----------|-----------|--------|
| Cores | Semanticas, gradientes, hardcoded com moderacao* | -- |
| Spacing | `container`, `px-*`, `py-*` | -- |
| Position | `fixed`, `sticky`, `absolute` | -- |
| Z-index | Todos os niveis | -- |
| Layout | Macro: sidebar + content, grid de blocos | -- |
| Height | `min-h-screen`, `h-dvh`, `h-screen` | -- |
| Safe area | `pb-safe`, `pt-safe` | Ignorar |

> *Na camada pages/, cores hardcoded como `#F3A169`, `#1e1e2e`, `white/[0.12]` sao toleradas para estados de selecao, toolbars e UI de canvas que nao justificam tokens semanticos. Prefira tokens quando possivel.

---

## Z-index Scale

| Token | Valor | Uso | Camada |
|-------|-------|-----|--------|
| `z-0` | 0 | Base | shared |
| `z-10` | 10 | Overlays internos, selection badges | entities, features |
| `z-20` | 20 | Dropdowns, tooltips | widgets |
| `z-30` | 30 | Sticky headers, App Bar, floating toolbars, selection bar | widgets, pages |
| `z-40` | 40 | Sidebars (nav + AI) | widgets |
| `z-50` | 50 | Modals, Command Palette, Delete Confirm Modal | pages |
| `z-[100]` | 100 | Toasts (sonner) | pages |

---

## Classes Proibidas Globais

| Classe | Motivo |
|--------|--------|
| `bg-white`, `bg-black` | Usar variaveis semanticas (`bg-background`, `bg-card`) |
| `text-gray-*` | Usar `text-muted-foreground` |
| `border-gray-*` | Usar `border-border` |
| `text-white/X`, `bg-white/[X]`, `border-white/[X]` | Usar `text-foreground/X` (adapta light/dark). White hardcoded só onde for cor literalmente branca. |
| `bg-[#0A0B10]`, `bg-[#0c0c14]`, `bg-[#020203]` | Usar `bg-card`, `bg-popover`, `bg-background` |
| `text-[#F3A169]`, `bg-[#F3A169]/X` | Usar `text-primary`, `bg-primary/X` |
| Cores hex/rgb inline (fora de pages/) | Usar variaveis |
| `!important` | Override problematico (excecao: recharts reset em globals.css) |
| `p-[13px]` arbitrarios | Usar escala de espacamento |
| `font-thin`, `font-black` | Legibilidade (usar pesos definidos) |

---

## Convencoes de arquivo por camada

| Camada | Estrutura | Exemplo |
|--------|-----------|---------|
| `shared/ui/` | Componente shadcn/Radix, 1 arquivo por componente | `button.tsx`, `skeleton.tsx` |
| `shared/stores/` | Zustand store | `app-store.ts`, `canvas-store.ts` |
| `shared/hooks/` | Custom hooks de dados | `useDashboardSummary.ts`, `useConversations.ts` |
| `shared/config/` | Constantes, tipos, prompts AI | `agents/canvas-orchestrator.ts`, `agents/types.ts` |
| `features/` | Logica de feature: tools, orchestrator | `canvas-orchestrator/tools/add-block.ts` |
| `widgets/` | Composicoes reutilizaveis | `kpi-grid/ui/KpiCard.tsx`, `chart-widget/ui/ChartWidget.tsx` |
| `pages/*/ui/` | UI especifica da pagina | `explore/ui/CanvasPanel.tsx`, `explore/ui/blocks/SingleKpiBlock.tsx` |
| `app/(dashboard)/` | Route handlers, page.tsx thin wrappers | `app/(dashboard)/explore/page.tsx` |
