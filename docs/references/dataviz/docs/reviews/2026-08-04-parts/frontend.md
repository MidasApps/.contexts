# Auditoria de Aderência — Frontend e UI

**Escopo:** `app/` (rotas e layouts), `src/pages/*/ui/`, `src/widgets/*`, `src/shared/ui/`,
`src/app/layouts/`, `src/app/providers/`, `src/shared/hooks/`, `src/shared/stores/`,
`src/shared/providers/`, `app/globals.css`.

**Branch:** `chore/limpeza-vila-rosa` · **Data:** 2026-08-04
**Convenções lidas:** `.contexts/engineering/rules/{accessibility,state-management,performance,internationalization,development,documentation,error-handling}.md`,
`.contexts/engineering/stacks/frontend/{next@16,react@19,tailwind@4,shadcn-ui,radix-ui}.md`,
`.contexts/engineering/stacks/state/zustand@5.md`, `.contexts/engineering/architecture/fsd.md`.

**Verificações executadas:**
- `pnpm lint` → **falha com exit 2** (não roda; ver F-01)
- `pnpm vitest run src/widgets src/pages src/shared/ui src/shared/stores` → 27 arquivos, 147 testes, **todos passando** (25.6s)

---

## 1. Inventário

Arquitetura declarada: **FSD adaptado ao App Router** (`src/{app,pages,widgets,features,shared}`).
Não existe camada `entities`. **58 módulos** agrupados em 10 áreas de produto.

### 1.1 Shell e navegação — 12 módulos

| # | Módulo | Caminho | O que faz | Estado |
|---|---|---|---|---|
| 1 | RootLayout | `app/layout.tsx` | HTML raiz, `lang="pt-BR"`, fontes Geist via `next/font`, metadata global | vivo |
| 2 | Providers | `src/app/providers/Providers.tsx` | Encadeia ThemeProvider (next-themes) → Auth → Data → Tooltip → Toaster; `DomainLoader` carrega clients/products/metrics | vivo |
| 3 | DashboardLayout | `src/app/layouts/DashboardLayout.tsx` | Shell das rotas protegidas: header, sidebar de páginas, chat lateral, sheets mobile, modal de atalhos | vivo |
| 4 | DashboardGroupLayout | `app/(dashboard)/layout.tsx` | Casca fina do route group → `DashboardLayout` | vivo |
| 5 | AdminLayout | `app/(admin)/admin/layout.tsx` | Guard client-side de admin (redireciona não-admin para `/dashboard`) | vivo |
| 6 | AppHeader | `src/widgets/app-header/` | Topbar de sessão: menu mobile, client switcher, filtros, chat, tema | vivo |
| 7 | AppBar | `src/widgets/app-bar/` | Header alternativo usado só nas páginas de admin (título + modo edição) | vivo (4 props `@deprecated`) |
| 8 | PagesSidebar | `src/widgets/pages-sidebar/` | Navegação lateral: lista de reports, criar/renomear/duplicar/excluir, galeria de templates, perfil | vivo |
| 9 | AdminSidebar | `src/features/admin/ui/AdminSidebar.tsx` | Menu de seções do admin | vivo |
| 10 | ChatSidebar / ChatContent | `src/widgets/chat-sidebar/` | Painel de chat de 256px à direita (desktop ≥1024px) | vivo |
| 11 | ClientSwitcher / TopbarClientSwitcher | `src/widgets/client-switcher/` | Troca de cliente ativo com busca | vivo |
| 12 | useKeyboardShortcuts | `src/shared/hooks/useKeyboardShortcuts.ts` | Atalhos globais ⌘K, ⌘⇧A, `?` | vivo |

### 1.2 Relatórios dinâmicos (núcleo do produto) — 9 módulos

| # | Módulo | Caminho | O que faz | Estado |
|---|---|---|---|---|
| 13 | ReportPage | `src/pages/report/ui/ReportPage.tsx` | Renderiza um report salvo (`/g/[groupId]/r/[reportId]`), modo edição, drill-through por query string | vivo |
| 14 | HomePage | `src/pages/home/ui/HomePage.tsx` | `/dashboard` — redireciona para o primeiro report do cliente | vivo |
| 15 | GroupPage | `app/(dashboard)/g/[groupId]/page.tsx` | Redireciona grupo → primeiro report | vivo |
| 16 | KpiCard / KpiExpandedModal | `src/widgets/kpi-grid/ui/` | Cartão de KPI com sparkline, delta, expansão com IA | vivo (sem `index.ts`) |
| 17 | ChartWidget / ChartSizer / DonutChart | `src/widgets/chart-widget/` | Container de gráfico Recharts com expansão e painel de IA | vivo |
| 18 | DataTableWidget | `src/widgets/data-table-widget/` | Tabela TanStack com sort/filtro/paginação e painel de IA | vivo |
| 19 | useReportData | `src/shared/hooks/useReportData.ts` | Resolve dados de blocos de um report via `/api/metrics/batch` | vivo |
| 20 | useReports / useGroups / useTemplates | `src/shared/hooks/` | CRUD de reports, grupos e templates (Firestore) | vivo |
| 21 | drill-through | `src/pages/report/ui/drill-through.ts` | Parse de `?pf.*` da URL para filtros de página | vivo |

### 1.3 Filtros — 7 módulos

| # | Módulo | Caminho | O que faz | Estado |
|---|---|---|---|---|
| 22 | DataProvider | `src/shared/providers/DataProvider.tsx` | Context de filtros: período, projetos, filtros avançados, comparação, viewMode | vivo |
| 23 | GlobalFilters | `src/widgets/global-filters/` | Barra de filtros do canvas (`/explore`) com chips de filtros ativos | vivo |
| 24 | FilterPanel | `src/widgets/filter-panel/` | Drawer de filtros avançados + exportação de PDF | vivo |
| 25 | PageFilterBar | `src/widgets/page-filter-bar/` | Filtros locais por atributo (dropdowns declarados no template) | vivo |
| 26 | FiltersButton | `src/shared/ui/filters-button.tsx` | Botão que abre o `FilterPanel` a partir do header | vivo |
| 27 | MonthRangePicker | `src/shared/ui/month-range-picker.tsx` | Seletor de intervalo mês/ano | vivo |
| 28 | MultiSelectCombobox | `src/shared/ui/multi-select-combobox.tsx` | Combobox multi-seleção com busca | vivo |

### 1.4 IA — chat e canvas — 10 módulos

