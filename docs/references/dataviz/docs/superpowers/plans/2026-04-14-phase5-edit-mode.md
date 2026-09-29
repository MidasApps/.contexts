# Phase 5: Edit Mode In-Place

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-place editing to saved reports, allowing users to modify blocks via toolbar actions and AI chat, then save changes back to Firestore.

**Architecture:** Reuse the existing canvas-store and CanvasPanel from the explore system. When the user clicks "Edit" on a report, load the report's `blockMap + layout` into canvas-store via `loadPages()`, switch the sidebar to Chat tab, and render CanvasPanel instead of the read-only view. Save persists the modified canvas state back to Firestore via a new `updateReport()` function. Cancel discards changes and restores the read-only view.

**Tech Stack:** React, Zustand (canvas-store + app-store), Firestore, CanvasPanel, AISidebar, shadcn/ui

**Spec:** `docs/superpowers/specs/2026-04-14-multi-report-dashboards-design.md` (Section 5)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/shared/lib/firestore/reports.ts` | Add `updateReport()` function |
| Modify | `src/pages/report/ui/ReportPage.tsx` | Add edit mode toggle, render CanvasPanel when editing |
| Modify | `src/widgets/app-bar/ui/AppBar.tsx` | Add edit button and Save/Cancel buttons for edit mode |
| Modify | `src/shared/stores/app-store.ts` | Add `editingReport` boolean state |

---

### Task 1: Add updateReport to Firestore module

**Files:**
- Modify: `src/shared/lib/firestore/reports.ts`

- [ ] **Step 1: Add updateReport function**

After the existing `renameReport` function, add:

```tsx
export async function updateReport(
  clientId: string,
  groupId: string,
  reportId: string,
  blockMap: Record<string, CanvasBlock>,
  layout: CanvasRow[],
): Promise<void> {
  await updateDoc(doc(reportsRef(clientId, groupId), reportId), {
    blockMap,
    layout,
    updatedAt: serverTimestamp(),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/lib/firestore/reports.ts
git commit -m "feat(firestore): add updateReport function for saving edited reports"
```

---

### Task 2: Add editing state to app store

**Files:**
- Modify: `src/shared/stores/app-store.ts`

- [ ] **Step 1: Add editingReport flag**

Add to the `AppState` interface:
```tsx
editingReport: boolean;
setEditingReport: (editing: boolean) => void;
```

Add to the store:
```tsx
editingReport: false,
setEditingReport: (editing) => set({ editingReport: editing }),
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/stores/app-store.ts
git commit -m "feat(store): add editingReport state flag"
```

---

### Task 3: Update AppBar with edit/save/cancel buttons

**Files:**
- Modify: `src/widgets/app-bar/ui/AppBar.tsx`

- [ ] **Step 1: Read current AppBar and add edit mode props**

Add new props to AppBarProps:
```tsx
interface AppBarProps {
  pageTitle?: string;
  title?: string;
  groupName?: string;
  onToggleSidebar?: () => void;
  className?: string;
  children?: React.ReactNode;
  /** Show edit button for reports */
  editable?: boolean;
  /** Currently in edit mode */
  editing?: boolean;
  /** Callbacks for edit mode */
  onEdit?: () => void;
  onSave?: () => void;
  onCancel?: () => void;
  /** Save in progress */
  saving?: boolean;
}
```

- [ ] **Step 2: Add edit button next to breadcrumb**

After the breadcrumb `<span>` with displayTitle, add:

```tsx
{editable && !editing && (
  <button
    onClick={onEdit}
    className="flex h-7 w-7 items-center justify-center rounded-md text-white/30 hover:text-white/60 hover:bg-white/[0.04] transition-colors ml-1"
    title="Editar relatório"
  >
    <Pencil className="h-3.5 w-3.5" strokeWidth={1.5} />
  </button>
)}
```

Add `Pencil` to the lucide-react imports.

- [ ] **Step 3: Add Save/Cancel buttons in edit mode**

Between the breadcrumb and the spacer div, when `editing` is true, show:

```tsx
{editing && (
  <div className="flex items-center gap-1.5 ml-3">
    <span className="text-[10px] text-[#F3A169]/70 font-medium px-2 py-0.5 rounded-full bg-[#F3A169]/10">
      Editando
    </span>
  </div>
)}
```

In the right section (before period picker), when `editing` is true, show Save/Cancel:

```tsx
{editing && (
  <div className="flex items-center gap-1.5">
    <button
      onClick={onCancel}
      disabled={saving}
      className="rounded-md px-3 py-1.5 text-[11px] font-medium text-white/50 hover:text-white/70 hover:bg-white/[0.04] transition-colors"
    >
      Cancelar
    </button>
    <button
      onClick={onSave}
      disabled={saving}
      className="rounded-md bg-[#F3A169] px-3 py-1.5 text-[11px] font-bold text-black hover:bg-[#F3A169]/90 transition-colors disabled:opacity-50"
    >
      {saving ? 'Salvando...' : 'Salvar'}
    </button>
  </div>
)}
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git add src/widgets/app-bar/ui/AppBar.tsx
git commit -m "feat(header): add edit/save/cancel buttons to AppBar for report editing"
```

---

### Task 4: Implement edit mode in ReportPage

**Files:**
- Modify: `src/pages/report/ui/ReportPage.tsx`

This is the main task. The ReportPage will toggle between read-only mode (current) and edit mode (CanvasPanel + canvas-store).

- [ ] **Step 1: Add imports and edit state**

Add imports:
```tsx
import { useCanvasStore } from '@/shared/stores/canvas-store';
import { updateReport } from '@/shared/lib/firestore/reports';
import type { CanvasPage } from '@/shared/config/agents/types';
```

Add state:
```tsx
const [editing, setEditing] = useState(false);
const [saving, setSaving] = useState(false);
const [originalReport, setOriginalReport] = useState<Report | null>(null);
const canvasStore = useCanvasStore();
```

- [ ] **Step 2: Add edit mode handlers**

```tsx
const handleEdit = () => {
  if (!report) return;
  // Store original for cancel
  setOriginalReport(JSON.parse(JSON.stringify(report)));
  // Load report into canvas store as a single page
  const page: CanvasPage = {
    id: report.id,
    title: report.name,
    blockMap: report.blockMap ?? {},
    layout: report.layout ?? [],
    filters: report.filters,
  };
  canvasStore.loadPages([page]);
  setEditing(true);
  // Dispatch event to switch sidebar to Chat tab
  window.dispatchEvent(new CustomEvent('switch-sidebar-tab', { detail: 'chat' }));
};

const handleSave = async () => {
  if (!activeClientId || !groupId || !reportId) return;
  setSaving(true);
  try {
    // Get current canvas state
    const pages = canvasStore.pages;
    const activePage = pages[0];
    if (activePage) {
      await updateReport(activeClientId, groupId, reportId, activePage.blockMap, activePage.layout);
      // Update local state with saved data
      setReport({
        ...report!,
        blockMap: activePage.blockMap,
        layout: activePage.layout,
      });
    }
    setEditing(false);
    canvasStore.loadPages([]);
  } catch (error) {
    console.error('Failed to save report:', error);
  } finally {
    setSaving(false);
  }
};

const [showCancelConfirm, setShowCancelConfirm] = useState(false);

const handleCancel = () => {
  // Check if canvas state differs from original
  const currentPage = canvasStore.pages[0];
  const hasChanges = currentPage &&
    JSON.stringify(currentPage.blockMap) !== JSON.stringify(originalReport?.blockMap);
  if (hasChanges) {
    setShowCancelConfirm(true);
    return;
  }
  confirmCancel();
};

const confirmCancel = () => {
  if (originalReport) setReport(originalReport);
  setEditing(false);
  setShowCancelConfirm(false);
  canvasStore.loadPages([]);
};
```

- [ ] **Step 3: Update the render to conditionally show CanvasPanel**

The ReportPage currently renders blocks read-only. When `editing` is true, dynamically import and render `CanvasPanel` instead.

However, CanvasPanel is a complex component from the explore page. For a simpler approach, we can render the canvas store's blocks using the same grid layout but with the block toolbar enabled.

A pragmatic approach: Import and use the CanvasPanel's rendering logic. Read `src/pages/explore/ui/CanvasPanel.tsx` first to understand how it renders the grid.

For the edit mode view, render a simplified version that shows blocks from canvas-store with hover toolbars:

```tsx
// In the return, replace the read-only block rendering:
{editing ? (
  <EditModeCanvas />
) : (
  // ... existing read-only rendering
)}
```

Create an inline `EditModeCanvas` component (or extract to a separate file if too large):

```tsx
function EditModeCanvas() {
  const pages = useCanvasStore((s) => s.pages);
  const activePage = pages[0];
  const removeBlock = useCanvasStore((s) => s.removeBlock);

  if (!activePage) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-white/30 text-sm">Nenhum bloco</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6">
      {activePage.layout.map((row) => (
        <div key={row.id} className="grid grid-cols-3 gap-4">
          {row.blockIds.map((blockId) => {
            const block = activePage.blockMap[blockId];
            if (!block) return null;
            const colSpanClass = COL_SPAN_CLASS[block.colSpan ?? 1] ?? 'col-span-1';
            return (
              <div
                key={blockId}
                className={cn(
                  colSpanClass,
                  'group relative rounded-lg border border-transparent hover:border-white/[0.10] transition-colors'
                )}
              >
                {/* Edit toolbar */}
                <div className="absolute -top-3 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.06] text-white/40 hover:bg-white/[0.10] cursor-grab"
                    title="Arrastar bloco"
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData('text/plain', blockId)}
                  >
                    <GripVertical className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => removeBlock(0, blockId)}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 text-xs"
                    title="Remover bloco"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                <CanvasBlockRenderer block={block} />
              </div>
            );
          })}
        </div>
      ))}

      {/* Add block button */}
      <button
        onClick={() => {
          // Dispatch event to focus chat with add-block intent
          window.dispatchEvent(new CustomEvent('switch-sidebar-tab', { detail: 'chat' }));
        }}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/[0.08] py-6 text-[12px] text-white/25 hover:text-white/50 hover:border-white/[0.15] hover:bg-white/[0.02] transition-colors"
      >
        <Plus className="h-4 w-4" />
        Adicionar bloco
      </button>
    </div>
  );
}
```

Add `Trash2`, `GripVertical`, `Plus` to lucide-react imports, and import `useCanvasStore`.

- [ ] **Step 4: Update AppBar usage with edit mode props**

Update the AppBar rendering in ReportPage:

```tsx
<AppBar
  pageTitle={report.name}
  groupName={group?.name}
  editable
  editing={editing}
  onEdit={handleEdit}
  onSave={handleSave}
  onCancel={handleCancel}
  saving={saving}
