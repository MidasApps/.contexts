# Template ↔ Produto (`productRefs`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o enum `product` (`'play' | 'play-plus'`) dos Dashboard Templates por **`productRefs: string[]`** referenciando a coleção `products/`, suportando 1+ produtos por template.

**Architecture:** Mudança de schema (Zod + tipo rico + `TemplateRecord`) propagada pela API, pelo array-fonte de templates, por um script de migração idempotente, e pela UI (form do admin com picker multi-produto, tabela com nomes de produto, galeria com chips de produto dinâmicos). Migração: `play→['credit']`, `play-plus→['covenants']`. `segment` permanece como tag opcional.

**Tech Stack:** Next.js 16, Firestore (firebase-admin), Zod v4, React 19, Vitest + Testing Library (happy-dom), pnpm.

**Spec:** `docs/superpowers/specs/2026-06-16-template-product-refs-design.md`

**Convenções (ler antes):**
- **`pnpm lint` está QUEBRADO** (Next 16 removeu `next lint`). Type-check com `./node_modules/.bin/tsc --noEmit`. Testes: `pnpm test <path>`.
- Erros em `.next/types/**` são **stale** (regeneram no build) — ignore; filtre com `grep -v ".next/types"`.
- Produtos reais relevantes: `credit` (Liquid Play+ Credit) e `covenants` (Liquid Play+ Covenants).
- Working dir: `C:\Projetos\liquid-dataviz`. Branch atual: `review/admin`.
- Commits frequentes, mensagens PT-BR estilo do repo.

---

## Task 1: Schema — `productRefs`

**Files:**
- Modify: `src/shared/schemas/dashboard-template.ts`
- Test: `src/shared/schemas/__tests__/dashboard-template.test.ts`

- [ ] **Step 1: Atualizar o teste (TDD)** — substituir `product` por `productRefs` no `baseDoc` e no caso mínimo, e adicionar casos de `productRefs`.

Em `src/shared/schemas/__tests__/dashboard-template.test.ts`:
- No `baseDoc` (linha ~8-19): trocar `product: 'play' as const,` por `productRefs: ['credit'],`.
- No caso "valida um doc mínimo e aplica defaults": trocar `product: 'play',` por `productRefs: ['credit'],`.
- Adicionar no `describe('DashboardTemplateDoc', ...)`:

```ts
  it('exige productRefs com ao menos 1 produto', () => {
    expect(() => DashboardTemplateDoc.parse({ ...baseDoc, productRefs: [] })).toThrow();
  });

  it('aceita múltiplos produtos', () => {
    const parsed = DashboardTemplateDoc.parse({ ...baseDoc, productRefs: ['credit', 'covenants'] });
    expect(parsed.productRefs).toEqual(['credit', 'covenants']);
  });
```

- [ ] **Step 2: Rodar e confirmar FALHA**

Run: `pnpm test src/shared/schemas/__tests__/dashboard-template.test.ts`
Expected: FAIL — o schema ainda tem `product` (obrigatório) e não tem `productRefs` (os novos casos e o baseDoc sem `product` quebram).

- [ ] **Step 3: Implementar o schema**

Em `src/shared/schemas/dashboard-template.ts`:
- Adicionar import no topo: `import { Slug } from './identifier';`
- No `DashboardTemplateDoc`, **remover** a linha `product: TemplateProduct,` e **adicionar** em seu lugar:
```ts
  /** Produtos (slugs de products/) aos quais o template pertence. Pelo menos 1. */
  productRefs: z.array(Slug).min(1),
```
- Manter `segment: TemplateSegment.optional()`, `category`, e todos os demais campos. Manter os exports de `TemplateSegment`, `TemplateCategory`, `TemplateStatus`. O export `TemplateProduct` pode permanecer (não é mais usado no Doc) — não remover agora para não quebrar imports externos.

- [ ] **Step 4: Rodar e confirmar PASSA**

Run: `pnpm test src/shared/schemas/__tests__/dashboard-template.test.ts`
Expected: PASS (todos os casos, incluindo os 2 novos).

- [ ] **Step 5: Commit**

