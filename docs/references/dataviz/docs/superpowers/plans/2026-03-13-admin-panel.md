# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin panel at `/admin` for managing clients, groups, and user permissions, persisted in Firestore, with integration into the existing auth and client-switching system.

**Architecture:** Firestore for persistence (3 collections: clients, groups, users). Admin feature module under `src/features/admin/`. Permission resolution hook consumed by ProtectedRoute and ClientSwitcher. Admin gate via layout-level email check.

**Tech Stack:** Firebase Firestore, Firebase Auth (existing), React, Zustand (existing store), Next.js App Router

---

## Chunk 1: Firestore Types & CRUD Hooks

### Task 1: Admin types

**Files:**
- Create: `src/features/admin/model/types.ts`

- [ ] **Step 1: Create Firestore document interfaces**

```typescript
import { Timestamp } from 'firebase/firestore';

export interface ClientDoc {
  name: string;
  dataset: string;
  color: string;
  initial: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface GroupDoc {
  name: string;
  description: string;
  routes: string[];
  createdAt: Timestamp;
}

export interface ClientAccess {
  clientId: string;
  routeOverrides?: string[] | null;
}

export interface UserDoc {
  email: string;
  displayName: string;
  groups: string[];
  clientAccess: ClientAccess[];
  createdAt: Timestamp;
}

// Runtime types (with id attached)
export interface Client extends Omit<ClientDoc, 'createdAt' | 'updatedAt'> {
  id: string;
}

export interface Group extends Omit<GroupDoc, 'createdAt'> {
  id: string;
}

export interface AppUser extends Omit<UserDoc, 'createdAt'> {
  id: string;
}

export const ALL_ROUTES = [
  { path: '/dashboard', label: 'Visão Geral', group: 'Carteira' },
  { path: '/contratos', label: 'Contratos', group: 'Carteira' },
  { path: '/pagamentos', label: 'Pagamentos', group: 'Carteira' },
  { path: '/fluxo-de-caixa', label: 'Fluxo de Caixa', group: 'Carteira' },
  { path: '/pdd', label: 'PDD', group: 'Risco' },
  { path: '/pricing', label: 'Pricing', group: 'Risco' },
  { path: '/simulacao', label: 'Simulação', group: 'Risco' },
  { path: '/elegibilidade', label: 'Inadimplência', group: 'Operacional' },
  { path: '/repasse', label: 'Repasse', group: 'Operacional' },
  { path: '/detalhamento', label: 'Detalhamento', group: 'Operacional' },
  { path: '/anexos/rating', label: 'Anexo Rating', group: 'Anexos' },
  { path: '/anexos/pdd', label: 'Anexo PDD', group: 'Anexos' },
  { path: '/anexos/elegibilidade', label: 'Anexo Elegibilidade', group: 'Anexos' },
] as const;
```

- [ ] **Step 2: Commit**

```bash
git add src/features/admin/model/types.ts
git commit -m "feat(admin): add Firestore document types and route constants"
```

---

### Task 2: Clients CRUD hook

**Files:**
- Create: `src/features/admin/model/useAdminClients.ts`

- [ ] **Step 1: Create the hook**

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, getDocs, setDoc, deleteDoc, Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/shared/lib/firebase/config';
import type { Client, ClientDoc } from './types';

export function useAdminClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const db = getFirebaseDb();
  const colRef = collection(db, 'clients');

  const fetch = useCallback(async () => {
    setLoading(true);
    const snap = await getDocs(colRef);
    setClients(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Client)));
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const save = useCallback(async (id: string, data: Omit<ClientDoc, 'createdAt' | 'updatedAt'>) => {
    const now = Timestamp.now();
    const existing = clients.find((c) => c.id === id);
    await setDoc(doc(db, 'clients', id), {
      ...data,
      createdAt: existing ? (existing as any).createdAt ?? now : now,
      updatedAt: now,
    });
    await fetch();
  }, [clients, fetch]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'clients', id));
    await fetch();
  }, [fetch]);

  return { clients, loading, save, remove, refetch: fetch };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/admin/model/useAdminClients.ts
