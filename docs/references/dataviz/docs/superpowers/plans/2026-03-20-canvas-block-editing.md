# Canvas Block Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add interactive block editing to the Explore canvas — toolbar with delete/select/drag, row-based drag-and-drop layout composition, block selection for targeted AI commands, and new orchestrator tools for layout manipulation.

**Architecture:** Migrate `CanvasPage` from a flat `blocks[]` array to `blockMap` (content lookup) + `layout: CanvasRow[]` (ordering/positioning). All mutations update both atomically. Use `@dnd-kit/core@^6` with `useDraggable` + `useDroppable` (custom drop zones for row-composition model). New UI components wrap each block with a floating toolbar (hover) and drop zones. The AI orchestrator gets new tools (`move_block`, `remove_block`, `update_*_block`) and layout context.

**Tech Stack:** React 19, Zustand 5, @dnd-kit/core 6, Tailwind CSS v4, Vercel AI SDK, TypeScript 5.9

**Spec:** `docs/superpowers/specs/2026-03-20-canvas-block-editing-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `src/pages/explore/ui/BlockToolbar.tsx` | Floating toolbar: checkbox, drag handle, delete button |
| `src/pages/explore/ui/BlockWrapper.tsx` | Wraps CanvasBlockRenderer with toolbar, selection state, hover detection |
| `src/pages/explore/ui/CanvasRow.tsx` | Renders a row of 1-3 blocks with drop zones for lateral placement |
| `src/pages/explore/ui/DropIndicator.tsx` | Blue line indicator shown during drag (horizontal or vertical) |
| `src/pages/explore/ui/SelectionBar.tsx` | Bottom bar: "N blocos selecionados" + "Limpar seleção" |
| `src/pages/explore/ui/DeleteConfirmModal.tsx` | Confirmation modal for block deletion |
| `src/features/canvas-orchestrator/tools/move-block.ts` | AI tool: move block relative to another |
| `src/features/canvas-orchestrator/tools/remove-block.ts` | AI tool: remove block by ID |
| `src/features/canvas-orchestrator/tools/update-block.ts` | AI tools: update_text_block, update_kpis_block, update_chart_block, update_table_block |

### Modified Files
| File | Changes |
|------|---------|
| `src/shared/config/agents/types.ts` | Add `CanvasRow` type. Change `CanvasPage` to use `blockMap` + `layout`. Extend `CanvasPageContext` with layout. |
| `src/shared/stores/canvas-store.ts` | Add `selectedBlockIds`, selection actions, `removeBlock`, `moveBlock`, `updateBlockContent`. Modify `addBlock`, `createPage`, `loadPages`, `getPagesContext`, `reset`. |
| `src/pages/explore/ui/CanvasPanel.tsx` | Replace flat block list with `CanvasRow` components inside DndContext. Add `SelectionBar`. |
| `src/pages/explore/ui/CanvasBlockRenderer.tsx` | No changes needed — BlockWrapper wraps it externally. |
| `src/pages/explore/ui/ConversationSidebar.tsx` | Pass `selectedBlockIds` in `buildBody()`. Handle new tool results (`move_block`, `remove_block`, `update_*_block`). Clear selection on send. |
| `src/shared/lib/firestore/conversations.ts` | Add `migratePage` to handle legacy `blocks[]` → `blockMap` + `layout` on read. Update `docToConversation`. |
| `src/shared/hooks/useConversations.ts` | No structural changes, but `pages` type changes cascade through. |
| `app/api/canvas-chat/route.ts` | Pass `selectedBlockIds` to orchestrator. |
| `src/features/canvas-orchestrator/orchestrator.ts` | Register new tools. Pass `selectedBlockIds` to prompt builder. |
| `src/shared/config/agents/canvas-orchestrator.ts` | Add selection-aware prompt section. Add layout tools description. |
| `package.json` | Add `@dnd-kit/core`. |

---

## Task 1: Install dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install @dnd-kit/core**

```bash
pnpm add @dnd-kit/core@^6
```

- [ ] **Step 2: Verify installation**

```bash
pnpm ls @dnd-kit/core
```

Expected: `@dnd-kit/core` listed with version 6.x.

- [ ] **Step 3: Verify build still passes**

```bash
pnpm build 2>&1 | tail -5
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add @dnd-kit/core for canvas drag-and-drop"
```

---

## Task 2: Migrate data model — types and canvas-store

This is the foundational change. Migrate `CanvasPage` from `blocks[]` to `blockMap` + `layout`, and add all new store actions.

**Files:**
- Modify: `src/shared/config/agents/types.ts`
- Modify: `src/shared/stores/canvas-store.ts`

- [ ] **Step 1: Update types.ts — add CanvasRow, change CanvasPage, extend CanvasPageContext**

In `src/shared/config/agents/types.ts`, add `CanvasRow` interface and update `CanvasPage`:

```typescript
// Add after CanvasPageFilters:

export interface CanvasRow {
  id: string;
  blockIds: string[];
}

// Replace existing CanvasPage with:
export interface CanvasPage {
  id: string;
  title: string;
  description?: string;
  blockMap: Record<string, CanvasBlock>;
  layout: CanvasRow[];
  filters?: CanvasPageFilters;
}

// Keep legacy type for migration:
export interface LegacyCanvasPage {
  id: string;
  title: string;
  description?: string;
  blocks: CanvasBlock[];
  filters?: CanvasPageFilters;
}

// Update CanvasPageContext:
export interface CanvasPageContext {
  id: string;
  title: string;
  blocks: Array<{ id: string; type: string; title?: string }>;
  layout: Array<{ rowIndex: number; blockIds: string[] }>;
}
```

- [ ] **Step 2: Add helper functions to types.ts**

```typescript
/** Serialize blockMap + layout back to ordered blocks array (for Firestore, legacy compat) */
export function serializeBlocks(page: CanvasPage): CanvasBlock[] {
  return page.layout.flatMap(row =>
    row.blockIds.map(id => page.blockMap[id]).filter(Boolean)
  );
}

