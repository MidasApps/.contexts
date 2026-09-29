# Layout Refresh - Liquid DataViz

## Objetivo

Melhorar o layout do dashboard com mais respiro, mais contraste visual, sparklines nos KPI cards, filtro de data por range de meses, e filtro multi-select de empreendimentos. Remover comentarios das paginas.

## Referências visuais

Combinacao de:
- **Portfel** — hierarquia de KPIs financeiros, evolucao temporal
- **WindPulse** — espacamento limpo, cards legíveis, KPIs com trend
- **Finotive** — layout geral, dark theme com camadas, bordas sutis
- **Quanta** — background abstrato com gradientes blur, efeito glassmorphism

---

## 1. Background e Camadas Visuais

### Estado atual
- `--color-background: oklch(0% 0 0)` (preto puro)
- `--color-card: oklch(8% 0 0)`
- Cards ja tem `bg-white/5 backdrop-blur-xl border-white/10` (card.tsx)
- 3 blobs de gradiente animados no DashboardLayout (primary/20, primary/10, purple-500/10)

### Mudancas

**globals.css:**
- `--color-background`: `oklch(0% 0 0)` -> `oklch(3.5% 0.005 280)` (quase preto com leve tom frio)
- `--color-card`: `oklch(8% 0 0)` -> `oklch(7% 0.003 280)` (tom levemente azulado)
- `--color-popover`: `oklch(10% 0 0)` -> `oklch(9% 0.003 280)`
- `--color-border`: `oklch(18% 0 0)` -> `oklch(16% 0.005 280)`
- `--color-input`: `oklch(22% 0 0)` -> `oklch(20% 0.005 280)` (alinhar com tom frio)

**DashboardLayout.tsx — blobs de gradiente:**
- Blob 1 (top-left): manter primary/20, aumentar para `h-[700px] w-[700px]`, blur `blur-[160px]`, opacity-60
- Blob 2 (bottom-right): manter primary/10, aumentar para `h-[800px] w-[800px]`, blur `blur-[180px]`, opacity-40
- Blob 3 (center): mudar de `bg-purple-500/10` para `bg-violet-600/[0.08]`, aumentar para `h-[500px] w-[500px]`, blur `blur-[140px]`, opacity-30
- Adicionar blob 4 (top-right): `bg-primary/5`, `h-[400px] w-[400px]`, `blur-[120px]`, opacity-20 — para gradiente mais difuso
- Blobs sao estaticos (sem animacao CSS) para evitar custo de GPU; o efeito visual vem do blur + mix-blend-screen
- Nota: testar opacidades finais em tela real — se ficar pesado visualmente, reduzir blob 1 para opacity-40

**card.tsx:**
- Manter glassmorphism existente (`bg-white/5 backdrop-blur-xl border-white/10`)
- Ajustar hover: `hover:bg-white/[0.08]` (levemente mais visivel)

---

## 2. Espacamento (Respiro)

### Mudancas globais em todas as paginas

**Padding da area de conteudo:**
- `p-4 lg:p-6` -> `p-5 lg:p-8`

**Gap entre secoes:**
- `space-y-6` -> `space-y-8`

**Gap no grid de KPIs:**
- KpiGrid gap interno: `gap-3` -> `gap-4`

**Padding interno dos KPI cards:**
- `p-5` -> `p-6`

**Gap entre widgets/charts:**
- `gap-4` ou `gap-6` -> `gap-6` padrao

---

## 3. KPI Card com Sparkline

### Estado atual (KpiCard.tsx)
Props: `label`, `value`, `subtitle`, `trend`, `comparison`, `loading`, `className`, `animationIndex`

### Nova prop

```typescript
interface KpiCardProps {
  // ... props existentes ...
  sparklineData?: number[];  // Array de ~6-9 valores (meses) para mini grafico
}
```

### Layout interno do card

```
+---------------------------------------+
| LABEL (uppercase, xs, white/60)       |
| VALUE (4xl, gradient text, bold)      |
| TREND/COMPARISON (existente)          |
|                                       |
| [--- sparkline 36px height ---]       |
+---------------------------------------+
```

### Determinacao da cor da sparkline

A cor e derivada automaticamente dos dados: compara o primeiro e ultimo valor do array `sparklineData`.
- Ultimo > primeiro: linha success (verde)
- Ultimo < primeiro: linha destructive (vermelho)
- Iguais: linha muted-foreground
- Se `comparison.positiveIsGood === false`, inverte a logica de cores

### Implementacao da sparkline

- Usar Recharts `<LineChart>` com `<ResponsiveContainer>`
- Sem eixos (`<XAxis hide>`, `<YAxis hide>`)
- Sem grid, sem tooltip
- Linha com `strokeWidth={1.5}`, cor determinada pela logica acima
- Area fill com gradiente vertical sutil (cor da linha -> transparente, opacity 0.1)
- Height: 36px
- Margin top: `mt-3`
- A sparkline so aparece se `sparklineData` for fornecido e tiver >= 2 pontos