/>
```

Also add a cancel confirmation dialog after the `<ScrollArea>`:

```tsx
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/shared/ui/alert-dialog';

// In the return, after ScrollArea:
<AlertDialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
  <AlertDialogContent className="bg-[#0A0B10] border-white/[0.10]">
    <AlertDialogHeader>
      <AlertDialogTitle className="text-white">Descartar alterações?</AlertDialogTitle>
      <AlertDialogDescription className="text-white/50">
        Você tem alterações não salvas. Deseja descartá-las?
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel className="text-white/70">Continuar editando</AlertDialogCancel>
      <AlertDialogAction onClick={confirmCancel} className="bg-red-500 text-white hover:bg-red-600">
        Descartar
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 5: Handle unsaved changes on navigation**

Add a `beforeunload` handler when editing:

```tsx
useEffect(() => {
  if (!editing) return;
  const handler = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    e.returnValue = '';
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, [editing]);
```

- [ ] **Step 6: Verify build**

Run: `pnpm build`

- [ ] **Step 7: Commit**

```bash
git add src/pages/report/ui/ReportPage.tsx
git commit -m "feat(report): add in-place edit mode with canvas store integration"
```

---

### Task 5: Wire sidebar chat tab for edit mode

**Files:**
- Modify: `src/widgets/nav-sidebar/ui/NavSidebar.tsx`