/** Migrate legacy page (blocks[]) to new format (blockMap + layout) */
export function migratePage(page: LegacyCanvasPage | CanvasPage): CanvasPage {
  // Already migrated
  if ('blockMap' in page && page.blockMap && 'layout' in page && page.layout) {
    return page as CanvasPage;
  }
  const legacy = page as LegacyCanvasPage;
  const blockMap: Record<string, CanvasBlock> = {};
  const layout: CanvasRow[] = [];
  for (const block of legacy.blocks ?? []) {
    blockMap[block.id] = block;
    layout.push({ id: crypto.randomUUID(), blockIds: [block.id] });
  }
  return {
    id: legacy.id,
    title: legacy.title,
    description: legacy.description,
    blockMap,
    layout,
    filters: legacy.filters,
  };
}
```

- [ ] **Step 3: Rewrite canvas-store.ts with new data model**

Rewrite `src/shared/stores/canvas-store.ts`. Key changes:

1. `pages` now uses new `CanvasPage` shape with `blockMap` + `layout`
2. Add `selectedBlockIds: string[]` state
3. `createPage` creates page with empty `blockMap` and `layout`
4. `addBlock` inserts into `blockMap` AND appends new `CanvasRow` to `layout`
5. Add `removeBlock` — removes from `blockMap`, removes from row's `blockIds`, cleans empty rows
6. Add `moveBlock(pageIndex, blockId, targetBlockId, position)` — removes block from current row, inserts relative to target
7. Add `updateBlockContent(pageIndex, blockId, updates)` — merges into existing block in `blockMap`
8. Add `selectBlock`, `deselectBlock`, `clearSelection`
9. `setActivePage` calls `clearSelection`
10. `loadPages` runs `migratePage` on each page
11. `getPagesContext` includes layout info
12. `reset` clears `selectedBlockIds`

Full implementation:

```typescript
import { create } from 'zustand';
import type { CanvasBlock, CanvasPage, CanvasPageContext, CanvasPageFilters, CanvasRow } from '@/shared/config/agents/types';
import { migratePage, serializeBlocks } from '@/shared/config/agents/types';

// Block type minimum column requirements
const BLOCK_MIN_SLOTS: Record<string, number> = {
  table: 2,  // min 2/3 width
  kpis: 2,   // min 1/2 width (but 2 slots in a 3-col grid)
  chart: 1,
  text: 1,
};

function getBlockMinSlots(blockType: string): number {
  return BLOCK_MIN_SLOTS[blockType] ?? 1;
}

interface CanvasStore {
  sessionId: string | null;
  conversationId: string | null;
  pages: CanvasPage[];
  activePage: number;
  isStreaming: boolean;
  filtersStale: boolean;
  selectedBlockIds: string[];

  setConversationId: (id: string | null) => void;
  createPage: (title: string, description?: string, filters?: CanvasPageFilters) => number;
  addBlock: (pageIndex: number, block: CanvasBlock, position?: number) => void;
  removeBlock: (pageIndex: number, blockId: string) => void;
  moveBlock: (pageIndex: number, blockId: string, targetBlockId: string, position: 'before' | 'after' | 'left' | 'right') => void;
  updateBlockContent: (pageIndex: number, blockId: string, updates: Partial<CanvasBlock>) => void;
  selectBlock: (blockId: string) => void;
  deselectBlock: (blockId: string) => void;
  clearSelection: () => void;
  setActivePage: (index: number) => void;
  setStreaming: (streaming: boolean) => void;
  setFiltersStale: (stale: boolean) => void;
  loadPages: (pages: (CanvasPage | { blocks: CanvasBlock[]; [key: string]: unknown })[]) => void;
  reset: () => void;
  getActivePage: () => CanvasPage | null;
  getPagesContext: () => CanvasPageContext[];
  /** Get ordered blocks array from active page (for rendering compatibility) */
  getPageBlocks: (pageIndex: number) => CanvasBlock[];
}