git commit -m "feat(admin): add clients CRUD hook"
```

---

### Task 3: Groups CRUD hook

**Files:**
- Create: `src/features/admin/model/useAdminGroups.ts`

- [ ] **Step 1: Create the hook**

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, getDocs, addDoc, updateDoc, deleteDoc, Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/shared/lib/firebase/config';
import type { Group, GroupDoc } from './types';

export function useAdminGroups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  const db = getFirebaseDb();
  const colRef = collection(db, 'groups');

  const fetch = useCallback(async () => {
    setLoading(true);
    const snap = await getDocs(colRef);
    setGroups(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Group)));
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const create = useCallback(async (data: Omit<GroupDoc, 'createdAt'>) => {
    await addDoc(colRef, { ...data, createdAt: Timestamp.now() });
    await fetch();
  }, [fetch]);

  const update = useCallback(async (id: string, data: Partial<Omit<GroupDoc, 'createdAt'>>) => {
    await updateDoc(doc(db, 'groups', id), data);
    await fetch();
  }, [fetch]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'groups', id));
    await fetch();
  }, [fetch]);

  return { groups, loading, create, update, remove, refetch: fetch };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/admin/model/useAdminGroups.ts
git commit -m "feat(admin): add groups CRUD hook"
```

---

### Task 4: Users CRUD hook

**Files:**
- Create: `src/features/admin/model/useAdminUsers.ts`

- [ ] **Step 1: Create the hook**

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  collection, doc, getDocs, setDoc, deleteDoc, Timestamp,
} from 'firebase/firestore';
import { getFirebaseDb } from '@/shared/lib/firebase/config';
import type { AppUser, UserDoc } from './types';

export function useAdminUsers() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);

  const db = getFirebaseDb();
  const colRef = collection(db, 'users');

  const fetch = useCallback(async () => {
    setLoading(true);
    const snap = await getDocs(colRef);
    setUsers(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AppUser)));
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const save = useCallback(async (id: string, data: Omit<UserDoc, 'createdAt'>) => {
    const existing = users.find((u) => u.id === id);
    await setDoc(doc(db, 'users', id), {
      ...data,
      createdAt: existing ? (existing as any).createdAt ?? Timestamp.now() : Timestamp.now(),
    }, { merge: true });
    await fetch();
  }, [users, fetch]);

  const remove = useCallback(async (id: string) => {
    await deleteDoc(doc(db, 'users', id));
    await fetch();
  }, [fetch]);

  return { users, loading, save, remove, refetch: fetch };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/admin/model/useAdminUsers.ts
