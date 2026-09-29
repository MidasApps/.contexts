# Admin Panel — Design Spec

**Date:** 2026-03-13
**Status:** Approved

## Overview

Admin panel at `/admin` for managing clients, user groups, and user access. Only `@askliquid.com` emails can access. Data persisted in Firestore. Permissions are cumulative across groups with per-client route overrides.

## Access Control

- Gate: `user.email.endsWith('@askliquid.com')`
- Enforced in `/admin` layout — redirects unauthorized to `/dashboard`
- Admin users always have full access to all clients and routes

## Firestore Schema

### Collection: `clients`

Document ID = slugified client id (e.g., `om`, `brz`)

```typescript
interface ClientDoc {
  name: string;           // "OM Incorporadora"
  dataset: string;        // "om_monitor"
  color: string;          // "#F3A169"
  initial: string;        // "O"
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Collection: `groups`

Document ID = auto-generated

```typescript
interface GroupDoc {
  name: string;           // "Analistas"
  description: string;    // "Acesso a análises de risco"
  routes: string[];       // ["/dashboard", "/pdd", "/pricing"]
  createdAt: Timestamp;
}
```

### Collection: `users`

Document ID = Firebase Auth UID

```typescript
interface UserDoc {
  email: string;
  displayName: string;
  groups: string[];       // group doc IDs
  clientAccess: {
    clientId: string;
    routeOverrides?: string[] | null;  // null = inherit from groups
  }[];
  createdAt: Timestamp;
}
```

## Permission Resolution

```
function resolvePermissions(user, groups, clientId):
  1. baseRoutes = union of all group.routes for user's groups
  2. clientEntry = user.clientAccess.find(c => c.clientId === clientId)
  3. if no clientEntry → deny access to client
  4. if clientEntry.routeOverrides exists → use those routes
  5. else → use baseRoutes
  6. if user.email ends with @askliquid.com → allow everything
```

## Available Routes (for checkboxes)

Derived from `NAV_ITEMS` and `ANEXO_ITEMS` in `src/shared/config/constants.ts`:

- `/dashboard`, `/contratos`, `/pagamentos`, `/fluxo-de-caixa`
- `/pdd`, `/pricing`, `/simulacao`
- `/elegibilidade`, `/repasse`, `/detalhamento`
- `/anexos/rating`, `/anexos/pdd`, `/anexos/elegibilidade`

## UI Design

### Layout

Single page `/admin` with 3 tabs: **Clientes**, **Grupos**, **Usuários**.

Same dark theme as rest of app. Uses `AppBar` header (no filters, just title "Administração"). Sidebar remains visible for navigation back.

### Tab: Clientes

- Table: Initial (colored circle) | Nome | Dataset | Ações (editar, remover)
- Add button top-right opens inline form or modal
- Form fields: nome, dataset, cor (color picker or preset), inicial (1 char)
- Delete confirmation dialog

### Tab: Grupos

- Table: Nome | Descrição | Rotas (count badge) | Ações
- Add/edit opens form with:
  - Nome, descrição (text inputs)
  - Rotas: grid of checkboxes with all available pages
- Delete warns if group has users assigned

### Tab: Usuários

- Table: Email | Nome | Grupos (badges) | Clientes (badges) | Ações
- Add: email input (must be valid), nome, multi-select for grupos, multi-select for clientes
- Expandable row or edit modal: per-client route overrides
  - For each client assigned: toggle "Usar rotas do grupo" or custom checkbox grid
- Search/filter by email

## Integration with Existing App

### 1. Client loading (app-store.ts)

Replace hardcoded `CLIENTS` array with Firestore fetch:

- New hook `useClients()` fetches `clients` collection
- App store `setClients(clients)` action updates available clients
- `ClientSwitcher` reads from store (already does) — filtered by user access

### 2. ProtectedRoute reactivation

- Fetch user doc from Firestore on auth state change
- Store user permissions in auth context
- `ProtectedRoute` checks resolved permissions for current client + route
- Redirect to `/dashboard` if denied

### 3. ClientSwitcher filtering

- Only show clients the user has access to (from `user.clientAccess`)
- Admin users see all clients

### 4. Firestore security rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Admin collections: only @askliquid.com can write
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

## File Structure

```
src/features/admin/
  model/
    types.ts              — Firestore doc interfaces
    useAdminClients.ts    — CRUD hook for clients
    useAdminGroups.ts     — CRUD hook for groups
    useAdminUsers.ts      — CRUD hook for users
  ui/
    AdminPage.tsx          — main page with tabs
    ClientsTab.tsx         — clients CRUD table
    GroupsTab.tsx          — groups CRUD table + route checkboxes
    UsersTab.tsx           — users CRUD table + client overrides
    ClientForm.tsx         — add/edit client form
    GroupForm.tsx          — add/edit group form
    UserForm.tsx           — add/edit user form
    RouteCheckboxGrid.tsx  — reusable route selection grid

app/(admin)/
  admin/
    layout.tsx             — admin gate (email check)
    page.tsx               — renders AdminPage

src/shared/hooks/
  useUserPermissions.ts    — resolves permissions for current user
```

## Out of Scope

- Audit log of admin actions
- Bulk import/export of users
- Email invitations
- Two-factor auth
