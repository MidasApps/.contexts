# Template ↔ Produto — `productRefs` (frente A)

**Date:** 2026-06-16
**Status:** Draft
**Relacionado:** ADR-0015 (Semantic Layer), spec `2026-06-15-admin-dashboard-templates-design.md` (Dashboard Templates no admin), `src/shared/schemas/product.ts`

## Goal

Fazer os Dashboard Templates pertencerem a **produtos reais** (coleção `products/`), suportando **um ou mais produtos por template**. Hoje o template classifica produto por um **enum fixo** (`'play' | 'play-plus'`) que não corresponde aos produtos cadastrados no admin. Esta frente troca esse enum por **`productRefs: Slug[]`** (referência a `products/`), alinhando os templates ao modelo "templates pertencem aos produtos".

Esta é a **frente A** de um modelo maior (ver §Contexto). Frentes B (galeria/pré-carga escopadas pelos produtos do cliente) e C (gating da IA por produto contratado) ficam **fora** desta spec.

## Contexto (modelo de produto pretendido)

1. Data Contracts + Metrics são contexto para a IA criar indicadores.
2. **Métricas pertencem a produtos** (N:N via `Product.metricRefs[]`). ✅ já existe.
3. **Clientes têm produtos** (`Client.productBindings[]`). ✅ já existe.
4. **Templates** = páginas prontas com indicadores que **pertencem a um ou mais produtos**, carregadas pelo usuário. ⚠️ hoje o vínculo template→produto é um enum fixo — **esta spec corrige isso**.

## Problem

`DashboardTemplate` (schema em `src/shared/schemas/dashboard-template.ts`, tipo rico em `src/shared/config/dashboard-templates.ts`, e `TemplateRecord` em `src/shared/lib/firestore/dashboard-templates.ts`) carrega:

```ts
product: 'play' | 'play-plus';   // enum fixo
segment?: 'sbpe' | 'mcmv' | 'both';
```

Os produtos **reais** na coleção `products/` são outros e carregam as métricas de verdade:

| id / slug | nome | status | métricas |
|---|---|---|---|
| `credit` | Liquid Play+ Credit | active | 39 |
| `covenants` | Liquid Play+ Covenants | active | 18 |
| `liquid-play` | Liquid Play | active | 0 (umbrella vazio) |
| `liquid-play-plus` | Liquid Play+ | active | 0 (umbrella vazio) |
| `play-legacy` | Liquid Play (legacy) | archived | 39 |

Consequências do enum fixo:
- Templates não se ligam aos produtos reais (não dá pra criar um produto novo e associar templates a ele).
- Um template não pode pertencer a mais de um produto.
- Galeria e form do admin usam `PRODUCT_META` hardcoded (`play`/`play-plus`) em vez de nome/cor/ícone do produto real.

## Decisões (definidas no brainstorm)

- Campo: **`productRefs: Slug[]`** (mín. 1), referenciando `products/`. Remove `product`.
- Migração dos 40 templates: **`play → ['credit']`**, **`play-plus → ['covenants']`**. Umbrellas vazios e `play-legacy` ficam de fora.
- **`segment` permanece** como tag opcional (`sbpe | mcmv | both`) — os ~30 templates de covenants mantêm a distinção SBPE/MCMV.
- Schema suporta múltiplos produtos por template (a migração atribui 1, mas o admin pode marcar vários).

## Data Model

### Schema Zod — `src/shared/schemas/dashboard-template.ts`

```ts
import { Slug } from './identifier';
// ...
export const DashboardTemplateDoc = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(500),
  category: TemplateCategory,
  /** Produtos (slugs de products/) aos quais o template pertence. ≥1. */
  productRefs: z.array(Slug).min(1),
  segment: TemplateSegment.optional(),
  blockMap: z.record(z.string(), z.unknown()).default({}),
  layout: z.array(z.unknown()).default([]),
  filters: z.record(z.string(), z.unknown()).optional(),
  queries: z.array(z.unknown()).optional(),
  metricRefs: z.array(z.string()).default([]),
  status: TemplateStatus.default('active'),
  createdAt: z.unknown(),
  updatedAt: z.unknown(),
});
```

- Remove `TemplateProduct` (enum) do uso no Doc. Mantém `TemplateSegment`, `TemplateCategory`, `TemplateStatus`.
- `Slug` é o mesmo usado por `Product.id` (`src/shared/schemas/identifier.ts`).

### Tipo rico — `src/shared/config/dashboard-templates.ts`

- `DashboardTemplate.product: TemplateProduct` → `productRefs: string[]`.
- Cada um dos 40 templates do array `DASHBOARD_TEMPLATES` ganha `productRefs` (derivado do enum atual): templates `play` → `['credit']`; `play-plus` → `['covenants']`. Remove o campo `product`. `segment` permanece.
- `TemplateProduct`/`PRODUCT_META` deixam de classificar template; se ainda forem usados só pela galeria, migram para leitura dinâmica (ver §Galeria).

### `TemplateRecord` — `src/shared/lib/firestore/dashboard-templates.ts`

- `product: 'play' | 'play-plus'` → `productRefs: string[]`. Mantém `segment?`.

## API — `/api/dashboard-templates`

- `serialize()` retorna `productRefs: data.productRefs ?? []` (remove `product`).
- POST (`DashboardTemplateDoc`) e o whitelist do PATCH passam a aceitar `productRefs` (e `segment`); removem `product`.
- Sem mudança de rota/contrato além do campo.

## Migração

**`scripts/migrate-template-products.mjs`** — idempotente, via API (dev server), espelhando o estilo de `scripts/seed-dashboard-templates.ts`:

