# Frente B — Galeria escopada por produto + lineage Template→Report

**Date:** 2026-06-16
**Status:** Draft
**Relacionado:** ADR-0015 (Semantic Layer), ADR-0006 (multi-tenant), spec `2026-06-16-template-product-refs-design.md` (frente A), spec `2026-06-16-frente-c-ai-semantic-context-design.md` (frente C).

## Goal

Fazer a galeria de templates **respeitar os produtos contratados do cliente ativo** (esconder o que o cliente não tem) e gravar **lineage Template→Report** (`templateId`/`productRefs`/`metricRefs`) no momento do import, com o `useReportData` passando a buscar dados pelo **produto do próprio report** em vez do produto globalmente ativo.

## Contexto (mapeado)

- Templates referenciam produtos reais via `productRefs: string[]` (frente A). A galeria (`src/widgets/nav-sidebar/ui/TemplateGallery.tsx`) hoje é **cega ao cliente**: mostra todos os templates não-arquivados e deriva os chips de produto da união de *todos* os templates.
- Existe `useAvailableProducts()` (`src/shared/hooks/useActiveProduct.ts:93`) que retorna os `Product[]` contratados do cliente ativo (via `productBindings`); **cliente sem bindings → retorna todos os produtos** (fallback legado). `Product.id` é o `Slug` (== `binding.productId`).
- O Report (`src/shared/lib/firestore/reports.ts:4`) **não tem lineage** (`templateId`/`productRefs`/`metricRefs`). O `handleImport` (`TemplateGallery.tsx:137`) só copia `name/blockMap/layout/queries/description/filters` → `useReports.create` (`src/shared/hooks/useReports.ts:44`) → `createReport` (`reports.ts:69`) → `POST /api/reports` (`app/api/reports/route.ts`).
- `useReportData` (`src/shared/hooks/useReportData.ts:200-204`) escopa o fetch por `activeClientId` + `activeProduct?.id` (produto **globalmente ativo**), que pode não ser o produto de origem do report.
- Duplicar/mover report (`app/api/reports/route.ts:111,142`) clona só os campos atuais — lineage seria perdido se não for propagado.

## Decisões (definidas no brainstorm)

1. **Galeria esconde** templates de produtos não contratados pelo cliente ativo (não marca/desabilita; não tem toggle "ver todos").
2. **Lineage é gravado E consumido**: grava `templateId`/`productRefs`/`metricRefs` no import; `useReportData` passa a usar `report.productRefs[0]` (com fallback ao produto ativo).
3. Refs continuam **soft** (sem FK forte), coerente com frente A.

## Data Model — Report (lineage)

`src/shared/lib/firestore/reports.ts` — adicionar à interface `Report` (todos opcionais):

```ts
export interface Report {
  // ...campos atuais...
  /** Slug do DashboardTemplate de origem (se criado a partir de um template). */
  templateId?: string;
  /** Copiado de template.productRefs no import. */
  productRefs?: string[];
  /** Copiado de template.metricRefs no import. */
  metricRefs?: string[];
}
```

- `createReport(...)` (`reports.ts:69`) ganha 3 params opcionais (`templateId?`, `productRefs?`, `metricRefs?`) e os inclui no `payload` **só quando presentes/não-vazios** (mesmo padrão do `queries`).
- `POST /api/reports` (`app/api/reports/route.ts`): aceita os 3 campos no body e grava em `docData` condicionalmente (só quando presentes).
- Sem validação FK bloqueante (soft, igual frente A).

## B1 — Galeria escopada

`src/widgets/nav-sidebar/ui/TemplateGallery.tsx`:

1. Adicionar `const availableProducts = useAvailableProducts();` (de `@/shared/hooks/useActiveProduct`).
2. `const clientProductIds = useMemo(() => new Set(availableProducts.map((p) => p.id)), [availableProducts]);`
3. No `filteredTemplates`: adicionar guard **no início** do filtro —
   ```ts
   if (clientProductIds.size > 0 && !(t.productRefs ?? []).some((id) => clientProductIds.has(id))) {
     return false;
   }
   ```
   - Cliente **legado** (sem bindings): `useAvailableProducts` retorna **todos** → `clientProductIds` contém todos → todo template intersecta → mostra todos (fallback correto).
   - `clientProductIds.size === 0` (produtos ainda não carregados / cliente sem produtos resolvíveis): **não filtra** (evita galeria vazia durante loading).