git commit -m "feat(admin): add users CRUD hook"
```

---

## Chunk 2: Admin UI Components

### Task 5: RouteCheckboxGrid

**Files:**
- Create: `src/features/admin/ui/RouteCheckboxGrid.tsx`

- [ ] **Step 1: Create reusable route selection grid**

Component that renders `ALL_ROUTES` grouped by category, with checkboxes. Props: `selected: string[]`, `onChange: (routes: string[]) => void`. Groups routes by their `group` field. "Selecionar todos" toggle per group.

- [ ] **Step 2: Commit**

```bash
git add src/features/admin/ui/RouteCheckboxGrid.tsx
git commit -m "feat(admin): add RouteCheckboxGrid component"
```

---

### Task 6: ClientForm

**Files:**
- Create: `src/features/admin/ui/ClientForm.tsx`

- [ ] **Step 1: Create client add/edit form**

Modal/dialog with fields: nome (input), dataset (input), cor (preset color swatches), inicial (1 char input). Save/cancel buttons. Receives optional `client: Client` for edit mode, `onSave`, `onCancel` callbacks.

- [ ] **Step 2: Commit**

```bash
git add src/features/admin/ui/ClientForm.tsx
git commit -m "feat(admin): add ClientForm component"
```

---

### Task 7: ClientsTab

**Files:**
- Create: `src/features/admin/ui/ClientsTab.tsx`

- [ ] **Step 1: Create clients tab with table and CRUD**

Table with columns: Inicial (colored circle), Nome, Dataset, Ações (edit/delete buttons). "Adicionar cliente" button opens ClientForm. Delete has confirmation dialog. Uses `useAdminClients` hook.

- [ ] **Step 2: Commit**

```bash
git add src/features/admin/ui/ClientsTab.tsx
git commit -m "feat(admin): add ClientsTab component"
```

---

### Task 8: GroupForm

**Files:**
- Create: `src/features/admin/ui/GroupForm.tsx`

- [ ] **Step 1: Create group add/edit form**

Modal with fields: nome, descrição, and `RouteCheckboxGrid` for route selection. Receives optional `group: Group` for edit mode.

- [ ] **Step 2: Commit**

```bash
git add src/features/admin/ui/GroupForm.tsx
git commit -m "feat(admin): add GroupForm component"
```

---

### Task 9: GroupsTab

**Files:**
- Create: `src/features/admin/ui/GroupsTab.tsx`

- [ ] **Step 1: Create groups tab with table and CRUD**

Table: Nome, Descrição, Rotas (count badge), Ações. "Adicionar grupo" button. Delete warns if users are assigned to this group (cross-reference with `useAdminUsers`).

- [ ] **Step 2: Commit**

```bash
git add src/features/admin/ui/GroupsTab.tsx
git commit -m "feat(admin): add GroupsTab component"
```

---

### Task 10: UserForm

**Files:**
- Create: `src/features/admin/ui/UserForm.tsx`

- [ ] **Step 1: Create user add/edit form**

Modal with: email input, displayName input, multi-select for groups (from `useAdminGroups`), multi-select for clients (from `useAdminClients`). For each selected client, expandable section with toggle "Usar rotas do grupo" vs custom `RouteCheckboxGrid`. Generates the `clientAccess` array with `routeOverrides`.

- [ ] **Step 2: Commit**

```bash
git add src/features/admin/ui/UserForm.tsx
git commit -m "feat(admin): add UserForm component"
```

---

### Task 11: UsersTab

**Files:**
- Create: `src/features/admin/ui/UsersTab.tsx`

- [ ] **Step 1: Create users tab with table and CRUD**

Table: Email, Nome, Grupos (badges), Clientes (badges), Ações. Search input filters by email/name. "Adicionar usuário" button. Uses `useAdminUsers`, `useAdminGroups`, `useAdminClients` hooks to render badges with names.

- [ ] **Step 2: Commit**

```bash
git add src/features/admin/ui/UsersTab.tsx
git commit -m "feat(admin): add UsersTab component"
```

---

### Task 12: AdminPage + route

**Files:**
- Create: `src/features/admin/ui/AdminPage.tsx`
- Create: `app/(admin)/admin/layout.tsx`
- Create: `app/(admin)/admin/page.tsx`

- [ ] **Step 1: Create AdminPage with 3 tabs**

Component with tab state (Clientes | Grupos | Usuários). Renders the corresponding tab component. Header shows "Administração" title.

- [ ] **Step 2: Create admin layout with gate**

`app/(admin)/admin/layout.tsx`: uses `DashboardLayout` wrapper. Checks if user email ends with `@askliquid.com`. Redirects to `/dashboard` if not. Shows loading skeleton while checking.

- [ ] **Step 3: Create admin page route**

`app/(admin)/admin/page.tsx`: exports `AdminPage`.

- [ ] **Step 4: Add /admin to NAV_ITEMS** in `src/shared/config/constants.ts` — only visible to admin users (handled at render time in NavSidebar).

- [ ] **Step 5: Commit**

```bash
git add src/features/admin/ app/\(admin\)/
git commit -m "feat(admin): add AdminPage with tabs and route gate"
```

---

## Chunk 3: Permission System & Integration

### Task 13: Permission resolution hook

**Files:**
- Create: `src/shared/hooks/useUserPermissions.ts`

- [ ] **Step 1: Create the hook**

```typescript
'use client';

import { useState, useEffect, useMemo } from 'react';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { getFirebaseDb } from '@/shared/lib/firebase/config';
import { useAuthContext } from '@/features/auth/providers/AuthProvider';
import type { UserDoc, GroupDoc } from '@/features/admin/model/types';