| # | Módulo | Caminho | O que faz | Estado |
|---|---|---|---|---|
| 29 | AISidebar | `src/widgets/ai-sidebar/ui/AISidebar.tsx` (766 ln) | Chat contextual embutido em widgets e no painel lateral | vivo |
| 30 | ToolStepIndicator / SqlPreview / InlineDataRenderer / ClarificationOptions | `src/widgets/ai-sidebar/ui/` | Passos de tool, SQL em debug, tabelas inline, opções de clarificação | vivo |
| 31 | ExplorePage | `src/pages/explore/ui/ExplorePage.tsx` | `/explore` — análise conversacional; gate desktop-only + gate de auth | vivo |
| 32 | ConversationSidebar / ChatPanel | `src/pages/explore/ui/ConversationSidebar.tsx` (1201 ln) | Lista de conversas + painel de chat streamado | vivo |
| 33 | CanvasPanel | `src/pages/explore/ui/CanvasPanel.tsx` (644 ln) | Canvas de páginas/blocos com drag, seleção e edição | vivo |
| 34 | CanvasBlockRenderer + `blocks/` | `src/pages/explore/ui/blocks/` | 8 tipos de bloco: Chart, Donut, Gauge, Kpi, SingleKpi, Table, Text, Skeleton/Error | vivo |
| 35 | BlockInspector / BlockPalette / SelectionBar | `src/pages/explore/ui/` | Edição de propriedades, paleta e ações em lote de blocos | vivo |
| 36 | ExploreWelcome | `src/pages/explore/ui/ExploreWelcome.tsx` | Tela inicial do `/explore` com prompt | vivo |
| 37 | canvas-store | `src/shared/stores/canvas-store.ts` | Zustand: páginas, blocos, layout, seleção, streaming | vivo |
| 38 | useConversations | `src/shared/hooks/useConversations.ts` | Persistência de conversas no Firestore | vivo |

### 1.5 Páginas fixas de negócio — 4 módulos

| # | Módulo | Caminho | O que faz | Estado |
|---|---|---|---|---|
| 39 | AnexosRatingPage | `src/pages/anexos-rating/` | Anexo de metodologia de rating | vivo (só por URL direta / grant) |
| 40 | AnexosPddPage | `src/pages/anexos-pdd/` | Anexo de metodologia de PDD | vivo (só por URL direta / grant) |
| 41 | AnexosElegibilidadePage | `src/pages/anexos-elegibilidade/` | Anexo de critérios de elegibilidade | vivo (só por URL direta / grant) |
| 42 | Covenants Configuração (+ EvolucaoObra, OpenBanking, `sections/`) | `src/pages/covenants-configuracao/` | Config de covenants, upload com IA, evolução de obra, open banking (mock) | **dormente** — rota ausente de `ALL_ROUTES` (`src/features/admin/model/types.ts:76-83`); não linkada em nenhum menu |

### 1.6 Admin — 6 módulos

| # | Módulo | Caminho | O que faz | Estado |
|---|---|---|---|---|
| 43 | AdminPage + abas | `src/features/admin/ui/` (24 componentes) | CRUD de clients, groups, products, metrics, templates, users, data contracts | vivo |
| 44 | AdminSqlCatalogPage | `src/pages/admin-sql-catalog/` | Curadoria do catálogo de SQL validado (aprovar/rejeitar/revalidar) | vivo |
| 45 | AgentQualityPage | `src/pages/admin-agent-quality/` | Eval runs, heatmap de scorers, alerta de judge drift | vivo |
| 46 | OrchestratorAnalyticsPage | `src/pages/admin-orchestrator-analytics/` | Métricas de fases, retry rate, sub-agentes | vivo |
| 47 | TemplateEditorPage | `src/pages/admin-template-editor/` | Editor de template de dashboard | vivo |
| 48 | Hooks de admin | `src/shared/hooks/{useEvalRuns,useJudgeDrift,useOrchestratorMetrics,useSqlCatalog}.ts` | Fetch dos dados das telas de admin | vivo |

### 1.7 Autenticação e permissões — 4 módulos

| # | Módulo | Caminho | O que faz | Estado |
|---|---|---|---|---|
| 49 | LoginPage | `src/features/auth/ui/LoginPage.tsx` | Login Firebase | vivo |
| 50 | ProtectedRoute | `src/features/auth/ui/ProtectedRoute.tsx` | Gate de auth dentro do `DashboardLayout` | vivo |
| 51 | AuthProvider | `src/features/auth/providers/AuthProvider.tsx` | Context de usuário + modo embedded | vivo |
| 52 | useUserPermissions | `src/shared/hooks/useUserPermissions.tsx` | Provider de permissões por cliente/rota (onSnapshot Firestore) | vivo |

### 1.8 Landing e docs — 2 módulos

| # | Módulo | Caminho | O que faz | Estado |
|---|---|---|---|---|
| 53 | LandingPage | `src/pages/landing/ui/LandingPage.tsx` (918 ln) | Página pública `/` com KPIs mockados e seções de marketing | vivo |
| 54 | DocsPage + diagramas | `src/pages/docs/ui/` (8 componentes) | `/docs` — arquitetura de agentes, Mermaid, prompts, tools | vivo (não linkado no app) |

### 1.9 Design system — 2 módulos

| # | Módulo | Caminho | O que faz | Estado |
|---|---|---|---|---|
| 55 | `shared/ui` | `src/shared/ui/` (27 arquivos, 2406 ln) | shadcn new-york: button, card, dialog, sheet, select, popover, dropdown-menu, table, tooltip, scroll-area, switch, separator, badge, input, textarea, skeleton, sonner + customizados (page-hero, empty-state, error-boundary, confirm-dialog, prompt-dialog, info-tooltip, filters-button, theme-toggle, month-range-picker, multi-select-combobox) | vivo |
| 56 | Tema | `app/globals.css` (216 ln) | `@theme` OKLCH, dark como base + override `[data-theme="light"]`, keyframes, reset de reduced-motion | vivo |

### 1.10 Estado e camada de dados de UI — 2 módulos

| # | Módulo | Caminho | O que faz | Estado |
|---|---|---|---|---|
| 57 | app-store | `src/shared/stores/app-store.ts` (408 ln) | Zustand: cliente/produto/métricas ativos, filtros por cliente, navegação, edição, chat, debug, feature flags, thread de IA, persona/ICP | vivo |
| 58 | useQuery + hooks de domínio | `src/shared/hooks/` (22 arquivos) | Cache SWR-like em memória (TTL 5min), retry, toast; `useClients`, `useProducts`, `useMetrics`, `useActiveClient`, `usePdfExport`, `useIsMounted`, `usePageFilterValues` | vivo |

### Superfície de rotas

