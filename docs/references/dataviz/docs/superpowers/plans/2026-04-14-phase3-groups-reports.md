# Phase 3: Groups and Reports Navigation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace static navigation with dynamic group-based report navigation. Clients create groups (organizational folders) and navigate to reports (dashboards) within them via a new sidebar with group tabs and report list.

**Architecture:** Create Firestore CRUD for groups and reports under `clients/{clientId}/groups/{groupId}` and `clients/{clientId}/groups/{groupId}/reports/{reportId}`. Build new sidebar UI with horizontal group tabs, report list, inline group creation, and context menus. Add new dynamic routes `/g/[groupId]/r/[reportId]`. Replace old static `NAV_ITEMS` navigation in the sidebar. **Old route pages remain untouched and functional** — they are simply no longer linked from the sidebar. Full route migration/redirects will happen in a later phase when templates are seeded as reports.

**Tech Stack:** React, Next.js App Router, Firestore (firebase/firestore), Zustand, Tailwind CSS, shadcn/ui, Lucide React

**Spec:** `docs/superpowers/specs/2026-04-14-multi-report-dashboards-design.md` (Section 3)

---

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/shared/lib/firestore/groups.ts` | Firestore CRUD for groups (create, list, rename, delete, reorder) |
| Create | `src/shared/lib/firestore/reports.ts` | Firestore CRUD for reports (create, list, rename, delete, move, duplicate) |
| Create | `src/shared/hooks/useGroups.ts` | React hook with real-time Firestore listener for groups |
| Create | `src/shared/hooks/useReports.ts` | React hook with real-time Firestore listener for reports in active group |
| Create | `src/widgets/nav-sidebar/ui/GroupTabs.tsx` | Horizontal group tabs with inline creation and context menu |
| Create | `src/widgets/nav-sidebar/ui/ReportList.tsx` | Report list with active indicator, context menu, and "+ Novo relatório" |
| Create | `src/widgets/nav-sidebar/ui/NewReportModal.tsx` | Modal: "Criar do zero" or "Importar template" |
| Modify | `src/widgets/nav-sidebar/ui/NavSidebar.tsx` | Replace NAV_ITEMS with GroupTabs + ReportList |
| Modify | `src/widgets/bottom-tab-bar/ui/BottomTabBar.tsx` | Update mobile nav for dynamic reports |
| Create | `app/(dashboard)/g/[groupId]/r/[reportId]/page.tsx` | Dynamic report page route |
| Create | `app/(dashboard)/g/[groupId]/page.tsx` | Group redirect (to first report) |
| Create | `src/pages/report/ui/ReportPage.tsx` | Report page component (renders CanvasPage blocks) |
| Modify | `src/shared/stores/app-store.ts` | Add activeGroupId and activeReportId |
| Modify | `src/shared/config/constants.ts` | Remove NAV_ITEMS and ANEXO_ITEMS (or deprecate) |

---

### Task 1: Firestore CRUD for groups

**Files:**
- Create: `src/shared/lib/firestore/groups.ts`

- [ ] **Step 1: Create groups Firestore module**

Follow the existing pattern in `src/shared/lib/firestore/conversations.ts`. Create:

```tsx
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, onSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/shared/lib/firebase/config';

export interface GroupDoc {
  name: string;
  order: number;
  createdAt: ReturnType<typeof serverTimestamp>;
}

export interface Group {
  id: string;
  name: string;
  order: number;
}

function groupsRef(clientId: string) {
  return collection(getFirebaseDb(), 'clients', clientId, 'groups');
}