### Dados

Cada hook de dados (useDashboardSummary, etc.) vai precisar retornar dados historicos para os sparklines. Como os dados vem do BigQuery via API, os hooks ja recebem `dataBase` e `projeto` do contexto. A mudanca sera:

- Adicionar campo `historico` ao response de cada endpoint que alimenta KPIs
- Formato: `{ [kpi_key]: number[] }` — array de valores mensais ordenados cronologicamente
- Fallback: se nao houver dados historicos, sparkline simplesmente nao aparece

---

## 4. Filtro de Data — Month Range Picker

### Estado atual (GlobalFilters.tsx + DataProvider.tsx)
- Um `<Select>` com opcoes de meses pre-definidas
- `dataBase` e um unico valor string (ex: `'2026-01-31'`)
- Hooks usam `dataBase` como parametro unico

### Novo modelo de dados (DataProvider.tsx)

```typescript
interface DateRange {
  start: string;  // ex: '2025-05-31'
  end: string;    // ex: '2026-01-31'
}

interface DataFilters {
  dateRange: DateRange;           // substitui dataBase
  projetos: string[];             // substitui projeto (singular)
  compareEnabled: boolean;
  comparePeriod: DatePeriod | null;
}
```

### Estrategia de compatibilidade

O DataProvider expoe tanto a nova API (`dateRange`, `projetos`) quanto aliases da antiga (`dataBase`, `projeto`) para migracao incremental:

```typescript
// Aliases computados no provider
const dataBase = dateRange.end;  // compatibilidade com hooks existentes
const projeto = projetos[0] ?? '';  // compatibilidade temporaria
```

Hooks sao migrados um a um. Ao final, os aliases sao removidos.

### Componente MonthRangePicker

Novo componente em `src/shared/ui/month-range-picker.tsx`.

**UI:**
- Trigger: botao com texto "jan/2025 — mar/2026" (formato abreviado)
- Popover com:
  - Header: `< 2025 >` navegacao de ano
  - Grid 4x3 com os 12 meses como botoes
  - Primeiro clique = start, segundo clique = end
  - Meses no range ficam com bg highlight (`bg-primary/10`)
  - Start e end ficam com `bg-primary text-primary-foreground`
  - Meses fora do range disponivel ficam disabled (`opacity-40`)

**Comportamento:**
- Se clicar em mes antes do start selecionado, reseta e define novo start
- Se clicar no mesmo mes ja selecionado, seleciona apenas aquele mes (start = end)
- Clicar fora fecha o popover
- Props `minDate` / `maxDate` limitam o range selecionavel (default: mai/2025 a jan/2026)

**Acessibilidade:**
- Navegacao por teclado: setas para mover entre meses, Enter para selecionar, Escape para fechar
- `role="grid"` no container de meses, `role="gridcell"` em cada mes
- `aria-selected` nos meses selecionados, `aria-disabled` nos desabilitados

### Integracao em GlobalFilters.tsx

Substituir o primeiro `<Select>` (data base) por `<MonthRangePicker>`.

---

## 5. Filtro de Empreendimentos — Multi-select Combobox

### Estado atual
- `<Select>` simples com valor unico
- `projeto: string` no DataProvider

### Novo componente MultiSelectCombobox

Novo componente em `src/shared/ui/multi-select-combobox.tsx`.

**UI:**
```
+--------------------------------------------+
| [Trigger: "2 empreendimentos" v ]          |
+--------------------------------------------+
| Popover:                                   |
| +----------------------------------------+ |
| | [Buscar empreendimentos...]            | |
| +----------------------------------------+ |
| | [x] AUTORIA BY ORNARE        [somente] | |
| | [x] BOSSA OM HOME            [somente] | |
| | [ ] PROJETO C                 [somente] | |
| +----------------------------------------+ |
| | [Todos]  [Nenhum]                      | |
| +----------------------------------------+ |
+--------------------------------------------+
```

**Comportamento:**
- Campo de busca filtra a lista (case-insensitive, substring match)
- Checkbox toggle individual
- Botao "somente" aparece no hover (desktop) ou sempre visivel (mobile touch); ao clicar, desmarca todos e marca so aquele
- "Todos" marca todos, "Nenhum" desmarca todos
- Trigger mostra:
  - Se todos selecionados: "Todos os empreendimentos"
  - Se 1 selecionado: nome do empreendimento
  - Se 2-3: "2 empreendimentos" / "3 empreendimentos"
  - Se nenhum: "Nenhum selecionado" (estado de warning)

### Integracao em GlobalFilters.tsx

Substituir o segundo `<Select>` (projeto) por `<MultiSelectCombobox>`.

### Integracao no DataProvider

- `projeto: string` -> `projetos: string[]`
- `setProjeto` -> `setProjetos`
- Default: todos selecionados
- Hooks passam `projetos` como array para a API

---

## 6. Limpeza — Remover Comentarios

Remover todos os comentarios de codigo das paginas e widgets:

