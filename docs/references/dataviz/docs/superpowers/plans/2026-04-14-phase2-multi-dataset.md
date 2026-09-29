# Phase 2: Multi-Dataset per Client

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow clients to have multiple BigQuery datasets instead of a single one, enabling future per-block dataset selection in reports.

**Architecture:** Change `ClientConfig.dataset: string` to `ClientConfig.datasets: DatasetConfig[]` throughout the stack: Zustand store, admin UI, API routes, Firestore schema, and the `useActiveDataset` hook. Maintain backward compatibility by treating legacy single-dataset clients as `datasets: [{ id: "default", name: "Principal", dataset: "legacy_value" }]`. For Phase 2, the active dataset remains the first one — per-block dataset selection comes in Phase 5.

**Tech Stack:** React, Zustand, Firebase/Firestore, Next.js API Routes, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-14-multi-report-dashboards-design.md` (Section 6)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/shared/stores/app-store.ts` | Add `DatasetConfig` interface, change `ClientConfig.dataset` to `datasets` |
| Modify | `src/shared/hooks/useActiveClient.ts` | Update `useActiveDataset` to return first dataset from array |
| Modify | `src/features/admin/model/types.ts` | Update `ClientDoc` and `Client` types for multi-dataset |
| Modify | `src/features/admin/ui/ClientForm.tsx` | Multi-dataset editor UI (add/remove datasets) |
| Modify | `app/api/clients/route.ts` | Handle both legacy `dataset` and new `datasets` in Firestore reads/writes |
| Modify | `app/api/bigquery/route.ts` | Update `findClientByDataset` to search across `datasets` array |
| Modify | `src/shared/config/agents/types.ts` | Add `dataset?: string` to `BaseBlock` |

---

### Task 1: Add DatasetConfig type and update ClientConfig

**Files:**
- Modify: `src/shared/stores/app-store.ts`

- [ ] **Step 1: Add DatasetConfig interface and update ClientConfig**

In `app-store.ts`, add the `DatasetConfig` interface after the existing `ClientConfig` and update `ClientConfig`:

Replace:
```tsx
export interface ClientConfig {
  id: string;
  name: string;
  dataset: string;
  color: string;
  initial: string;
  schema?: Record<string, Record<string, string | null>> | null;
}
```

With:
```tsx
export interface DatasetConfig {
  id: string;
  name: string;
  dataset: string;
  description?: string;
}

export interface ClientConfig {
  id: string;
  name: string;
  datasets: DatasetConfig[];
  color: string;
  initial: string;
  schema?: Record<string, Record<string, string | null>> | null;
}
```

- [ ] **Step 2: Update buildAIContext to use datasets**

In `buildAIContext`, replace:
```tsx
lines.push(`Cliente: ${client.name} (dataset: ${client.dataset})`);
```

With:
```tsx
const dsNames = client.datasets.map(d => d.name).join(', ');
lines.push(`Cliente: ${client.name} (datasets: ${dsNames})`);
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: Build will have TypeScript errors in files that reference `client.dataset` — this is expected and will be fixed in subsequent tasks.

Actually, let's check first what breaks:

Run: `npx tsc --noEmit 2>&1 | head -40`

Note the files that need updating (useActiveClient.ts, admin types, API routes, etc). These will be fixed in Tasks 2-5.

- [ ] **Step 4: Commit**

```bash
git add src/shared/stores/app-store.ts
git commit -m "feat(types): add DatasetConfig and update ClientConfig for multi-dataset"
```

---

### Task 2: Update useActiveClient hook

**Files:**
- Modify: `src/shared/hooks/useActiveClient.ts`

- [ ] **Step 1: Update useActiveDataset**

Replace the entire file content:

```tsx
'use client';

import { useAppStore, type DatasetConfig } from '@/shared/stores/app-store';

export function useActiveClient() {
  return useAppStore((s) => s.getActiveClient());
}

/** Returns the primary (first) dataset string for backward compat with existing query hooks */
export function useActiveDataset() {
  return useAppStore((s) => s.getActiveClient()?.datasets[0]?.dataset ?? null);
}