4. `productOptions` (chips de produto, `TemplateGallery.tsx:94-102`): intersectar com `clientProductIds` — só produtos do cliente viram chip (quando `size > 0`).

## B2 — Lineage: gravar + consumir

### Gravar (import)
- `handleImport` (`TemplateGallery.tsx:137`): passar `template.id`, `template.productRefs`, `template.metricRefs` para `create(...)`.
- `useReports.create` (`useReports.ts:44`): threads os 3 novos params opcionais para `createReport`.
- `createReport` + `POST /api/reports`: gravam os campos (ver Data Model).

### Preservar (duplicar/mover)
- `app/api/reports/route.ts` paths de **duplicação** (`:111`) e **move** (`:142`): incluir `templateId`/`productRefs`/`metricRefs` no `dupData`/`moveData` (copiados do doc de origem) — hoje seriam perdidos.

### Consumir (useReportData)
- `useReportData` (`src/shared/hooks/useReportData.ts`): aceitar um `productId` (ou `productRefs`) opcional do report e usá-lo para escopar o fetch **em vez de** `activeProduct?.id`, com fallback: `const effectiveProductId = reportProductId ?? activeProduct?.id;`.
- `ReportPage` (`src/pages/report/ui/ReportPage.tsx`): ler `report.productRefs?.[0]` do doc carregado e passar para `useReportData`.
- **Retrocompatível:** reports antigos sem `productRefs` → `reportProductId` undefined → cai em `activeProduct?.id` (comportamento atual inalterado). Incluir `effectiveProductId` no `cacheKey` do `useReportData` para invalidar corretamente.

## Edge cases

- **Template com productRef de produto que o cliente não tem:** escondido (B1).
- **Orphan productRefs** (template referencia produto inexistente): já degradam mostrando o slug cru; com o filtro, um template só-orphan não intersecta nenhum produto do cliente → some (aceitável).
- **Sem cliente ativo:** `useAvailableProducts` retorna todos → galeria mostra todos (comportamento atual; aceitável pré-seleção de cliente).
- **Report multi-produto:** `useReportData` usa `productRefs[0]` (primeiro). Refinável depois.

## Testing

- **B1 (galeria):** cliente com subset de produtos → só templates que intersectam + chips só dos produtos do cliente; cliente legado (sem bindings) → todos; `clientProductIds` vazio → não filtra.
- **Schema/API:** `createReport`/`POST /api/reports` gravam `templateId`/`productRefs`/`metricRefs` quando presentes; ausentes → campos omitidos (happy-path byte-equivalente).
- **Import:** `handleImport` passa os 3 campos do template.
- **Duplicar/mover:** lineage preservado no doc resultante.
- **useReportData:** report com `productRefs` → fetch usa `productRefs[0]`; report sem → usa `activeProduct?.id` (fallback). `cacheKey` muda com o produto efetivo.

## Boundaries / YAGNI

- **Não** mudar o produto globalmente ativo ao abrir um report (só o fetch do report usa o produto dele).
- `metricRefs` é gravado como lineage mas **não tem consumidor ativo** nesta frente (futuro: contexto de IA por report).
- **Não** adicionar validação FK bloqueante (soft).
- **Não** mexer no admin template editor nem na taxonomia de produtos.

## Arquivos afetados

**Modificados**
- `src/widgets/nav-sidebar/ui/TemplateGallery.tsx` (filtro + chips + handleImport)
- `src/shared/lib/firestore/reports.ts` (interface + `createReport`)
- `src/shared/hooks/useReports.ts` (`create` threads lineage)
- `app/api/reports/route.ts` (POST aceita/grava lineage; dup/move preservam)
- `src/shared/hooks/useReportData.ts` (productId efetivo + cacheKey)
- `src/pages/report/ui/ReportPage.tsx` (passa `report.productRefs?.[0]`)
- testes correspondentes (TemplateGallery, reports lib/route, useReportData)

## Rollout

1. Schema Report + `createReport` + `POST /api/reports` (gravar lineage) + dup/move.
2. `handleImport` + `useReports.create` (passar lineage no import).
3. B1 galeria (filtro + chips).
4. `useReportData` consumir `report.productRefs[0]` + `ReportPage` plumbing.

**Rollback:** reverter commits; campos de lineage são opcionais; reports sem lineage seguem com fallback ao produto ativo; a galeria volta a mostrar tudo. Sem migração de dados.