```bash
git add src/shared/schemas/dashboard-template.ts src/shared/schemas/__tests__/dashboard-template.test.ts
git commit -m "feat(schema): template productRefs (1+) no lugar do enum product"
```

---

## Task 2: API `/api/dashboard-templates` — `productRefs`

**Files:**
- Modify: `app/api/dashboard-templates/route.ts`
- Test: `app/api/dashboard-templates/__tests__/route.test.ts`

- [ ] **Step 1: Atualizar o teste (TDD)**

Em `app/api/dashboard-templates/__tests__/route.test.ts`:
- No `docData` (mock do doc): trocar `product: 'play',` por `productRefs: ['credit'],`.
- No teste "POST cria/upsert via set": trocar o body de `{ id: 'novo', name: 'Novo', description: 'd', category: 'Risco', product: 'play' }` por `{ id: 'novo', name: 'Novo', description: 'd', category: 'Risco', productRefs: ['credit'] }`.
- No teste "POST 400 com id inválido": trocar `product: 'play'` por `productRefs: ['credit']` no body.
- Adicionar um caso novo:
```ts
  it('GET single serializa productRefs', async () => {
    const res = await GET(req('http://x/api/dashboard-templates?id=visao-geral'));
    const body = await res.json();
    expect(body.data.productRefs).toEqual(['credit']);
  });
```

- [ ] **Step 2: Rodar e confirmar FALHA**

Run: `pnpm test app/api/dashboard-templates/__tests__/route.test.ts`
Expected: FAIL — `serialize` ainda devolve `product`, não `productRefs`; o POST valida `product`.

- [ ] **Step 3: Implementar a rota**

Em `app/api/dashboard-templates/route.ts`:
- Na função `serialize()`: remover a linha `product: data.product ?? 'play',` e adicionar `productRefs: data.productRefs ?? [],`. Manter `segment: data.segment ?? undefined,`.
- No PATCH, no array de whitelist de chaves, trocar `'product'` por `'productRefs'` (manter `'segment'`).
- O POST já valida via `DashboardTemplateDoc` (Task 1) — nenhuma mudança extra além do schema.

- [ ] **Step 4: Rodar e confirmar PASSA**

Run: `pnpm test app/api/dashboard-templates/__tests__/route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/dashboard-templates/route.ts app/api/dashboard-templates/__tests__/route.test.ts
git commit -m "feat(api): dashboard-templates usa productRefs"
```

---

## Task 3: `TemplateRecord` (firestore lib)

**Files:**
- Modify: `src/shared/lib/firestore/dashboard-templates.ts`

- [ ] **Step 1: Trocar o campo no tipo**

Em `src/shared/lib/firestore/dashboard-templates.ts`, na interface `TemplateRecord`: remover `product: 'play' | 'play-plus';` e adicionar `productRefs: string[];`. Manter `segment?: 'sbpe' | 'mcmv' | 'both';`.

- [ ] **Step 2: Type-check**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -v ".next/types" | grep -iE "dashboard-templates|TemplateRecord" || echo CLEAN`
Expected: pode haver erros NOS CONSUMIDORES (gallery/tab/form) que ainda usam `.product` — isso é esperado e será corrigido nas Tasks 6-8. Confirmar que o ERRO é só nesses consumidores e não no próprio `dashboard-templates.ts`. Se o arquivo da lib em si estiver limpo, prosseguir.

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/firestore/dashboard-templates.ts
git commit -m "feat(firestore): TemplateRecord.productRefs"
```

---

## Task 4: Tipo rico + array-fonte + seed (`dashboard-templates.ts` config)

**Files:**
- Modify: `src/shared/config/dashboard-templates.ts`
- Modify: `scripts/seed-dashboard-templates.ts`

- [ ] **Step 1: Trocar o campo na interface**

Em `src/shared/config/dashboard-templates.ts`, na interface `DashboardTemplate`: remover `product: TemplateProduct;` (e o comentário associado) e adicionar `productRefs: string[];`. Manter `segment?: TemplateSegment;`. Manter o type `TemplateProduct` exportado por ora (consumido pela galeria até a Task 8).