1. `GET /api/dashboard-templates` (lista).
2. Para cada doc: se tiver `product` e não tiver `productRefs`, computa `productRefs` (`play→['credit']`, `play-plus→['covenants']`) e faz `PATCH` com `productRefs`. (O campo `product` legado pode permanecer ignorado no doc; o serialize deixa de lê-lo.)
3. Loga cada `✓ <id> → [productRefs]`.

> Alternativa equivalente: re-rodar `seed:templates` após atualizar o array de código (já contém `productRefs`). O script de migração existe para bases já populadas sem reescrever tudo.

## Admin — UI

### `TemplateForm` (`src/features/admin/ui/TemplateForm.tsx`)

- `TemplateMetadata.product` → `productRefs: string[]`.
- Troca o `<select>` único de produto por um **picker multi-produto**: checkboxes dos produtos **ativos** (via `useAdminProducts`, filtrando `status==='active'`), exibindo `product.name`. Mantém o select de `segment` e demais campos.
- Validação: `productRefs.length >= 1` (mensagem "Selecione ao menos um produto").
- No create, gera o doc com `productRefs` selecionados.

### `TemplatesTable` (`src/features/admin/ui/TemplatesTable.tsx`)

- Coluna "Produto" passa a renderizar os **nomes** dos produtos referenciados (join `productRefs` → `product.name` via lista de produtos recebida por prop ou hook no `TemplatesTab`). Segmento continua sufixo quando presente.

### `TemplatesTab` (`src/features/admin/ui/TemplatesTab.tsx`)

- Carrega produtos (`useAdminProducts`) e passa o mapa `id→name` para a tabela e os produtos ativos para o `TemplateForm`.

## Galeria — `TemplateGallery` (`src/widgets/nav-sidebar/ui/TemplateGallery.tsx`)

- Os chips de filtro de **produto** passam a ser **dinâmicos**: um chip por produto real referenciado pelos templates carregados (deriva de `productRefs` + nome/cor do doc do produto).
- Fonte dos produtos: hook read-only `useProducts()` (novo, `GET /api/products`) — ou, se `/api/products` exigir admin, derivar nome/cor a partir de um endpoint/leitura permitida (ver Riscos).
- `PRODUCT_META` hardcoded (`play`/`play-plus`) é substituído por nome/cor do produto (campos `name`/`color`/`icon` já existem em `Product`).
- Filtro de **segmento** e navegação por **categoria** permanecem. Fluxo de import (`handleImport` → cria report) **inalterado**.
- Loading/empty states preservados.

## Riscos

1. **`/api/products` pode ser admin-gated.** A galeria é aberta por qualquer usuário logado. Se o endpoint exigir admin, o `useProducts()` falha para não-admins. Mitigação: na fase de plano, verificar a auth de `/api/products`; se for admin-only, expor leitura autenticada mínima (id/name/color/icon/status) ou embutir esses metadados ao listar templates. **Verificar antes de implementar a galeria.**
2. **Produtos referenciados inexistentes/arquivados.** Um template pode referenciar um produto removido/arquivado. UI deve degradar (mostrar o slug cru, sem quebrar). `productRefs` não tem FK forte (consistente com `metricRefs`).
3. **Coexistência do campo `product` legado.** Docs antigos podem manter `product` após a migração; o código para de lê-lo. Sem impacto desde que `serialize` use só `productRefs`.

## Fronteiras / YAGNI

- **Não** escopar a galeria pelos produtos do **cliente** (frente B).
- **Não** mexer no **gating da IA** por produto (frente C).
- **Não** mexer na taxonomia de produtos (umbrellas vazios, legacy) — fora de escopo.
- `category`, `segment`, fluxo de import e o editor de canvas seguem iguais.
- Sem FK/validação de existência de produto (igual a `metricRefs`).

## Testing

- **Schema:** `dashboard-template.test.ts` — `productRefs` exige ≥1 (rejeita `[]`); aceita 1 e múltiplos; `product` não é mais exigido.
- **API:** ajustar `route.test.ts` — POST/PATCH com `productRefs`; serialize retorna `productRefs`.
- **TemplateForm:** teste do picker multi-produto (seleciona produto → `onSave` recebe `productRefs`); rejeita save sem produto.
- **TemplatesTable:** renderiza nomes de produto a partir de `productRefs` + mapa.
- **Migração:** verificação manual — rodar o script em dev e conferir os 40 docs com `productRefs` corretos.

## Rollout

1. Schema + tipo rico + `TemplateRecord` + array de código com `productRefs`.
2. API (productRefs no lugar de product).
3. Script de migração + rodar em dev.
4. Admin (`TemplateForm` picker multi-produto, `TemplatesTab`/`TemplatesTable`).
5. Galeria (chips dinâmicos por produto).

**Rollback:** reverter os commits; docs migrados mantêm `productRefs` (inofensivo) e podem reter `product` legado.

## Arquivos afetados

**Modificados**
- `src/shared/schemas/dashboard-template.ts`
- `src/shared/config/dashboard-templates.ts` (tipo rico + 40 entradas + helpers)
- `src/shared/lib/firestore/dashboard-templates.ts` (`TemplateRecord`)
- `app/api/dashboard-templates/route.ts`
- `src/features/admin/ui/TemplateForm.tsx`
- `src/features/admin/ui/TemplatesTab.tsx`
- `src/features/admin/ui/TemplatesTable.tsx`
- `src/widgets/nav-sidebar/ui/TemplateGallery.tsx`
- `src/shared/schemas/__tests__/dashboard-template.test.ts`
- `app/api/dashboard-templates/__tests__/route.test.ts`
- `src/features/admin/ui/__tests__/TemplateForm.test.tsx`

**Novos**
- `scripts/migrate-template-products.mjs`
- `src/shared/hooks/useProducts.ts` (read-only, se `/api/products` permitir) — ver Riscos.