18 `page.tsx` · 4 `layout.tsx` · 1 `error.tsx` · 1 `not-found.tsx`
**Ausentes:** `loading.tsx` (0), `global-error.tsx` (0), `instrumentation.ts` (0), `middleware.ts` (0).

**Public API de slice (`index.ts`)** — 6 de 12 slices de `pages` expõem; 11 de 12 widgets expõem
(`kpi-grid` não tem). Os demais são importados por caminho profundo
(`@/pages/admin-agent-quality/ui/AgentQualityPage`, `@/widgets/chart-widget/ui/ChartSizer`).

---

## 2. Tabela de aderência

| Módulo | Convenção | Aderente? | Evidência | Observação |
|---|---|---|---|---|
| **Toolchain (área toda)** | `rules/development` — "Nunca importe transitivamente. Se você usa, declare explicitamente em `dependencies`" | ❌ | `pnpm lint` → `ESLint: A configuration object specifies rule "react-hooks/set-state-in-effect", but could not find plugin "react-hooks"` / exit 2. `eslint.config.mjs:31-37` configura 6 regras `react-hooks/*`; `grep -n "react-hooks" package.json` → sem resultado; plugin existe só em `node_modules/.pnpm/eslint-plugin-react-hooks@7.1.1_...` (transitivo de `eslint-config-next`) | **F-01.** O gate de lint não roda. Todas as regras `react-hooks/*` e `@next/next/*` estão inertes, e há `eslint-disable-next-line react-hooks/...` no código (`useQuery.ts:71,124`; `GlobalFilters.tsx:20`) que ninguém valida. Corrigir: declarar `eslint-plugin-react-hooks` em `devDependencies` |
| **Toolchain** | `MEMORY.md` — baseline TypeScript 7.x | ❌ | `package.json:"typescript": "^5.9.3"` | Fora do baseline de compatibilidade declarado |
| **Toolchain** | `stacks/frontend/tailwind@4` — "`prettier-plugin-tailwindcss` é obrigatório" | ❌ | ausente de `package.json`; não há `.prettierrc` no repo | Ordem de classes não determinística |
| **Toolchain** | `rules/performance` §3 — "Sempre rode `@next/bundle-analyzer` antes de mergear features que adicionam dependência client-side" | ❌ | ausente de `package.json`; `next.config.ts:1-16` não o registra | Sem orçamento de bundle observável |
| ChartWidget | `rules/accessibility` — "Nunca use `<div onClick>` como botão"; "toda funcionalidade alcançável por mouse também alcançável por teclado" | ❌ | `src/widgets/chart-widget/ui/ChartWidget.tsx:53-59` — `<div onClick={...}>` sem `role`, `tabIndex` nem handler de `Enter`/`Space` | **F-02.** Expandir gráfico é mouse-only |
| KpiCard | idem | ❌ | `src/widgets/kpi-grid/ui/KpiCard.tsx:248-253` — mesmo padrão | **F-02.** Expandir KPI é mouse-only. São os dois widgets mais usados do dashboard |
| ChartWidget / KpiCard | `rules/accessibility` — "Nunca use `outline: none` sem substituir por outro indicador visual de foco" | ❌ | `ChartWidget.tsx:62` e `KpiCard.tsx:255`: `outline-none [&_*]:outline-none [&:focus]:ring-0 [&_*:focus]:ring-0 [&_*:focus]:shadow-none` | **F-02.** Mata o anel de foco de *todos* os descendentes, incluindo botões e links internos |
| Tema global | idem | ❌ | `app/globals.css:177-186`: `.recharts-wrapper *, [role="img"], [role="img"] * { outline: none !important; box-shadow: none !important; }` | O seletor `[role="img"]` é global, não só Recharts. `!important` impede override local |
| DashboardLayout | `rules/accessibility` — "Sempre forneça um 'Skip to main content' como primeiro elemento focável" | ❌ | `grep -rn "sr-only focus\|Skip to\|Pular para" src app --include=*.tsx` → 0 resultados | Ausente em toda a aplicação |
| DashboardLayout | `rules/accessibility` — "exatamente um `<main>` por página/rota" | ❌ | `src/app/layouts/DashboardLayout.tsx:102` renderiza `<main>` no branch imersivo; `src/pages/explore/ui/ExplorePage.tsx:180` renderiza outro `<main>` dentro dele | `/explore` tem `<main>` aninhado |
| DashboardLayout | `rules/accessibility` — "Sempre marque navegação primária com `<nav>`" | ⚠️ | `<header>` em `AppHeader.tsx:21`, `<aside>` em `ExplorePage.tsx:161` e `AISidebar.tsx:764`; `grep -rn "<nav" src app --include=*.tsx` → 0 | Sidebars de navegação não usam `<nav>` |
| DashboardLayout | `rules/accessibility` — "Nunca use `<div onClick>`"; "focus trap em modais bloqueantes" | ❌ | `DashboardLayout.tsx:129-148` — modal de atalhos é `<div onClick>` + `<div onClick={stopPropagation}>`, sem `role="dialog"`, sem focus trap, sem `Esc` | Radix `Dialog` está disponível (`src/shared/ui/dialog.tsx`) e não foi usado |
| useKeyboardShortcuts | `rules/accessibility` — "Nunca crie atalho de teclado de uma única letra sem permitir desabilitar ou remapear (WCAG 2.1.4)" | ⚠️ | `src/shared/hooks/useKeyboardShortcuts.ts:38-42` — tecla `?` sem opção de desabilitar | Mitigado por guard de `INPUT`/`TEXTAREA`/`contentEditable` (linhas 17-18), mas não satisfaz o critério |
| AISidebar | `rules/accessibility` — "Sempre anuncie início e fim de geração de LLM via live region"; "comunique estados de loading e streaming via texto acessível, não apenas spinner" | ❌ | `grep -rn "aria-live\|role=\"status\"" src app --include=*.tsx` → 1 único resultado, `JudgeDriftAlert.tsx:28` (`role="alert"`). Streaming em `AISidebar.tsx:699,756` e `ToolStepIndicator.tsx:221-227` só sinaliza com `animate-spin`/`animate-pulse` | **F-03.** Todo o fluxo de IA é mudo para leitor de tela |
| AISidebar | `rules/accessibility` — "Sempre associe todo `<textarea>` a um `<label>`"; "Nunca use `placeholder` como substituto de label" | ❌ | `src/widgets/ai-sidebar/ui/AISidebar.tsx:729-741` — `<textarea>` com `placeholder` e sem `aria-label` (o botão de envio na linha 752 tem `aria-label`) | |
| ExploreWelcome | idem | ❌ | `src/pages/explore/ui/ExploreWelcome.tsx:68-80` — `<textarea>` só com `placeholder` | |
| Covenants / OpenBanking | idem | ❌ | `src/pages/covenants-configuracao/ui/sections/open-banking-section.tsx:91-92` — `<input placeholder="CPF / CNPJ">` e `<input type="password" placeholder="Senha Internet Banking">`, sem label | Também usa `focus:border-white/25` (`focus:`, não `focus-visible:`; cor hardcoded) |
| Covenants / EvolucaoObra | `rules/accessibility` — "marque o campo com `aria-invalid`" e "descreva erros via `aria-describedby`" | ❌ | `src/pages/covenants-configuracao/ui/sections/evolucao-obra-section.tsx:102-110` — input numérico obrigatório (asterisco em `<p>` na linha 99) sem `<label>`, sem `aria-label`, sem `aria-invalid`; erro renderizado solto na linha 114 | |
| BlockInspector | `rules/accessibility` — nome acessível em todo input | ✅ | `src/pages/explore/ui/BlockInspector.tsx:31,35,50,60,64,88,93,112` — `aria-label` em todos os campos | Contraexemplo positivo na base |
| Tabelas (DataTableWidget, TableBlock, CatalogTable, PhaseTable) | `rules/accessibility` — "Sempre use `<th>` com `scope`"; "Sempre forneça `<caption>` ou `aria-labelledby`" | ❌ | 46 ocorrências de `<th>`/`<TableHead>` em `src/{widgets,pages,shared/ui}`; `grep -rn 'scope="col"\|scope="row"\|<caption'` → só `src/shared/ui/table.tsx:99` (a primitiva). Nenhum consumidor usa `TableCaption` | |
| PagesSidebar | `rules/accessibility` — `alt` em toda `<img>`; `rules/performance` §3 — "Sempre prefira `next/image`" | ⚠️ | `src/widgets/pages-sidebar/ui/PagesSidebar.tsx:236-237` — `<img>` cru com `alt={profile.displayName ?? ''}` e `eslint-disable` **com justificativa escrita** (URL externa arbitrária exigiria whitelist de domínios) | Divergência documentada conforme `rules/documentation`; único `<img>` cru da base |
| Animações (área toda) | `rules/accessibility` — "Sempre respeite `prefers-reduced-motion: reduce`" | ✅ | `app/globals.css:209-215` — reset global `*, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important }` | Satisfeito por CSS global. `stacks/frontend/tailwind@4` prescreve variantes `motion-safe:`/`motion-reduce:` (0 usos), mas o efeito prático está coberto |
| shared/ui (button, badge, dialog…) | `stacks/frontend/radix-ui` §5 — "importar dos pacotes individuais (`@radix-ui/react-*`), **nunca** do meta-package" | ❌ | 11 arquivos importam `from "radix-ui"`: `badge.tsx:3`, `button.tsx:3`, `dialog.tsx:5`, `dropdown-menu.tsx:5`, `popover.tsx:4`, `scroll-area.tsx:4`, `select.tsx:5`, `separator.tsx:4`, `sheet.tsx:5`, `switch.tsx:4`, `tooltip.tsx:4`. `grep -rn "@radix-ui/react-"` → 0. `package.json:"radix-ui": "^1.4.3"` | Tree-shaking degradado; `package.json` não reflete os primitives realmente usados |
| dialog / sheet | `stacks/frontend/tailwind@4` — "`focus:ring-*` (pisca em click) → `focus-visible:ring-*`" | ⚠️ | `src/shared/ui/dialog.tsx:73` e `src/shared/ui/sheet.tsx:78` — botão Close com `focus:ring-2 focus:ring-ring` | Resto do design system usa `focus-visible:` corretamente (`button.tsx:8`, `badge.tsx:8`) |
| dialog | `stacks/frontend/shadcn-ui` — "`<DialogContent>` sem `<DialogTitle>`" é anti-pattern | ✅ | Loop sobre todos os arquivos com `DialogContent` → nenhum sem `DialogTitle`; `DashboardLayout.tsx:78,95` usam `SheetTitle` com `sr-only` | |
| shared/ui | `stacks/frontend/shadcn-ui` — variantes via `cva`, não props booleanas | ✅ | `src/shared/ui/button.tsx:7-39` (6 variants × 8 sizes), `badge.tsx:8-22` | |
| shared/ui | `stacks/frontend/react@19` — "`forwardRef` deprecated; ref como prop"; "não usar `React.FC`" | ✅ | `grep -rn "forwardRef\|React.FC" src app --include=*.tsx` → 0 resultados | |
| shared/ui | `stacks/frontend/tailwind@4` — "`cn()` é o ponto canônico; nunca concatenar strings" | ✅ | `src/shared/lib/utils.ts` exporta `cn`; usado consistentemente (`button.tsx:58`, `page-hero.tsx:29`, `KpiCard.tsx:254`) | |
| shared/ui/button | `stacks/frontend/tailwind@4` — "`bg-[#ff6600]` em vez de token" é anti-pattern | ⚠️ | `src/shared/ui/button.tsx:12` — `shadow-[0_4px_14px_0_rgb(255,100,100,0.39)]` hardcoded na variante `default` | Não acompanha tema nem rebrand |
| Tema | `stacks/frontend/tailwind@4` — "`@theme inline` (não `@theme`) quando os valores **referenciam** outros vars" | ⚠️ | `app/globals.css:3` usa `@theme {`, e as linhas 4-6 referenciam `var(--font-geist-sans)` / `var(--font-geist-mono)` injetados por `next/font` | Divergência da forma prescrita |
| Tema | `stacks/frontend/tailwind@4` — "`@variant dark` deve casar com o que o provider de tema escreve no `<html>`" | ❌ | `grep -rn "@variant\|@custom-variant" app/globals.css src --include=*.css` → **0 resultados**. `Providers.tsx:28` usa `attribute="data-theme"`, `defaultTheme="dark"`, `enableSystem={false}` | **F-04.** Sem `@variant dark` declarado, as 12 utilities `dark:` do código (`button.tsx:14,16`, `badge.tsx:8,16`, `TableBlock.tsx:12-14`) caem no default de Tailwind 4 (`prefers-color-scheme`) — **desacopladas do tema real do app** |
| Tema / cores hardcoded | `stacks/frontend/tailwind@4` — "Componentes consomem tokens semânticos, não paleta crua" | ❌ | 120 ocorrências de `bg-[#`/`text-[#`/`text-white`/`bg-black`/`bg-white` em `src/{pages,widgets,shared/ui,app}` + `app/`. Exemplos: `LandingPage.tsx:13-24` (paleta hex duplicada em `const C`), `MermaidDiagram.tsx:217-240`, `app/error.tsx:18,53`, `app/not-found.tsx:6,43`, `KpiCard.tsx:262` (`bg-[#F27C7C]`), `CanvasPanel.tsx:295,298` | O CLAUDE.md já alerta para isso. `text-black` sobre `bg-primary` (`ExploreWelcome.tsx:87`, `AISidebar.tsx:747`) quebra no tema claro, onde `--color-primary-foreground` é branco (`globals.css:132`) |
| Tema / RTL | `rules/internationalization` — "Use **exclusivamente** CSS logical properties (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`)" | ❌ | 73 utilities direcionais físicas em `src/{shared/ui,widgets}`; `grep -rn "\bms-[0-9]\|\bme-[0-9]\|\bps-[0-9]\|\bpe-[0-9]"` → **0** | Moot enquanto não houver locale RTL, mas é violação literal da regra |
| Área toda | `rules/internationalization` — "Nunca hard-code string user-facing em código. Toda string visível passa por função de tradução" | ❌ | Nenhuma lib de i18n em `package.json` (sem `next-intl`, `react-i18next`, `formatjs`); 100% das strings são pt-BR literais no JSX (`AppHeader.tsx:31` `aria-label="Abrir menu"`, `ExploreWelcome.tsx:78`, `app/not-found.tsx:13`, …) | **F-05.** Produto é mono-locale pt-BR e não há ADR registrando essa escolha (`.contexts/engineering/decisions/` tem só a ADR 0001 do harness) |
| format.ts | `rules/internationalization` — "Sempre passe o locale corrente explicitamente para qualquer construtor `Intl`" | ✅ | `src/shared/lib/format.ts:1,6,12,17,25,33` — `const ptBR = 'pt-BR'` passado em todo `toLocaleString` | |
| format.ts | `rules/internationalization` — "Nunca formate moeda com concatenação manual de símbolo e número. Use `Intl.NumberFormat` com `style: 'currency'`" | ⚠️ | `src/shared/lib/format.ts:6,12,17` — `` `R$ ${n.toLocaleString(ptBR, …)} mi` `` | Motivo legítimo (abreviação mi/mil), mas a regra é explícita |
| Blocos de canvas / KPI / admin | idem + "Nunca assuma separador decimal" | ❌ | Consumidores que **contornam** `format.ts` e usam `.toFixed()` cru: `DonutBlock.tsx:27-29` (`` `R$${(total/1e9).toFixed(1)}bi` ``), `ChartBlock.tsx:42-43`, `KpiCard.tsx:427`, `KpiExpandedModal.tsx:120`, `SubAgentMetricsCard.tsx:16,28,29`, `PhaseTable.tsx:42-43`, `evolucao-obra-section.tsx:152,185` | Renderiza `1234.5` (ponto decimal) numa UI pt-BR |
| ExplorePage | `rules/internationalization` (qualidade de string source) | ⚠️ | `src/pages/explore/ui/ExplorePage.tsx:24-25` — "A Analise Conversacional esta disponivel apenas em desktop" (sem acentos); idem `ExploreWelcome.tsx:78` "Descreva a analise que deseja..." | |
| app-store | `rules/state-management` §3 — "Server state nunca vira client state"; `stacks/state/zustand@5` — "NÃO usar para: server state (dados de fetch)" | ❌ | `src/shared/stores/app-store.ts:63-89` guarda `clients`, `products`, `metrics` (+ status/error de cada) — todos vindos de `/api/clients`, `/api/products`, `/api/metrics`. Populados por `useClients.ts`, `useProducts.ts`, `useMetrics.ts` via `Providers.tsx:18-23` | **F-06.** Três coleções de servidor espelhadas na store, com poll de 30s em `useClients.ts` |
| app-store | `rules/state-management` §17 — "Mega-store global única contendo todo o estado da aplicação. Divida por domínio"; `zustand@5` — "Single mega-store global" | ❌ | `src/shared/stores/app-store.ts:59-156` — 1 interface com ~50 membros: clientes, produtos, métricas, filtros por cliente, navegação, edição, título de página, chat, versão de lista, debug, testAsUser, thread de IA, persona/ICP, 3 feature flags, `buildAIContext()` | |
| app-store | `rules/state-management` §15 — "Toda store global precisa de método `reset` explícito. Reset acontece em logout, troca de tenant" | ❌ | `grep -n "reset" src/shared/stores/app-store.ts` → nenhuma ação de reset (só `canvas-store.ts:278` tem) | Troca de cliente (`switchClient`, linha 374) e logout não limpam a store |
| app-store | `stacks/state/zustand@5` — "Double-call signature obrigatória: `create<State>()((set) => …)`" | ⚠️ | `src/shared/stores/app-store.ts:226` — `create<AppState>((set, get) => ({`; idem `canvas-store.ts:51` | Funciona sem middleware, mas diverge do padrão prescrito |
| app-store | `stacks/state/zustand@5` — middleware `persist` com `partialize`/`version`/`migrate`/`skipHydration`; `rules/state-management` §14 — "Sempre versione o shape do state persistido" | ❌ | `src/shared/stores/app-store.ts:158-224` — 6 pares de `read*`/`save*` artesanais lendo `localStorage` direto; sem versão, sem migração. `import { persist }` ausente | Estado inicial lê `localStorage` na criação do módulo (linhas 227, 233, 247, 259, 273) → risco de mismatch de hidratação, exatamente o que `skipHydration` existe para evitar |
| app-store | `rules/state-management` §16 — "Use DevTools da biblioteca de state (Zustand devtools middleware) apenas em desenvolvimento"; "Toda store global tem nome identificável no DevTools" | ❌ | Sem `devtools` em `app-store.ts:226` nem `canvas-store.ts:51` | |
| app-store | `rules/error-handling` §5 — "Nunca escreva `catch {}` vazio. Sem exceções" | ❌ | `src/shared/stores/app-store.ts:169, 193, 205, 222, 286` — `try { localStorage.setItem(…) } catch {}` | 5 ocorrências no mesmo arquivo |
| Consumo da store | `stacks/state/zustand@5` — selectors granulares; `useShallow` para objetos | ✅ / ⚠️ | Todos os call sites usam selector explícito (`grep "useAppStore(" | grep -v "useAppStore(("` → 0 leituras da store inteira). Ex.: `ChatSidebar.tsx:24-27` | `grep -rn "useShallow" src app` → 0 usos, mas também nenhum selector retorna objeto novo, então não há loop de re-render |
| canvas-store | `rules/state-management` §15 — reset explícito | ✅ | `src/shared/stores/canvas-store.ts:45,278` | |
| DataProvider | `rules/state-management` §9 — "Context sem memoização do `value` causa re-render em cascata — sempre estabilize o objeto provido" | ✅ | `src/shared/providers/DataProvider.tsx:194-219` — `useMemo` com deps completas | |
| DataProvider | `rules/state-management` §6 — "Filtros, paginação, abas selecionadas, ordenação: **vão na URL**" | ❌ | `src/shared/providers/DataProvider.tsx:103-111` — período, projetos, filtros avançados, comparação e `viewMode` em `useState` de Context; nenhum `useSearchParams` no provider | Filtro aplicado não é compartilhável por link nem sobrevive a back/forward |
| ReportPage | idem | ✅ | `src/pages/report/ui/ReportPage.tsx:62-63,82` — lê `?edit=1` e `?pf.*` de `useSearchParams`; `drill-through.ts:37-42` faz o parse | Único lugar da base que usa URL como estado |
| DataProvider | `rules/state-management` §12 — "Use `AbortController` para fetches canceláveis"; `rules/error-handling` §9 — timeout explícito em toda I/O | ⚠️ | `src/shared/providers/DataProvider.tsx:114,122,170-172` — descarte por flag `cancelled`, sem `AbortController` nem timeout no `fetch` | A regra aceita descarte por ID *quando cancelamento não é possível*; com `fetch` ele é |
| useQuery | `rules/state-management` §12 — "Nunca aplique resultado de requisição obsoleta ao state atual" | ✅ | `src/shared/hooks/useQuery.ts:65,77,89,102,107` — `latestKeyRef` + `isCurrent()` descartam respostas stale | Implementação correta e comentada |
| useQuery | `rules/error-handling` §8 — "backoff exponencial com jitter"; §9 — timeout explícito | ⚠️ | `src/shared/hooks/useQuery.ts:31-32` — `MAX_RETRIES = 2`, `RETRY_DELAYS = [1000, 3000]` (fixo, sem jitter); `fetchFilterOptions` (linha 171) sem `signal` nem timeout | Retry limitado e só para não-4xx (linha 97) — parte correta |
| useQuery | `rules/development` — "Nunca use `console.log` em código de produção. Use o logger estruturado" | ⚠️ | `src/shared/hooks/useQuery.ts:108` — `console.warn('[useQuery] Error after retries:', …)` | |
| useClients | idem + "Nunca logue conteúdo de payloads brutos. Logue identificadores e contexto estruturado" | ❌ | `src/shared/hooks/useClients.ts:19,20,27,79,88` — 5 `console.log`, incluindo `console.log('[useClients] API response:', res.status, body)` (payload cru) e flags de presença de token | |
| Área toda | `rules/development` — sem `console.*` em produção | ❌ | 35 ocorrências de `console.{log,warn,error}` em `src/{pages,widgets,shared/ui,shared/hooks,shared/stores,app}` (excluindo testes). Ex.: `ErrorBoundary` `error-boundary.tsx:27`, `PagesSidebar.tsx:89,112,136,152,168`, `ConversationSidebar.tsx:537,547,581`, `AISidebar.tsx:354,377`, `app/error.tsx:14` | Não há logger estruturado no cliente |
| ErrorBoundary | `rules/error-handling` §12 — "Sempre envolva subárvores que renderizam dados externos em Error Boundary"; "forneça UI de fallback explícita" | ✅ | `src/shared/ui/error-boundary.tsx:16-66` (class component, forma correta); aplicado em `DashboardLayout.tsx:103,113` | |
| ErrorBoundary | `rules/error-handling` §12 — "Sempre reporte o erro capturado pelo boundary ao sistema de observability uma única vez" | ❌ | `src/shared/ui/error-boundary.tsx:26-28` — só `console.error`; não há `instrumentation.ts` no repo (`ls instrumentation.ts src/instrumentation.ts` → NONE) | Nenhum erro de UI chega a observability |
| app/error.tsx | `rules/error-handling` §13 — "Sempre crie `global-error.tsx` no root para capturar falhas do layout raiz" | ❌ | `find app -name "global-error.tsx"` → 0 resultados. Existe só `app/error.tsx` (cuja função, ironicamente, se chama `GlobalError`, linha 12) | Falha no root layout → tela branca |
| app/error.tsx | `rules/error-handling` §7 — "**Nunca** exponha `error.message`, `error.stack` ou `cause` diretamente em respostas HTTP, UI ou logs públicos" | ❌ | `app/error.tsx:34-47` — renderiza `{error.message}` e `{error.digest}` na UI, em produção inclusive | **F-07.** Vaza detalhe interno para o usuário final |
| Rotas | `rules/performance` §1 — "Sempre prefira `loading.tsx` por segmento de rota em vez de spinner manual em layout compartilhado" | ❌ | `find app -name "loading.tsx"` → 0 resultados, para 18 `page.tsx` | |
| Rotas | `stacks/frontend/next@16` — "Não habilitar `instrumentation.ts` — perde observability nativa" (anti-pattern) | ❌ | ausente | |
| Rotas | `stacks/frontend/next@16` — "**Typed Routes** estável. Habilitar `typedRoutes: true` em `next.config.ts`" | ❌ | `next.config.ts:3-15` — só `output: 'standalone'` e um header COOP | |
| Área toda | `rules/performance` §1 / `stacks/frontend/next@16` — "Sempre prefira Server Components por padrão"; "Marque o componente **folha** que precisa de interatividade, não o layout/page inteiro" | ❌ | **120 de 149** arquivos não-teste de `src/{pages,widgets,shared/ui,app,shared/hooks,shared/providers}` têm `'use client'`. `grep -rn "export default async\|export async function" src/pages src/widgets --include=*.tsx` → **0 Server Components async**. `DashboardLayout.tsx:1` marca o shell inteiro | **F-08.** A aplicação é 100% client-rendered; RSC não é usado em lugar nenhum |
| Área toda | `rules/performance` §4 — "Nunca faça `fetch` em Client Component quando o servidor pode chamar e passar o dado"; anti-pattern "`useEffect` para fetch em Client Component" | ❌ | Consequência do anterior: `DataProvider.tsx:113-173`, `useClients.ts`, `useReports.ts:37-39`, `useQuery.ts:118-130` — todo dado entra por `useEffect` + `fetch` no cliente | |
| AISidebar / ConversationSidebar / TextBlock | `rules/performance` §3 — "**Nunca** importe bibliotecas pesadas (Markdown renderers, syntax highlighters, libs de chart) em Client Components. Mantenha-as no servidor ou faça import dinâmico" | ❌ | `react-markdown` + `remark-gfm` importados estaticamente em `AISidebar.tsx`, `ConversationSidebar.tsx`, `TextBlock.tsx`; `recharts` estático em `ChartBlock.tsx`, `DonutChart.tsx`, `KpiCard.tsx`, `KpiExpandedModal.tsx`, `RetryRateChart.tsx`. `grep -rn "next/dynamic" src app` → **0 usos** | |
| MermaidDiagram / export-pdf | idem (contraexemplo) | ✅ | `src/pages/docs/ui/MermaidDiagram.tsx:160` — `const mermaid = (await import('mermaid')).default`; `app/api/export-pdf/route.ts:106` — `await import('jspdf')` | Import dinâmico aplicado onde mais pesa |
| RootLayout | `rules/performance` §3 — "Sempre use `next/font` para fontes"; "Nunca carregue mais de um peso/estilo por família sem necessidade" | ✅ | `app/layout.tsx:2,6-16` — `Geist` e `Geist_Mono` via `next/font/google` com `display: 'swap'` e `variable` | |
| RootLayout | `rules/accessibility` — "Sempre declare `lang` no `<html>` raiz" | ✅ | `app/layout.tsx:30` — `lang="pt-BR"` | |
| Providers | `stacks/frontend/shadcn-ui` — `next-themes` com `attribute="data-theme"` + `suppressHydrationWarning` no `<html>` | ✅ | `src/app/providers/Providers.tsx:27-32` e `app/layout.tsx:31` | Ver F-04 quanto ao `@variant dark` correspondente |
| Providers | `rules/state-management` §9 — "Não coloque state que muda frequentemente em Context amplo. Divida em Contexts pequenos por frequência de mudança" | ⚠️ | `Providers.tsx:33-41` — Auth → Data → Tooltip aninhados na raiz; `DataProvider` (filtros, alta frequência) envolve toda a aplicação | |
| AdminLayout | `stacks/frontend/next@16` — anti-pattern "Marcar `'use client'` em `layout.tsx` inteiro sem necessidade"; `rules/development` — "Nunca confie em dados do cliente para decisões de autorização" | ⚠️ | `app/(admin)/admin/layout.tsx:1,13,15-20` — `'use client'` + guard por `isAdminEmail(user?.email)` e `router.replace` em `useEffect` | O gate real precisa estar no servidor (as rotas `/api/admin/*` têm guard próprio — fora do meu escopo); a camada de UI é apenas cosmética |
| FSD — camadas | `architecture/fsd` — "Camadas inferiores **nunca** importam de camadas superiores" | ❌ | `src/shared/ui/filters-button.tsx:7` → `@/widgets/filter-panel` (shared → widgets). Mais 10 casos `shared → features`: `shared/hooks/useConversations.ts:4`, `shared/hooks/useUserPermissions.tsx:6`, `shared/hooks/useSqlCatalog.ts:4`, `shared/lib/bigquery/queries.ts:3`, `shared/lib/bigquery/schema-resolver.ts:6`, `shared/config/agents/{build-system.ts:13,shared-context.ts:2,types.ts:2,types.ts:496}`, `shared/config/dashboard-templates/templates-loader.ts:1` | **F-09.** 11 inversões da regra de dependência |
| FSD — camadas | idem | ❌ | `src/widgets/chat-sidebar/ui/ChatContent.tsx:6` → `@/pages/explore/ui/ConversationSidebar` (widgets → pages); `src/features/admin/ui/AdminPage.tsx:4` → `@/widgets/app-bar` (features → widgets); `src/widgets/ai-sidebar/ui/AISidebar.tsx:13` e `src/widgets/pages-sidebar/ui/PagesSidebar.tsx:14` → `@/features/*` (widgets → features) | |
| FSD — slices | `architecture/fsd` — "Slices da mesma camada **não** se importam entre si" | ❌ | 9 imports widget→widget: `app-header/ui/AppHeader.tsx:5`, `chart-widget/ui/ChartWidget.tsx:8`, `chat-sidebar/ui/ChatContent.tsx:5`, `data-table-widget/ui/DataTableWidget.tsx:30`, `global-filters/ui/GlobalFilters.tsx:7,8`, `kpi-grid/ui/KpiCard.tsx:13`, `kpi-grid/ui/KpiExpandedModal.tsx:13,14` | |
| FSD — public API | `architecture/fsd` — "Cada slice expõe um `index.ts`… o interior do slice não deve ser importado diretamente de fora" | ⚠️ | 6 de 12 slices de `pages` têm `index.ts`; `src/widgets/kpi-grid` não tem. Imports profundos: `app/(admin)/admin/agent-quality/page.tsx:1`, `app/(admin)/admin/sql-catalog/page.tsx:1`, `app/(dashboard)/explore/page.tsx:1`, `KpiCard.tsx:13` (`@/widgets/chart-widget/ui/ChartSizer`) | Convenção aplicada pela metade |
| FSD — shared | `architecture/fsd` — "A camada `shared` não recebe lógica de domínio. Qualquer tipo, schema ou função que mencione um conceito de negócio pertence a `entities`" | ❌ | `src/shared/schemas/` contém `client.ts`, `product.ts`, `metric.ts`, `client-binding.ts`, `data-contract.ts`, `relation.ts`; `src/shared/config/glossary.ts`, `chart-theme.ts`, `tenants.ts`. Não existe `src/entities/` | |
| FSD — naming | `architecture/fsd` — slices em `kebab-case`, componentes `ui/` em `PascalCase` | ✅ | `src/pages/admin-sql-catalog/ui/AdminSqlCatalogPage.tsx`, `src/widgets/page-filter-bar/ui/PageFilterBar.tsx` etc. | Exceção: `src/pages/covenants-configuracao/ui/sections/*.tsx` em kebab-case |
| GlobalFilters / ClientSwitcher / PagesSidebar | `stacks/frontend/react@19` — rules of hooks; `rules/error-handling` §5 — sem `catch` vazio | ⚠️ / ❌ | `GlobalFilters.tsx:18-24` — `try { ctx = useDataFilters(); } catch { return null }` com `eslint-disable react-hooks/rules-of-hooks`; `ClientSwitcher.tsx:52`, `TopbarClientSwitcher.tsx:54`, `PagesSidebar.tsx:72` — mesmo padrão com **`catch {}` vazio** | A contagem de hooks permanece estável nos 4 casos (nada roda depois do early-return), então não quebra hoje — mas é frágil e o disable não é validado por ninguém (ver F-01) |
| usePdfExport | `stacks/frontend/react@19` — anti-pattern "Manipular DOM via `document.querySelector`/`getElementById` → `useRef`" | ⚠️ | `src/shared/hooks/usePdfExport.ts:45` — `document.getElementById(elementId)` + clonagem de árvore (linhas 23-38) | Pragmático para snapshot de página inteira; ainda assim é o anti-pattern citado |
| PageHero | `rules/state-management` §17 — "Sincronizar dois states via `useEffect`" | ⚠️ | `src/shared/ui/page-hero.tsx:24-26` — `useEffect` escreve `title` no `app-store` a cada mudança | Comentado com a razão (linhas 21-23); o consumidor real é o `FilterPanel` |
| shared/ui | `stacks/frontend/shadcn-ui` — "Componente de domínio dentro de `src/components/ui/`" é anti-pattern | ⚠️ | `src/shared/ui/filters-button.tsx` importa `@/widgets/filter-panel`; `src/shared/ui/page-hero.tsx:5` importa `@/shared/stores/app-store` | Dois componentes de `ui/` com dependência de domínio |
| components.json | `stacks/frontend/shadcn-ui` — `style: new-york`, `rsc: true`, `cssVariables: true`, aliases coerentes com `tsconfig` | ✅ | `components.json:3-18` — `"style": "new-york"`, `"rsc": true`, `"cssVariables": true`, `"tailwind.config": ""`, aliases apontando para `@/shared/*` | Único desvio: `"rsc": true` não corresponde à realidade (nenhum RSC — ver F-08) |
| postcss | `stacks/frontend/tailwind@4` — "apenas `@tailwindcss/postcss`. Sem `autoprefixer`, sem `postcss-import`" | ✅ | `postcss.config.mjs:2-6` | |
| Documentação de código | `rules/documentation` — comentar o **porquê**, não o **quê**; sem `TODO` órfão | ✅ | `ChatSidebar.tsx:10-22`, `useKeyboardShortcuts.ts:5-13`, `DashboardLayout.tsx:44-46,88-91`, `useQuery.ts:63-72`, `PagesSidebar.tsx:236` — todos explicam decisões e restrições, não a mecânica. `grep -rn "TODO\|FIXME\|HACK"` em `src/{widgets,pages,shared/ui}` → 0 | Ponto forte consistente da base |
| Documentação de módulo | `rules/documentation` — "README por feature/módulo quando tem mais de 3-4 arquivos" | ❌ | `find src -name "README.md"` → 0 resultados, para slices como `explore` (17 arquivos) e `features/admin` (48 arquivos) | |
| Testes de UI | `rules/testing` (via suíte existente) | ✅ | `pnpm vitest run src/widgets src/pages src/shared/ui src/shared/stores` → 27 arquivos, 147 testes, 0 falhas | Cobertura concentrada em `pages-sidebar`, `explore`, `admin-sql-catalog`, `filter-panel`, `app-store` |
| Testes de a11y | `rules/accessibility` — "Sempre rode `axe-core` (via `@axe-core/react` em dev, `vitest-axe` em testes) em toda página/componente novo" | ❌ | `grep -n "axe" package.json` → sem resultado; nenhum teste importa `vitest-axe` | Nenhuma verificação automatizada de a11y na suíte |
| Covenants Configuração | (inventário — não é convenção) | n/a | `src/features/admin/model/types.ts:76-83` — `ALL_ROUTES` não inclui `/covenants/configuracao`; `grep -rn "'/covenants"` fora de `app/` → 0 links | Código dormente: 6 componentes (~750 ln) sem entrada de navegação nem grant possível pelo admin |