export function useUserPermissions() {
  const { user } = useAuthContext();
  const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
  const [groupDocs, setGroupDocs] = useState<GroupDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = user?.email?.endsWith('@askliquid.com') ?? false;

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    const db = getFirebaseDb();
    Promise.all([
      getDoc(doc(db, 'users', user.uid)),
      getDocs(collection(db, 'groups')),
    ]).then(([userSnap, groupsSnap]) => {
      setUserDoc(userSnap.exists() ? userSnap.data() as UserDoc : null);
      setGroupDocs(groupsSnap.docs.map((d) => d.data() as GroupDoc));
    }).finally(() => setLoading(false));
  }, [user]);

  const baseRoutes = useMemo(() => {
    if (!userDoc) return [];
    const userGroupIds = new Set(userDoc.groups);
    const routes = new Set<string>();
    for (const g of groupDocs) {
      // match by iterating — groupDocs don't carry id on data()
      // We need to refetch with ids. Simplify: store group id too.
    }
    // Union all group routes
    return [...routes];
  }, [userDoc, groupDocs]);

  function canAccessClient(clientId: string): boolean {
    if (isAdmin) return true;
    if (!userDoc) return false;
    return userDoc.clientAccess.some((ca) => ca.clientId === clientId);
  }

  function canAccessRoute(clientId: string, route: string): boolean {
    if (isAdmin) return true;
    if (!userDoc) return false;
    const ca = userDoc.clientAccess.find((c) => c.clientId === clientId);
    if (!ca) return false;
    if (ca.routeOverrides) return ca.routeOverrides.includes(route);
    return baseRoutes.includes(route);
  }

  function accessibleClientIds(): string[] {
    if (isAdmin) return []; // means all
    if (!userDoc) return [];
    return userDoc.clientAccess.map((ca) => ca.clientId);
  }

  return { isAdmin, loading, canAccessClient, canAccessRoute, accessibleClientIds, userDoc };
}
```

Note: The group matching logic needs refinement during implementation — groupDocs need their IDs attached. Use same pattern as admin hooks (map with id).

- [ ] **Step 2: Commit**

```bash
git add src/shared/hooks/useUserPermissions.ts
git commit -m "feat: add useUserPermissions hook for permission resolution"
```

---

### Task 14: Reactivate ProtectedRoute

**Files:**
- Modify: `src/features/auth/ui/ProtectedRoute.tsx`

- [ ] **Step 1: Update ProtectedRoute to use permissions**

Replace the passthrough with actual permission checking:
- Use `useUserPermissions()` to check `canAccessRoute(activeClientId, pathname)`
- Get `activeClientId` from `useAppStore`
- Show loading skeleton while permissions load
- Redirect to `/dashboard` if denied
- Admin users always pass

- [ ] **Step 2: Commit**

```bash
git add src/features/auth/ui/ProtectedRoute.tsx
git commit -m "feat: reactivate ProtectedRoute with Firestore permissions"
```

---

### Task 15: Dynamic client loading

**Files:**
- Modify: `src/shared/stores/app-store.ts`
- Modify: `src/widgets/client-switcher/ui/ClientSwitcher.tsx`
- Create: `src/shared/hooks/useClients.ts`

- [ ] **Step 1: Add `setClients` action to app store**

Add `clients: ClientConfig[]` state and `setClients` action to the Zustand store. Keep `CLIENTS` as fallback for when Firestore hasn't loaded yet.

- [ ] **Step 2: Create useClients hook**

Fetches `clients` collection from Firestore on mount, maps to `ClientConfig[]`, calls `setClients` on the store. Falls back to hardcoded `CLIENTS` on error.

- [ ] **Step 3: Update ClientSwitcher**

Filter displayed clients based on `useUserPermissions().accessibleClientIds()`. Admin users see all. Read clients from store instead of hardcoded array.

- [ ] **Step 4: Load clients in Providers.tsx**

Add `useClients()` call in the root Providers component so clients load on app start.

- [ ] **Step 5: Commit**

```bash
git add src/shared/stores/app-store.ts src/widgets/client-switcher/ src/shared/hooks/useClients.ts src/app/providers/Providers.tsx
git commit -m "feat: dynamic client loading from Firestore with permission filtering"
```

---

### Task 16: Firestore security rules

**Files:**
- Create: `firestore.rules`

- [ ] **Step 1: Write security rules**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /clients/{doc} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.email.matches('.*@askliquid\\.com');
    }
    match /groups/{doc} {
      allow read: if request.auth != null;
      allow write: if request.auth.token.email.matches('.*@askliquid\\.com');
    }
    match /users/{uid} {
      allow read: if request.auth != null && (request.auth.uid == uid || request.auth.token.email.matches('.*@askliquid\\.com'));
      allow write: if request.auth.token.email.matches('.*@askliquid\\.com');
    }
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add firestore.rules
git commit -m "feat: add Firestore security rules for admin collections"
```

---

### Task 17: Admin feature barrel export

**Files:**
- Create: `src/features/admin/index.ts`

- [ ] **Step 1: Create barrel export**

```typescript
export { AdminPage } from './ui/AdminPage';
export type { Client, Group, AppUser, ClientDoc, GroupDoc, UserDoc, ClientAccess } from './model/types';
export { ALL_ROUTES } from './model/types';
export { useAdminClients } from './model/useAdminClients';
export { useAdminGroups } from './model/useAdminGroups';
export { useAdminUsers } from './model/useAdminUsers';
```

- [ ] **Step 2: Final commit**

```bash
git add src/features/admin/index.ts
git commit -m "feat(admin): add barrel exports"
```
