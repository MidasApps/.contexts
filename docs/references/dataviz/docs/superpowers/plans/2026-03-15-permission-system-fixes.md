# Permission System Bug Fixes

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 critical permission system bugs that prevent non-admin users from loading permissions and expose data on error.

**Architecture:** Firestore-based RBAC with groups/clientAccess per user, admin determined by email domain. Fixes align the client-side permission hook with Firestore security rules, unify the user document schema, and harden error handling.

**Tech Stack:** Next.js 16, Firebase Auth, Firestore, Zustand, TypeScript

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `src/shared/hooks/useUserPermissions.ts` | Modify | Fix Firestore query to use `getDoc` by UID |
| `src/features/auth/model/types.ts` | Modify | Remove legacy `UserRole`, `ROLE_PERMISSIONS`, `hasAccess` |
| `src/features/auth/model/useAuth.ts` | Modify | Unify schema: add `groups`, `clientAccess` to profile creation |
| `src/features/auth/providers/AuthProvider.tsx` | Modify | Remove `UserRole` import |
| `src/features/auth/index.ts` | Modify | Remove legacy exports |
| `src/shared/hooks/useClients.ts` | Modify | Remove `FALLBACK_CLIENTS`, use error state |
| `src/features/auth/ui/ProtectedRoute.tsx` | Modify | Smart redirect to first accessible route |

---

## Chunk 1: Core Permission Fixes

### Task 1: Fix Firestore query in useUserPermissions

**Files:**
- Modify: `src/shared/hooks/useUserPermissions.ts`

**Problem:** Collection query `where('email', '==', user.email)` fails for non-admins due to Firestore rules requiring `request.auth.uid == uid`.

- [ ] **Step 1: Change collection query to doc-level getDoc**

Replace the `query(collection(...), where('email', ...))` + `getDocs` pattern with `doc(db, 'users', user.uid)` + `getDoc`. Also fetch groups collection separately.

```typescript
// Before (line 25):
const usersQuery = query(collection(db, 'users'), where('email', '==', user.email));
Promise.all([
  getDocs(usersQuery),
  getDocs(collection(db, 'groups')),
]).then(([uSnap, gSnap]) => {
  if (!uSnap.empty) {
    const data = uSnap.docs[0].data();
    setUserDoc({ groups: data.groups ?? [], clientAccess: data.clientAccess ?? [] });
  }
  ...

// After:
const userDocRef = doc(db, 'users', user.uid);
Promise.all([
  getDoc(userDocRef),
  getDocs(collection(db, 'groups')),
]).then(([uSnap, gSnap]) => {
  if (uSnap.exists()) {
    const data = uSnap.data();
    setUserDoc({ groups: data.groups ?? [], clientAccess: data.clientAccess ?? [] });
  }
  ...
```

Update imports: replace `collection, getDocs, query, where` with `doc, getDoc, collection, getDocs`.

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`
Expected: No TypeScript or build errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/hooks/useUserPermissions.ts
git commit -m "fix: use doc-level getDoc in useUserPermissions for Firestore rules compat"
```

---

### Task 2: Unify user document schema in useAuth

**Files:**
- Modify: `src/features/auth/model/types.ts`
- Modify: `src/features/auth/model/useAuth.ts`
- Modify: `src/features/auth/providers/AuthProvider.tsx`
- Modify: `src/features/auth/index.ts`

**Problem:** `useAuth` creates profiles with `{ uid, email, role, ... }` but permissions system expects `{ email, groups, clientAccess, ... }`.

- [ ] **Step 1: Update UserProfile interface and remove legacy types**

In `src/features/auth/model/types.ts`:
- Remove `UserRole` type
- Remove `ROLE_PERMISSIONS` const
- Remove `hasAccess()` function
- Remove `role` field from `UserProfile`
- Add `groups` and `clientAccess` optional fields for backward compat

```typescript
// New types.ts content:
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL: string | null;
  groups?: string[];
  clientAccess?: Array<{ clientId: string; routeOverrides?: string[] | null }>;
  createdAt: string;
}
```

- [ ] **Step 2: Update useAuth.ts profile creation**

In `src/features/auth/model/useAuth.ts`:
- Remove `UserRole` import
- Update `newProfile` to include `groups: []` and `clientAccess: []`
- Remove `role` field

```typescript
const newProfile: UserProfile = {
  uid: user.uid,
  email: user.email ?? '',
  displayName: user.displayName,
  photoURL: user.photoURL,
  groups: [],
  clientAccess: [],
  createdAt: new Date().toISOString(),
};
```

