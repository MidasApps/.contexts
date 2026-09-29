import '@/shared/lib/firebase/admin';
import { getAuth } from 'firebase-admin/auth';
import { getDb } from '@/shared/lib/firebase/admin';
import { DEV_BYPASS_EMAIL, isAdminEmail, isDevAuthBypassEnabled } from '@/shared/lib/runtime-config';
import { canAccessRoute, isSubset, type PermissionGroup, type UserAccessDoc } from '@/shared/lib/permissions/authorize';

// ─── Token verification cache ─────────────────────────────────────────────────
// Caches verifyIdToken results for 60 seconds to avoid redundant crypto checks
// when the same JWT is sent across parallel requests during a page load.

interface CachedToken {
  email: string;
  expiresAt: number;
}

const TOKEN_CACHE_TTL_MS = 60_000;
const tokenCache = new Map<string, CachedToken>();

function getCachedEmail(token: string): string | null {
  const cached = tokenCache.get(token);
  if (!cached) return null;
  if (Date.now() >= cached.expiresAt) {
    tokenCache.delete(token);
    return null;
  }
  return cached.email;
}

function setCachedEmail(token: string, email: string): void {
  if (tokenCache.size > 0 && tokenCache.size % 100 === 0) {
    const now = Date.now();
    for (const [k, v] of tokenCache) {
      if (now >= v.expiresAt) tokenCache.delete(k);
    }
  }
  tokenCache.set(token, { email, expiresAt: Date.now() + TOKEN_CACHE_TTL_MS });
}

// ─── Auth verification ────────────────────────────────────────────────────────

/**
 * Extracts Bearer token from request header and verifies with Firebase Admin SDK.
 * Returns the user's email if valid, or null otherwise.
 */
export async function verifyAuthToken(req: Request): Promise<string | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    if (isDevAuthBypassEnabled()) return DEV_BYPASS_EMAIL;
    return null;
  }

  const token = authHeader.slice(7);
  if (!token) {
    if (isDevAuthBypassEnabled()) return DEV_BYPASS_EMAIL;
    return null;
  }

  const cached = getCachedEmail(token);
  if (cached) return cached;

  try {
    const decoded = await getAuth().verifyIdToken(token);
    const email = decoded.email ?? null;
    if (email) setCachedEmail(token, email);
    return email;
  } catch {
    if (isDevAuthBypassEnabled()) return DEV_BYPASS_EMAIL;
    return null;
  }
}

// ─── Dataset access verification ──────────────────────────────────────────────

/**
 * Verifica se o usuário pode acessar o `dataset` solicitado.
 * Bypass para admins.
 *
 * Dois caminhos:
 * - **Com `clientId`** (preferido): faz lookup direto do doc `clients/{clientId}`,
 *   confirma que o `dataset` realmente pertence a esse cliente (campo legado
 *   `dataset` OU algum `productBindings[].datasets[].datasetId`) e cruza com
 *   o `clientAccess` do usuário. Cobre clientes no formato novo
 *   (`productBindings`) sem campo `dataset` legado.
 * - **Sem `clientId`** (back-compat): localiza o cliente pelo campo legado
 *   `where('dataset','==',dataset)`. Mantido para `/api/chat` e
 *   `/api/canvas-chat`.
 */