- [ ] **Step 2: Migrar as 40 entradas (transform mecânico)**

No mesmo arquivo, substituir em TODAS as entradas de template:
- `product: 'play',` → `productRefs: ['credit'],`
- `product: 'play-plus',` → `productRefs: ['covenants'],`

Manter as linhas `segment: ...` intactas.

- [ ] **Step 3: Verificar que não sobrou `product:`**

Run: `grep -nE "(^|[^A-Za-z])product:" src/shared/config/dashboard-templates.ts || echo "OK: nenhum product: restante"`
Expected: `OK: nenhum product: restante` (todas viraram `productRefs:`).

- [ ] **Step 4: Atualizar o seed**

Em `scripts/seed-dashboard-templates.ts`, no corpo do POST (`upsert`): remover `product: template.product,` e adicionar `productRefs: template.productRefs,`. Manter `segment: template.segment,`.

- [ ] **Step 5: Type-check do arquivo de config + seed**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -v ".next/types" | grep -iE "config/dashboard-templates|seed-dashboard-templates" || echo CLEAN`
Expected: CLEAN nesses arquivos (consumidores tipo gallery podem ainda acusar — corrigidos nas próximas tasks).

- [ ] **Step 6: Commit**

```bash
git add src/shared/config/dashboard-templates.ts scripts/seed-dashboard-templates.ts
git commit -m "refactor(templates): array-fonte e seed usam productRefs (play->credit, play-plus->covenants)"
```

---

## Task 5: Migração dos docs existentes (re-seed)

**Files:** nenhum (operação de dados em dev).

A migração é feita por **re-seed**: o array-fonte `DASHBOARD_TEMPLATES` já tem `productRefs` (Task 4) e o seed faz upsert idempotente por `id` (preservando `createdAt`). Não criamos script de PATCH dedicado — a API deixou de expor o `product` legado (Task 2), então um script que lê `product` da API seria inócuo; o re-seed a partir do código é o caminho correto e determinístico.

- [ ] **Step 1: Re-seed (dev server na porta 4000, dev-auth-bypass)**

Run: `pnpm seed:templates`
Expected: `✓ <id>` para os 40 templates. Cada doc passa a ter `productRefs` (do array de código).

- [ ] **Step 2: Validar (manual)**

- `GET /api/dashboard-templates?id=visao-geral` → `productRefs: ['credit']`.
- `GET /api/dashboard-templates?id=risco-pdd-sbpe` → `productRefs: ['covenants']`.

(Sem commit — é operação de dados; o código do seed já foi commitado na Task 4.)

---

## Task 6: Admin `TemplateForm` — picker multi-produto

**Files:**
- Modify: `src/features/admin/ui/TemplateForm.tsx`
- Test: `src/features/admin/ui/__tests__/TemplateForm.test.tsx`

- [ ] **Step 1: Atualizar o teste (TDD)**

Em `src/features/admin/ui/__tests__/TemplateForm.test.tsx`:
- Definir uma lista de produtos de teste e passá-la em todos os renders: `const products = [{ id: 'credit', name: 'Credit' }, { id: 'covenants', name: 'Covenants' }];` e adicionar `products={products}` ao `<TemplateForm ... />`.
- Caso "cria template novo": após preencher nome/descrição, marcar o produto: `fireEvent.click(screen.getByLabelText('Credit'));` antes de clicar em Salvar. Asserção: `onSave` chamado com `expect.objectContaining({ id: 'minha-analise', name: 'Minha Análise', productRefs: ['credit'] })`.
- Caso "pré-popula ao editar": `template` passa a ter `productRefs: ['credit']` (em vez de qualquer `product`); asserção continua checando `id: 'pdd'`.
- Adicionar caso:
```ts
  it('rejeita salvar sem nenhum produto', () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<TemplateForm open onClose={() => {}} onSave={onSave} existingIds={[]} products={products} />);
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Sem Produto' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar/i }));
    expect(onSave).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Rodar e confirmar FALHA**

Run: `pnpm test src/features/admin/ui/__tests__/TemplateForm.test.tsx`
Expected: FAIL — `products` prop não existe, não há checkbox 'Credit', `productRefs` não é emitido.

