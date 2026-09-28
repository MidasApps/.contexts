# Admin — Gerenciamento de Dashboard Templates

**Date:** 2026-06-15
**Status:** Draft
**Relacionado:** ADR-0013 (Firestore storage), ADR-0015 (Semantic Layer — Data Contract + Metric Catalog), spec `2026-05-11-semantic-layer-design.md`, plan `2026-04-14-phase4-templates.md`

## Goal

Transformar os **Dashboard Templates** — hoje hardcoded em `src/shared/config/dashboard-templates.ts` e consumidos apenas pela `TemplateGallery` — em entidades gerenciáveis pelo Admin Panel, com **CRUD completo + editor visual**. O admin passa a criar, editar (metadados e composição de blocos/layout), duplicar e excluir templates em runtime, sem deploy de código.

Inclui um ajuste de nomenclatura: a aba **`Data Metrics`** passa a se chamar **`Metrics Contracts`**.

## Problem

Os templates de dashboard são a porta de entrada para gerar relatórios: em *Importar template* (dropdown do `AppBar`, aberto via `TemplateGallery`) o usuário escolhe um template — cada um com seus indicadores (KPIs/gráficos/tabelas) e um layout — e ao importar gera um Report (uma página) naquele grupo.

Hoje esses templates:

1. **Vivem só em código** (`DASHBOARD_TEMPLATES: DashboardTemplate[]`). Criar/editar exige PR + deploy.
2. **Não aparecem no Admin Panel.** O admin gerencia Data Contracts, Data Metrics, Data Sources, Ingestion, Products, Clients, Groups, Users — mas não os templates que empacotam métricas em páginas prontas.
3. São consumidos por um único ponto em runtime (`TemplateGallery`), além do seed `scripts/seed-galli-templates.ts`.

Consequência: a camada que o usuário final mais toca (os dashboards prontos) é a única sem superfície de gestão. O pedido é trazê-la para a administração.

## Conceitos (para evitar ambiguidade)

| Conceito | O que é | Storage hoje | Storage após esta spec |
|---|---|---|---|
| **Data Metric** | Definição atômica de 1 indicador (`metrics/{id}`, com `requires[]` → atributos do contract) | Firestore (global) | — (inalterado) |
| **Product** | Empacotamento comercial (metricRefs + rotas) | Firestore (global) | — (inalterado) |
| **Dashboard Template** | 1 página pronta = `blockMap` (indicadores) + `layout` + metadados | **Código** | **Firestore (global)** |
| **Report** | Dashboard gerado por cliente/grupo (import de template ou IA) | Firestore (por cliente/grupo) | — (inalterado) |

Esta spec mexe **apenas** na linha *Dashboard Template* e no label da aba de métricas.

## Modelo proposto

```
Código (dashboard-templates.ts)      →  fonte de TIPOS + seed (não lido em runtime)
Firestore  dashboardTemplates/{id}   →  fonte canônica em runtime (NOVO)
  ├── Admin Tab "Dashboard Templates" →  CRUD de metadados + lista
  ├── Rota /admin/templates/[id]      →  editor visual (reusa CanvasPanel)
  └── TemplateGallery                 →  lê do Firestore via useTemplates()
```

## Data Model

### Coleção Firestore

Global (templates são produto, não por-cliente — mesma decisão de `metrics/`):

```
dashboardTemplates/{templateId}   (doc, top-level)
```

`templateId` = o `id` atual do template (`"visao-geral"`, `"pdd"`, `"sumario-executivo-sbpe"`, …). Slug estável usado como doc id.

### Schema Zod — `src/shared/schemas/dashboard-template.ts`

Espelha o `DashboardTemplate` atual (`src/shared/config/dashboard-templates.ts`), adicionando `status` e timestamps no padrão das outras coleções. `blockMap` e `layout` são persistidos como JSON livre (validação estrutural fica no canvas / nos tipos de `@/shared/config/agents/types`), evitando reescrever os schemas de bloco em Zod.

