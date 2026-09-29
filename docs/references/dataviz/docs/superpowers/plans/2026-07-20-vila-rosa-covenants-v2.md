# Onboarding Vila Rosa + Template Covenants v2 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastrar o cliente Vila Rosa (datasets `vila_rosa_monitor` + `vila_rosa_covenants`) e entregar o template Covenants v2 (13 páginas espelhando o Looker "Liquid Play - Covenants v2.7", com status de enquadramento).

**Architecture:** Reuso integral da engine data-driven (ADR-0013/0015): contrato `liquid-play-plus` estendido, métricas `covenants.*` novas, templates `covenants-v2-*` seedados por script, cliente via `productBindings`. Gaps de visualização (waterfall, barra horizontal, badge, dropdowns de página) entram como extensões aditivas do canvas.

**Tech Stack:** Next.js 16, Firestore (firebase-admin), BigQuery, Recharts, Zod, vitest, tsx, pnpm.

**Specs de referência (leitura obrigatória antes de cada fase):**
- `docs/superpowers/specs/2026-07-20-vila-rosa-covenants-design.md` (design aprovado)
- `docs/bases/vila-rosa/MAPEAMENTO.md` (inventário página a página, joins, filtros, fórmulas — §6 tem os valores de referência de mai/2026 para validação)

## Global Constraints

- Package manager: **pnpm** (nunca npm/yarn). Testes: `pnpm test` (= `vitest run`); rode arquivos novos em isolamento (`pnpm exec vitest run <path>`) — a suíte cheia tem flakiness conhecida (~6 falhas de baseline).
- ADRs vencem specs em divergência. Storage de config/metadados = Firestore DB `liquid-play-dataviz` (projeto `liquid-micro-apps`). BigQuery só para dados de cliente.
- Slug do cliente: `vila-rosa` (doc Firestore); token BQML futuro: `vila_rosa` (não criar nada BQML neste plano).
- Multi-tenancy fail-closed (ADR-0006): toda rota valida token + `clientAccess`.
- Mudanças de schema do canvas/template devem ser **aditivas** (templates existentes seguem válidos sem migração).
- Formato numérico PT-BR na UI; `percent` trafega como razão 0–1 e é ×100 na apresentação.
- Commits frequentes, mensagens `feat(escopo): …` / `fix(escopo): …` em PT-BR como no histórico.
- Nunca commitar `secrets/`, `.env*` ou os PNGs de `docs/bases/vila-rosa/` (somente `.md` dessa pasta).

---

## Fase 0 — Pré-requisitos de dados (sem código)

### Task 0: Confirmar datasets e acesso da service account

**Files:** nenhum (verificação).

**Interfaces:**
- Produces: nomes reais `PROJETO_GCP`, `DATASET_MONITOR`, `DATASET_COVENANTS` usados nas Tasks 8, 9, 12.

- [ ] **Step 1: Listar datasets candidatos**

Run (com a credencial `dataviz-sa`, ver memória docker-local-sa-key):
```bash
bq ls --project_id=<PROJETO_GCP> | grep -i vila
```
Expected: datasets `vila_rosa_monitor` e `vila_rosa_covenants` (ou variação — anotar os nomes reais).

- [ ] **Step 2: Conferir tabelas e colunas-chave**

```bash
bq ls <PROJETO_GCP>:vila_rosa_covenants
bq show --schema --format=prettyjson <PROJETO_GCP>:vila_rosa_covenants.covenants_calculo | head -40
bq query --use_legacy_sql=false 'SELECT MAX(data_base_report) FROM `<PROJETO_GCP>.vila_rosa_monitor.contratos`'
```
Expected: 7 tabelas no covenants, 2 no monitor; schemas batendo com `docs/bases/vila-rosa/BigQuery/*.json`; `MAX(data_base_report)` retorna 2026-05-31 ou mais recente.

- [ ] **Step 3: Registrar os nomes confirmados**

Anotar `PROJETO_GCP`/datasets no PR description e substituir nos placeholders `<PROJETO_GCP>` das tasks seguintes. **Bloqueia a Fase 2 se divergirem do mapeamento.**

---

## Fase 1 — Plataforma: fix bloqueador + gaps do canvas

### Task 1: Fix `/api/filter-options` para clientes com `productBindings`

**Files:**
- Modify: `app/api/filter-options/route.ts:16-29`
- Test: `app/api/filter-options/route.test.ts` (criar)

**Interfaces:**
- Consumes: shape `ClientProductBinding` de `src/shared/schemas/client-binding.ts` (`productBindings[].datasets[]: { dataSourceId, datasetId }`).
- Produces: `findClientByDataset(dataset)` passa a casar `"${dataSourceId}.${datasetId}"` e `datasetId` puro, além dos campos legados. É o formato que `useActiveDataset()` (`src/shared/hooks/useActiveClient.ts:17-33`) envia para clientes formato-novo.

- [ ] **Step 1: Escrever teste que falha**

```ts
// app/api/filter-options/route.test.ts
import { describe, it, expect } from 'vitest';
import { matchClientDataset } from './match-client-dataset';

const bindingClient = {
  productBindings: [
    { productId: 'covenants', datasets: [{ dataSourceId: 'bq-data-wh', datasetId: 'vila_rosa_covenants' }] },
  ],
};

describe('matchClientDataset', () => {
  it('casa dataset no formato dataSourceId.datasetId de productBindings', () => {
    expect(matchClientDataset(bindingClient, 'bq-data-wh.vila_rosa_covenants')).toBe(true);
  });
  it('casa datasetId puro de productBindings', () => {
    expect(matchClientDataset(bindingClient, 'vila_rosa_covenants')).toBe(true);
  });
  it('segue casando campos legados', () => {
    expect(matchClientDataset({ dataset: 'bq-data-wh.om_monitor' }, 'bq-data-wh.om_monitor')).toBe(true);
    expect(matchClientDataset({ datasets: [{ dataset: 'x.y' }] }, 'x.y')).toBe(true);
  });
  it('não casa dataset alheio', () => {
    expect(matchClientDataset(bindingClient, 'bq-data-wh.galli_vivapark_covenants')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm exec vitest run app/api/filter-options/route.test.ts`
Expected: FAIL — `match-client-dataset` não existe.

- [ ] **Step 3: Extrair helper puro e usar na rota**

Criar `app/api/filter-options/match-client-dataset.ts`:
```ts
type LegacyDataset = { dataset?: string };
type BindingDataset = { dataSourceId?: string; datasetId?: string };
type ClientData = {
  dataset?: string;
  datasets?: LegacyDataset[];
  productBindings?: { datasets?: BindingDataset[] }[];
};

/** Um doc de cliente "possui" o dataset se ele bater com qualquer formato: legado ou binding. */
export function matchClientDataset(data: ClientData, dataset: string): boolean {
  if (data.dataset === dataset) return true;
  if (Array.isArray(data.datasets) && data.datasets.some((d) => d?.dataset === dataset)) return true;
  for (const pb of data.productBindings ?? []) {
    for (const d of pb?.datasets ?? []) {
      if (!d?.datasetId) continue;
      if (d.datasetId === dataset) return true;
      if (d.dataSourceId && `${d.dataSourceId}.${d.datasetId}` === dataset) return true;
    }
  }
  return false;
}
```
Em `route.ts`, substituir o corpo do loop de `findClientByDataset` por `if (matchClientDataset(data as never, dataset)) return { id: doc.id, data };` (mantendo import no topo).

- [ ] **Step 4: Rodar e ver passar**