export async function createGroup(clientId: string, name: string): Promise<string> {
  const snap = await getDocs(groupsRef(clientId));
  const maxOrder = snap.docs.reduce((max, d) => Math.max(max, d.data().order ?? 0), 0);
  const ref = await addDoc(groupsRef(clientId), {
    name,
    order: maxOrder + 1,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function renameGroup(clientId: string, groupId: string, name: string): Promise<void> {
  await updateDoc(doc(groupsRef(clientId), groupId), { name });
}

export async function deleteGroup(clientId: string, groupId: string): Promise<void> {
  // Delete all reports in this group first
  const reportsSnap = await getDocs(collection(getFirebaseDb(), 'clients', clientId, 'groups', groupId, 'reports'));
  for (const reportDoc of reportsSnap.docs) {
    await deleteDoc(reportDoc.ref);
  }
  await deleteDoc(doc(groupsRef(clientId), groupId));
}

export function onGroupsSnapshot(
  clientId: string,
  callback: (groups: Group[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(groupsRef(clientId), orderBy('order', 'asc'));
  return onSnapshot(q, (snap) => {
    const groups = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Group));
    callback(groups);
  }, onError);
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/shared/lib/firestore/groups.ts 2>&1 || pnpm build 2>&1 | tail -5`

- [ ] **Step 3: Commit**

```bash
git add src/shared/lib/firestore/groups.ts
git commit -m "feat(firestore): add groups CRUD module"
```

---

### Task 2: Firestore CRUD for reports

**Files:**
- Create: `src/shared/lib/firestore/reports.ts`

- [ ] **Step 1: Create reports Firestore module**

```tsx
import {
  collection, doc, addDoc, getDoc, getDocs, updateDoc, deleteDoc,
  query, orderBy, serverTimestamp, onSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/shared/lib/firebase/config';
import type { CanvasBlock, CanvasRow, CanvasPageFilters } from '@/shared/config/agents/types';

export interface ReportDoc {
  name: string;
  order: number;
  blockMap: Record<string, CanvasBlock>;
  layout: CanvasRow[];
  filters?: CanvasPageFilters;
  createdAt: ReturnType<typeof serverTimestamp>;
  updatedAt: ReturnType<typeof serverTimestamp>;
}

export interface Report {
  id: string;
  name: string;
  order: number;
  blockMap: Record<string, CanvasBlock>;
  layout: CanvasRow[];
  filters?: CanvasPageFilters;
}

function reportsRef(clientId: string, groupId: string) {
  return collection(getFirebaseDb(), 'clients', clientId, 'groups', groupId, 'reports');
}

export async function createReport(
  clientId: string,
  groupId: string,
  name: string,
  blockMap: Record<string, CanvasBlock> = {},
  layout: CanvasRow[] = [],
): Promise<string> {
  const snap = await getDocs(reportsRef(clientId, groupId));
  const maxOrder = snap.docs.reduce((max, d) => Math.max(max, d.data().order ?? 0), 0);
  const ref = await addDoc(reportsRef(clientId, groupId), {
    name,
    order: maxOrder + 1,
    blockMap,
    layout,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function getReport(clientId: string, groupId: string, reportId: string): Promise<Report | null> {
  const snap = await getDoc(doc(reportsRef(clientId, groupId), reportId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as Report;
}

export async function renameReport(clientId: string, groupId: string, reportId: string, name: string): Promise<void> {
  await updateDoc(doc(reportsRef(clientId, groupId), reportId), { name, updatedAt: serverTimestamp() });
}

export async function deleteReport(clientId: string, groupId: string, reportId: string): Promise<void> {
  await deleteDoc(doc(reportsRef(clientId, groupId), reportId));
}

export async function duplicateReport(clientId: string, groupId: string, reportId: string): Promise<string> {
  const report = await getReport(clientId, groupId, reportId);
  if (!report) throw new Error('Report not found');
  return createReport(clientId, groupId, `${report.name} (cópia)`, report.blockMap, report.layout);
}

export async function moveReport(
  clientId: string,
  fromGroupId: string,
  toGroupId: string,
  reportId: string,
): Promise<string> {
  const report = await getReport(clientId, fromGroupId, reportId);
  if (!report) throw new Error('Report not found');
  const newId = await createReport(clientId, toGroupId, report.name, report.blockMap, report.layout);
  await deleteReport(clientId, fromGroupId, reportId);
  return newId;
}

export function onReportsSnapshot(
  clientId: string,
  groupId: string,
  callback: (reports: Report[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(reportsRef(clientId, groupId), orderBy('order', 'asc'));
  return onSnapshot(q, (snap) => {
    const reports = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Report));
    callback(reports);
  }, onError);
}
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/lib/firestore/reports.ts
git commit -m "feat(firestore): add reports CRUD module"
```

---

### Task 3: React hooks for groups and reports

**Files:**
- Create: `src/shared/hooks/useGroups.ts`
- Create: `src/shared/hooks/useReports.ts`

- [ ] **Step 1: Create useGroups hook**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/shared/stores/app-store';
import { onGroupsSnapshot, createGroup, renameGroup, deleteGroup, type Group } from '@/shared/lib/firestore/groups';

export function useGroups() {
  const activeClientId = useAppStore((s) => s.activeClientId);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeClientId) {
      setGroups([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onGroupsSnapshot(
      activeClientId,
      (data) => { setGroups(data); setLoading(false); },
      () => { setGroups([]); setLoading(false); },
    );
    return unsub;
  }, [activeClientId]);

  return {
    groups,
    loading,
    create: (name: string) => createGroup(activeClientId, name),
    rename: (groupId: string, name: string) => renameGroup(activeClientId, groupId, name),
    remove: (groupId: string) => deleteGroup(activeClientId, groupId),
  };
}
```

- [ ] **Step 2: Create useReports hook**

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useAppStore } from '@/shared/stores/app-store';
import {
  onReportsSnapshot, createReport, renameReport, deleteReport,
  duplicateReport, moveReport, type Report,
} from '@/shared/lib/firestore/reports';
import type { CanvasBlock, CanvasRow } from '@/shared/config/agents/types';

export function useReports(groupId: string | null) {
  const activeClientId = useAppStore((s) => s.activeClientId);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeClientId || !groupId) {
      setReports([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onReportsSnapshot(
      activeClientId,
      groupId,
      (data) => { setReports(data); setLoading(false); },
      () => { setReports([]); setLoading(false); },
    );
    return unsub;
  }, [activeClientId, groupId]);

  return {
    reports,
    loading,
    create: (name: string, blockMap?: Record<string, CanvasBlock>, layout?: CanvasRow[]) =>
      createReport(activeClientId, groupId!, name, blockMap, layout),
    rename: (reportId: string, name: string) =>
      renameReport(activeClientId, groupId!, reportId, name),
    remove: (reportId: string) =>
      deleteReport(activeClientId, groupId!, reportId),
    duplicate: (reportId: string) =>
      duplicateReport(activeClientId, groupId!, reportId),
    move: (reportId: string, toGroupId: string) =>
      moveReport(activeClientId, groupId!, toGroupId, reportId),
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/shared/hooks/useGroups.ts src/shared/hooks/useReports.ts
git commit -m "feat(hooks): add useGroups and useReports with real-time Firestore listeners"
```

---

### Task 4: Add navigation state to Zustand store

**Files:**
- Modify: `src/shared/stores/app-store.ts`

- [ ] **Step 1: Add activeGroupId and activeReportId to store**

Add to the `AppState` interface:
```tsx
activeGroupId: string;
activeReportId: string;
setActiveGroup: (groupId: string) => void;
setActiveReport: (groupId: string, reportId: string) => void;
```

Add to the store creation:
```tsx
activeGroupId: '',
activeReportId: '',

setActiveGroup: (groupId) => set({ activeGroupId: groupId }),
setActiveReport: (groupId, reportId) => set({ activeGroupId: groupId, activeReportId: reportId }),
```

Update `switchClient` to also clear group/report:
```tsx
switchClient: (clientId, currentFilters) => {
  const prev = get().activeClientId;
  saveActiveClientId(clientId);
  set((state) => ({
    activeClientId: clientId,
    activeGroupId: '',
    activeReportId: '',
    clientFilters: {
      ...state.clientFilters,
      ...(prev ? { [prev]: currentFilters } : {}),
    },
    indicators: [],
    filtersSnapshot: null,
  }));
},
```

- [ ] **Step 2: Commit**

```bash
git add src/shared/stores/app-store.ts
git commit -m "feat(store): add activeGroupId and activeReportId to app store"
```

---

### Task 5: GroupTabs component

**Files:**
- Create: `src/widgets/nav-sidebar/ui/GroupTabs.tsx`

- [ ] **Step 1: Create GroupTabs component**

A horizontal scrollable row of group tabs with:
- Active group highlighted
- "+" button for inline creation (editable text field)
- Context menu (right-click or "..." on hover): Rename, Delete
- Overflow scroll with fade edges

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { cn } from '@/shared/lib/utils';
import { Plus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useGroups } from '@/shared/hooks/useGroups';
import { useAppStore } from '@/shared/stores/app-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

export function GroupTabs() {
  const { groups, loading, create, rename, remove } = useGroups();
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const setActiveGroup = useAppStore((s) => s.setActiveGroup);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  // Auto-select first group when groups load
  useEffect(() => {
    if (groups.length > 0 && !activeGroupId) {
      setActiveGroup(groups[0].id);
    }
  }, [groups, activeGroupId, setActiveGroup]);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  const handleCreate = async () => {
    if (!newName.trim()) { setCreating(false); return; }
    const id = await create(newName.trim());
    setNewName('');
    setCreating(false);
    setActiveGroup(id);
  };

  const handleRename = async (groupId: string) => {
    if (!editName.trim()) { setEditingId(null); return; }
    await rename(groupId, editName.trim());
    setEditingId(null);
  };

  const handleDelete = async (groupId: string) => {
    await remove(groupId);
    if (activeGroupId === groupId) {
      const remaining = groups.filter((g) => g.id !== groupId);
      setActiveGroup(remaining[0]?.id ?? '');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2">
        <div className="h-7 w-16 animate-pulse rounded-md bg-white/[0.04]" />
        <div className="h-7 w-16 animate-pulse rounded-md bg-white/[0.04]" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-3 py-2 scrollbar-none">
      {groups.map((group) => (
        <div key={group.id} className="group flex items-center shrink-0">
          {editingId === group.id ? (
            <input
              ref={editInputRef}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={() => handleRename(group.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(group.id);
                if (e.key === 'Escape') setEditingId(null);
              }}
              className="h-7 w-20 rounded-md bg-white/[0.06] border border-[#F3A169]/30 px-2 text-[11px] text-white/90 outline-none"
            />
          ) : (
            <>
              <button
                onClick={() => setActiveGroup(group.id)}
                className={cn(
                  'h-7 rounded-md px-2.5 text-[11px] font-medium transition-colors shrink-0',
                  activeGroupId === group.id
                    ? 'bg-[#F3A169]/15 text-[#F3A169]'
                    : 'text-white/40 hover:text-white/60 hover:bg-white/[0.04]'
                )}
              >
                {group.name}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      'h-7 w-5 flex items-center justify-center rounded-md text-white/20 hover:text-white/50 hover:bg-white/[0.04] transition-colors -ml-0.5 opacity-0 group-hover:opacity-100',
                      activeGroupId === group.id && 'opacity-100'
                    )}
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="bg-[#0A0B10] border-white/[0.10]">
                  <DropdownMenuItem
                    onClick={() => { setEditingId(group.id); setEditName(group.name); }}
                    className="text-white/70 text-xs"
                  >
                    <Pencil className="h-3 w-3 mr-2" /> Renomear
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDelete(group.id)}
                    className="text-red-400 text-xs"
                  >
                    <Trash2 className="h-3 w-3 mr-2" /> Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      ))}

      {creating ? (
        <input
          ref={inputRef}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={handleCreate}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
            if (e.key === 'Escape') { setCreating(false); setNewName(''); }
          }}
          placeholder="Nome..."
          className="h-7 w-20 rounded-md bg-white/[0.06] border border-white/[0.14] px-2 text-[11px] text-white/90 placeholder:text-white/25 outline-none shrink-0"
        />
      ) : (
        <button
          onClick={() => setCreating(true)}
          className="h-7 w-7 flex items-center justify-center rounded-md text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-colors shrink-0"
          title="Novo grupo"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/widgets/nav-sidebar/ui/GroupTabs.tsx
git commit -m "feat(sidebar): add GroupTabs component with inline create and context menu"
```

---

### Task 6: ReportList component

**Files:**
- Create: `src/widgets/nav-sidebar/ui/ReportList.tsx`

- [ ] **Step 1: Create ReportList component**

List of reports in the active group with:
- Active indicator (dot or highlight)
- Context menu: Rename, Duplicate, Move to group, Delete
- "+ Novo relatório" button at bottom
- Click navigates to report

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/shared/lib/utils';
import { Plus, MoreHorizontal, Pencil, Trash2, Copy, ArrowRightLeft, FileText } from 'lucide-react';
import { useReports } from '@/shared/hooks/useReports';
import { useGroups } from '@/shared/hooks/useGroups';
import { useAppStore } from '@/shared/stores/app-store';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';

interface ReportListProps {
  onNewReport: () => void;
}

export function ReportList({ onNewReport }: ReportListProps) {
  const router = useRouter();
  const activeGroupId = useAppStore((s) => s.activeGroupId);
  const activeReportId = useAppStore((s) => s.activeReportId);
  const setActiveReport = useAppStore((s) => s.setActiveReport);
  const { groups } = useGroups();
  const { reports, loading, rename, remove, duplicate, move } = useReports(activeGroupId || null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const editRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editingId) editRef.current?.focus();
  }, [editingId]);

  const handleNavigate = (reportId: string) => {
    setActiveReport(activeGroupId, reportId);
    router.push(`/g/${activeGroupId}/r/${reportId}`);
  };

  const handleRename = async (reportId: string) => {
    if (!editName.trim()) { setEditingId(null); return; }
    await rename(reportId, editName.trim());
    setEditingId(null);
  };

  if (!activeGroupId) {
    return (
      <div className="flex-1 flex items-center justify-center px-4">
        <p className="text-[11px] text-white/25 text-center">Selecione ou crie um grupo</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-1 px-3 py-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 animate-pulse rounded-md bg-white/[0.03]" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <p className="text-[9px] uppercase tracking-widest text-white/25 px-4 py-2">Relatórios</p>

      <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
        {reports.length === 0 ? (
          <div className="px-2 py-6 text-center">
            <FileText className="h-8 w-8 text-white/10 mx-auto mb-2" />
            <p className="text-[11px] text-white/25">Nenhum relatório</p>
            <p className="text-[10px] text-white/15">Crie um relatório ou importe um template</p>
          </div>
        ) : (
          reports.map((report) => (
            <div key={report.id} className="group flex items-center">
              {editingId === report.id ? (
                <input
                  ref={editRef}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={() => handleRename(report.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(report.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  className="flex-1 h-8 rounded-md bg-white/[0.06] border border-[#F3A169]/30 px-3 text-[12px] text-white/90 outline-none"
                />
              ) : (
                <>
                  <button
                    onClick={() => handleNavigate(report.id)}
                    className={cn(
                      'flex-1 flex items-center gap-2 h-8 rounded-md px-3 text-[12px] font-medium transition-colors text-left truncate',
                      activeReportId === report.id
                        ? 'bg-white/[0.06] text-white/90'
                        : 'text-white/45 hover:text-white/70 hover:bg-white/[0.03]'
                    )}
                  >
                    {activeReportId === report.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F3A169] shrink-0" />
                    )}
                    <span className="truncate">{report.name}</span>
                  </button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="h-7 w-7 flex items-center justify-center rounded-md text-white/15 hover:text-white/50 hover:bg-white/[0.04] transition-colors opacity-0 group-hover:opacity-100 shrink-0">
                        <MoreHorizontal className="h-3 w-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-[#0A0B10] border-white/[0.10]">
                      <DropdownMenuItem
                        onClick={() => { setEditingId(report.id); setEditName(report.name); }}
                        className="text-white/70 text-xs"
                      >
                        <Pencil className="h-3 w-3 mr-2" /> Renomear
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => duplicate(report.id)}
                        className="text-white/70 text-xs"
                      >
                        <Copy className="h-3 w-3 mr-2" /> Duplicar
                      </DropdownMenuItem>
                      {groups.length > 1 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="text-white/70 text-xs">
                            <ArrowRightLeft className="h-3 w-3 mr-2" /> Mover para
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="bg-[#0A0B10] border-white/[0.10]">
                            {groups
                              .filter((g) => g.id !== activeGroupId)
                              .map((g) => (
                                <DropdownMenuItem
                                  key={g.id}
                                  onClick={() => move(report.id, g.id)}
                                  className="text-white/70 text-xs"
                                >
                                  {g.name}
                                </DropdownMenuItem>
                              ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                      <DropdownMenuItem
                        onClick={() => remove(report.id)}
                        className="text-red-400 text-xs"
                      >
                        <Trash2 className="h-3 w-3 mr-2" /> Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </div>
          ))
        )}
      </div>

      <div className="px-3 py-2 border-t border-white/[0.04]">
        <button
          onClick={onNewReport}
          className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[11px] text-white/30 hover:text-white/50 hover:bg-white/[0.03] transition-colors"
        >
          <Plus className="h-3 w-3" />
          Novo relatório
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/widgets/nav-sidebar/ui/ReportList.tsx
git commit -m "feat(sidebar): add ReportList component with context menu and navigation"
```

---

### Task 7: NewReportModal component

**Files:**
- Create: `src/widgets/nav-sidebar/ui/NewReportModal.tsx`

- [ ] **Step 1: Create NewReportModal**

Simple dialog with two options: "Criar do zero" (navigates to /explore) and "Importar template" (placeholder for Phase 4).

```tsx
'use client';

import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Sparkles, LayoutTemplate } from 'lucide-react';

interface NewReportModalProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
}

export function NewReportModal({ open, onClose, groupId }: NewReportModalProps) {
  const router = useRouter();

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="bg-[#0A0B10] border-white/[0.10] text-white sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white text-[15px]">Novo Relatório</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <button
            onClick={() => { onClose(); router.push('/explore'); }}
            className="flex w-full items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] transition-colors text-left"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#F3A169]/10">
              <Sparkles className="h-5 w-5 text-[#F3A169]" />
            </div>
            <div>
              <p className="text-[13px] font-medium text-white/90">Criar do zero</p>
              <p className="text-[11px] text-white/40">Use a IA para construir seu dashboard</p>
            </div>
          </button>

          <button
            disabled
            className="flex w-full items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 opacity-40 cursor-not-allowed text-left"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/[0.04]">
              <LayoutTemplate className="h-5 w-5 text-white/40" />
            </div>
            <div>
              <p className="text-[13px] font-medium text-white/50">Importar template</p>
              <p className="text-[11px] text-white/30">Em breve — templates prontos para importar</p>
            </div>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/widgets/nav-sidebar/ui/NewReportModal.tsx
git commit -m "feat(sidebar): add NewReportModal with create-from-scratch option"
```

---

### Task 8: Refactor NavSidebar to use GroupTabs + ReportList

**Files:**
- Modify: `src/widgets/nav-sidebar/ui/NavSidebar.tsx`

- [ ] **Step 1: Read current NavSidebar and understand its structure**

The sidebar currently renders:
1. Logo / ClientSwitcher
2. Immersive mode button (explore link)
3. Nav/Chat toggle tabs
4. NAV_ITEMS grouped navigation
5. Anexos section
6. Admin section
7. User profile + logout

We need to replace sections 3-5 (NAV_ITEMS + Anexos) with GroupTabs + ReportList while keeping everything else.

- [ ] **Step 2: Replace static nav with GroupTabs + ReportList**

In the NavSidebar, replace the `NAV_ITEMS` navigation section with:

```tsx
import { GroupTabs } from './GroupTabs';
import { ReportList } from './ReportList';
import { NewReportModal } from './NewReportModal';
```

Then in the expanded sidebar content, replace the nav items list with:

```tsx
{/* Group tabs */}
<div className="border-b border-white/[0.04]">
  <GroupTabs />
</div>

{/* Report list */}
<ReportList onNewReport={() => setNewReportOpen(true)} />

{/* New report modal */}
<NewReportModal
  open={newReportOpen}
  onClose={() => setNewReportOpen(false)}
  groupId={activeGroupId}
/>
```

Add state: `const [newReportOpen, setNewReportOpen] = useState(false);`
Add: `const activeGroupId = useAppStore((s) => s.activeGroupId);`

Remove imports for `NAV_ITEMS` and `ANEXO_ITEMS` from constants.

Keep the Nav/Chat tab toggle, admin section, explore button, and user profile.

- [ ] **Step 3: Handle collapsed sidebar**

When collapsed, show just the first letter of the active group as an icon badge. On hover, show popover with report list. This can be simplified for now — just show a folder icon that expands the sidebar on click.

- [ ] **Step 4: Verify build**

Run: `pnpm build`

- [ ] **Step 5: Commit**

```bash
git add src/widgets/nav-sidebar/ui/NavSidebar.tsx
git commit -m "feat(sidebar): replace static NAV_ITEMS with GroupTabs + ReportList"
```

---

### Task 9: Dynamic report routes

**Files:**
- Create: `app/(dashboard)/g/[groupId]/r/[reportId]/page.tsx`
- Create: `app/(dashboard)/g/[groupId]/page.tsx`
- Create: `src/pages/report/ui/ReportPage.tsx`

- [ ] **Step 1: Create ReportPage component**

A page that loads a report from Firestore and renders its blocks using the existing `BlockRenderer` from the explore/canvas system.

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { AppBar } from '@/widgets/app-bar';
import { useAppStore } from '@/shared/stores/app-store';
import { getReport, type Report } from '@/shared/lib/firestore/reports';
import { useGroups } from '@/shared/hooks/useGroups';
import { CanvasBlockRenderer } from '@/pages/explore/ui/CanvasBlockRenderer';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { cn } from '@/shared/lib/utils';
import { Loader2 } from 'lucide-react';

export function ReportPage() {
  const params = useParams<{ groupId: string; reportId: string }>();
  const activeClientId = useAppStore((s) => s.activeClientId);
  const setActiveReport = useAppStore((s) => s.setActiveReport);
  const { groups } = useGroups();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const group = groups.find((g) => g.id === params.groupId);

  useEffect(() => {
    if (!activeClientId || !params.groupId || !params.reportId) return;
    setActiveReport(params.groupId, params.reportId);

    setLoading(true);
    getReport(activeClientId, params.groupId, params.reportId)
      .then(setReport)
      .finally(() => setLoading(false));
  }, [activeClientId, params.groupId, params.reportId, setActiveReport]);

  if (loading) {
    return (
      <>
        <AppBar pageTitle="Carregando..." groupName={group?.name} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-white/20" />
        </div>
      </>
    );
  }

  if (!report) {
    return (
      <>
        <AppBar pageTitle="Relatório não encontrado" groupName={group?.name} />
        <div className="flex-1 flex items-center justify-center">
          <p className="text-white/30 text-sm">Este relatório não existe ou foi removido.</p>
        </div>
      </>
    );
  }

  const blockCount = Object.keys(report.blockMap ?? {}).length;

  return (
    <>
      <AppBar pageTitle={report.name} groupName={group?.name} />
      <ScrollArea className="flex-1">
        <div className="p-6">
          {blockCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <p className="text-white/30 text-sm mb-2">Relatório vazio</p>
              <p className="text-white/20 text-xs">Use o modo edição para adicionar blocos</p>
            </div>
          ) : (
            <div className="space-y-4">
              {(report.layout ?? []).map((row) => (
                <div key={row.id} className="grid grid-cols-3 gap-4">
                  {row.blockIds.map((blockId) => {
                    const block = report.blockMap[blockId];
                    if (!block) return null;
                    return (
                      <div key={blockId} className={cn('col-span-' + (block.colSpan ?? 1))}>
                        <CanvasBlockRenderer block={block} />
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
```

- [ ] **Step 2: Create route files**

`app/(dashboard)/g/[groupId]/r/[reportId]/page.tsx`:
```tsx
export { ReportPage as default } from '@/pages/report';
```

`app/(dashboard)/g/[groupId]/page.tsx`:
```tsx
'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useReports } from '@/shared/hooks/useReports';

export default function GroupPage() {
  const params = useParams<{ groupId: string }>();
  const router = useRouter();
  const { reports, loading } = useReports(params.groupId);

  useEffect(() => {
    if (!loading && reports.length > 0) {
      router.replace(`/g/${params.groupId}/r/${reports[0].id}`);
    }
  }, [loading, reports, params.groupId, router]);

  return (
    <div className="flex-1 flex items-center justify-center">
      <p className="text-white/20 text-sm">
        {loading ? 'Carregando...' : 'Nenhum relatório neste grupo'}
      </p>
    </div>
  );
}
```

Create barrel export:
`src/pages/report/index.ts`:
```tsx
export { ReportPage } from './ui/ReportPage';
```

- [ ] **Step 3: Verify build**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add app/(dashboard)/g/ src/pages/report/
git commit -m "feat(routes): add dynamic report routes /g/[groupId]/r/[reportId]"
```

---

### Task 10: Update BottomTabBar for dynamic reports

**Files:**
- Modify: `src/widgets/bottom-tab-bar/ui/BottomTabBar.tsx`

- [ ] **Step 1: Update mobile nav**

The BottomTabBar currently uses hardcoded routes. Replace with dynamic navigation that shows the active group's reports. Read the current file first.

For the mobile bar, show:
- First 3-4 reports from active group as tabs
- "Mais" (more) button with remaining reports

If no groups/reports exist, show a simplified "Create first group" CTA.

- [ ] **Step 2: Verify build**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/widgets/bottom-tab-bar/
git commit -m "feat(mobile): update BottomTabBar for dynamic report navigation"
```

---

### Task 11: Build verification and final polish

**Files:**
- Possibly adjust: multiple files

- [ ] **Step 1: Full build check**

Run: `pnpm build`
Fix any TypeScript errors.

- [ ] **Step 2: Verify navigation flow**

Run: `pnpm dev`

Test in browser:
1. Sidebar shows GroupTabs (empty initially)
2. Click "+" to create a group inline
3. Group tab appears, report list shows empty state
4. Click "+ Novo relatório" → modal opens
5. Click "Criar do zero" → navigates to /explore
6. Old routes (/dashboard, /contratos, etc.) still render their static pages (just not linked from sidebar)
7. Client switch clears group/report selection

- [ ] **Step 3: Commit any fixes**

```bash
git add -u
git commit -m "fix: phase 3 build and navigation polish"
```