- [ ] **Step 3: Implementar o form**

Em `src/features/admin/ui/TemplateForm.tsx`:
- Na interface `TemplateMetadata`: remover `product: 'play' | 'play-plus';` e adicionar `productRefs: string[];`.
- Em `TemplateFormProps`: adicionar `products: Array<{ id: string; name: string }>;`.
- Remover a const `PRODUCTS` e o estado/select de `product`. Adicionar estado `const [productRefs, setProductRefs] = useState<string[]>([]);`.
- No `useEffect` de reset: `setProductRefs(template?.productRefs ?? []);`.
- No `handleSave`: validar `if (productRefs.length === 0) { setError('Selecione ao menos um produto'); return; }` (antes do try). Incluir `productRefs` no objeto passado a `onSave`. Remover `product` do objeto.
- No JSX, substituir o `<select>` de Produto por um grupo de checkboxes (densidade compact, tokens semânticos):
```tsx
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Produtos</span>
            <div className="rounded-md border border-border bg-background p-2 space-y-1 max-h-40 overflow-y-auto">
              {products.length === 0 ? (
                <p className="text-[11px] text-muted-foreground/60 px-1 py-1">Nenhum produto disponível.</p>
              ) : (
                products.map((p) => {
                  const checked = productRefs.includes(p.id);
                  return (
                    <label key={p.id} className="flex items-center gap-2 text-xs text-foreground cursor-pointer px-1 py-0.5">
                      <input
                        type="checkbox"
                        aria-label={p.name}
                        checked={checked}
                        onChange={() =>
                          setProductRefs((cur) =>
                            checked ? cur.filter((id) => id !== p.id) : [...cur, p.id],
                          )
                        }
                        className="size-3 accent-primary"
                      />
                      {p.name}
                    </label>
                  );
                })
              )}
            </div>
          </div>
```
(Posicionar esse bloco onde estava o select de Produto, dentro do grid de campos. Manter o select de `segment` e os demais.)

- [ ] **Step 4: Rodar e confirmar PASSA**

Run: `pnpm test src/features/admin/ui/__tests__/TemplateForm.test.tsx`
Expected: PASS (4 casos).

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/ui/TemplateForm.tsx src/features/admin/ui/__tests__/TemplateForm.test.tsx
git commit -m "feat(admin): TemplateForm com picker multi-produto (productRefs)"
```

---

## Task 7: Admin `TemplatesTab` + `TemplatesTable` — nomes de produto

**Files:**
- Modify: `src/features/admin/ui/TemplatesTab.tsx`
- Modify: `src/features/admin/ui/TemplatesTable.tsx`
- Test: `src/features/admin/ui/__tests__/TemplatesTable.test.tsx`

- [ ] **Step 1: Atualizar o teste do TemplatesTable (TDD)**

Em `src/features/admin/ui/__tests__/TemplatesTable.test.tsx`:
- Na factory `rec()`: remover `product: 'play',` e adicionar `productRefs: ['credit'],`.
- Adicionar `productNameById={{ credit: 'Credit' }}` em todos os `<TemplatesTable ... />`.
- Adicionar caso:
```ts
  it('mostra nomes de produto a partir de productRefs', () => {
    render(<TemplatesTable rows={[rec({ id: 'a', name: 'A', productRefs: ['credit', 'covenants'] })]} productNameById={{ credit: 'Credit', covenants: 'Covenants' }} {...cbs} />);
    expect(screen.getByText(/Credit/)).toBeInTheDocument();
    expect(screen.getByText(/Covenants/)).toBeInTheDocument();
  });
```

- [ ] **Step 2: Rodar e confirmar FALHA**

Run: `pnpm test src/features/admin/ui/__tests__/TemplatesTable.test.tsx`
Expected: FAIL — `productNameById` não existe; a tabela renderiza `t.product`.

- [ ] **Step 3: Implementar `TemplatesTable`**

Em `src/features/admin/ui/TemplatesTable.tsx`:
- Em `TemplatesTableProps`: adicionar `productNameById: Record<string, string>;`.
- Na célula de Produto (hoje `{t.product}{t.segment ...}`): trocar por:
```tsx
            <p className="text-xs text-muted-foreground truncate">
              {(t.productRefs ?? []).map((id) => productNameById[id] ?? id).join(', ') || '—'}
              {t.segment && t.segment !== 'both' ? ` · ${t.segment}` : ''}
            </p>
