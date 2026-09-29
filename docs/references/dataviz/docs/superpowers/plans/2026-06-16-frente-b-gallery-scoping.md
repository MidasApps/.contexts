# Frente B — Galeria escopada por produto + lineage Template→Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development para implementar tarefa-a-tarefa. Steps usam checkbox (`- [ ]`).

**Goal:** A galeria de templates respeita os produtos contratados do cliente ativo (esconde o que ele não tem), e reports gravam lineage Template→Report (`templateId`/`productRefs`/`metricRefs`) com o `useReportData` buscando dados pelo produto do próprio report.

**Architecture:** 3 tarefas sequenciais — (1) persistência do lineage no Report (schema + API + dup/move); (2) `TemplateGallery` escopado por produto + grava lineage no import; (3) `useReportData` consome `report.productRefs[0]` + plumbing no `ReportPage`. Refs soft (sem FK), retrocompatível (reports antigos sem lineage caem no produto globalmente ativo).

**Tech Stack:** Next.js 16 App Router, Firestore (firebase-admin), Zod, Zustand, React 19, Vitest + Testing Library (happy-dom).

**Spec:** `docs/superpowers/specs/2026-06-16-frente-b-gallery-scoping-design.md` (fonte de verdade do design).

**Verificação (todo o projeto):** `pnpm lint` está QUEBRADO (Next 16). Use `./node_modules/.bin/tsc --noEmit 2>&1 | grep -v ".next/types" | grep -cE "error TS"` (esperar 0) e `pnpm exec vitest run <arquivo>` para testes.

---

## Task 1: Persistência do lineage no Report (schema + API + dup/move)

**Files:**
- Modify: `src/shared/lib/firestore/reports.ts` (interface `Report` + função `createReport`)
- Modify: `app/api/reports/route.ts` (POST body/persist; paths de duplicar e mover)
- Test: `app/api/reports/__tests__/route.test.ts` (ou o arquivo de teste existente da rota — localizar; se não existir, criar mirror do estilo de `app/api/dashboard-templates/__tests__/route.test.ts`)

**Contexto:** Ler `src/shared/lib/firestore/reports.ts` (interface `Report` ~linha 4; `createReport` ~linha 69) e `app/api/reports/route.ts` (POST ~linha 79-183; duplicação ~linha 111; move ~linha 142) para casar as assinaturas e shapes exatos. Lineage é **opcional e soft** (sem FK).

- [ ] **Step 1: Teste — POST grava lineage quando presente, omite quando ausente**

No teste da rota (mockando `getDb`/auth como os outros testes de rota), adicionar casos:
- POST com `{ ...reportBody, templateId: 'fluxo-mensal', productRefs: ['credit'], metricRefs: ['pdd.total'] }` → doc persistido contém os 3 campos.
- POST sem esses campos → doc persistido NÃO contém as chaves (happy-path byte-equivalente).

- [ ] **Step 2: Rodar o teste e ver falhar**

`pnpm exec vitest run app/api/reports/__tests__/route.test.ts` → FAIL (campos não gravados ainda).

- [ ] **Step 3: Adicionar campos à interface `Report`**

Em `src/shared/lib/firestore/reports.ts`, na interface `Report`, adicionar (opcionais):
```ts
  /** Slug do DashboardTemplate de origem. */
  templateId?: string;
  /** Copiado de template.productRefs no import. */
  productRefs?: string[];
  /** Copiado de template.metricRefs no import. */
  metricRefs?: string[];
```

- [ ] **Step 4: `createReport` aceita e grava lineage (condicional)**

Adicionar 3 params opcionais a `createReport` (após os existentes) e incluí-los no `payload` SÓ quando presentes/não-vazios, no MESMO padrão condicional já usado para `queries`/`description`/`filters` (ler o código para casar o estilo, ex.: `...(templateId ? { templateId } : {})`, `...(productRefs?.length ? { productRefs } : {})`, `...(metricRefs?.length ? { metricRefs } : {})`).

- [ ] **Step 5: `POST /api/reports` aceita no body e grava no docData (condicional)**