**DashboardLayout.tsx:**
- `{/* Abstract animated backgrounds */}`
- `{/* Desktop nav sidebar */}`
- `{/* Mobile nav sidebar drawer */}`
- `{/* Main content area — pb-16 on mobile for bottom tab bar */}`
- `{/* AI Sidebar - desktop */}`
- `{/* AI Sidebar - mobile (full-screen sheet) */}`
- `{/* Mobile bottom tab bar */}`

**DashboardPage.tsx:**
- `{/* Left: KPIs in 2x3 grid */}`
- `{/* Right: Table */}`

**globals.css:**
- Remover blocos de comentario `/* === ... === */`
- Manter so o `@theme` limpo sem comentarios descritivos

**chart-theme.ts:**
- Remover `// Recharts theme configuration matching Liquid design tokens`
- Remover `// All chart colors use CSS variables for consistency`
- Remover comentarios inline `// chart-1: orange`, etc.

**KpiCard.tsx:**
- Remover JSDoc comments das props (`/** Period comparison data */`, etc.)

**Todas as outras paginas:** remover quaisquer comentarios JSX ou inline encontrados.

---

## 7. Arquivos impactados

### Modificados
| Arquivo | Mudanca |
|---------|---------|
| `app/globals.css` | Cores do tema (background, card, border, popover), remover comentarios |
| `src/shared/ui/card.tsx` | Ajustar hover opacity |
| `src/app/layouts/DashboardLayout.tsx` | Refinar blobs gradiente, remover comentarios |
| `src/widgets/kpi-grid/ui/KpiCard.tsx` | Adicionar sparkline, aumentar padding, remover comentarios |
| `src/widgets/global-filters/ui/GlobalFilters.tsx` | Usar MonthRangePicker + MultiSelectCombobox |
| `src/shared/providers/DataProvider.tsx` | dateRange + projetos (array) |
| `src/shared/config/chart-theme.ts` | Remover comentarios |
| `src/pages/dashboard/ui/DashboardPage.tsx` | Espacamento, remover comentarios |
| `src/pages/contratos/ui/ContratosPage.tsx` | Espacamento, remover comentarios |
| `src/pages/pagamentos/ui/PagamentosPage.tsx` | Espacamento, remover comentarios |
| `src/pages/fluxo-de-caixa/ui/FluxoDeCaixaPage.tsx` | Espacamento, remover comentarios |
| `src/pages/pdd/ui/PddPage.tsx` | Espacamento, remover comentarios |
| `src/pages/pricing/ui/PricingPage.tsx` | Espacamento, remover comentarios |
| `src/pages/simulacao/ui/SimulacaoPage.tsx` | Espacamento, remover comentarios |
| `src/pages/elegibilidade/ui/ElegibilidadePage.tsx` | Espacamento, remover comentarios |
| `src/pages/repasse/ui/RepassePage.tsx` | Espacamento, remover comentarios |
| `src/pages/detalhamento/ui/DetalhamentoPage.tsx` | Espacamento, remover comentarios |
| `src/pages/anexos-elegibilidade/ui/AnexosElegibilidadePage.tsx` | Espacamento, remover comentarios |
| `src/pages/anexos-pdd/ui/AnexosPddPage.tsx` | Espacamento, remover comentarios |
| `src/pages/anexos-rating/ui/AnexosRatingPage.tsx` | Espacamento, remover comentarios |
| Todos os hooks (`useDashboardSummary`, `useContratos`, `usePagamentos`, `useFluxoCaixa`, `usePdd`, `usePricing`, `useSimulacao`, `useElegibilidade`, `useRepasse`, `useDetalhamento`, `useDashboardFaixaAtraso`, `useCompare`) | Adaptar para `dateRange` e `projetos[]` |

### Novos
| Arquivo | Descricao |
|---------|-----------|
| `src/shared/ui/month-range-picker.tsx` | Seletor de range de meses |
| `src/shared/ui/multi-select-combobox.tsx` | Combobox com busca, checkboxes e "somente" |

### Sem mudanca
- `src/widgets/chart-widget/ui/ChartWidget.tsx` — ja funciona bem, so herdara novo espacamento dos pais
- `src/widgets/app-bar/` — sem mudanca
- `src/widgets/nav-sidebar/` — sem mudanca
- `src/widgets/ai-sidebar/` — sem mudanca

---

## 8. Riscos e mitigacao

| Risco | Mitigacao |
|-------|-----------|
| Hooks existentes quebram com `dateRange`/`projetos` | Manter aliases temporarios (`dataBase` aponta para `dateRange.end`) |
| Performance das sparklines (muitos Recharts instances) | Sparklines sao componentes leves sem tooltip/axes; 6-8 por pagina e aceitavel |
| API BigQuery nao retorna dados historicos | Sparkline nao renderiza quando `sparklineData` e undefined; graceful fallback |
| MonthRangePicker complexidade de interacao | Seguir padrao familiar de date range (Google Analytics, Linear) |