- [ ] **Step 3: Update AuthProvider.tsx**

Remove `UserRole` from the import in `src/features/auth/providers/AuthProvider.tsx`:

```typescript
// Before:
import type { UserProfile, UserRole } from '../model/types';
// After:
import type { UserProfile } from '../model/types';
```

- [ ] **Step 4: Update barrel exports**

In `src/features/auth/index.ts`, remove legacy exports:

```typescript
// Remove these lines:
export { hasAccess, ROLE_PERMISSIONS } from './model/types';
export type { UserRole, UserProfile } from './model/types';

// Replace with:
export type { UserProfile } from './model/types';
```

- [ ] **Step 5: Verify build passes**

Run: `pnpm build`
Expected: No TypeScript or build errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/auth/model/types.ts src/features/auth/model/useAuth.ts src/features/auth/providers/AuthProvider.tsx src/features/auth/index.ts
git commit -m "fix: unify user document schema and remove legacy role system"
```

---

### Task 3: Remove FALLBACK_CLIENTS in useClients

**Files:**
- Modify: `src/shared/hooks/useClients.ts`

**Problem:** On API error, falls back to all 4 hardcoded clients without permission filtering.

- [ ] **Step 1: Replace FALLBACK_CLIENTS with error state**

Remove `FALLBACK_CLIENTS` const. In the catch blocks, call `setClientsError()` instead of `setClients(FALLBACK_CLIENTS)`. Keep the empty Firestore fallback as an info message.

```typescript
// Remove lines 6-11 (FALLBACK_CLIENTS const)

// Line 67-69: Replace Firestore empty fallback
// Before:
useAppStore.getState().setClients(FALLBACK_CLIENTS);
// After:
useAppStore.getState().setClientsError('Nenhum cliente configurado no Firestore.');

// Line 73-75: Replace error fallback
// Before:
console.warn('[useClients] Falha ao buscar clientes, usando fallback:', error);
useAppStore.getState().setClients(FALLBACK_CLIENTS);
// After:
const msg = error instanceof Error ? error.message : 'Erro ao carregar clientes';
useAppStore.getState().setClientsError(msg);
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`
Expected: No TypeScript or build errors.

- [ ] **Step 3: Commit**

```bash
git add src/shared/hooks/useClients.ts
git commit -m "fix: remove FALLBACK_CLIENTS, show error state on API failure"
```

---

### Task 4: Fix ProtectedRoute blank screen for users without /dashboard access

**Files:**
- Modify: `src/features/auth/ui/ProtectedRoute.tsx`

**Problem:** Users without `/dashboard` access get redirected there and see blank screen.

- [ ] **Step 1: Redirect to first accessible route instead of /dashboard**

Import `baseRoutes` from `useUserPermissions`. Update the redirect logic to find the first accessible route.

```typescript
// In the hook destructuring (line 21):
const { isAdmin, loading, canAccessRoute, baseRoutes } = useUserPermissions();

// Replace the redirect useEffect (lines 29-39):
useEffect(() => {
  if (loading) return;
  if (!user) return;
  if (isAdmin) return;
  if (!activeClientId) return;
  if (canAccessRoute(activeClientId, pathToCheck)) return;

  // Find first accessible route to redirect to
  const fallbackRoute = baseRoutes.find(
    (r) => r !== pathToCheck && canAccessRoute(activeClientId, r)
  );

  if (fallbackRoute) {
    router.replace(fallbackRoute);
  }
  // If no route accessible, EmptyState below will show
}, [loading, user, isAdmin, canAccessRoute, activeClientId, pathToCheck, router, baseRoutes]);
```

Also add an EmptyState for when no routes are accessible at all (after the existing EmptyState for no clients):

```typescript
// After the clientsStatus check (after line 71), add:
if (!loading && user && !isAdmin && baseRoutes.length === 0) {
  return (
    <div className="p-6">
      <EmptyState
        title="Sem permissão"
        description="Seu usuário não possui acesso a nenhuma página. Entre em contato com o administrador."
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`
Expected: No TypeScript or build errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/auth/ui/ProtectedRoute.tsx
git commit -m "fix: redirect to first accessible route instead of always /dashboard"
```

---

## Verification

After all tasks:

- [ ] **Final build check**: `pnpm build` passes cleanly
- [ ] **Final lint check**: `pnpm lint` passes cleanly