No handler POST, adicionar `templateId?`, `productRefs?: string[]`, `metricRefs?: string[]` ao tipo/parse do body, e gravar em `docData` condicionalmente (mesmo padrão dos campos opcionais existentes). Sem validação FK bloqueante.

- [ ] **Step 6: Duplicar e mover preservam lineage**

Nos paths de duplicação (~`route.ts:111`) e move (~`route.ts:142`), incluir `templateId`/`productRefs`/`metricRefs` no `dupData`/`moveData` copiados do doc de origem (condicionalmente, como os demais campos), para não perder o lineage.

- [ ] **Step 7: Rodar testes + tsc**

`pnpm exec vitest run app/api/reports/__tests__/route.test.ts` → PASS. `./node_modules/.bin/tsc --noEmit 2>&1 | grep -v ".next/types" | grep -cE "error TS"` → 0.

- [ ] **Step 8: Commit**

```bash
git add src/shared/lib/firestore/reports.ts "app/api/reports/route.ts" app/api/reports/__tests__/route.test.ts
git commit -m "feat(reports): lineage templateId/productRefs/metricRefs (grava no POST + preserva em dup/move)"
```

---

## Task 2: `TemplateGallery` — escopo por produto + grava lineage no import

**Files:**
- Modify: `src/widgets/nav-sidebar/ui/TemplateGallery.tsx` (filtro + chips + `handleImport`)
- Modify: `src/shared/hooks/useReports.ts` (`create` repassa lineage)
- Test: `src/widgets/nav-sidebar/ui/__tests__/TemplateGallery.test.tsx` (criar/estender; mirror do estilo de testes de componente em `__tests__` com happy-dom; mockar `useTemplates`/`useProductsList`/`useAvailableProducts`/`useReports`)

**Contexto:** Ler `TemplateGallery.tsx` (`productOptions` ~94-102; `filteredTemplates` ~104; `handleImport` ~137-153) e `useReports.ts` (`create` ~44-65). `useAvailableProducts` vem de `@/shared/hooks/useActiveProduct` e retorna `Product[]` (com `.id` = Slug do produto). **Não** mexer em `useReportData`/`ReportPage` (Task 3).

- [ ] **Step 1: Teste — galeria escopa por produtos do cliente**

No teste do componente, mockar `useAvailableProducts` para retornar `[{ id: 'credit', ... }]` e `useTemplates` com templates `[{ productRefs: ['credit'] }, { productRefs: ['covenants'] }]`. Asserts: só o template `credit` aparece; o chip de produto `covenants` NÃO aparece. Segundo caso: `useAvailableProducts` retorna `[]` (loading/sem produtos) → ambos templates aparecem (sem filtro).

- [ ] **Step 2: Rodar e ver falhar**

`pnpm exec vitest run src/widgets/nav-sidebar/ui/__tests__/TemplateGallery.test.tsx` → FAIL.

- [ ] **Step 3: Filtro por produtos do cliente**

Em `TemplateGallery.tsx`:
```ts
import { useAvailableProducts } from '@/shared/hooks/useActiveProduct';
// ...
const availableProducts = useAvailableProducts();
const clientProductIds = useMemo(
  () => new Set(availableProducts.map((p) => p.id)),
  [availableProducts],
);
```
No início do predicado de `filteredTemplates`:
```ts
if (
  clientProductIds.size > 0 &&
  !(t.productRefs ?? []).some((id) => clientProductIds.has(id))
) {
  return false;
}
```
(Cliente legado → `useAvailableProducts` retorna todos → intersecta tudo. `size===0` → não filtra.)

- [ ] **Step 4: Chips só dos produtos do cliente**

Em `productOptions` (~94-102), quando `clientProductIds.size > 0`, manter apenas os ids presentes em `clientProductIds` (intersecção). Quando `size===0`, manter o comportamento atual (todos).

- [ ] **Step 5: `handleImport` passa lineage**

Em `handleImport`, passar `template.id`, `template.productRefs`, `template.metricRefs` para `create(...)` (após os args atuais, na ordem que `create`/`createReport` esperam — ver Task 1).