---

## 3. Achados priorizados

| ID | Achado | Severidade | Onde começar |
|---|---|---|---|
| F-01 | `pnpm lint` não roda (plugin `react-hooks` não declarado) — gate de lint morto | **Crítica** | `package.json` devDependencies + `eslint.config.mjs:31-37` |
| F-02 | Expandir gráfico/KPI é mouse-only e o anel de foco é anulado em todos os descendentes | **Crítica** (a11y) | `ChartWidget.tsx:53-62`, `KpiCard.tsx:248-255`, `globals.css:177-186` |
| F-03 | Fluxo de IA (streaming, tool steps) sem live region — mudo para leitor de tela | **Alta** (a11y) | `AISidebar.tsx:699,756`, `ToolStepIndicator.tsx:221-227` |
| F-04 | `dark:` sem `@variant dark` → utilities de tema seguem o SO, não o `data-theme` do app | **Alta** | `app/globals.css` (declarar `@variant dark`) |
| F-06 | Server state (`clients`/`products`/`metrics`) espelhado no Zustand, com poll de 30s | **Alta** | `app-store.ts:63-89`, `useClients.ts` |
| F-07 | `error.message` renderizado na UI de erro em produção | **Alta** | `app/error.tsx:34-47` |
| F-08 | 120/149 arquivos `'use client'`; zero Server Components | **Alta** | `DashboardLayout.tsx:1`, superfície de rotas |
| F-09 | 11 inversões da regra de dependência FSD (`shared` → `widgets`/`features`) | **Média** | `filters-button.tsx:7` é o caso mais puro |
| F-05 | Zero i18n; 100% de strings hardcoded, sem ADR registrando a escolha mono-locale | **Média** | Decisão de produto — merece ADR mesmo que a resposta seja "pt-BR only" |
| — | `global-error.tsx`, `loading.tsx`, `instrumentation.ts`, skip link, `scope`/`caption` em tabelas: todos ausentes | **Média** | superfície de rotas + `shared/ui/table.tsx` |

### Contrapontos — o que já está bem

Não é uma base descuidada. Vários pontos passam com folga:

- **Zero `forwardRef`, zero `React.FC`, zero `tabIndex` positivo, zero `enum`** — React 19 idiomático.
- **Selectors granulares em 100% dos call sites de Zustand** — nenhuma leitura da store inteira.
- **`DataProvider` memoiza o `value`** e `useQuery` implementa descarte de resposta stale corretamente.
- **Todo `DialogContent` tem `DialogTitle`** (com `sr-only` onde o design esconde).
- **`prefers-reduced-motion` respeitado globalmente**; `next/font` correto; `cn()` usado consistentemente.
- **Comentários explicam *porquê*, não *o quê*** — e não há um único `TODO` órfão nos widgets/pages.
- **147 testes de UI passando**, incluindo os do `app-store` e dos widgets de navegação.