```typescript
import { z } from 'zod';

export const TemplateId = z.string().regex(/^[a-z][a-z0-9-]*$/, {
  message: 'TemplateId deve ser kebab-case (ex: "visao-geral")',
});

export const TemplateProduct = z.enum(['play', 'play-plus']);
export const TemplateSegment = z.enum(['sbpe', 'mcmv', 'both']);
export const TemplateCategory = z.enum(['Carteira', 'Risco', 'Operacional', 'Covenants']);
export const TemplateStatus = z.enum(['active', 'draft', 'archived']);

export const DashboardTemplateDoc = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500),
  category: TemplateCategory,
  product: TemplateProduct,
  segment: TemplateSegment.optional(),
  /** Composição visual — formato CanvasBlock / CanvasRow (JSON livre). */
  blockMap: z.record(z.string(), z.unknown()).default({}),
  layout: z.array(z.unknown()).default([]),
  /** Filtros de página persistidos ao importar (CanvasPageFilters). */
  filters: z.record(z.string(), z.unknown()).optional(),
  /** Legacy TemplateQueryConfig — mantido para back-compat. */
  queries: z.array(z.unknown()).optional(),
  /** IDs de métricas cobertas (metrics/). */
  metricRefs: z.array(z.string()).default([]),
  status: TemplateStatus.default('active'),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});

export const DashboardTemplate = DashboardTemplateDoc.extend({ id: TemplateId });

export type DashboardTemplateDoc = z.infer<typeof DashboardTemplateDoc>;
export type DashboardTemplate = z.infer<typeof DashboardTemplate>;
```

Exportado no barrel `src/shared/schemas/index.ts`.

> **Nota de tipos:** o tipo `DashboardTemplate` "rico" (com `blockMap: Record<string, CanvasBlock>` e `layout: CanvasRow[]`) continua vivendo em `src/shared/config/dashboard-templates.ts`, que permanece como fonte de tipos para a UI e como dataset de seed. O schema Zod acima é a fronteira de persistência/validação na API. Os dois coexistem: o Zod valida o doc na borda; a UI continua usando os tipos ricos do canvas.

## API — `app/api/dashboard-templates/route.ts`

Espelha `app/api/metrics/route.ts` e `app/api/reports/route.ts`. Auth via `verifyAuthToken` (admin-gated no nível de rota de UI; a API exige token válido).

- **`GET`** — `?id=<templateId>` retorna 1 template; sem `id` lista todos. Ordenação por `category`/`name` é aplicada no client (hook), evitando índice composto no Firestore. Usado tanto pelo admin quanto pela `TemplateGallery`.
- **`POST`** — cria ou faz upsert (doc id = `body.id`). Valida com `DashboardTemplateDoc`. Suporta `action: 'duplicate'` (copia doc com novo id `"<id>-copia"` + `name "<name> (cópia)"`).
- **`PATCH`** — update parcial (usado pelo editor para salvar só `blockMap`/`layout`/`filters`, e pelo form para salvar metadados). Seta `updatedAt`.
- **`DELETE`** — `?id=<templateId>` remove o doc (hard delete). `status: 'archived'` cobre o soft-hide.

Coleção: `getDb().collection('dashboardTemplates')`.

## Camada de acesso e hooks

- **`src/shared/lib/firestore/dashboard-templates.ts`** — funções `fetchTemplates()`, `getTemplate(id)`, `createTemplate()`, `updateTemplate()`, `deleteTemplate()`, `duplicateTemplate()` (espelha `reports.ts`; resolve token via Firebase auth / external token).
- **`useAdminTemplates()`** (`src/features/admin/model/useAdminTemplates.ts`) — `{ templates, loading, error, save, remove, duplicate, refetch }`, espelhando `useAdminMetrics`.
- **`useTemplates()`** (`src/shared/hooks/useTemplates.ts`) — read-only para a `TemplateGallery`. Retorna `{ templates, loading }`. Cache em memória no padrão dos hooks existentes.

## UI do Admin

### Nova aba "Dashboard Templates"

Em `src/features/admin/ui/AdminPage.tsx`, adicionar à lista `TABS`:

```ts
{ id: 'templates', label: 'Dashboard Templates', group: 'commercial' },
```

Posicionada no grupo **commercial**, ao lado de `Products` (ambos são camada de empacotamento/consumo). Renderiza `<TemplatesTab />`.

### `TemplatesTab.tsx`

Espelha `MetricsTab` / `ProductsTab`:

- Header: contagem + botão **"Novo template"** (abre `TemplateForm` em modo create).
- Busca por nome/id.
- Tabela com colunas: ícone, **Nome / id**, **Produto + Segmento** (tags reusando `PRODUCT_META`/`SEGMENT_META`), **Blocos** (`Object.keys(blockMap).length`), **Métricas** (`metricRefs.length`), **Status**, **Ações**.
- Ações por linha: **Editar metadados** (abre `TemplateForm`) · **Abrir editor** (navega para `/admin/templates/[id]`) · **Duplicar** · **Excluir** (`ConfirmDialog` destrutivo, avisando que a galeria deixa de oferecê-lo).

### `TemplateForm.tsx` (dialog — só metadados)

Campos: `name`, `description`, `category` (select), `product` (select), `segment` (select, opcional), `status`, e `metricRefs` **reusando o `MetricRefsPicker` existente**. **Não** edita `blockMap`/`layout` — isso é função do editor visual. No create, gera `id` a partir do nome (kebab-case) com `blockMap`/`layout` vazios; em seguida o admin abre o editor para compor.