export const useCanvasStore = create<CanvasStore>((set, get) => ({
  sessionId: null,
  conversationId: null,
  pages: [],
  activePage: 0,
  isStreaming: false,
  filtersStale: false,
  selectedBlockIds: [],

  setConversationId: (conversationId) => set({ conversationId }),

  createPage: (title, description, filters) => {
    const id = crypto.randomUUID();
    const newPage: CanvasPage = { id, title, description, blockMap: {}, layout: [], filters };
    set((state) => {
      const pages = [...state.pages, newPage];
      return { pages, activePage: pages.length - 1 };
    });
    return get().pages.length - 1;
  },

  addBlock: (pageIndex, block, position) => {
    set((state) => {
      const pages = [...state.pages];
      const page = pages[pageIndex];
      if (!page) return state;
      const blockMap = { ...page.blockMap, [block.id]: block };
      const newRow: CanvasRow = { id: crypto.randomUUID(), blockIds: [block.id] };
      const layout = [...page.layout];
      if (position !== undefined && position >= 0 && position <= layout.length) {
        layout.splice(position, 0, newRow);
      } else {
        layout.push(newRow);
      }
      pages[pageIndex] = { ...page, blockMap, layout };
      return { pages };
    });
  },

  removeBlock: (pageIndex, blockId) => {
    set((state) => {
      const pages = [...state.pages];
      const page = pages[pageIndex];
      if (!page) return state;
      const blockMap = { ...page.blockMap };
      delete blockMap[blockId];
      const layout = page.layout
        .map(row => ({
          ...row,
          blockIds: row.blockIds.filter(id => id !== blockId),
        }))
        .filter(row => row.blockIds.length > 0);
      pages[pageIndex] = { ...page, blockMap, layout };
      // Also remove from selection
      const selectedBlockIds = state.selectedBlockIds.filter(id => id !== blockId);
      return { pages, selectedBlockIds };
    });
  },

  moveBlock: (pageIndex, blockId, targetBlockId, position) => {
    set((state) => {
      const pages = [...state.pages];
      const page = pages[pageIndex];
      if (!page || !page.blockMap[blockId] || !page.blockMap[targetBlockId]) return state;

      const blockType = page.blockMap[blockId].type;
      const targetType = page.blockMap[targetBlockId].type;

      // Remove block from its current row
      let layout = page.layout.map(row => ({
        ...row,
        blockIds: [...row.blockIds],
      }));
      for (const row of layout) {
        const idx = row.blockIds.indexOf(blockId);
        if (idx !== -1) {
          row.blockIds.splice(idx, 1);
          break;
        }
      }
      // Clean empty rows
      layout = layout.filter(row => row.blockIds.length > 0);

      if (position === 'left' || position === 'right') {
        // Insert into same row as target
        const targetRow = layout.find(r => r.blockIds.includes(targetBlockId));
        if (!targetRow) return state;

        // Check constraints: max 3 columns, min slots
        const wouldHave = targetRow.blockIds.length + 1;
        if (wouldHave > 3) return state;

        // Check if block fits (min slots)
        const totalSlots = 3;
        const occupiedSlots = targetRow.blockIds.reduce((sum, id) => {
          const bt = page.blockMap[id]?.type ?? 'text';
          return sum + getBlockMinSlots(bt);
        }, 0);
        if (occupiedSlots + getBlockMinSlots(blockType) > totalSlots) return state;

        const targetIdx = targetRow.blockIds.indexOf(targetBlockId);
        const insertIdx = position === 'left' ? targetIdx : targetIdx + 1;
        targetRow.blockIds.splice(insertIdx, 0, blockId);
      } else {
        // Insert as new row before/after target's row
        const targetRowIdx = layout.findIndex(r => r.blockIds.includes(targetBlockId));
        if (targetRowIdx === -1) return state;
        const newRow: CanvasRow = { id: crypto.randomUUID(), blockIds: [blockId] };
        const insertIdx = position === 'before' ? targetRowIdx : targetRowIdx + 1;
        layout.splice(insertIdx, 0, newRow);
      }

      pages[pageIndex] = { ...page, layout };
      return { pages };
    });
  },

  updateBlockContent: (pageIndex, blockId, updates) => {
    set((state) => {
      const pages = [...state.pages];
      const page = pages[pageIndex];
      if (!page || !page.blockMap[blockId]) return state;
      const blockMap = {
        ...page.blockMap,
        [blockId]: { ...page.blockMap[blockId], ...updates } as CanvasBlock,
      };
      pages[pageIndex] = { ...page, blockMap };
      return { pages };
    });
  },

  selectBlock: (blockId) => {
    set((state) => {
      if (state.selectedBlockIds.includes(blockId)) return state;
      return { selectedBlockIds: [...state.selectedBlockIds, blockId] };
    });
  },

  deselectBlock: (blockId) => {
    set((state) => ({
      selectedBlockIds: state.selectedBlockIds.filter(id => id !== blockId),
    }));
  },

  clearSelection: () => set({ selectedBlockIds: [] }),

  setActivePage: (index) => set({ activePage: index, selectedBlockIds: [] }),
  setStreaming: (isStreaming) => set({ isStreaming }),
  setFiltersStale: (filtersStale) => set({ filtersStale }),

  loadPages: (pages) => {
    const migrated = pages.map(p => migratePage(p as CanvasPage));
    set({ pages: migrated, activePage: 0, selectedBlockIds: [] });
  },

  reset: () => set({
    sessionId: null, conversationId: null, pages: [], activePage: 0,
    isStreaming: false, filtersStale: false, selectedBlockIds: [],
  }),

  getActivePage: () => {
    const { pages, activePage } = get();
    return pages[activePage] ?? null;
  },

  getPagesContext: () => {
    return get().pages.map((p) => ({
      id: p.id,
      title: p.title,
      blocks: Object.values(p.blockMap).map((b) => ({
        id: b.id,
        type: b.type,
        title: b.type === 'chart' ? b.title : b.type === 'table' ? b.title : undefined,
      })),
      layout: p.layout.map((row, i) => ({
        rowIndex: i,
        blockIds: row.blockIds,
      })),
    }));
  },

  getPageBlocks: (pageIndex) => {
    const page = get().pages[pageIndex];
    if (!page) return [];
    return serializeBlocks(page);
  },
}));
```

- [ ] **Step 4: Fix type errors across codebase**

After changing `CanvasPage`, multiple files reference `page.blocks`. These need to be updated:

In `src/pages/explore/ui/CanvasPanel.tsx`:
- Change `pages.some((p) => p.blocks.length > 0)` → `pages.some((p) => p.layout.length > 0)`
- Change `currentPage.blocks.length > 0` → `currentPage.layout.length > 0`
- `PageContent` renders from `layout` + `blockMap` (will be fully rewritten in Task 4)

In `src/pages/explore/ui/ConversationSidebar.tsx`:
- The `debouncedSave` call passes `pages: canvasStore.getState().pages` — the Firestore module needs to serialize these. Handle in Task 3.

In `src/shared/lib/firestore/conversations.ts`:
- `docToConversation` reads `pages` — need to run `migratePage` on read. Handle in Task 3.

For now, make the **minimal** changes to make the build pass:

In `CanvasPanel.tsx`, temporarily update `PageContent` to derive blocks from the new model:

```typescript
// Inside PageContent, replace page.blocks.map with:
const blocks = page.layout.flatMap(row =>
  row.blockIds.map(id => page.blockMap[id]).filter(Boolean)
);
// Then map over blocks instead of page.blocks
```

And update the `hasBlocks` check:

```typescript
const hasBlocks = pages.some((p) => p.layout.length > 0);
```

And `currentPage.blocks.length > 0` → `currentPage.layout.length > 0`.

- [ ] **Step 5: Verify build passes**

```bash
pnpm build 2>&1 | tail -10
```

Expected: Build succeeds. There may be TypeScript errors in other files referencing `page.blocks` — fix all of them.

- [ ] **Step 6: Commit**

```bash
git add src/shared/config/agents/types.ts src/shared/stores/canvas-store.ts src/pages/explore/ui/CanvasPanel.tsx
git commit -m "feat: migrate canvas data model to blockMap + layout with selection state"
```

---

## Task 3: Update Firestore persistence for new data model

**Files:**
- Modify: `src/shared/lib/firestore/conversations.ts`
- Modify: `src/pages/explore/ui/ConversationSidebar.tsx`

- [ ] **Step 1: Update conversations.ts to handle migration on read and serialization on write**

In `docToConversation`, run `migratePage` on each page:

```typescript
import { migratePage, serializeBlocks, type CanvasPage } from '@/shared/config/agents/types';

// In docToConversation:
pages: ((data.pages as unknown[]) ?? []).map(p => migratePage(p as CanvasPage)),
```

In `updateConversation`, serialize pages before writing:

```typescript
// Before the updateDoc call, if data.pages exists, serialize for Firestore:
if (cleaned.pages) {
  cleaned.pages = (cleaned.pages as CanvasPage[]).map(p => ({
    ...p,
    // Store both formats: blockMap+layout (new) and blocks (legacy compat)
    blocks: serializeBlocks(p),
  }));
}
```

Import `serializeBlocks` from types.

- [ ] **Step 2: Update ConversationSidebar tool result handler for pages save**

The `debouncedSave` passes `pages: canvasStore.getState().pages`. This now sends `CanvasPage` objects with `blockMap` + `layout`. The Firestore module handles serialization, so no changes needed here — just verify the flow works.

- [ ] **Step 3: Verify build passes**

```bash
pnpm build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/shared/lib/firestore/conversations.ts
git commit -m "feat: add page migration on Firestore read, serialize blocks on write"
```

---

## Task 4: Build BlockToolbar and DeleteConfirmModal

**Files:**
- Create: `src/pages/explore/ui/BlockToolbar.tsx`
- Create: `src/pages/explore/ui/DeleteConfirmModal.tsx`

- [ ] **Step 1: Create BlockToolbar.tsx**

```typescript
'use client';