Run: `pnpm exec vitest run app/api/filter-options/route.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Verificação de comportamento downstream**

`queryFilterOptions(dataset, schema)` recebe `data.schema` legado que será `undefined` para cliente formato-novo — conferir em `src/shared/lib/bigquery/queries.ts:15-60` que `schema` ausente cai no caminho de colunas default (`data_base_report`, `projeto`). Se lançar, tratar `schema ?? null` na rota. Documentar o observado no commit.

- [ ] **Step 6: Commit**

```bash
git add app/api/filter-options/
git commit -m "fix(filter-options): resolve cliente via productBindings alem dos campos legados"
```

### Task 2: `ChartBlock` — layout horizontal (G2)

**Files:**
- Modify: `src/shared/config/agents/types.ts:228-247` (interface `ChartBlockType`)
- Modify: `src/pages/explore/ui/blocks/ChartBlock.tsx:52-214`
- Test: `src/pages/explore/ui/blocks/ChartBlock.test.tsx` (criar)

**Interfaces:**
- Produces: campo opcional `layout?: 'vertical' | 'horizontal'` no bloco `chart` (default `'vertical'` = comportamento atual). Templates da Fase 3 usam `layout: 'horizontal'` na pág. Inadimplência.

- [ ] **Step 1: Teste que falha**

```tsx
// src/pages/explore/ui/blocks/ChartBlock.test.tsx
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChartBlock } from './ChartBlock';

const base = {
  id: 'c1', type: 'chart' as const, chartType: 'stacked-bar' as const,
  title: 'x', data: [{ bucket: 'Pré', a: 1, b: 2 }], dataKeys: ['a', 'b'], xAxisKey: 'bucket',
};

describe('ChartBlock layout', () => {
  it('horizontal inverte eixos (categoria no Y)', () => {
    const { container } = render(<ChartBlock block={{ ...base, layout: 'horizontal' }} />);
    // Recharts marca o BarChart com a prop layout="vertical" (nomenclatura invertida da lib)
    expect(container.querySelector('.recharts-wrapper')).toBeTruthy();
  });
  it('sem layout renderiza como hoje', () => {
    const { container } = render(<ChartBlock block={base} />);
    expect(container.querySelector('.recharts-wrapper')).toBeTruthy();
  });
});
```
(Seguir o padrão de setup dos testes de componente existentes — ver `src/` por `*.test.tsx` com Testing Library; se o projeto usa jsdom via config do vitest, nada extra a fazer.)

- [ ] **Step 2: Rodar e ver falhar** — `pnpm exec vitest run src/pages/explore/ui/blocks/ChartBlock.test.tsx` → FAIL (prop `layout` inexistente no tipo).

- [ ] **Step 3: Implementar**

Em `types.ts` (dentro de `ChartBlockType`):
```ts
  /** Orientação das barras. 'horizontal' = categoria no eixo Y (Recharts layout="vertical"). */
  layout?: 'vertical' | 'horizontal';
```
Em `ChartBlock.tsx`, no branch de `bar`/`stacked-bar`: quando `block.layout === 'horizontal'`, passar `layout="vertical"` ao `<BarChart>`, trocar `<XAxis type="number" />` / `<YAxis type="category" dataKey={xAxisKey} width={120} />` e manter tooltip/formatador. Não alterar `line`/`area`/`composed`.

- [ ] **Step 4: Rodar e ver passar** — mesmo comando, PASS.

- [ ] **Step 5: Commit** — `git add src/shared/config/agents/types.ts src/pages/explore/ui/blocks/ && git commit -m "feat(canvas): layout horizontal em bar/stacked-bar"`

### Task 3: `ChartBlock` — tipo `waterfall` (G1)

**Files:**
- Modify: `src/shared/config/agents/types.ts:230` (`chartType` union)
- Modify: `src/pages/explore/ui/blocks/ChartBlock.tsx`
- Test: `src/pages/explore/ui/blocks/ChartBlock.waterfall.test.tsx` (criar)

**Interfaces:**
- Consumes: rows no formato canônico `{ bucket: string; value: number }` (convenção `bucket`/`value` de `useReportData`).
- Produces: `chartType: 'waterfall'` — barras flutuantes com acumulado invisível; usado no template `covenants-v2-visao-executiva` (Extrato Resumido).

- [ ] **Step 1: Teste que falha (transformação pura)**

```ts
// src/pages/explore/ui/blocks/ChartBlock.waterfall.test.tsx
import { describe, it, expect } from 'vitest';
import { toWaterfallData } from './waterfall';