export async function verifyDatasetAccess(
  email: string,
  dataset: string,
  clientId?: string,
): Promise<{ allowed: boolean; error?: string; status?: number }> {
  if (!dataset?.trim()) {
    return { allowed: false, error: 'Dataset inválido', status: 400 };
  }

  if (isAdminEmail(email)) {
    return { allowed: true };
  }

  const db = getDb();

  // ── Caminho novo (preferido): clientId conhecido ────────────────────────────
  if (clientId) {
    const [usersSnap, clientSnap] = await Promise.all([
      db.collection('users').where('email', '==', email).limit(1).get(),
      db.collection('clients').doc(clientId).get(),
    ]);

    if (!clientSnap.exists) {
      return { allowed: false, error: 'Cliente não encontrado', status: 403 };
    }

    // Confirma que o dataset pertence a este cliente (legado OU productBindings).
    const clientData = clientSnap.data() ?? {};
    const legacyMatch = clientData.dataset === dataset;
    const bindings: Array<{ datasets?: Array<{ datasetId?: string }> }> = Array.isArray(
      clientData.productBindings,
    )
      ? clientData.productBindings
      : [];
    const bindingMatch = bindings.some((b) =>
      Array.isArray(b?.datasets) && b.datasets.some((d) => d?.datasetId === dataset),
    );
    if (!legacyMatch && !bindingMatch) {
      return { allowed: false, error: 'Dataset não pertence ao cliente', status: 403 };
    }

    if (usersSnap.empty) {
      return { allowed: false, error: 'Usuário não configurado', status: 403 };
    }

    const userData = usersSnap.docs[0].data();
    const clientAccess: { clientId: string }[] = userData.clientAccess ?? [];
    if (!clientAccess.some((ca) => ca.clientId === clientId)) {
      return { allowed: false, error: 'Sem permissão para este cliente', status: 403 };
    }

    return { allowed: true };
  }

  // ── Caminho legado (back-compat): localiza cliente pelo campo `dataset` ──────
  // Run both lookups in parallel
  const [usersSnap, clientsSnap] = await Promise.all([
    db.collection('users').where('email', '==', email).limit(1).get(),
    db.collection('clients').where('dataset', '==', dataset).limit(1).get(),
  ]);

  if (usersSnap.empty) {
    return { allowed: false, error: 'Usuário não configurado', status: 403 };
  }

  // Fail-closed: se nenhum cliente reivindica este dataset (campo legado), negar.
  // Antes o acesso era CONCEDIDO para datasets "órfãos", permitindo a um usuário
  // autenticado ler dados de qualquer dataset não mapeado — vazamento cross-tenant
  // (ADR-0006). O `clientAccess` do usuário precisa cobrir o cliente dono do dataset.
  if (clientsSnap.empty) {
    return { allowed: false, error: 'Dataset não pertence a nenhum cliente', status: 403 };
  }

  const userData = usersSnap.docs[0].data();
  const clientAccess: { clientId: string }[] = userData.clientAccess ?? [];
  const matchedClientId = clientsSnap.docs[0].id;
  if (!clientAccess.some((ca) => ca.clientId === matchedClientId)) {
    return { allowed: false, error: 'Sem permissão para este cliente', status: 403 };
  }

  return { allowed: true };
}

// ─── Client (tenant) access verification ──────────────────────────────────────

/**
 * Verifica se o usuário tem acesso ao `clientId` (tenant) solicitado.
 *
 * Admins têm acesso a todos os clientes; demais usuários precisam ter o
 * `clientId` no seu `users/{email}.clientAccess`. Use em rotas tenant-scoped
 * que recebem `clientId` de body/query (relatórios, grupos de relatórios, …)
 * para impedir IDOR cross-tenant — o `clientId` nunca deve ser confiado sem
 * cruzar com as permissões do usuário (ADR-0006).
 */
export async function verifyClientAccess(
  email: string,
  clientId: string,
): Promise<{ allowed: boolean; error?: string; status?: number }> {
  if (!clientId?.trim()) {
    return { allowed: false, error: 'clientId inválido', status: 400 };
  }

  if (isAdminEmail(email)) {
    return { allowed: true };
  }

  const db = getDb();
  const usersSnap = await db.collection('users').where('email', '==', email).limit(1).get();
  if (usersSnap.empty) {
    return { allowed: false, error: 'Usuário não configurado', status: 403 };
  }

  const userData = usersSnap.docs[0].data();
  const clientAccess: { clientId: string }[] = userData.clientAccess ?? [];
  if (!clientAccess.some((ca) => ca.clientId === clientId)) {
    return { allowed: false, error: 'Sem permissão para este cliente', status: 403 };
  }

  return { allowed: true };
}

// ─── Route (page) permission verification ─────────────────────────────────────

/**
 * Verifica se o usuário pode acessar uma `route` (página) de um cliente,
 * aplicando NO SERVIDOR a mesma lógica dos hooks de permissão da UI
 * (routeOverrides por cliente > rotas dos grupos). Sem isso, a permissão fina
 * era apenas cosmética — qualquer usuário com acesso ao cliente podia buscar
 * dados de páginas restritas chamando a API direto (G1 da auditoria, ADR-0006).
 */