### Rota do editor — `app/(admin)/admin/templates/[id]/page.tsx`

Página client-side dentro do `(admin)` layout (já auth-gated por `isAdminEmail`). Reaproveita o fluxo de edição do `ReportPage`:

1. `getTemplate(id)` → monta um `CanvasPage` (`{ id, title: name, blockMap, layout, filters }`) e chama `loadPages([page])` no `canvas-store`.
2. Renderiza um header próprio (título do template + botões **Salvar** / **Cancelar**, espelhando o uso do `AppBar editable` no `ReportPage`) e `<CanvasPanel />`.
3. **Salvar** → lê `useCanvasStore.getState().pages[0]`, deriva `metricRefs` dos blocos (ver abaixo) e faz `PATCH` em `/api/dashboard-templates` com `blockMap`/`layout`/`filters`/`metricRefs`. **Cancelar** → confirma descarte se houver mudanças (reusa o padrão de `ConfirmDialog`/diff do `ReportPage`).
4. Ao sair, `loadPages([])` + reset do canvas.

**Modo autoria do canvas (descoberta de planejamento — substitui o "modo estrutura" da v1 desta spec).** O `CanvasPanel` sem IA só faz **layout** (mover/redimensionar/excluir blocos existentes); `addBlock`/`updateBlockContent`-de-conteúdo são disparados **apenas pela IA** (`AISidebar`/`ConversationSidebar`). Para um autorador de templates sem IA, o `CanvasPanel` ganha uma prop opt-in **`authoring`** que adiciona:

- **`BlockPalette`** — botões para inserir blocos vazios (KPI/gráfico/tabela/texto) via `addBlock(activePage, makeEmptyBlock(type))`.
- **Edição inline** — cada `BlockCard` ganha um botão de editar que abre o **`BlockInspector`**, um painel por-tipo que altera os campos do bloco (label/título, `metricId`, colSpan; chart: `chartType`/`dataKeys`/`xAxisKey`; table: `columns[]`; text: `content`) via `updateBlockContent`.
- Oculta `GlobalFilters` e o banner `filtersStale` (templates não têm cliente/dados).

`makeEmptyBlock(type)` e `deriveMetricRefs(blockMap)` (extrai os `metricId` únicos dos blocos) ficam num util novo `src/shared/config/agents/template-blocks.ts`. Sem `authoring` (default `false`), o `CanvasPanel` mantém exatamente o comportamento atual.

## Rewiring da `TemplateGallery`

`src/widgets/nav-sidebar/ui/TemplateGallery.tsx` deixa de importar `DASHBOARD_TEMPLATES` e passa a consumir `useTemplates()`:

- `filteredTemplates` filtra sobre os templates do Firestore (mesma lógica de produto/segmento).
- `TEMPLATE_CATEGORIES` continua vindo do código (lista canônica de categorias).
- Estado de loading enquanto busca; fallback visual se a lista vier vazia.
- O fluxo de import (`handleImport` → `create(...)` → cria Report → navega) **não muda**.

`AppBar.tsx` e `NewReportModal.tsx` (que apenas montam `TemplateGallery`) não mudam.

## Rename `Data Metrics` → `Metrics Contracts`

- `src/features/admin/ui/AdminPage.tsx`: label da tab `{ id: 'metrics', label: 'Metrics Contracts', group: 'semantic' }` e o comentário de ordem das tabs.
- Ajustar textos visíveis que digam "Data Metrics" relacionados a essa aba. **Sem** renomear a coleção Firestore `metrics/`, o id da tab (`'metrics'`), arquivos, hooks ou schemas — é troca de label apenas.

## Migração / Seed

- **`scripts/seed-dashboard-templates.ts`** — lê `DASHBOARD_TEMPLATES` do código e faz upsert idempotente em `dashboardTemplates/{id}` (por `id`), preenchendo `status: 'active'` + timestamps. Reexecutável sem duplicar.
- `dashboard-templates.ts` **permanece** no repo: fonte de tipos + dataset de seed. O array deixa de ser lido em runtime (só `TEMPLATE_CATEGORIES` e os tipos continuam importados).
- `scripts/seed-galli-templates.ts` (que cria Reports a partir dos templates) continua válido — pode ser ajustado depois para ler do Firestore, mas não é parte desta spec.

## Riscos e mitigação