- [ ] **Step 1: Listen for switch-sidebar-tab event**

The ReportPage dispatches `switch-sidebar-tab` with `detail: 'chat'` when entering edit mode. NavSidebar should listen for this and switch to the chat tab.

In NavSidebar, find where `activeTab` state is managed (the nav/chat toggle). Add an effect:

```tsx
useEffect(() => {
  const handler = (e: CustomEvent) => {
    if (e.detail === 'chat') setActiveTab('chat');
  };
  window.addEventListener('switch-sidebar-tab', handler as EventListener);
  return () => window.removeEventListener('switch-sidebar-tab', handler as EventListener);
}, []);
```

- [ ] **Step 2: Commit**

```bash
git add src/widgets/nav-sidebar/ui/NavSidebar.tsx
git commit -m "feat(sidebar): listen for switch-sidebar-tab event to activate chat in edit mode"
```

---

### Task 6: Build verification and polish

**Files:**
- Possibly adjust: multiple files

- [ ] **Step 1: Full build check**

Run: `pnpm build`
Fix any TypeScript errors.

- [ ] **Step 2: Verify edit mode flow**

Run: `pnpm dev`

Test:
1. Navigate to a report with blocks (import a template first if needed)
2. Click edit button (pencil) in header
3. Header changes to show "Editando" badge + Save/Cancel buttons
4. Blocks show hover toolbar with delete button
5. Sidebar switches to Chat tab
6. Click Cancel — returns to read-only view
7. Click Edit again, modify something, click Save — persists to Firestore
8. Reload page — changes persist

- [ ] **Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix: phase 5 edit mode polish and build fixes"
```