```

- [ ] **Step 4: Implementar `TemplatesTab`**

Em `src/features/admin/ui/TemplatesTab.tsx`:
- Importar `useAdminProducts`: `import { useAdminProducts } from '@/features/admin/model/useAdminProducts';`
- No corpo: `const { products } = useAdminProducts();`
- `const productNameById = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p.name])), [products]);`
- `const activeProducts = useMemo(() => products.filter((p) => p.status === 'active').map((p) => ({ id: p.id, name: p.name })), [products]);`
- Passar `productNameById={productNameById}` ao `<TemplatesTable .../>`.
- Passar `products={activeProducts}` ao `<TemplateForm .../>`.
- (Se faltar `useMemo` no import do React, adicionar.)

- [ ] **Step 5: Rodar testes + type-check**

Run: `pnpm test src/features/admin/ui/__tests__/TemplatesTable.test.tsx`
And: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -v ".next/types" | grep -iE "TemplatesTab|TemplatesTable" || echo CLEAN`
Expected: testes PASS; CLEAN.

- [ ] **Step 6: Commit**

```bash
git add src/features/admin/ui/TemplatesTab.tsx src/features/admin/ui/TemplatesTable.tsx src/features/admin/ui/__tests__/TemplatesTable.test.tsx
git commit -m "feat(admin): TemplatesTab/Table exibem produtos por productRefs"
```

---

## Task 8: Galeria — chips de produto dinâmicos + `useProducts`

**Files:**
- Create: `src/shared/hooks/useProducts.ts`
- Modify: `src/widgets/nav-sidebar/ui/TemplateGallery.tsx`

- [ ] **Step 1: Criar o hook read-only `useProducts`**

Create `src/shared/hooks/useProducts.ts`:

```typescript
'use client';
import { useCallback, useEffect, useState } from 'react';
import type { Product } from '@/shared/schemas';

async function authHeaders(): Promise<Record<string, string>> {
  const { getFirebaseAuth } = await import('@/shared/lib/firebase/config');
  const user = getFirebaseAuth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

/** Leitura de products/ (GET /api/products — liberado para usuário autenticado). */
export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.fetch('/api/products', { headers: await authHeaders() });
      const body = await res.json().catch(() => ({}));
      setProducts(res.ok ? ((body.data ?? []) as Product[]) : []);
    } catch (error) {
      console.error('[useProducts] Error:', error);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refetch(); }, [refetch]);

  return { products, loading, refetch };
}
```

- [ ] **Step 2: Refatorar a `TemplateGallery` para produtos dinâmicos**

Em `src/widgets/nav-sidebar/ui/TemplateGallery.tsx`, ler o arquivo inteiro e aplicar:

(a) Imports: adicionar `import { useProducts } from '@/shared/hooks/useProducts';`. Remover o uso de `TemplateProduct`/`PRODUCT_META` para FILTRAGEM (o `SEGMENT_META`/segment permanece). Pode manter `TemplateProduct` import se ainda referenciado em tipos; o objetivo é parar de classificar por enum.

(b) No componente: `const { products } = useProducts();` e um mapa:
```tsx
  const productById = useMemo(
    () => Object.fromEntries(products.map((p) => [p.id, p])),
    [products],
  );
```

(c) Estado do filtro de produto: trocar `productFilter: 'all' | TemplateProduct` por `productFilter: string` (id do produto) com default `'all'`.

(d) Lista de chips de produto: derivar dos produtos referenciados pelos templates:
```tsx
  const productOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const t of templates) for (const id of t.productRefs ?? []) ids.add(id);
    return Array.from(ids).map((id) => ({ id, name: productById[id]?.name ?? id, color: productById[id]?.color }));
  }, [templates, productById]);
```
Renderizar um `FilterChip` "Todos" (`productFilter === 'all'`) + um chip por `productOptions` (label `name`, cor `color`).