1. **`CanvasPanel` é layout-only sem IA + embute `GlobalFilters`.** Confirmado na fase de plano: adicionar/editar conteúdo de blocos depende da IA. **Mitigação:** prop opt-in `authoring` que injeta `BlockPalette` + `BlockInspector` + esconde `GlobalFilters`/`filtersStale` (ver §Modo autoria). Mudança guardada por flag com default `false` → zero regressão no editor de reports. **É o maior risco/esforço da spec** e o motivo de o editor ser sua própria fase no plano.
2. **Blocos sem dados** renderizam vazios (`value: '—'`, `data: []`) — comportamento já existente no canvas; aceitável para edição estrutural.
3. **Drift entre código e Firestore** após a migração: o array do código vira histórico. Mitigação: o seed é a ponte; documentar que a fonte canônica passou a ser o Firestore.
4. **Templates referenciados por id** (ex.: seeds, `business-context/select-template`). Buscar usos de ids de template antes de permitir edição de `id` no admin; no MVP, **`id` é imutável após criação** (só `name`/metadados editáveis), evitando quebrar referências.

## Fronteiras / YAGNI

- **Template = 1 página.** Não introduzir templates multi-página.
- **`metricRefs` é derivado** dos `metricId` dos blocos no save (`deriveMetricRefs`) — sem editor manual. Descarta o `MetricRefsPicker` (faz gating por entity, não encaixa em template). Single source of truth = os blocos.
- `BlockInspector` cobre os 4 tipos do palette (kpi/chart/table/text). Blocos `gauge`/`donut`/`kpis` pré-existentes (templates Play+) permanecem editáveis em **layout** (mover/redimensionar/excluir), sem editor de conteúdo dedicado nesta fase.
- Não mexer em Products, Reports seedados, ou no runtime de IA.
- Sem versionamento/histórico de templates (status `active|draft|archived` cobre o necessário).
- Sem permissões granulares além do gate `isAdminEmail` já existente.
- Rename é só de label — nenhuma renomeação de coleção/id/arquivo.

## Testing

- **Schema:** `dashboard-template.test.ts` — valida `DashboardTemplateDoc` (campos obrigatórios, enums, defaults).
- **API:** testes de rota espelhando `app/api/admin/sql-catalog/__tests__/*` (GET lista/single, POST create+duplicate, PATCH parcial, DELETE), mockando `getDb` + `verifyAuthToken`.
- **Util:** `template-blocks.test.ts` — `makeEmptyBlock` (1 caso por tipo) e `deriveMetricRefs` (únicos + ignora blocos sem `metricId`).
- **Componentes (happy-dom + testing-library):** `BlockInspector` (edita cada tipo → dispara `onChange`), `BlockPalette` (clique → `onAdd(type)`), `TemplateForm` (submit → `onSave`), `TemplatesTab` (lista linhas + ações). Componentes apresentacionais recebem props/callbacks (padrão `CatalogTable.test.tsx`).
- **Smoke manual:** seed → abrir admin → criar template → editor (add/editar/remover bloco) → salvar → abrir galeria → importar → verificar Report gerado.

## Rollout / Rollback

1. Schema + API + seed (sem efeito de UI ainda).
2. Rodar seed em dev → validar coleção populada.
3. Aba admin + `TemplateForm` + rota do editor.
4. Rewiring da `TemplateGallery` para Firestore (ponto de corte).
5. Rename da aba.

**Rollback:** reverter o passo 4 (galeria volta a `DASHBOARD_TEMPLATES` do código). A coleção Firestore pode coexistir sem efeito.

## Arquivos afetados

**Novos**
- `src/shared/schemas/dashboard-template.ts`
- `src/shared/lib/firestore/dashboard-templates.ts`
- `src/features/admin/model/useAdminTemplates.ts`
- `src/shared/hooks/useTemplates.ts`
- `app/api/dashboard-templates/route.ts`
- `src/features/admin/ui/TemplatesTab.tsx`
- `src/features/admin/ui/TemplateForm.tsx`
- `app/(admin)/admin/templates/[id]/page.tsx`
- `src/shared/config/agents/template-blocks.ts` (`makeEmptyBlock`, `deriveMetricRefs`)
- `src/pages/explore/ui/BlockPalette.tsx`
- `src/pages/explore/ui/BlockInspector.tsx`
- `scripts/seed-dashboard-templates.ts`

**Modificados**
- `src/shared/schemas/index.ts` (export do schema)
- `src/features/admin/ui/AdminPage.tsx` (aba nova + rename do label)
- `src/features/admin/ui/index.ts` (export do `TemplatesTab`)
- `src/widgets/nav-sidebar/ui/TemplateGallery.tsx` (consome `useTemplates()`)
- `src/pages/explore/ui/CanvasPanel.tsx` (prop `authoring` → palette + inspector + esconde GlobalFilters)
- `src/shared/config/dashboard-templates.ts` (passa a ser só tipos + seed; sem mudança estrutural)