export async function verifyRouteAccess(
  email: string,
  clientId: string,
  route: string,
): Promise<{ allowed: boolean; error?: string; status?: number }> {
  if (isAdminEmail(email)) {
    return { allowed: true };
  }

  const db = getDb();
  const usersSnap = await db.collection('users').where('email', '==', email).limit(1).get();
  if (usersSnap.empty) {
    return { allowed: false, error: 'Usuário não configurado', status: 403 };
  }

  const userData = usersSnap.docs[0].data();
  const user: UserAccessDoc = {
    groups: (userData.groups as string[]) ?? [],
    clientAccess: ((userData.clientAccess ?? []) as Array<Record<string, unknown>>).map((ca) => ({
      clientId: ca.clientId as string,
      routeOverrides: (ca.routeOverrides as string[] | null | undefined) ?? null,
    })),
  };

  const groupsSnap = await db.collection('groups').get();
  const groups: PermissionGroup[] = groupsSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      routes: (data.routes as string[]) ?? [],
    };
  });

  if (!canAccessRoute({ isAdmin: false, user, groups, clientId, route })) {
    return { allowed: false, error: 'Sem permissão para esta página', status: 403 };
  }
  return { allowed: true };
}

// ─── Provisionamento (RBAC clientAdmin, ADR-0018) ─────────────────────────────

export interface ProvisionScope {
  allowed: boolean;
  global: boolean;
  adminClientIds: string[];
  error?: string;
  status?: number;
}

/**
 * Resolve o escopo de provisionamento do chamador (server-side, ADR-0006 §1):
 * admin global (isAdminEmail) → escopo total; senão lê `users/{email}.adminClientIds`.
 * Fail-closed: sem doc ou adminClientIds vazio → negado.
 */
export async function getProvisionScope(callerEmail: string): Promise<ProvisionScope> {
  if (isAdminEmail(callerEmail)) {
    return { allowed: true, global: true, adminClientIds: [] };
  }
  const db = getDb();
  const snap = await db.collection('users').where('email', '==', callerEmail).limit(1).get();
  if (snap.empty) {
    return { allowed: false, global: false, adminClientIds: [], error: 'Sem permissão para provisionar', status: 403 };
  }
  const adminClientIds: string[] = (snap.docs[0].data().adminClientIds as string[] | undefined) ?? [];
  if (adminClientIds.length === 0) {
    return { allowed: false, global: false, adminClientIds: [], error: 'Sem permissão para provisionar', status: 403 };
  }
  return { allowed: true, global: false, adminClientIds };
}

export interface ProvisionTarget {
  email: string;
  clientAccess: { clientId: string }[];
  adminClientIds?: string[];
}

/**
 * Autoriza o chamador a provisionar/editar `target` (§3.2). Admin global: livre.
 * clientAdmin: (a) tenants do target ⊆ escopo; (b) target não vira admin global
 * (bloqueia email no domínio admin — senão isAdminEmail fallback promoveria, V1);
 * (c) sub-delegação de adminClientIds ⊆ escopo. Tudo fail-closed.
 */
export async function verifyCanProvision(callerEmail: string, target: ProvisionTarget): Promise<ProvisionScope> {
  const scope = await getProvisionScope(callerEmail);
  if (!scope.allowed) return scope;
  if (scope.global) return { allowed: true, global: true, adminClientIds: [] };

  const targetTenants = (target.clientAccess ?? []).map((c) => c.clientId);
  if (!isSubset(targetTenants, scope.adminClientIds)) {
    return { allowed: false, global: false, adminClientIds: scope.adminClientIds, error: 'Tenant fora do seu escopo', status: 403 };
  }
  if (isAdminEmail(target.email)) {
    return { allowed: false, global: false, adminClientIds: scope.adminClientIds, error: 'Não é permitido provisionar admin global', status: 403 };
  }
  if (!isSubset(target.adminClientIds ?? [], scope.adminClientIds)) {
    return { allowed: false, global: false, adminClientIds: scope.adminClientIds, error: 'Sub-delegação fora do escopo', status: 403 };
  }
  return { allowed: true, global: false, adminClientIds: scope.adminClientIds };
}