it('empilha base invisível acumulada', () => {
  const rows = [
    { bucket: 'Entrada', value: 5_400_000 },
    { bucket: 'Compras', value: -247_600 },
    { bucket: 'Transferência', value: -5_000_000 },
  ];
  expect(toWaterfallData(rows)).toEqual([
    { bucket: 'Entrada', base: 0, delta: 5_400_000, value: 5_400_000 },
    { bucket: 'Compras', base: 5_152_400, delta: 247_600, value: -247_600 },
    { bucket: 'Transferência', base: 152_400, delta: 5_000_000, value: -5_000_000 },
  ]);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `pnpm exec vitest run src/pages/explore/ui/blocks/ChartBlock.waterfall.test.tsx` → FAIL.

- [ ] **Step 3: Implementar**

Criar `src/pages/explore/ui/blocks/waterfall.ts`:
```ts
export type WaterfallRow = { bucket: string; base: number; delta: number; value: number };

/** Converte {bucket,value} em barras flutuantes: base invisível + delta visível. */
export function toWaterfallData(rows: { bucket: string; value: number }[]): WaterfallRow[] {
  let running = 0;
  return rows.map((r) => {
    const start = running;
    running += r.value;
    const base = Math.min(start, running);
    return { bucket: r.bucket, base, delta: Math.abs(r.value), value: r.value };
  });
}
```
Em `types.ts`: `chartType: 'bar' | 'line' | 'area' | 'composed' | 'stacked-bar' | 'waterfall';`
Em `ChartBlock.tsx`: branch `waterfall` → `<BarChart data={toWaterfallData(rows)}>` com `<Bar dataKey="base" stackId="w" fill="transparent" />` + `<Bar dataKey="delta" stackId="w">` colorindo cada `<Cell>` por sinal de `value` (positivo = cor 1 da paleta `CHART_COLORS`, negativo = cor neutra/negativa do `chart-theme.ts`); tooltip exibe `value` formatado, não `delta`.

- [ ] **Step 4: Rodar e ver passar** — PASS.

- [ ] **Step 5: Commit** — `git commit -m "feat(canvas): chartType waterfall (extrato resumido)"` (com `git add` dos 3 arquivos).

### Task 4: `TableBlock` — formato `status-badge` (G4)

**Files:**
- Modify: `src/shared/config/agents/types.ts:296-310` (coluna de `TableBlockType`)
- Modify: `src/pages/explore/ui/blocks/TableBlock.tsx` (onde formatos `currency/percent/number/date` são aplicados)
- Test: `src/pages/explore/ui/blocks/TableBlock.status-badge.test.tsx` (criar)

**Interfaces:**
- Produces: coluna `{ format: 'status-badge', statusMap?: Record<string, 'success'|'danger'|'warning'|'neutral'> }`. Default sem `statusMap`: `Válida→success`, `Inválida→danger`, resto `neutral`. Usado em Certidões (pág. 13) e Rating (pág. 6).

- [ ] **Step 1: Teste que falha**

```tsx
import { describe, it, expect } from 'vitest';
import { resolveStatusVariant } from './status-badge';

describe('resolveStatusVariant', () => {
  it('usa statusMap quando fornecido', () => {
    expect(resolveStatusVariant('H', { H: 'danger' })).toBe('danger');
  });
  it('defaults PT-BR', () => {
    expect(resolveStatusVariant('Válida')).toBe('success');
    expect(resolveStatusVariant('Inválida')).toBe('danger');
    expect(resolveStatusVariant('qualquer')).toBe('neutral');
  });
});
```

- [ ] **Step 2: Ver falhar** — `pnpm exec vitest run src/pages/explore/ui/blocks/TableBlock.status-badge.test.tsx` → FAIL.

- [ ] **Step 3: Implementar**

`src/pages/explore/ui/blocks/status-badge.ts`:
```ts
export type StatusVariant = 'success' | 'danger' | 'warning' | 'neutral';
const DEFAULTS: Record<string, StatusVariant> = {
  'Válida': 'success', 'Inválida': 'danger', 'Vencida': 'danger', 'Pendente': 'warning',
};
export function resolveStatusVariant(value: string, statusMap?: Record<string, StatusVariant>): StatusVariant {
  return statusMap?.[value] ?? DEFAULTS[value] ?? 'neutral';
}
```
Em `types.ts`, na coluna: `format?: 'currency' | 'percent' | 'number' | 'date' | 'status-badge'; statusMap?: Record<string, 'success'|'danger'|'warning'|'neutral'>;`
No `TableBlock.tsx`, quando `format === 'status-badge'`, renderizar `<Badge>` do shadcn (`src/shared/ui/badge`) com classes semânticas (usar tokens: `bg-emerald-500/15 text-emerald-500` etc. seguindo o padrão de cores semânticas já usado no GaugeBlock).

- [ ] **Step 4: Ver passar** — PASS. Rodar também `pnpm exec vitest run src/pages/explore` para sanity dos blocos.

- [ ] **Step 5: Commit** — `git commit -m "feat(canvas): format status-badge em colunas de tabela"`.

### Task 5: Filtros de página dropdown por atributo (G3)

**Files:**
- Modify: `src/shared/config/agents/types.ts:334-349` (`CanvasPageFilters`)
- Create: `app/api/metrics/filter-values/route.ts`
- Modify: `src/pages/report/ui/ReportPage.tsx` (render dos dropdowns) e `src/shared/hooks/useReportData.ts` (aplicar valores no `pageFilters`)
- Test: `app/api/metrics/filter-values/route.test.ts`

**Interfaces:**
- Consumes: `resolveMetric`/bindings para traduzir `entity.attribute` → coluna física; `verifyClientAccess` de `src/shared/lib/api-auth.ts`.
- Produces:
  - entrada `metricPageFilters` ganha forma `{ kind: 'in', attribute: 'transacoes.banco_codigo', control: 'dropdown', label: 'Banco', labelAttribute?: 'transacoes.banco_nome' }`;
  - `POST /api/metrics/filter-values` `{ clientId, productId, attribute }` → `{ values: {value: string, label?: string}[] }` (SELECT DISTINCT limitado a 200);
  - `useReportData` injeta `pageFilters[key] = { kind:'in', attribute, values }` quando o usuário seleciona.

- [ ] **Step 1: Teste do endpoint (validação de payload) que falha**

```ts
// app/api/metrics/filter-values/route.test.ts
import { describe, it, expect } from 'vitest';
import { FilterValuesBody } from './schema';

describe('FilterValuesBody', () => {
  it('aceita payload válido', () => {
    expect(FilterValuesBody.safeParse({
      clientId: 'vila-rosa', productId: 'covenants', attribute: 'transacoes.banco_codigo',
    }).success).toBe(true);
  });
  it('rejeita attribute sem entidade', () => {
    expect(FilterValuesBody.safeParse({
      clientId: 'vila-rosa', productId: 'covenants', attribute: 'banco',
    }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Ver falhar**, criar `app/api/metrics/filter-values/schema.ts`:

```ts
import { z } from 'zod';
export const FilterValuesBody = z.object({
  clientId: z.string().min(1),
  productId: z.string().min(1),
  attribute: z.string().regex(/^[a-z0-9_]+\.[a-z0-9_]+$/),
});
```
Ver passar.

- [ ] **Step 3: Implementar a rota**

`route.ts`: autentica (`verifyAuthToken`), `verifyClientAccess(email, clientId)`, carrega binding (`loadClientBindings` de `src/shared/lib/metrics/execute-metric.ts`), resolve coluna via `schemaBindings[attribute]` (fail com 422 se `null`/ausente), monta `SELECT DISTINCT <col> AS value FROM <tabela da entidade> WHERE <col> IS NOT NULL ORDER BY 1 LIMIT 200` usando os mesmos helpers de identificador seguro (`src/shared/lib/bigquery/identifier.ts`) e `getBigQueryClientFor(dataSourceId)`. Reusar a resolução de tabela física de `resolve-metric.ts` (mesma função que aplica `tableBindings`) — extrair helper se necessário.

- [ ] **Step 4: UI**

Em `types.ts`, no valor de `metricPageFilters`: adicionar `control?: 'dropdown'; label?: string; labelAttribute?: string;`.
Em `ReportPage.tsx`: se o report tem entradas com `control: 'dropdown'`, renderizar uma barra de filtros locais acima do grid (componente `Select`/`MultiSelectCombobox` já existente em `src/shared/ui`), estado local por report, opções via `POST /api/metrics/filter-values`. Ao mudar, repassar para `useReportData` (novo parâmetro `pageFilterValues: Record<string, string[]>`) que mescla no `pageFilters` enviado ao `/api/metrics/batch`.

- [ ] **Step 5: Teste manual** — `pnpm dev`, abrir um report com filtro dropdown configurado (usar template de teste), conferir network: `filter-values` retorna valores e `metrics/batch` recebe `pageFilters` com `kind:'in'`.

- [ ] **Step 6: Commit** — `git commit -m "feat(reports): filtros de pagina dropdown por atributo (kind in)"`.

### Task 6: Drill-through entre reports com propagação de filtros (G5)

**Files:**
- Modify: `src/pages/report/ui/ReportPage.tsx`
- Modify: `src/shared/config/agents/types.ts` (`TextBlock` já suporta markdown/link — sem mudança; adicionar `linkTo?: { groupId?: string; reportName: string; carryFilters?: boolean }` ao `BaseBlock` é DESNECESSÁRIO — YAGNI: usar link markdown + querystring)
- Test: manual (roteamento)

**Interfaces:**
- Produces: `ReportPage` lê querystring `?pf.<attribute>=v1,v2` na carga e inicializa `pageFilterValues` (Task 5). O botão "Extrato Detalhado →" vira um bloco `text` com link markdown `[Extrato Detalhado →](/g/<groupId>/r/<reportId>?pf.transacoes.banco_codigo=…)` gerado dinamicamente pela UI de filtros (os valores atuais são serializados pelo próprio ReportPage ao renderizar links relativos contendo o token `{pageFilters}`).

- [ ] **Step 1: Implementar parse da querystring**

Em `ReportPage.tsx`, no mount: `useSearchParams()`; para cada par `pf.<attr>=a,b`, popular `pageFilterValues[<attr>] = ['a','b']`. Nada além disso (o estado já flui pela Task 5).

- [ ] **Step 2: Substituição de token em links de TextBlock**

No render do `TextBlock` dentro do ReportPage (ou no próprio bloco, via prop opcional `resolveHref`), substituir a substring literal `{pageFilters}` pela serialização atual (`pf.attr=v1,v2&…`). Bloco de exemplo (usado no template pág. 12): `content: '[Extrato Detalhado →](/g/{groupId}/r/{report:covenants-v2-extrato-detalhado}?{pageFilters})'` — `{groupId}` = grupo atual; `{report:<templateId>}` = id do report do grupo atual cujo `templateId` bate (resolver via `useReports`).

- [ ] **Step 3: Teste manual** — navegar pág. 12 → 14 com filtro Banco selecionado; conferir que o dropdown da pág. 14 chega pré-preenchido.

- [ ] **Step 4: Commit** — `git commit -m "feat(reports): drill-through com propagacao de pageFilters via querystring"`.

### Task 7: Validar barras espelhadas ± (G6)

**Files:**
- Test: `src/pages/explore/ui/blocks/ChartBlock.negative.test.tsx` (criar)

**Interfaces:** nenhum novo — task de verificação com teste de regressão.

- [ ] **Step 1: Teste com valores negativos**

```tsx
import { it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ChartBlock } from './ChartBlock';

it('bar chart renderiza séries com valores negativos sem lançar', () => {
  const { container } = render(<ChartBlock block={{
    id: 'n1', type: 'chart', chartType: 'bar', title: 'E&S',
    data: [{ bucket: 'mai. 2026', credit: 5_400_000, debit: -5_247_584.61 }],
    dataKeys: ['credit', 'debit'], xAxisKey: 'bucket',
  }} />);
  expect(container.querySelector('.recharts-wrapper')).toBeTruthy();
});
```

- [ ] **Step 2: Rodar** — se PASS, só commitar o teste. Se o eixo não cruzar zero corretamente na inspeção visual (`pnpm dev` com dados mock), adicionar `<ReferenceLine y={0} />` no branch `bar` quando houver valores negativos.

- [ ] **Step 3: Commit** — `git commit -m "test(canvas): regressao para barras com valores negativos"`.

---

## Fase 2 — Dados & camada semântica Vila Rosa

### Task 8: Ingestão das bases auxiliares (Sheets → BigQuery `liquid_aux`)

**Files:**
- Create: `scripts/bq-load-aux-tables.ts`
- Modify: `package.json` (script `bq:load-aux`)

**Interfaces:**
- Consumes: CSVs em `docs/bases/vila-rosa/Google Sheets/`.
- Produces: tabelas `liquid_aux.ba_bancos` (ISPB STRING, nome_reduzido STRING, numero_codigo INT64 NULLABLE, participa_compe STRING, acesso_principal STRING, nome_extenso STRING, inicio_operacao DATE) e `liquid_aux.ba_pluggy_categorias` (idx INT64 NULL, id INT64 NULL, description STRING, description_translated STRING, parent_id INT64 NULL, parent_description STRING NULL, parent_description_translated STRING NULL). Usadas nas recipes das Tasks 11 (joins de transações).

- [ ] **Step 1: Escrever o script**

```ts
// scripts/bq-load-aux-tables.ts — carrega bases auxiliares compartilhadas (COMPE + taxonomia Pluggy).
// Uso: pnpm exec tsx scripts/bq-load-aux-tables.ts --project <PROJETO_GCP> [--apply]
import { BigQuery } from '@google-cloud/bigquery';
import { parse } from 'csv-parse/sync';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DATASET = 'liquid_aux';
const BASE = path.join('docs', 'bases', 'vila-rosa', 'Google Sheets');
const APPLY = process.argv.includes('--apply');
const project = process.argv[process.argv.indexOf('--project') + 1];
if (!project) throw new Error('use --project <PROJETO_GCP>');

function num(v: string): number | null {
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null; // 'n/a' → null
}
function dateBr(v: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v?.trim() ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

const bancosCsv = parse(readFileSync(path.join(BASE, 'Covenants - Bases Auxiliares - Bancos & Pluggy Transactions Category - BA - Bancos.csv')), { columns: true, skip_empty_lines: true });
const bancos = bancosCsv.map((r: Record<string, string>) => ({
  ispb: r['ISPB'], nome_reduzido: r['Nome_Reduzido'], numero_codigo: num(r['Número_Código']),
  participa_compe: r['Participa_da_Compe'], acesso_principal: r['Acesso_Principal'],
  nome_extenso: r['Nome_Extenso'], inicio_operacao: dateBr(r['Início_da_Operação']),
}));

const plugCsv = parse(readFileSync(path.join(BASE, 'Covenants - Bases Auxiliares - Bancos & Pluggy Transactions Category - BA - Pluggy - Transactions ID.csv')), { columns: true, skip_empty_lines: true });
const categorias = plugCsv.map((r: Record<string, string>) => ({
  idx: num(r['index']), id: num(r['id']), description: r['description'] || null,
  description_translated: r['descriptionTranslated'] || null, parent_id: num(r['parentId']),
  parent_description: r['parentDescription'] || null,
  parent_description_translated: r['parentDescriptionTranslated'] || null,
}));

async function main() {
  console.log(`bancos=${bancos.length} categorias=${categorias.length} → ${project}.${DATASET} ${APPLY ? '(APPLY)' : '(dry-run)'}`);
  if (!APPLY) return;
  const bq = new BigQuery({ projectId: project });
  const [ds] = await bq.dataset(DATASET).get({ autoCreate: true });
  for (const [name, rows] of [['ba_bancos', bancos], ['ba_pluggy_categorias', categorias]] as const) {
    const table = ds.table(name);
    const [exists] = await table.exists();
    if (exists) await table.delete();
    await ds.createTable(name, { schema: undefined }); // schema inferido no insert? Não: definir explícito abaixo.
    await table.insert(rows, { schema: undefined, raw: false });
    console.log(`  ✓ ${name} (${rows.length} linhas)`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
```
Ajuste obrigatório ao implementar: `createTable` com schema explícito (arrays `{name, type}` conforme a interface acima) em vez de inferência — o comentário no código marca o ponto. Se `csv-parse` não estiver nas deps, `pnpm add -D csv-parse`.

- [ ] **Step 2: Dry-run** — `pnpm exec tsx scripts/bq-load-aux-tables.ts --project <PROJETO_GCP>` → contagens 477/136.

- [ ] **Step 3: Apply + verificação**

```bash
pnpm exec tsx scripts/bq-load-aux-tables.ts --project <PROJETO_GCP> --apply
bq query --use_legacy_sql=false 'SELECT nome_reduzido FROM `<PROJETO_GCP>.liquid_aux.ba_bancos` WHERE numero_codigo = 77'
```
Expected: `BANCO INTER`.

- [ ] **Step 4: Commit** — adicionar script em `package.json` (`"bq:load-aux": "tsx scripts/bq-load-aux-tables.ts"`), `git add scripts/bq-load-aux-tables.ts package.json pnpm-lock.yaml && git commit -m "feat(bq): ingestao das bases auxiliares ba_bancos e ba_pluggy_categorias"`.

### Task 9: Estender o data contract `liquid-play-plus`

**Files:**
- Create: `scripts/seed-liquid-play-plus-v2-contract.mjs` (aditivo — NÃO editar `seed-liquid-play-contracts.mjs`, que documenta o estado v1)

**Interfaces:**
- Consumes: estrutura Firestore `dataContracts/{c}/entities/{e}/attributes/{a}` (mesmo formato do seed v1 — ver `scripts/seed-liquid-play-contracts.mjs:142-193`).
- Produces: no contrato `liquid-play-plus`: entidades novas `ficha_cadastral`, `mapa_de_vendas`, `evolucao_obra`, `evolucao_plano_empresario`, `transacoes` (se ainda não existir com todos os campos) e atributos novos em `covenants_calculo` (`vgv`, `total_de_unidades`, `total_m2`, `total_valor_vendido`, `valor_medio_m2`, `valor_estoque`) e `certidoes` (`data_validade`, `status`). Nomes de atributo = nomes de coluna dos schemas (`docs/bases/vila-rosa/BigQuery/*.json`), o que torna os `schemaBindings` identidade.

- [ ] **Step 1: Escrever o seed** seguindo byte a byte o padrão do v1 (mesmo init firebase-admin, PROJECT_ID `liquid-micro-apps`, DB `liquid-play-dataviz`, flags `--dry-run`/`--apply`). Conteúdo das entidades: copiar a lista integral de colunas de cada JSON de schema (MAPEAMENTO §2 dá as contagens: ficha_cadastral 16, mapa_de_vendas 15, evolucao_obra 11, evolucao_plano_empresario 5, transacoes 28). Cada atributo: `{ name, type: <'string'|'number'|'date'|'boolean'>, description }` mapeando `STRING→string`, `INT64/FLOAT64→number`, `DATE→date`, `BOOL→boolean`.

- [ ] **Step 2: Dry-run** — `pnpm exec tsx scripts/seed-liquid-play-plus-v2-contract.mjs --dry-run` → lista entidades/atributos a criar, zero updates destrutivos (somente `set(..., {merge:true})`).

- [ ] **Step 3: Apply + verificação** — rodar com `--apply`; verificar no Admin UI (`/admin?section=contracts` ou equivalente) ou via script de leitura que `liquid-play-plus` agora tem 8+ entidades. **Não remover** a entidade legada `evolucao` (Galli depende).

- [ ] **Step 4: Commit** — `git commit -m "feat(semantic): estende contrato liquid-play-plus (entidades vila rosa)"`.

### Task 10: Relations para métricas derived (joins)

**Files:**
- Create: `scripts/seed-covenants-v2-relations.mjs`

**Interfaces:**
- Consumes: coleção `relations` (formato usado por recipes `derived` — conferir schema em `src/shared/schemas/` e exemplos existentes na coleção antes de escrever).
- Produces: 3 relations: `fluxo_caixa↔contratos` por `id_contrato` (+ mesmo `data_base_report`); `contratos↔mapa_de_vendas` por `unidade` com cast (`CAST(contratos.unidade AS STRING) = mapa_de_vendas.unidade`); `transacoes↔ba_bancos` por `banco_codigo = numero_codigo` (aux em `liquid_aux`, cross-dataset). Consumidas pelas recipes da Task 11.

- [ ] **Step 1: Ler o schema real de `relations`** (grep `collection('relations')` em `src/`) e 1 doc existente (script de leitura ou console) — replicar o formato exato.

- [ ] **Step 2: Escrever seed** (mesmo padrão dry-run/apply). Para a relation com `liquid_aux`, a tabela referenciada precisa de qualificação por dataset — se o schema de relations não suporta dataset externo, registrar a limitação e mover o join do banco para SQL literal da recipe (Task 11) em vez de relation. Documentar a escolha no commit.

- [ ] **Step 3: Apply + commit** — `git commit -m "feat(semantic): relations covenants v2 (fluxo x contratos, contratos x mapa, transacoes x bancos)"`.

### Task 11: Métricas `covenants.*` v2 (catálogo)

**Files:**
- Create: `scripts/metrics/covenants-v2.mjs` (definições) + `scripts/seed-covenants-v2-metrics.mjs` (runner dry-run/apply, padrão `seed-galli-metrics.mjs`)

**Interfaces:**
- Consumes: contrato estendido (Task 9), relations (Task 10), aux tables (Task 8). Schema Zod `Metric` (`src/shared/schemas/metric.ts` — `ownerClientId: null`, recipes `aggregation|sql|derived`).
- Produces: métricas globais novas listadas abaixo (ids exatos), referenciadas pelos templates da Task 15 e pelo produto na Task 12. Convenções: KPI snapshot usa snapshot-pin (`WHERE data_base_report = (SELECT MAX(data_base_report) FROM <tabela>)`); saída de série = `bucket`(mês)/`value`; percentuais como razão 0–1; `UPPER(status_contrato)` em todo filtro de status.

**Inventário completo (id → recipe):**

| metricId | Entidade base | Recipe (resumo executável) |
|---|---|---|
| `covenants.indice_recebivel` | covenants_calculo | snapshot-pin, `ANY_VALUE(indice_recebivel)` |
| `covenants.indice_recebivel_estoque` | covenants_calculo | snapshot-pin, `ANY_VALUE(indice_recebivel_estoque)` |
| `covenants.certidoes_validas_pct` | certidoes | snapshot-pin, `SAFE_DIVIDE(COUNTIF(status='Válida'), COUNT(certidao))` |
| `covenants.certidoes_data_consulta` | certidoes | snapshot-pin, `MAX(data_consulta)` |
| `covenants.certidoes_table` | certidoes | snapshot-pin, rows `certidao_orgao, certidao, tipo, status` |
| `covenants.plano_empresario_valor` | ficha_cadastral | `ANY_VALUE(plano_empresario_valor)` (sem snapshot — dimensão) |
| `covenants.plano_empresario_contratado` | evolucao_plano_empresario | snapshot-pin, `ANY_VALUE(plano_empresario_contratado)` |
| `covenants.plano_empresario_divida` | evolucao_plano_empresario | snapshot-pin, `ANY_VALUE(plano_empresario_divida_atual)` |
| `covenants.plano_empresario_serie` | evolucao_plano_empresario | série: bucket=mês(data_base_report), contratado + divida_atual |
| `covenants.contratos_total` | contratos | snapshot-pin, `COUNT(DISTINCT id_contrato)` |
| `covenants.contratos_por_status` | contratos | snapshot-pin, groupBy `UPPER(status_contrato)` (KPIs Ativos/Quitados/Distratados leem rows) — alternativa: 3 métricas com filtro fixo, seguir o que o renderer de KPI exigir |
| `covenants.inadimplencia_pct` | contratos | snapshot-pin, `SAFE_DIVIDE(SUM(valor_atraso), SUM(saldo_devedor))` |
| `covenants.inadimplencia_serie` | contratos | série mensal da razão acima |
| `covenants.over90_pct` | contratos | snapshot-pin, `SAFE_DIVIDE(SUM(valor_over_90), SUM(saldo_devedor))` |
| `covenants.faixa_atraso_table` | contratos | snapshot-pin, groupBy `faixa_atraso_1` (não-nulo): CTD contratos, SUM saldo_devedor, SUM valor_atraso, razão inadimplência |
| `covenants.faixa_atraso2_contratos_serie` | contratos | série: bucket=mês, séries por `faixa_atraso_2`, CTD contratos (pág.10) |
| `covenants.faixa_atraso2_valor_serie` / `covenants.faixa_atraso2_saldo_serie` | contratos | idem com SUM valor_atraso / SUM saldo_devedor |
| `covenants.rating_serie` | contratos | série: bucket=mês, séries por `rating_liquid` (A–H), CTD (faixa≠nulo) |
| `covenants.score_histograma` | contratos | snapshot-pin, groupBy `faixa_score`, CTD |
| `covenants.recebiveis_pre_pos_snapshot` | fluxo_caixa | snapshot-pin, groupBy `tipo_recebivel`, SUM fluxo_contratado (donut). Id próprio: `covenants.recebiveis_pre_pos` (sem sufixo) é a série mensal do Galli — NÃO reutilizar |
| `covenants.recebiveis_por_inadimplencia` | derived fluxo×contratos | snapshot-pin, groupBy `tipo_recebivel` + `faixa_atraso_1`, SUM fluxo_contratado |
| `covenants.fluxo_projetado_table` / `covenants.fluxo_projetado_serie` | fluxo_caixa | snapshot-pin em data_base_report, groupBy mês(data_base_fluxo) futuro: SUM fluxo_esperado, SUM fluxo_contratado |
| `covenants.fluxo_por_faixa_serie` | derived fluxo×contratos | idem, séries por faixa_atraso_1, SUM fluxo_esperado |
| `covenants.unidades_vendidas_acum` / `covenants.velocidade_venda` | contratos | série por mês(data_emissao) — SEM filtro de período (histórico completo): CTD acumulado / CTD do mês |
| `covenants.vuv_serie` | covenants_calculo | série: vuv3_m2 + vuva_m2 por mês |
| `covenants.vuv3_m2`, `covenants.vuva_m2`, `covenants.vuv3_estoque`, `covenants.vuva_estoque` | covenants_calculo | snapshot-pin, ANY_VALUE de cada coluna |
| `covenants.obra_kpis` (ou 4 métricas: previsto_acum, realizado_acum, data_medicao, desvio_acum) | evolucao_obra | snapshot-pin + `MAX(data_medicao)` |
| `covenants.obra_serie` | evolucao_obra | série por mês(data_medicao): previsto_acumulado × realizado_acumulado |
| `covenants.obra_desvio_periodo_serie` / `covenants.obra_desvio_acum_serie` | evolucao_obra | série por medição |
| `covenants.empreendimento_kpis_*` (total_unidades, area_total_m2, vgv — de ficha_cadastral; permutas_qtde/m2/vgv e garantias_un/m2/vgv — de mapa_de_vendas com filtros permuta/pavimento; estoque/estoque_m2 — covenants_calculo; unidades_vendidas — contratos ATIVO+QUITADO; valor_vendido, saldo_devedor — contratos; previsao_entrega — ficha_cadastral; realizado_acum — evolucao_obra) | várias | 1 métrica por KPI, snapshot-pin onde a base é snapshot; filtros do MAPEAMENTO §4 |
| `covenants.mapa_vendas_table` | derived contratos×fluxo (relation Task 10) | snapshot-pin, filtro ATIVO, colunas da pág. 6 + SUM pré/pós-chaves por contrato |
| `covenants.transacoes_por_tipo_serie` | transacoes | série: bucket=mês(data), séries CREDIT/DEBIT (DEBIT negativo: `SUM(IF(tipo='DEBIT', -valor, valor))` por série) |
| `covenants.entradas_por_categoria` / `covenants.saidas_por_categoria` | transacoes (join aux pluggy) | groupBy `parent_description_translated`, SUM valor, filtro CREDIT/DEBIT |
| `covenants.extrato_resumido` | transacoes (join aux pluggy) | groupBy categoria macro, SUM valor com sinal (waterfall) |
| `covenants.recebimentos_periodo` | transacoes (join aux bancos) | filtro CREDIT, groupBy nome_reduzido + conta_codigo, SUM valor |
| `covenants.extrato_table` | transacoes (joins aux) | rows: data, banco (nome), descricao, categoria macro, tipo, pagador*, recebedor*, valor |

- [ ] **Step 1: Escrever 1 métrica de cada tipo primeiro** (aggregation com snapshot-pin; série; derived com relation; sql com join aux) e validar com dry-run do runner antes de escrever as demais. Exemplo completo do padrão sql+join (as demais seguem este molde):

```js
// scripts/metrics/covenants-v2.mjs (trecho)
export const metrics = [
  {
    id: 'covenants.entradas_por_categoria',
    name: 'Entradas por Categoria',
    description: 'Somatório de créditos bancários por categoria macro Pluggy no período.',
    ownerClientId: null,
    unit: 'currency',
    requires: ['liquid-play-plus.transacoes.valor', 'liquid-play-plus.transacoes.tipo', 'liquid-play-plus.transacoes.categoria', 'liquid-play-plus.transacoes.data'],
    recipe: {
      kind: 'sql',
      sql: `
        SELECT COALESCE(cat.parent_description_translated, t.{transacoes.categoria}) AS bucket,
               SUM(t.{transacoes.valor}) AS value
        FROM {transacoes} t
        LEFT JOIN \`<PROJETO_GCP>.liquid_aux.ba_pluggy_categorias\` cat
          ON t.{transacoes.categoria} = cat.description
        WHERE t.{transacoes.tipo} = 'CREDIT' AND {filter.date_range:transacoes.data}
        GROUP BY 1 ORDER BY value DESC`,
    },
  },
];
```
(Confirmar a sintaxe exata de placeholders contra `src/shared/lib/metrics/resolve-metric.ts:374-440` antes de replicar — `{entity.attr}`, `{entity}`, `{filter.X:entity.attr}`.)

- [ ] **Step 2: Runner com validação Zod** (`seed-covenants-v2-metrics.mjs`, molde `seed-galli-metrics.mjs`): valida cada métrica com o schema `Metric` importado, dry-run lista, apply grava com merge.

- [ ] **Step 3: Dry-run** → todas validam. **Step 4: Apply.**

- [ ] **Step 5: Smoke de execução** — com o cliente da Task 12 já criado OU usando o Galli como cobaia para métricas compatíveis: `POST /api/metrics/covenants.inadimplencia_pct/data` via UI dev; conferir SQL logado e valor plausível.

- [ ] **Step 6: Commit** — `git commit -m "feat(metrics): catalogo covenants.* v2 (~35 metricas)"`.

### Task 12: Produto, cliente `vila-rosa`, acesso e gating

**Files:**
- Create: `scripts/seed-vila-rosa-client.mjs`
- Modify: `src/shared/lib/permissions/metric-route-map.ts:15-74`

**Interfaces:**
- Consumes: métricas Task 11; datasets confirmados Task 0.
- Produces: `products/liquid-play-plus.metricRefs += covenants.* novas` (retificado: ver spec §3.2 — products/covenants é outro domínio); doc `clients/vila-rosa` com `productBindings` (liquid-play → `vila_rosa_monitor`; liquid-play-plus → `vila_rosa_covenants`, espelhando o Galli), `schemaBindings` identidade (atributo = coluna) + `tableBindings` para nomes de tabela físicos; usuários liberados; métricas mapeadas a rotas.

- [ ] **Step 1: Seed do cliente** (molde `seed-liquid-play-contracts.mjs:263-268,419-459` do Galli):

```js
const client = {
  name: 'Vila Rosa', initial: 'V', color: '#E85D2C',
  productBindings: [
    { productId: 'credit', datasets: [{ dataSourceId: 'bq-data-wh', datasetId: 'vila_rosa_monitor', contractRef: 'canonical', isPrimary: true, schemaBindings: IDENTITY_MONITOR, tableBindings: { contratos: 'contratos', fluxo_caixa: 'fluxo_caixa' } }] },
    { productId: 'covenants', datasets: [{ dataSourceId: 'bq-data-wh', datasetId: 'vila_rosa_covenants', contractRef: 'canonical', isPrimary: true, schemaBindings: IDENTITY_COVENANTS, tableBindings: { covenants_calculo: 'covenants_calculo', certidoes: 'certidoes', ficha_cadastral: 'ficha_cadastral', mapa_de_vendas: 'mapa_de_vendas', evolucao_obra: 'evolucao_obra', evolucao_plano_empresario: 'evolucao_plano_empresario', transacoes: 'transacoes' } }] },
  ],
};
```
`IDENTITY_*` = gerados no script a partir das listas de colunas (mesmas dos JSONs de schema): `{ 'entidade.coluna': 'coluna' }`. `dataSourceId` real = o existente no Firestore `dataSources` (conferir; Galli usa `bq-data-wh`). Validar com `ClientDoc` Zod antes de gravar. Rodar `--dry-run` → `--apply`.

- [ ] **Step 2: Atualizar produto** — no mesmo seed: `products/liquid-play-plus` merge de `metricRefs` (retificado) com os ids da Task 11 (sem remover os existentes do Galli).

- [ ] **Step 3: Acesso de usuários** — via Admin UI (`/admin?section=users`): adicionar `clientAccess: {clientId:'vila-rosa'}` aos usuários de teste. (Alternativa scriptada aceitável.)

- [ ] **Step 4: Gating de rota** — adicionar em `metric-route-map.ts` as métricas novas → rota `/g` (reports dinâmicos) conforme o padrão vigente do arquivo para métricas de covenants do Galli (copiar o mapeamento usado pelas `covenants.*` v1).

- [ ] **Step 5: Verificação** — `pnpm dev`, logar como admin: Vila Rosa aparece no ClientSwitcher; `DataProvider` carrega filter-options (Task 1) sem 403; nenhuma página quebra.

- [ ] **Step 6: Commit** — `git commit -m "feat(tenant): cadastra cliente vila-rosa (bindings credit + covenants)"`.

---

## Fase 3 — Templates Covenants v2 + validação

### Task 13: Seeds dos 13 templates `covenants-v2-*`

**Files:**
- Create: `scripts/templates/covenants-v2-visao-executiva.template.mjs` (+ 12 irmãos, 1 por página)
- Modify: `scripts/seed-play-templates.ts:17-39` (imports + array `TEMPLATES`)

**Interfaces:**
- Consumes: metricIds da Task 11; extensões do canvas das Tasks 2-5 (`layout: 'horizontal'`, `chartType: 'waterfall'`, `format: 'status-badge'`, `metricPageFilters` com `control: 'dropdown'`); helpers `kpi/chart/table/row` (copiar o padrão de `scripts/templates/inadimplencia.template.mjs:13-44`).
- Produces: docs `dashboardTemplates/covenants-v2-*` com `category: 'Covenants'`, `productRefs: ['liquid-play-plus']` (retificado: ver spec §3.2), `status: 'active'`.

**Lista dos 13 templates (id → conteúdo, blocos por página conforme MAPEAMENTO §6):**

1. `covenants-v2-visao-executiva` (pág. 2) — exemplo completo abaixo.
2. `covenants-v2-empreendimento` (pág. 3) — 2 grades de KPIs (`kpis` items) + bloco `text` com a nota do saldo devedor.
3. `covenants-v2-unidades` (pág. 4) — 4 KPIs VUV + `text` explicativo + chart line dupla (`covenants.unidades_vendidas_acum`+`velocidade_venda`) + chart bar `covenants.vuv_serie`.
4. `covenants-v2-evolucao-obra` (pág. 5) — 4 KPIs + **gauge** de desvio acumulado (threshold a confirmar) + line previsto×realizado + 2 bars de desvio.
5. `covenants-v2-mapa-vendas` (pág. 6) — tabela única `covenants.mapa_vendas_table` (rating com `format: 'status-badge'` + statusMap A–H) + footerAggregations sum nos recebíveis.
6. `covenants-v2-recebiveis` (pág. 7) — donut + 2 KPIs + stacked-bar por faixa + tabela pivot (groupBy composto).
7. `covenants-v2-plano-empresario` (pág. 8) — 2 KPIs + **gauge** dívida/limite + bar série contratado×dívida.
8. `covenants-v2-perfil-carteira` (pág. 9) — stacked-bar expand rating (séries A–H) + bar histograma score.
9. `covenants-v2-inadimplencia` (pág. 10) — 2 KPIs (+gauges com threshold a confirmar) + stacked-bar **horizontal** expand (faixa_atraso_2) + 2 stacked-bar expand (valor, saldo).
10. `covenants-v2-fluxo-caixa` (pág. 11) — tabela mensal + composed (bar esperado + line contratado) + stacked-bar por faixa.
11. `covenants-v2-entradas-saidas` (pág. 12) — dropdowns (Banco, Categoria) via `filters.metricPageFilters` + bar ± mensal + 2 bars por categoria (títulos corretos: "Entradas"/"Saídas") + `text` drill-through p/ extrato.
12. `covenants-v2-certidoes` (pág. 13) — KPI Data Consulta + KPI/gauge % válidas + tabela com `status-badge`.
13. `covenants-v2-extrato-detalhado` (pág. 14) — dropdowns (Banco, Categoria, Tipo) + tabela full `covenants.extrato_table` com footer sum.

- [ ] **Step 1: Escrever o template exemplo completo** (`covenants-v2-visao-executiva`):

```js
// scripts/templates/covenants-v2-visao-executiva.template.mjs
// Página 2 do Looker Vila Rosa (visão executiva) + melhorias v2 (gauges de enquadramento).
// Helpers idênticos aos de inadimplencia.template.mjs (kpi/chart/table/row) — copiar.

const blockMap = {
  'gauge-indice-recebivel': {
    id: 'gauge-indice-recebivel', type: 'gauge', title: 'Índice Recebível',
    value: 0, threshold: 1.2, warnThreshold: 1.5, suffix: 'x', decimals: 2,
    metricId: 'covenants.indice_recebivel', colSpan: 2,
    // THRESHOLD A CONFIRMAR com o contrato do Inter (spec §9.2)
  },
  'gauge-pos-chaves-estoque': {
    id: 'gauge-pos-chaves-estoque', type: 'gauge', title: 'Pós-chaves + Estoque',
    value: 0, threshold: 1.2, warnThreshold: 1.5, suffix: 'x', decimals: 2,
    metricId: 'covenants.indice_recebivel_estoque', colSpan: 2,
  },
  'gauge-certidoes': {
    id: 'gauge-certidoes', type: 'gauge', title: 'Certidões Válidas',
    value: 0, threshold: 80, warnThreshold: 90, suffix: '%', decimals: 1,
    metricId: 'covenants.certidoes_validas_pct', colSpan: 2,
  },
  'chart-saldo-pe': chart('chart-saldo-pe', 'Saldo Devedor (Plano Empresário)', 'line', ['value'], 'bucket', 3, 'covenants.plano_empresario_serie'),
  'chart-inadimplencia': chart('chart-inadimplencia', 'Inadimplência', 'line', ['value'], 'bucket', 3, 'covenants.inadimplencia_serie'),
  'kpi-pe-valor': kpi('kpi-pe-valor', 'Plano Empresário Valor', 'Limite contratado com o banco', { metricId: 'covenants.plano_empresario_valor', format: 'currency', colSpan: 2 }),
  'kpi-pe-contratado': kpi('kpi-pe-contratado', 'Plano Empresário Contratado', 'Valor já contratado', { metricId: 'covenants.plano_empresario_contratado', format: 'currency', colSpan: 2 }),
  'kpi-pe-divida': kpi('kpi-pe-divida', 'Dívida Atual', 'Saldo devedor do plano empresário', { metricId: 'covenants.plano_empresario_divida', format: 'currency', colSpan: 2, positiveIsGood: false }),
  'kpi-contratos-total': kpi('kpi-contratos-total', 'Contratos Comercializados', 'Total histórico', { metricId: 'covenants.contratos_total', format: 'number', colSpan: 2 }),
  'kpi-contratos-ativos': kpi('kpi-contratos-ativos', 'Contratos Ativos', '', { metricId: 'covenants.contratos_ativos', format: 'number', colSpan: 2 }),
  'kpi-contratos-quitados': kpi('kpi-contratos-quitados', 'Contratos Quitados', '', { metricId: 'covenants.contratos_quitados', format: 'number', colSpan: 1 }),
  'kpi-contratos-distratados': kpi('kpi-contratos-distratados', 'Contratos Distratados', '', { metricId: 'covenants.contratos_distratados', format: 'number', colSpan: 1, positiveIsGood: false }),
  'donut-recebiveis': {
    id: 'donut-recebiveis', type: 'donut', title: 'Total de Recebíveis',
    slices: [], format: 'currency', showLegendCards: true,
    metricId: 'covenants.recebiveis_pre_pos_snapshot', colSpan: 2,
  },
  'text-nota-recebiveis': { id: 'text-nota-recebiveis', type: 'text', colSpan: 2, content: '_O Total de Recebíveis considera apenas os valores com vencimento futuro, excluindo os valores em atraso e as correções._' },
  'table-faixa-atraso': table('table-faixa-atraso', 'Faixa de Atraso', [
    { header: 'Faixa Atraso', accessorKey: 'faixa_atraso' },
    { header: 'Contratos', accessorKey: 'contratos', format: 'number' },
    { header: 'Saldo Devedor', accessorKey: 'saldo_devedor', format: 'currency' },
    { header: 'Valor Atraso', accessorKey: 'valor_atraso', format: 'currency' },
    { header: 'Inadimplência %', accessorKey: 'inadimplencia_pct', format: 'percent' },
  ], 4, 'covenants.faixa_atraso_table', { footerAggregations: { faixa_atraso: 'Total geral', contratos: 'sum', saldo_devedor: 'sum', valor_atraso: 'sum' } }),
  'table-recebimentos': table('table-recebimentos', 'Recebimentos no Período', [
    { header: 'Banco', accessorKey: 'nome_reduzido' },
    { header: 'Conta', accessorKey: 'conta' },
    { header: 'Valor', accessorKey: 'value', format: 'currency' },
  ], 2, 'covenants.recebimentos_periodo'),
  'chart-extrato-resumido': chart('chart-extrato-resumido', 'Extrato Resumido', 'waterfall', ['value'], 'bucket', 2, 'covenants.extrato_resumido'),
  'chart-entradas-saidas': chart('chart-entradas-saidas', 'Entradas & Saídas', 'bar', ['credit', 'debit'], 'bucket', 2, 'covenants.transacoes_por_tipo_serie'),
};

const layout = [
  row('row-gauges', ['gauge-indice-recebivel', 'gauge-pos-chaves-estoque', 'gauge-certidoes']),
  row('row-series', ['chart-saldo-pe', 'chart-inadimplencia']),
  row('row-pe', ['kpi-pe-valor', 'kpi-pe-contratado', 'kpi-pe-divida']),
  row('row-status', ['kpi-contratos-total', 'kpi-contratos-ativos', 'kpi-contratos-quitados', 'kpi-contratos-distratados']),
  row('row-recebiveis', ['donut-recebiveis', 'text-nota-recebiveis', 'table-faixa-atraso']),
  row('row-extrato', ['table-recebimentos', 'chart-extrato-resumido', 'chart-entradas-saidas']),
];

export default {
  id: 'covenants-v2-visao-executiva',
  productRefs: ['liquid-play-plus'],
  name: 'Covenants — Visão Executiva',
  description: 'Visão executiva dos covenants (índices, plano empresário, inadimplência, recebíveis e extrato) com status de enquadramento',
  category: 'Covenants',
  blockMap, layout,
  filters: {
    metricPageFilters: {
      snapshot: { kind: 'snapshot', attribute: 'covenants_calculo.data_base_report' },
      date_range: { kind: 'date_range', attribute: 'covenants_calculo.data_base_report' },
    },
  },
  metricRefs: [/* todos os metricIds citados nos blocos acima */],
};
```
Nota: se `covenants.contratos_por_status` (groupBy) for a escolha da Task 11 em vez de 3 métricas com filtro, ajustar os 3 KPIs para o formato que o renderer suporta — decisão registrada na Task 11 vale aqui.

- [ ] **Step 2: Escrever os outros 12** seguindo o inventário acima + MAPEAMENTO §6 (blocos, colunas, notas de rodapé em blocos `text`, títulos corrigidos).

- [ ] **Step 3: Registrar no seed** — adicionar os 13 imports e entradas no array `TEMPLATES` de `scripts/seed-play-templates.ts`.

- [ ] **Step 4: Dry-run** — `pnpm exec tsx scripts/seed-play-templates.ts --dry-run` → 23 templates validam (10 v1 + 13 novos), zero erro Zod.

- [ ] **Step 5: Apply** — `pnpm exec tsx scripts/seed-play-templates.ts --apply`.

- [ ] **Step 6: Commit** — `git add scripts/templates/ scripts/seed-play-templates.ts && git commit -m "feat(templates): covenants v2 (13 paginas, categoria Covenants)"`.

### Task 14: Grupo + reports do Vila Rosa

**Files:**
- Create: `scripts/seed-vila-rosa-reports.mjs` (ou usar a UI: TemplateGallery importa 1 a 1)

**Interfaces:**
- Consumes: templates Task 13; estrutura `clients/vila-rosa/groups/{g}/reports/{r}` (`src/shared/lib/firestore/reports.ts:4-21` — copiar `blockMap/layout/filters/metricRefs/templateId/productRefs` como `createReport` faz em `reports.ts:75-107`).
- Produces: grupo `Covenants` com 13 reports na ordem do Looker (order 1-13, nomes das páginas do MAPEAMENTO §1).

- [ ] **Step 1: Seed** — dry-run/apply; deep-copy de cada template (mesmo comportamento de `TemplateGallery.handleImport`, `src/widgets/nav-sidebar/ui/TemplateGallery.tsx:157-176`).
- [ ] **Step 2: Apply + verificação** — `pnpm dev`, cliente Vila Rosa: sidebar mostra grupo Covenants com 13 páginas; cada uma renderiza sem erro de console.
- [ ] **Step 3: Commit** — `git commit -m "feat(tenant): grupo covenants com 13 reports para vila-rosa"`.

### Task 15: Validação numérica contra o Looker (aceite)

**Files:**
- Create: `docs/bases/vila-rosa/VALIDACAO.md` (checklist preenchido)

**Interfaces:**
- Consumes: valores de referência de mai/2026 no MAPEAMENTO §6.

- [ ] **Step 1: Percorrer as 13 páginas** com período = mai/2026 e conferir cada valor de referência (ex.: Índice Recebível 12,06; Certidões 83,33%; Contratos Ativos 158; Recebíveis Pós 70.746.923,26; Inadimplência 0,66%; Fluxo dez/2026 esperado 1.309.037,84; total extrato 152.415,39; etc.). Registrar OK/divergência por widget em `VALIDACAO.md`.
- [ ] **Step 2: Investigar divergências** — causas prováveis: snapshot-pin ausente, filtro `faixa_atraso` nulo, caixa de `status_contrato`, semântica de `projeto` (MAPEAMENTO §2.1), join de unidade sem cast. Corrigir recipe → re-seed → re-validar.
- [ ] **Step 3: Commit** — `git add docs/bases/vila-rosa/VALIDACAO.md && git commit -m "docs(vila-rosa): validacao numerica vs looker mai/2026"`.

### Task 16 (opcional, recomendado): Perfil de IA do cliente

**Files:**
- Create: `src/shared/config/business-context/clients/vila-rosa.json`
- Modify: `src/shared/config/business-context/schemas.ts:3-5` (adicionar `'VILA-ROSA'` ao enum) e `index.ts:10-13,35-40` (import/registro)

- [ ] **Step 1:** Escrever o perfil (resumo do negócio: covenant de financiamento à produção, Banco Inter, SPE, covenants monitorados — reusar o §1 do MAPEAMENTO) seguindo o formato dos 4 JSONs existentes na pasta.
- [ ] **Step 2:** `pnpm exec vitest run src/shared/config/business-context` (se houver testes) + smoke no chat da IA com cliente Vila Rosa ativo.
- [ ] **Step 3:** Commit — `git commit -m "feat(ai): business-context do cliente vila-rosa"`.

---

## Fora do plano (registrado na spec §5/§9)

- G7 thresholds por cliente (coleção `covenantThresholds`) — evolução futura; thresholds atuais estáticos nos templates com marcador "A CONFIRMAR".
- G8 pivot real 2D em tabela — contornado com groupBy composto.
- BQML/evals para vila-rosa; migração do Galli para entidades split; ingestão Pluggy (fora do repo); páginas mock `covenants/configuracao/*`.