(e) `filteredTemplates`: trocar a condição de produto por:
```tsx
      if (productFilter !== 'all' && !(t.productRefs ?? []).includes(productFilter)) return false;
```
(manter a lógica de `segmentFilter` igual). Deps do `useMemo`: `[templates, productFilter, segmentFilter]`.

(f) Painel de detalhe — onde hoje renderiza `<ProductTag product={selected.product} />`: trocar por tags por produto:
```tsx
                {(selected.productRefs ?? []).map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      color: productById[id]?.color ?? undefined,
                      background: productById[id]?.color ? `${productById[id]!.color}1a` : 'rgba(255,255,255,0.06)',
                      border: `1px solid ${productById[id]?.color ?? 'var(--color-border)'}33`,
                    }}
                  >
                    {productById[id]?.name ?? id}
                  </span>
                ))}
```
Remover/!aposentar a função `ProductTag` e `PRODUCT_META` se ficarem sem uso (ou deixar `ProductTag` sem referências — preferir remover para evitar dead code).

(g) Na lista lateral de templates (o `dot` colorido por produto): usar a cor do primeiro produto:
```tsx
                        const firstColor = productById[t.productRefs?.[0] ?? '']?.color ?? 'var(--color-muted-foreground)';
```
e aplicar em `style={{ background: firstColor }}`.

(h) Estados loading/empty: se `templates` ainda carrega (já tratado pelo `useTemplates`), manter; produtos podem chegar depois — os chips/tags caem no fallback `id`/cor neutra sem quebrar.

- [ ] **Step 3: Type-check + testes (sem regressão)**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -v ".next/types" | grep -iE "TemplateGallery|useProducts" || echo CLEAN`
And: `pnpm test src/widgets` (se houver testes; senão pular)
Expected: CLEAN; sem `product`/`PRODUCT_META` remanescente no caminho de filtragem.

- [ ] **Step 4: Commit**

```bash
git add src/shared/hooks/useProducts.ts src/widgets/nav-sidebar/ui/TemplateGallery.tsx
git commit -m "feat(gallery): filtro/tags de produto dinamicos (productRefs + useProducts)"
```

---

## Task 9: Verificação final

- [ ] **Step 1: Suite completa**

Run: `pnpm test`
Expected: todos passam (incluindo os ajustados nas Tasks 1, 2, 6, 7).

- [ ] **Step 2: Type-check + build**

Run: `./node_modules/.bin/tsc --noEmit 2>&1 | grep -cE "error TS" | xargs echo "tsc total:"` (após um build, `.next/types` regenera; um total residual só de `.next/types` é aceitável — confira com `grep -v ".next/types"`).
And: `pnpm build`
Expected: build "Compiled successfully"; zero erros de fonte.

- [ ] **Step 3: Re-seed + smoke (manual, dev server na 4000)**

- `pnpm seed:templates` (re-grava os 40 com productRefs).
- Admin → Dashboard Templates: coluna Produto mostra "Credit"/"Covenants"; abrir "Novo template" → picker multi-produto; editar metadados de um template mostra o produto marcado.
- Header → Importar template: chips de produto dinâmicos (Credit/Covenants) filtram; detalhe mostra tag(s) de produto; import continua criando report.

- [ ] **Step 4: Commit final (se houver ajustes)**

```bash
git add -A && git commit -m "chore(templates): ajustes finais productRefs"
```

---

## Notas / decisões

- **Migração = re-seed** (Task 5), pois o array de código já tem `productRefs` e o seed é idempotente por id. Não há script de PATCH dedicado: como a API deixou de expor o `product` legado (Task 2), um script que o lesse seria inócuo.
- `TemplateProduct` (enum/type) deixa de classificar templates; mantido exportado por ora para não quebrar imports — remoção é limpeza futura, fora desta frente.
- `segment` e `category` inalterados. Fluxo de import e editor de canvas inalterados.
- Sem escopo por cliente (frente B) nem gating da IA (frente C).