import { GripVertical, X, Square, CheckSquare } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface BlockToolbarProps {
  isSelected: boolean;
  selectionIndex: number | null;  // 1-based, null if not selected
  onSelect: () => void;
  onDelete: () => void;
  dragListeners?: Record<string, unknown>;
  dragAttributes?: Record<string, unknown>;
}

export function BlockToolbar({
  isSelected,
  selectionIndex,
  onSelect,
  onDelete,
  dragListeners,
  dragAttributes,
}: BlockToolbarProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-t-lg px-2 py-1 transition-colors cursor-grab active:cursor-grabbing',
        isSelected
          ? 'bg-[#F3A169]/10 border border-b-0 border-[#F3A169]/30'
          : 'bg-[#1e1e2e] border border-b-0 border-white/[0.12]',
      )}
      {...dragListeners}
      {...dragAttributes}
    >
      {/* Left: checkbox */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onSelect(); }}
        className="flex items-center gap-1.5 rounded px-1 py-0.5 text-[10px] transition-colors hover:bg-white/[0.06]"
      >
        {isSelected ? (
          <div className="flex h-5 w-5 items-center justify-center rounded bg-[#F3A169] text-black text-[11px] font-bold">
            {selectionIndex ?? '✓'}
          </div>
        ) : (
          <Square className="h-4 w-4 text-white/30" strokeWidth={1.5} />
        )}
        <span className={cn('text-[10px]', isSelected ? 'text-[#F3A169]/60' : 'text-white/20')}>
          {isSelected ? 'Selecionado' : 'Selecionar'}
        </span>
      </button>

      {/* Center: drag indicator */}
      <div className="flex items-center text-white/20">
        <GripVertical className="h-4 w-4" strokeWidth={1.5} />
      </div>

      {/* Right: delete */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="flex h-6 w-6 items-center justify-center rounded transition-colors text-white/30 hover:text-red-400 hover:bg-red-400/10"
      >
        <X className="h-3.5 w-3.5" strokeWidth={2} />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create DeleteConfirmModal.tsx**

```typescript
'use client';

import { useEffect, useRef } from 'react';

interface DeleteConfirmModalProps {
  blockName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DeleteConfirmModal({ blockName, onConfirm, onCancel }: DeleteConfirmModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onCancel]);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === overlayRef.current) onCancel(); }}
    >
      <div className="w-full max-w-sm rounded-xl border border-white/[0.12] bg-[#1e1e2e] p-5 shadow-2xl">
        <h3 className="text-sm font-semibold text-white/90">Excluir bloco?</h3>
        <p className="mt-1.5 text-xs text-white/40">
          O bloco &ldquo;{blockName}&rdquo; será removido permanentemente.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-white/[0.12] px-3.5 py-1.5 text-xs text-white/50 transition-colors hover:bg-white/[0.06]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-red-500 px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-red-600"
          >
            Excluir
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build passes**

```bash
pnpm build 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/explore/ui/BlockToolbar.tsx src/pages/explore/ui/DeleteConfirmModal.tsx
git commit -m "feat: add BlockToolbar and DeleteConfirmModal components"
```

---

## Task 5: Build BlockWrapper with hover toolbar and selection

**Files:**
- Create: `src/pages/explore/ui/BlockWrapper.tsx`
- Create: `src/pages/explore/ui/SelectionBar.tsx`

- [ ] **Step 1: Create BlockWrapper.tsx**

This wraps each block with hover detection, toolbar, selection state, and passes dnd-kit props.

```typescript
'use client';

import { useState, useCallback } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { cn } from '@/shared/lib/utils';
import { useCanvasStore } from '@/shared/stores/canvas-store';
import { CanvasBlockRenderer } from './CanvasBlockRenderer';
import { BlockToolbar } from './BlockToolbar';
import { DeleteConfirmModal } from './DeleteConfirmModal';
import type { CanvasBlock } from '@/shared/config/agents/types';

interface BlockWrapperProps {
  block: CanvasBlock;
  pageIndex: number;
}

function getBlockName(block: CanvasBlock): string {
  switch (block.type) {
    case 'text': return 'Texto';
    case 'kpis': return 'KPIs';
    case 'chart': return block.title ?? 'Gráfico';
    case 'table': return block.title ?? 'Tabela';
    default: return 'Bloco';
  }
}

export function BlockWrapper({ block, pageIndex }: BlockWrapperProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const selectedBlockIds = useCanvasStore((s) => s.selectedBlockIds);
  const selectBlock = useCanvasStore((s) => s.selectBlock);
  const deselectBlock = useCanvasStore((s) => s.deselectBlock);
  const removeBlock = useCanvasStore((s) => s.removeBlock);
  const isStreaming = useCanvasStore((s) => s.isStreaming);

  const isSelected = selectedBlockIds.includes(block.id);
  const hasSelection = selectedBlockIds.length > 0;
  const selectionIndex = isSelected ? selectedBlockIds.indexOf(block.id) + 1 : null;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: block.id,
    disabled: isStreaming,
    data: { type: 'block', blockId: block.id, blockType: block.type },
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  const handleSelect = useCallback(() => {
    if (isSelected) {
      deselectBlock(block.id);
    } else {
      selectBlock(block.id);
    }
  }, [isSelected, block.id, selectBlock, deselectBlock]);

  const handleDelete = useCallback(() => {
    setShowDeleteModal(true);
  }, []);

  const confirmDelete = useCallback(() => {
    removeBlock(pageIndex, block.id);
    setShowDeleteModal(false);
  }, [removeBlock, pageIndex, block.id]);

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          'group relative',
          isDragging && 'opacity-30',
          hasSelection && !isSelected && 'opacity-50',
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Floating toolbar — above block, full width */}
        <div className={cn(
          'transition-all duration-150',
          (isHovered || isSelected) ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 pointer-events-none',
        )}>
          <BlockToolbar
            isSelected={isSelected}
            selectionIndex={selectionIndex}
            onSelect={handleSelect}
            onDelete={handleDelete}
            dragListeners={listeners}
            dragAttributes={attributes}
          />
        </div>

        {/* Block content */}
        <div className={cn(
          'transition-colors',
          isSelected && 'ring-1 ring-[#F3A169]/40 rounded-b-lg',
          (isHovered || isSelected) ? 'rounded-b-lg' : 'rounded-lg',
        )}>
          <CanvasBlockRenderer block={block} />
        </div>

        {/* Selection badge */}
        {isSelected && selectionIndex && (
          <div className="absolute -top-2 -right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[#F3A169] text-[10px] font-bold text-black">
            {selectionIndex}
          </div>
        )}
      </div>

      {showDeleteModal && (
        <DeleteConfirmModal
          blockName={getBlockName(block)}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Create SelectionBar.tsx**

```typescript
'use client';

import { useCanvasStore } from '@/shared/stores/canvas-store';

export function SelectionBar() {
  const selectedBlockIds = useCanvasStore((s) => s.selectedBlockIds);
  const clearSelection = useCanvasStore((s) => s.clearSelection);

  if (selectedBlockIds.length === 0) return null;

  return (
    <div className="shrink-0 border-t border-[#F3A169]/20 bg-[#F3A169]/[0.06] px-6 py-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#F3A169]">
            {selectedBlockIds.length} {selectedBlockIds.length === 1 ? 'bloco selecionado' : 'blocos selecionados'}
          </span>
          <span className="text-[10px] text-white/30">
            — a IA ajustará apenas o conteúdo destes blocos
          </span>
        </div>
        <button
          type="button"
          onClick={clearSelection}
          className="rounded-md border border-white/[0.1] px-2.5 py-1 text-[10px] text-white/40 transition-colors hover:bg-white/[0.06]"
        >
          Limpar seleção
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify build passes**

```bash
pnpm build 2>&1 | tail -10
```

Note: We use `useDraggable` from `@dnd-kit/core` directly (not `useSortable`) since the row-composition model is custom and doesn't fit dnd-kit's built-in sort abstraction.

- [ ] **Step 4: Commit**

```bash
git add src/pages/explore/ui/BlockWrapper.tsx src/pages/explore/ui/SelectionBar.tsx
git commit -m "feat: add BlockWrapper with hover toolbar, selection, and SelectionBar"
```

---

## Task 6: Build CanvasRow, DropIndicator, and rewrite CanvasPanel with DnD

**Files:**
- Create: `src/pages/explore/ui/CanvasRow.tsx`
- Create: `src/pages/explore/ui/DropIndicator.tsx`
- Modify: `src/pages/explore/ui/CanvasPanel.tsx`

- [ ] **Step 1: Create DropIndicator.tsx**

```typescript
'use client';

import { cn } from '@/shared/lib/utils';

interface DropIndicatorProps {
  direction: 'horizontal' | 'vertical';
  active: boolean;
}

export function DropIndicator({ direction, active }: DropIndicatorProps) {
  if (!active) return null;

  return (
    <div
      className={cn(
        'rounded-full bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.5)] transition-opacity',
        direction === 'horizontal' ? 'h-[3px] w-full my-1' : 'w-[3px] h-full mx-1',
      )}
    />
  );
}
```

- [ ] **Step 2: Create CanvasRow.tsx**

```typescript
'use client';

import { useDroppable } from '@dnd-kit/core';
import { BlockWrapper } from './BlockWrapper';
import type { CanvasBlock, CanvasRow as CanvasRowType } from '@/shared/config/agents/types';

interface CanvasRowProps {
  row: CanvasRowType;
  blockMap: Record<string, CanvasBlock>;
  pageIndex: number;
  rowIndex: number;
}

// Block type minimum slots (out of 3 total)
const BLOCK_MIN_SLOTS: Record<string, number> = { table: 2, kpis: 2, chart: 1, text: 1 };

function buildGridCols(blocks: CanvasBlock[]): string {
  if (blocks.length === 1) return '1fr';
  // Compute proportional widths based on min slots
  const slots = blocks.map(b => BLOCK_MIN_SLOTS[b.type] ?? 1);
  return slots.map(s => `${s}fr`).join(' ');
}

export function CanvasRowComponent({ row, blockMap, pageIndex, rowIndex }: CanvasRowProps) {
  const blocks = row.blockIds.map(id => blockMap[id]).filter(Boolean);

  const { setNodeRef } = useDroppable({
    id: `row-${row.id}`,
    data: { type: 'row', rowId: row.id, rowIndex },
  });

  return (
    <div
      ref={setNodeRef}
      className="grid gap-4 max-md:grid-cols-1"
      style={{ gridTemplateColumns: blocks.length > 1 ? buildGridCols(blocks) : undefined }}
    >
      {blocks.map((block) => (
        <div key={block.id} className="relative">
          <SideDropZone blockId={block.id} side="left" />
          <BlockWrapper block={block} pageIndex={pageIndex} />
          <SideDropZone blockId={block.id} side="right" />
        </div>
      ))}
    </div>
  );
}

/** Narrow drop zone on left/right edge of a block for lateral placement */
function SideDropZone({ blockId, side }: { blockId: string; side: 'left' | 'right' }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `side-${side}-${blockId}`,
    data: { type: 'side', blockId, side },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'absolute top-0 bottom-0 w-4 z-10',
        side === 'left' ? '-left-2' : '-right-2',
      )}
    >
      {isOver && (
        <div className="absolute inset-y-0 w-[3px] rounded-full bg-[#3b82f6] shadow-[0_0_8px_rgba(59,130,246,0.5)]"
          style={{ [side === 'left' ? 'left' : 'right']: 0 }} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite CanvasPanel.tsx with DndContext**

Replace the block rendering in `PageContent` with row-based layout using DndContext. The full rewrite of `CanvasPanel.tsx`:

Key changes:
- Import `DndContext`, `DragOverlay`, `closestCenter`, `PointerSensor`, `useSensor`, `useSensors` from `@dnd-kit/core`
- Wrap `PageContent` blocks area in `DndContext`
- Render `CanvasRowComponent` for each row in `page.layout`
- Add `RowDropZone` between rows (a droppable div that shows `DropIndicator` when active)
- Handle `onDragEnd` to call `moveBlock` based on where the block was dropped
- Add `SelectionBar` at the bottom
- Disable drag during streaming

The `onDragEnd` handler logic:
1. Get the `active` block ID and `over` droppable ID
2. If `over` is a row drop zone (`row-{id}`), call `moveBlock` with position `'left'` or `'right'` based on x coordinate
3. If `over` is a between-rows zone (`between-{rowIndex}`), call `moveBlock` with position `'before'` or `'after'`

This is the most complex component. Implement incrementally — start with just rendering rows without drag, verify it works, then add the DndContext.

- [ ] **Step 4: Verify the app renders blocks correctly with the new row layout**

```bash
pnpm build 2>&1 | tail -10
```

Start dev server, navigate to `/explore`, create a conversation with some blocks, verify they render in single-column rows (same as before visually, but using the new layout model).

- [ ] **Step 5: Commit**

```bash
git add src/pages/explore/ui/CanvasRow.tsx src/pages/explore/ui/DropIndicator.tsx src/pages/explore/ui/CanvasPanel.tsx
git commit -m "feat: rewrite CanvasPanel with row-based layout and DndContext"
```

---

## Task 7: Implement drag-and-drop logic with drop zones and constraints

**Files:**
- Modify: `src/pages/explore/ui/CanvasPanel.tsx`
- Modify: `src/pages/explore/ui/CanvasRow.tsx`

- [ ] **Step 1: Add between-row drop zones**

In `CanvasPanel.tsx`, between each `CanvasRowComponent`, add a droppable zone:

```typescript
function RowDropZone({ rowIndex, isActive }: { rowIndex: number; isActive: boolean }) {
  const { setNodeRef, isOver } = useDroppable({
    id: `between-${rowIndex}`,
    data: { type: 'between-rows', rowIndex },
  });

  return (
    <div ref={setNodeRef} className="relative h-2 -my-1">
      <DropIndicator direction="horizontal" active={isOver || isActive} />
    </div>
  );
}
```

- [ ] **Step 2: Add side drop zones in CanvasRow**

Inside `CanvasRowComponent`, add left/right drop zones per block to enable lateral placement. Each block gets droppable zones on its left and right edges:

```typescript
// Wrap each BlockWrapper with left/right drop zones
<div className="relative">
  {/* Left drop zone */}
  <SideDropZone blockId={block.id} side="left" rowId={row.id} />
  <BlockWrapper block={block} pageIndex={pageIndex} />
  {/* Right drop zone */}
  <SideDropZone blockId={block.id} side="right" rowId={row.id} />
</div>
```

Where `SideDropZone` is a narrow absolute-positioned droppable that shows a vertical `DropIndicator`.

- [ ] **Step 3: Implement onDragEnd handler with constraint validation**

In `CanvasPanel.tsx`, implement the drag end handler:

```typescript
function handleDragEnd(event: DragEndEvent) {
  const { active, over } = event;
  if (!over || !currentPage) return;

  const blockId = active.id as string;
  const overData = over.data.current;

  if (overData?.type === 'between-rows') {
    // Drop as new row
    const targetRowIndex = overData.rowIndex;
    const targetRow = currentPage.layout[targetRowIndex];
    if (targetRow) {
      const targetBlockId = targetRow.blockIds[0];
      moveBlock(activePage, blockId, targetBlockId, 'before');
    }
  } else if (overData?.type === 'side') {
    // Drop into existing row (left/right of a block)
    const targetBlockId = overData.blockId;
    const side = overData.side as 'left' | 'right';
    moveBlock(activePage, blockId, targetBlockId, side);
  }
}
```

The `moveBlock` store action already validates constraints (max 3 cols, min slots per block type).

- [ ] **Step 4: Add DragOverlay for visual feedback**

```typescript
<DragOverlay>
  {activeBlock ? (
    <div className="rounded-lg border border-white/20 bg-background/80 p-4 shadow-xl opacity-80">
      <CanvasBlockRenderer block={activeBlock} />
    </div>
  ) : null}
</DragOverlay>
```

Track `activeBlock` via `onDragStart`:

```typescript
const [activeBlock, setActiveBlock] = useState<CanvasBlock | null>(null);

function handleDragStart(event: DragStartEvent) {
  const blockId = event.active.id as string;
  const block = currentPage?.blockMap[blockId] ?? null;
  setActiveBlock(block);
}

function handleDragCancel() {
  setActiveBlock(null);
}
```

- [ ] **Step 5: Disable drag during streaming**

The `useSortable` in `BlockWrapper` already has `disabled: isStreaming`. Additionally, cancel active drag if streaming starts:

```typescript
// In CanvasPanel, watch isStreaming
useEffect(() => {
  if (isStreaming && activeBlock) {
    setActiveBlock(null);
    // DndContext handles cancellation internally
  }
}, [isStreaming]);
```

- [ ] **Step 6: Test drag-and-drop manually**

Start dev server, create blocks via AI, test:
1. Drag a block between rows → creates new row
2. Drag a block to the side of another → creates 2-column row
3. Drag a third block into a 2-column row → creates 3-column row
4. Drag a table next to 2 blocks → should be rejected (min 2/3 width)
5. Blocks render correctly after drag

- [ ] **Step 7: Commit**

```bash
git add src/pages/explore/ui/CanvasPanel.tsx src/pages/explore/ui/CanvasRow.tsx
git commit -m "feat: implement drag-and-drop with row composition, constraints, and drop indicators"
```

---

## Task 8: Integrate selection with chat — pass selectedBlockIds to AI

**Files:**
- Modify: `src/pages/explore/ui/ConversationSidebar.tsx`
- Modify: `app/api/canvas-chat/route.ts`
- Modify: `src/features/canvas-orchestrator/orchestrator.ts`
- Modify: `src/shared/config/agents/canvas-orchestrator.ts`

- [ ] **Step 1: Pass selectedBlockIds in buildBody() (ConversationSidebar.tsx)**

In the `buildBody` callback, add `selectedBlockIds`:

```typescript
const buildBody = useCallback(() => ({
  dataset: activeDataset,
  filters: { /* ... existing ... */ },
  dashboardState: buildAIContext(),
  canvasPages: useCanvasStore.getState().getPagesContext(),
  bqmlEnabled,
  selectedBlockIds: useCanvasStore.getState().selectedBlockIds,
}), [/* ... existing deps ... */]);
```

After sending a message, clear selection:

```typescript
const handleSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  if (!activeDataset || !input.trim() || isLoading) return;
  setChatError(null);
  if (!originalPrompt.current) {
    originalPrompt.current = input.trim();
  }
  sendMessage({ text: input }, { body: buildBody() });
  setInput('');
  useCanvasStore.getState().clearSelection(); // Clear after send
};
```

- [ ] **Step 2: Accept selectedBlockIds in API route**

In `app/api/canvas-chat/route.ts`:

```typescript
const body: {
  messages: UIMessage[];
  dataset: string;
  filters: ChatRequestFilters;
  pagesContext: CanvasPageContext[];
  bqmlEnabled?: boolean;
  selectedBlockIds?: string[];
} = await req.json();

const result = await createCanvasOrchestrator({
  messages: body.messages,
  dataset: body.dataset,
  filters: body.filters,
  pagesContext: body.pagesContext ?? [],
  bqmlEnabled: body.bqmlEnabled ?? false,
  selectedBlockIds: body.selectedBlockIds ?? [],
});
```

- [ ] **Step 3: Pass to orchestrator and update prompt**

In `orchestrator.ts`, add `selectedBlockIds` to the interface and pass to prompt:

```typescript
interface CanvasOrchestratorInput {
  // ... existing
  selectedBlockIds?: string[];
}

// In createCanvasOrchestrator:
system: buildCanvasOrchestratorPrompt({
  dataset: input.dataset,
  filters: input.filters,
  pagesContext: input.pagesContext,
  bqmlEnabled: input.bqmlEnabled,
  selectedBlockIds: input.selectedBlockIds,
}),
```

In `canvas-orchestrator.ts`, add `selectedBlockIds` to context interface and add conditional prompt section:

```typescript
interface CanvasOrchestratorContext {
  // ... existing
  selectedBlockIds?: string[];
}

// At the end of the prompt, before the closing backtick:
${ctx.selectedBlockIds && ctx.selectedBlockIds.length > 0 ? `

## Blocos Selecionados pelo Usuário

O usuário selecionou os seguintes blocos: ${ctx.selectedBlockIds.map(id => `\`${id}\``).join(', ')}

**REGRA:** Altere APENAS o conteúdo destes blocos usando as tools \`update_*_block\`. NÃO modifique o layout, NÃO crie novas páginas, NÃO mova blocos. Foque exclusivamente em atualizar os dados/visualização dos blocos selecionados conforme o pedido do usuário.` : ''}
```

- [ ] **Step 4: Verify build passes**

```bash
pnpm build 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add src/pages/explore/ui/ConversationSidebar.tsx app/api/canvas-chat/route.ts src/features/canvas-orchestrator/orchestrator.ts src/shared/config/agents/canvas-orchestrator.ts
git commit -m "feat: pass selected block IDs to AI orchestrator for targeted edits"
```

---

## Task 9: Add new orchestrator tools — move_block, remove_block, update_*_block

**Files:**
- Create: `src/features/canvas-orchestrator/tools/move-block.ts`
- Create: `src/features/canvas-orchestrator/tools/remove-block.ts`
- Create: `src/features/canvas-orchestrator/tools/update-block.ts`
- Modify: `src/features/canvas-orchestrator/orchestrator.ts`

- [ ] **Step 1: Create move-block.ts**

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export function createMoveBlockTool() {
  return tool({
    description: 'Move um bloco para uma nova posição relativa a outro bloco. Use para reorganizar o layout.',
    inputSchema: z.object({
      pageIndex: z.number().describe('Índice da página'),
      blockId: z.string().describe('ID do bloco a mover'),
      targetBlockId: z.string().describe('ID do bloco de referência'),
      position: z.enum(['before', 'after', 'left', 'right']).describe('Posição relativa: before/after = nova linha acima/abaixo, left/right = mesma linha'),
    }),
    execute: async ({ pageIndex, blockId, targetBlockId, position }) => {
      return { action: 'move_block', pageIndex, blockId, targetBlockId, position };
    },
  });
}
```

- [ ] **Step 2: Create remove-block.ts**

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export function createRemoveBlockTool() {
  return tool({
    description: 'Remove um bloco da página.',
    inputSchema: z.object({
      pageIndex: z.number().describe('Índice da página'),
      blockId: z.string().describe('ID do bloco a remover'),
    }),
    execute: async ({ pageIndex, blockId }) => {
      return { action: 'remove_block', pageIndex, blockId };
    },
  });
}
```

- [ ] **Step 3: Create update-block.ts with per-type tools**

```typescript
import { tool } from 'ai';
import { z } from 'zod';

export function createUpdateTextBlockTool() {
  return tool({
    description: 'Atualiza o conteúdo de um bloco de texto existente.',
    inputSchema: z.object({
      blockId: z.string().describe('ID do bloco de texto'),
      content: z.string().describe('Novo conteúdo em markdown'),
    }),
    execute: async ({ blockId, content }) => {
      return { action: 'update_block', blockId, updates: { type: 'text' as const, content } };
    },
  });
}

export function createUpdateKpisBlockTool() {
  return tool({
    description: 'Atualiza os KPIs de um bloco existente. Substitui todos os items.',
    inputSchema: z.object({
      blockId: z.string().describe('ID do bloco de KPIs'),
      items: z.array(z.object({
        label: z.string(),
        value: z.string(),
        description: z.string().optional(),
        trend: z.string().optional(),
        trendDirection: z.enum(['up', 'down']).optional(),
        trendIsPositive: z.boolean().optional(),
        sparklineData: z.array(z.number()).optional(),
        sparklineMonths: z.array(z.string()).optional(),
        previousValue: z.string().optional(),
        deltaPercent: z.string().optional(),
      })).min(1).max(6),
    }),
    execute: async ({ blockId, items }) => {
      return { action: 'update_block', blockId, updates: { type: 'kpis' as const, items } };
    },
  });
}

export function createUpdateChartBlockTool() {
  return tool({
    description: 'Atualiza um bloco de gráfico existente (dados, tipo, eixos).',
    inputSchema: z.object({
      blockId: z.string().describe('ID do bloco de gráfico'),
      chartType: z.enum(['bar', 'line', 'area', 'composed', 'stacked-bar']).optional(),
      title: z.string().optional(),
      xAxisKey: z.string().optional(),
      dataKeys: z.array(z.string()).optional(),
      data: z.array(z.record(z.string(), z.union([z.string(), z.number()]))).optional(),
    }),
    execute: async ({ blockId, ...updates }) => {
      // Filter out undefined values
      const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
      return { action: 'update_block', blockId, updates: { type: 'chart' as const, ...clean } };
    },
  });
}

export function createUpdateTableBlockTool() {
  return tool({
    description: 'Atualiza um bloco de tabela existente (colunas, dados).',
    inputSchema: z.object({
      blockId: z.string().describe('ID do bloco de tabela'),
      title: z.string().optional(),
      columns: z.array(z.object({
        header: z.string(),
        accessorKey: z.string(),
        format: z.enum(['currency', 'percent', 'number', 'date']).optional(),
      })).optional(),
      rows: z.array(z.record(z.string(), z.unknown())).optional(),
    }),
    execute: async ({ blockId, ...updates }) => {
      const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
      return { action: 'update_block', blockId, updates: { type: 'table' as const, ...clean } };
    },
  });
}
```

- [ ] **Step 4: Register tools in orchestrator.ts**

```typescript
import { createMoveBlockTool } from './tools/move-block';
import { createRemoveBlockTool } from './tools/remove-block';
import { createUpdateTextBlockTool, createUpdateKpisBlockTool, createUpdateChartBlockTool, createUpdateTableBlockTool } from './tools/update-block';

// In the tools object:
tools: {
  // ... existing tools
  move_block: createMoveBlockTool(),
  remove_block: createRemoveBlockTool(),
  update_text_block: createUpdateTextBlockTool(),
  update_kpis_block: createUpdateKpisBlockTool(),
  update_chart_block: createUpdateChartBlockTool(),
  update_table_block: createUpdateTableBlockTool(),
},
```

- [ ] **Step 5: Handle new tool results in ConversationSidebar.tsx**

In the tool result processing loop, add handlers:

```typescript
} else if (toolName === 'move_block') {
  const { pageIndex: serverPageIdx, blockId, targetBlockId, position } = result as {
    pageIndex: number; blockId: string; targetBlockId: string;
    position: 'before' | 'after' | 'left' | 'right';
  };
  const storePageIdx = pageIndexMap.current.get(serverPageIdx) ?? serverPageIdx;
  canvasStore.getState().moveBlock(storePageIdx, blockId, targetBlockId, position);
} else if (toolName === 'remove_block') {
  const { pageIndex: serverPageIdx, blockId } = result as { pageIndex: number; blockId: string };
  const storePageIdx = pageIndexMap.current.get(serverPageIdx) ?? serverPageIdx;
  canvasStore.getState().removeBlock(storePageIdx, blockId);
} else if (toolName.startsWith('update_') && toolName.endsWith('_block')) {
  const { blockId, updates } = result as { blockId: string; updates: Partial<CanvasBlock> };
  // update tools don't need pageIndex — find which page has this block
  const pages = canvasStore.getState().pages;
  const pageIdx = pages.findIndex(p => p.blockMap[blockId]);
  if (pageIdx !== -1) canvasStore.getState().updateBlockContent(pageIdx, blockId, updates);
}
```

Also add labels to `TOOL_LABELS`:

```typescript
const TOOL_LABELS: Record<string, string> = {
  // ... existing
  move_block: 'Movendo bloco',
  remove_block: 'Removendo bloco',
  update_text_block: 'Atualizando texto',
  update_kpis_block: 'Atualizando KPIs',
  update_chart_block: 'Atualizando gráfico',
  update_table_block: 'Atualizando tabela',
};
```

- [ ] **Step 6: Update system prompt with layout tool descriptions**

In `canvas-orchestrator.ts`, add a section about layout tools:

```typescript
// After the "Tools de Blocos" section:
## Tools de Layout e Edição

Você pode reorganizar e editar blocos existentes:
- **move_block** → mover bloco para outra posição (before/after = nova linha, left/right = mesma linha)
- **remove_block** → remover bloco da página
- **update_text_block** → atualizar conteúdo de bloco de texto
- **update_kpis_block** → atualizar KPIs de bloco existente
- **update_chart_block** → atualizar dados/tipo de gráfico existente
- **update_table_block** → atualizar colunas/dados de tabela existente

Prefira **update_*_block** em vez de remover e recriar blocos. Isso preserva a posição no layout.
```

- [ ] **Step 7: Verify build passes**

```bash
pnpm build 2>&1 | tail -10
```

- [ ] **Step 8: Commit**

```bash
git add src/features/canvas-orchestrator/tools/move-block.ts src/features/canvas-orchestrator/tools/remove-block.ts src/features/canvas-orchestrator/tools/update-block.ts src/features/canvas-orchestrator/orchestrator.ts src/pages/explore/ui/ConversationSidebar.tsx src/shared/config/agents/canvas-orchestrator.ts
git commit -m "feat: add move_block, remove_block, update_*_block tools for AI layout manipulation"
```

---

## Task 10: Final polish and integration testing

**Files:**
- Various files touched in previous tasks

- [ ] **Step 1: Run full build**

```bash
pnpm build 2>&1 | tail -20
```

Fix any remaining type errors.

- [ ] **Step 2: Manual testing checklist**

Start dev server: `pnpm dev --port 3005`

Navigate to `/explore`, start a conversation, ask AI to create multiple blocks:

1. **Toolbar hover:** Hover over a block → toolbar appears above with full width. Leave → disappears.
2. **Delete:** Click X → modal appears. Click "Excluir" → block removed. Click "Cancelar" → nothing happens.
3. **Selection:** Click checkbox → block gets orange border + badge. Click again → deselected. Select 2 blocks → opacity of others reduced, SelectionBar appears.
4. **Selection + AI:** With blocks selected, send message → AI only edits selected blocks. Selection clears after send.
5. **Drag between rows:** Drag block from one row to between two rows → blue horizontal line → block moves to new row.
6. **Drag to side:** Drag block to the side of another → blue vertical line → 2-column row.
7. **3 columns:** Drag third block into 2-column row → 3 columns.
8. **Table constraint:** Try dragging table into row with 2 blocks → rejected (no indicator).
9. **Drag during streaming:** Start streaming → drag is disabled.
10. **Load existing conversation:** Open a conversation saved before migration → blocks render correctly (legacy migration works).
11. **Save and reload:** Make layout changes, reload page, verify layout persists.

- [ ] **Step 3: Fix any issues found**

Address any bugs from manual testing.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: canvas block editing — toolbar, drag-and-drop layout, selection, AI tools"
```
