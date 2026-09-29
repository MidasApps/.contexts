/**
 * Lógica de autorização PURA (por rota), reutilizável no cliente e no
 * SERVIDOR. Espelha exatamente useUserPermissions para que o enforcement
 * server-side (G1) não divirja do que a UI mostra.
 *
 * Modelo (ADR-0006): users/{id} aponta para `groups` (grupos de permissão) e
 * `clientAccess[]` com overrides por cliente. groups/{id} declara `routes`.
 */

export interface PermissionGroup {
  id: string;
  routes: string[];
}

export interface ClientAccessEntry {
  clientId: string;
  routeOverrides?: string[] | null;
}

export interface UserAccessDoc {
  groups: string[];
  clientAccess: ClientAccessEntry[];
}

/** União das `routes` dos grupos a que o usuário pertence. */
export function computeBaseRoutes(userGroupIds: string[], groups: PermissionGroup[]): string[] {
  const ids = new Set(userGroupIds);
  const routes = new Set<string>();
  for (const g of groups) {
    if (ids.has(g.id)) g.routes.forEach((r) => routes.add(r));
  }
  return [...routes];
}

export function canAccessRoute(opts: {
  isAdmin: boolean;
  user: UserAccessDoc | null;
  groups: PermissionGroup[];
  clientId: string;
  route: string;
}): boolean {
  const { isAdmin, user, groups, clientId, route } = opts;
  if (isAdmin) return true;
  if (!user) return false;
  const ca = user.clientAccess.find((c) => c.clientId === clientId);
  if (!ca) return false;
  if (Array.isArray(ca.routeOverrides)) return ca.routeOverrides.includes(route);
  return computeBaseRoutes(user.groups, groups).includes(route);
}

/** true se todo item de `candidate` pertence a `universe`. Conjunto vazio é subconjunto de qualquer um. */
export function isSubset(candidate: string[], universe: string[]): boolean {
  const set = new Set(universe);
  return candidate.every((c) => set.has(c));
}

/**
 * Merge por tenant de clientAccess para um caller com escopo restrito (§3.3):
 * entradas de tenants FORA de `scope` no doc existente são preservadas intactas;
 * dentro de `scope`, o incoming substitui (incluindo remoção). Entradas incoming
 * de tenants fora de `scope` são descartadas (não concede cross-tenant).
 */
export function mergeClientAccessByScope(
  existing: ClientAccessEntry[],
  incoming: ClientAccessEntry[],
  scope: string[],
): ClientAccessEntry[] {
  const inScope = new Set(scope);
  const preserved = existing.filter((ca) => !inScope.has(ca.clientId));
  const mutable = incoming.filter((ca) => inScope.has(ca.clientId));
  return [...preserved, ...mutable];
}

/** Idem para adminClientIds (sub-delegação). Preserva fora do escopo, aplica dentro, dedup. */
export function mergeAdminClientIdsByScope(
  existing: string[],
  incoming: string[],
  scope: string[],
): string[] {
  const inScope = new Set(scope);
  const preserved = existing.filter((id) => !inScope.has(id));
  const mutable = incoming.filter((id) => inScope.has(id));
  return [...new Set([...preserved, ...mutable])];
}