- [ ] **Step 6: `useReports.create` repassa lineage**

Em `useReports.ts`, `create` ganha os 3 params opcionais e os repassa para `createReport` (Task 1). Manter a assinatura retrocompatível (params no final, opcionais).

- [ ] **Step 7: Rodar testes + tsc**

`pnpm exec vitest run src/widgets/nav-sidebar/ui/__tests__/TemplateGallery.test.tsx` → PASS. tsc → 0.

- [ ] **Step 8: Commit**

```bash
git add src/widgets/nav-sidebar/ui/TemplateGallery.tsx src/shared/hooks/useReports.ts src/widgets/nav-sidebar/ui/__tests__/TemplateGallery.test.tsx
git commit -m "feat(gallery): escopa templates/chips pelos produtos contratados + grava lineage no import"
```

---

## Task 3: `useReportData` consome o produto do report + plumbing no `ReportPage`

**Files:**
- Modify: `src/shared/hooks/useReportData.ts` (productId efetivo + cacheKey + dep array)
- Modify: `src/pages/report/ui/ReportPage.tsx` (passa `report.productRefs?.[0]`)
- Test: `src/shared/hooks/__tests__/useReportData.test.ts` (ou arquivo existente; se inexistente, estender o local onde `useReportData` já é testado, ou criar mirror)

**Contexto:** Ler `useReportData.ts` (onde `activeProduct?.id` é usado, ~200-204, e o `cacheKey` ~228 e o dep array do `useCallback`/`fetchAll`) e `ReportPage.tsx` (como carrega o `report` doc e chama `useReportData`). Mudança **retrocompatível**: sem `productRefs` no report → fallback ao produto ativo (comportamento atual).

- [ ] **Step 1: Teste — useReportData usa o produto do report quando presente**

Teste: chamar `useReportData` com um `productId` (do report) explícito → o fetch/cacheKey usa esse produto; sem `productId` → usa `activeProduct?.id` (fallback). Mockar o fetch e asserir o productId efetivo enviado (ou o cacheKey). Casar com o harness de teste existente do hook.

- [ ] **Step 2: Rodar e ver falhar**

`pnpm exec vitest run <arquivo de teste do useReportData>` → FAIL.

- [ ] **Step 3: `useReportData` aceita productId opcional do report**

Adicionar um parâmetro opcional ao `useReportData` (ex.: `reportProductId?: string`) e computar:
```ts
const effectiveProductId = reportProductId ?? activeProduct?.id;
```
Usar `effectiveProductId` onde antes usava `activeProduct?.id` para escopar o fetch. Incluir `effectiveProductId` no `cacheKey` e no dep array do `useCallback`/`fetchAll` para invalidar corretamente.

- [ ] **Step 4: `ReportPage` passa o produto do report**

Em `ReportPage.tsx`, ler `report.productRefs?.[0]` do doc carregado e passar como `reportProductId` para `useReportData`. (Reports antigos sem `productRefs` → `undefined` → fallback.)

- [ ] **Step 5: Rodar testes + tsc**

`pnpm exec vitest run <arquivo do useReportData>` → PASS. tsc → 0.

- [ ] **Step 6: Commit**

```bash
git add src/shared/hooks/useReportData.ts src/pages/report/ui/ReportPage.tsx <arquivo de teste>
git commit -m "feat(reports): useReportData busca pelo produto do report (productRefs[0]) com fallback ao ativo"
```

---

## Self-review (pós-escrita)

- **Cobertura da spec:** Task 1 = persistência lineage + dup/move; Task 2 = galeria escopada (B1) + grava lineage no import; Task 3 = consumo (useReportData + ReportPage). Cobre B1, B2-gravar, B2-preservar, B2-consumir. ✅
- **Ordem/consistência:** Task 1 adiciona os params de `createReport` que Task 2 usa; Task 3 independe de Task 2 mas depende do schema (Task 1). Sequencial 1→2→3. ✅
- **Retrocompatibilidade:** campos opcionais; fallback ao produto ativo; happy-path omitido quando ausente. ✅
- **Soft refs:** sem validação FK bloqueante. ✅