/** Returns all datasets for the active client */
export function useActiveDatasets(): DatasetConfig[] {
  return useAppStore((s) => s.getActiveClient()?.datasets ?? []);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/hooks/useActiveClient.ts
git commit -m "feat(hooks): update useActiveDataset for multi-dataset support"
```

---

### Task 3: Update admin types

**Files:**
- Modify: `src/features/admin/model/types.ts`

- [ ] **Step 1: Update ClientDoc type**

In `types.ts`, replace:
```tsx
export interface ClientDoc {
  name: string;
  dataset: string;
  color: string;
  initial: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  schema?: ClientSchema | null;
  lastSchemaSync?: Timestamp | null;
}
```

With:
```tsx
export interface DatasetEntry {
  id: string;
  name: string;
  dataset: string;
  description?: string;
}

export interface ClientDoc {
  name: string;
  datasets: DatasetEntry[];
  /** @deprecated Legacy single-dataset field — use datasets[] instead */
  dataset?: string;
  color: string;
  initial: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  schema?: ClientSchema | null;
  lastSchemaSync?: Timestamp | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/admin/model/types.ts
git commit -m "feat(admin-types): add DatasetEntry and update ClientDoc for multi-dataset"
```

---

### Task 4: Update API routes with migration logic

**Files:**
- Modify: `app/api/clients/route.ts`

- [ ] **Step 1: Add migration helper and update GET**

In the GET handler, add a migration function that normalizes legacy `dataset` field to `datasets[]` when reading from Firestore:

Add at the top of the file (after imports):

```tsx
/** Normalize legacy single-dataset clients to multi-dataset format */
function normalizeClientDatasets(data: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(data.datasets) && data.datasets.length > 0) {
    return data;
  }
  // Legacy: single dataset field → wrap in array
  if (typeof data.dataset === 'string' && data.dataset.trim()) {
    return {
      ...data,
      datasets: [{ id: 'default', name: 'Principal', dataset: data.dataset }],
    };
  }
  return { ...data, datasets: [] };
}
```

Update the GET handler's map:
```tsx
const clients = snap.docs
  .map((docSnap) => normalizeClientDatasets({ id: docSnap.id, ...docSnap.data() }))
  .filter((client: any) => isAdminEmail(email) || allowedClientIds.has(client.id));
```

- [ ] **Step 2: Update POST handler for multi-dataset**

Update the POST body type and Firestore write to handle `datasets[]`:

Replace the body type:
```tsx
const body = await req.json() as {
  id: string;
  name: string;
  datasets: Array<{ id: string; name: string; dataset: string; description?: string }>;
  color: string;
  initial: string;
  schema?: Record<string, Record<string, string | null>> | null;
};
```

Update validations:
```tsx
if (!body.name?.trim()) {
  return NextResponse.json({ error: 'Nome do cliente é obrigatório.' }, { status: 400 });
}
if (!Array.isArray(body.datasets) || body.datasets.length === 0) {
  return NextResponse.json({ error: 'Pelo menos um dataset é obrigatório.' }, { status: 400 });
}
```

Update the Firestore write:
```tsx
await ref.set({
  name: body.name,
  datasets: body.datasets,
  color: body.color,
  initial: body.initial,
  ...(body.schema !== undefined ? { schema: body.schema, ...(body.schema ? { lastSchemaSync: now } : {}) } : {}),
  updatedAt: now,
  ...(existing.exists ? {} : { createdAt: now }),
}, { merge: true });
```

- [ ] **Step 3: Update findClientByDataset in bigquery route**

Read `app/api/bigquery/route.ts` and find `findClientByDataset`. Update it to search the `datasets[]` array:

The function should check both legacy `dataset` field and new `datasets[]` array:

```tsx
async function findClientByDataset(dataset: string) {
  const db = getDb();
  const snap = await db.collection('clients').get();
  for (const doc of snap.docs) {
    const data = doc.data();
    // Check new datasets array
    if (Array.isArray(data.datasets)) {
      if (data.datasets.some((d: any) => d.dataset === dataset)) {
        return { id: doc.id, data };
      }
    }
    // Fallback: legacy single dataset field
    if (data.dataset === dataset) {
      return { id: doc.id, data };
    }
  }
  return null;
}
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git add app/api/clients/route.ts app/api/bigquery/route.ts
git commit -m "feat(api): update client and bigquery routes for multi-dataset"
```

---

### Task 5: Update ClientForm admin UI

**Files:**
- Modify: `src/features/admin/ui/ClientForm.tsx`

- [ ] **Step 1: Update state and props to handle datasets array**

Replace the single `dataset` state with a `datasets` array state.

Replace:
```tsx
const [dataset, setDataset] = useState('');
```

With:
```tsx
const [datasets, setDatasets] = useState<Array<{ id: string; name: string; dataset: string; description?: string }>>([]);
```

Update the `useEffect` that populates form on open:

Replace:
```tsx
setDataset(client.dataset);
```

With:
```tsx
setDatasets(client.datasets ?? [{ id: 'default', name: 'Principal', dataset: client.dataset ?? '' }]);
```

Replace the reset:
```tsx
setDataset('');
```

With:
```tsx
setDatasets([{ id: 'default', name: 'Principal', dataset: '' }]);
```

- [ ] **Step 2: Add dataset list editor UI**

Replace the single Dataset input field with a list editor. Replace the `{/* Dataset */}` section with:

```tsx
{/* Datasets */}
<div>
  <label className="text-[11px] text-white/50 uppercase tracking-wider mb-1.5 block">Datasets</label>
  <div className="space-y-2">
    {datasets.map((ds, i) => (
      <div key={ds.id} className="flex gap-2 items-start rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
        <div className="flex-1 space-y-2">
          <Input
            value={ds.name}
            onChange={(e) => {
              const next = [...datasets];
              next[i] = { ...next[i], name: e.target.value };
              setDatasets(next);
            }}
            placeholder="Nome (ex: MCMV)"
            disabled={saving}
            className="bg-white/[0.04] border-white/[0.10] text-white/80 placeholder:text-white/25 h-8 text-sm"
          />
          <Input
            value={ds.dataset}
            onChange={(e) => {
              const next = [...datasets];
              next[i] = { ...next[i], dataset: e.target.value };
              setDatasets(next);
            }}
            placeholder="dataset ou projeto.dataset"
            disabled={saving}
            className="bg-white/[0.04] border-white/[0.10] text-white/80 placeholder:text-white/25 h-8 text-sm font-mono"
          />
        </div>
        {datasets.length > 1 && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/30 hover:text-red-400 shrink-0"
            onClick={() => setDatasets(datasets.filter((_, j) => j !== i))}
            disabled={saving}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    ))}
    <Button
      variant="outline"
      size="sm"
      onClick={() => setDatasets([...datasets, { id: crypto.randomUUID().slice(0, 8), name: '', dataset: '' }])}
      disabled={saving}
      className="w-full border-dashed border-white/[0.10] text-white/40 hover:text-white/60"
    >
      + Adicionar dataset
    </Button>
  </div>
</div>
```

Add `X` to the imports from lucide-react:
```tsx
import { X } from 'lucide-react';
```

- [ ] **Step 3: Update handleDetect for first dataset**

Replace:
```tsx
if (!dataset.trim()) { setError('Preencha o dataset antes de detectar.'); return; }
```

With:
```tsx
const primaryDataset = datasets[0]?.dataset;
if (!primaryDataset?.trim()) { setError('Preencha o dataset antes de detectar.'); return; }
```

And replace `dataset: dataset.trim()` in the fetch body with `dataset: primaryDataset.trim()`.

- [ ] **Step 4: Update handleSave**

Replace:
```tsx
if (!dataset.trim()) { setError('Dataset é obrigatório'); return; }
```

With:
```tsx
const validDatasets = datasets.filter(d => d.name.trim() && d.dataset.trim());
if (validDatasets.length === 0) { setError('Pelo menos um dataset é obrigatório'); return; }
```

Replace `dataset: dataset.trim()` in the `onSave` call with `datasets: validDatasets`.

- [ ] **Step 5: Update onSave prop type**

The `onSave` prop currently expects `Omit<ClientDoc, 'createdAt' | 'updatedAt'>`. Since we updated `ClientDoc` in Task 3, this should automatically work with the new `datasets` field. Verify the parent component (`ClientsTab.tsx`) passes the data correctly to the API.

- [ ] **Step 6: Verify build**

Run: `pnpm build`

- [ ] **Step 7: Commit**

```bash
git add src/features/admin/ui/ClientForm.tsx
git commit -m "feat(admin): multi-dataset editor UI in client form"
```

---

### Task 6: Add dataset field to BaseBlock

**Files:**
- Modify: `src/shared/config/agents/types.ts`

- [ ] **Step 1: Add dataset field to BaseBlock**

In `types.ts`, update `BaseBlock`:

Replace:
```tsx
interface BaseBlock {
  id: string;
  /** Grid column span: 1 = 1/3, 2 = 2/3, 3 = full width. Default: 1 */
  colSpan?: 1 | 2 | 3;
}
```

With:
```tsx
interface BaseBlock {
  id: string;
  /** Grid column span: 1 = 1/3, 2 = 2/3, 3 = full width. Default: 1 */
  colSpan?: 1 | 2 | 3;
  /** BigQuery dataset name for this block (from client's DatasetConfig). Set by AI during block creation. */
  dataset?: string;
}
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/shared/config/agents/types.ts
git commit -m "feat(types): add optional dataset field to BaseBlock for per-block dataset"
```

---

### Task 7: Fix remaining TypeScript errors and verify

**Files:**
- Possibly modify: any file that still references `client.dataset` directly

- [ ] **Step 1: Check for remaining TypeScript errors**

Run: `npx tsc --noEmit 2>&1`

Look for any remaining references to `client.dataset` (singular) that need to be updated.

Common places:
- `src/shared/hooks/useClients.ts` — where clients are mapped from API response
- `src/widgets/client-switcher/ui/ClientSwitcher.tsx` — if it accesses dataset
- Any component that imports `ClientConfig` and reads `.dataset`

- [ ] **Step 2: Fix any remaining references**

For each file:
- If it reads `client.dataset` for display purposes → use `client.datasets[0]?.dataset`
- If it reads `client.dataset` to pass to BigQuery → use `client.datasets[0]?.dataset` (via `useActiveDataset()` which already handles this from Task 2)
- If it sets `client.dataset` → update to set `client.datasets`

- [ ] **Step 3: Verify full build**

Run: `pnpm build`
Expected: Clean build, all pages generated.

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "fix(types): resolve remaining single-dataset references for multi-dataset migration"
```
