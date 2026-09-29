'use client';

import { createContext, useContext, useState, useEffect, useMemo, type ReactNode } from 'react';
import { doc, collection, query, where, onSnapshot, getDocs } from 'firebase/firestore';
import { getFirebaseDb } from '@/shared/lib/firebase/config';
import { useAuthContext } from '@/features/auth/providers/AuthProvider';
import { isAdminEmail } from '@/shared/lib/runtime-config';
import { useAppStore } from '@/shared/stores/app-store';

interface GroupWithId {
  id: string;
  routes: string[];
}

interface UserDocState {
  groups: string[];
  clientAccess: {
    clientId: string;
    routeOverrides?: string[] | null;
  }[];
}

interface PermissionsContextValue {
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  canAccessClient: (clientId: string) => boolean;
  canAccessRoute: (clientId: string, route: string) => boolean;
  accessibleClientIds: () => string[];
  baseRoutes: string[];
  userDoc: UserDocState | null;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

export function UserPermissionsProvider({ children }: { children: ReactNode }) {
  const { user, embeddedMode } = useAuthContext();
  const [userDoc, setUserDoc] = useState<UserDocState | null>(null);
  const [allGroups, setAllGroups] = useState<GroupWithId[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const testAsUser = useAppStore((s) => s.testAsUser);
  // In embedded mode, treat as admin (parent shell handles auth)
  const isAdmin = embeddedMode ? true : (isAdminEmail(user?.email) && !testAsUser);

  // BUG 7 fix: add .catch() with error state
  // BUG 5 fix: use onSnapshot for real-time permission updates
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    const db = getFirebaseDb();

    let unsubUser: (() => void) | null = null;
    let unsubGroups: (() => void) | null = null;
    // Track whether the email-fallback snapshot is active so we can swap it
    let unsubEmailFallback: (() => void) | null = null;

    const applyUserSnap = (snap: { exists: () => boolean; data: () => Record<string, unknown> } | null) => {
      if (snap?.exists()) {
        const data = snap.data();
        const rawAccess = (data.clientAccess ?? []) as Array<Record<string, unknown>>;
        setUserDoc({
          groups: (data.groups as string[]) ?? [],
          clientAccess: rawAccess.map((ca) => ({
            clientId: ca.clientId as string,
            routeOverrides: (ca.routeOverrides as string[] | null | undefined) ?? null,
          })),
        });
      } else {
        setUserDoc(null);
      }
      setLoading(false);
    };

    // Try UID-based doc first; if it doesn't exist, fall back to email query
    const userDocRef = doc(db, 'users', user.uid);
    unsubUser = onSnapshot(
      userDocRef,
      (snap) => {
        if (snap.exists()) {
          // UID doc found — stop any email-fallback listener
          if (unsubEmailFallback) { unsubEmailFallback(); unsubEmailFallback = null; }
          applyUserSnap(snap);
        } else {
          // UID doc not found — start (or keep) the email-based snapshot
          if (!unsubEmailFallback) {
            const emailQuery = query(collection(db, 'users'), where('email', '==', user.email));
            // One-time fetch to find the doc ID, then listen to that specific doc
            getDocs(emailQuery).then((emailSnap) => {
              if (emailSnap.empty) {
                applyUserSnap(null);
              } else {
                const emailDocRef = emailSnap.docs[0].ref;
                unsubEmailFallback = onSnapshot(
                  emailDocRef,
                  (eSnap) => applyUserSnap(eSnap.exists() ? eSnap : null),
                  (err) => {
                    console.error('[useUserPermissions] Email-doc snapshot error:', err);
                    setError(err instanceof Error ? err.message : 'Erro ao carregar permissões');
                    setLoading(false);
                  },
                );
              }
            }).catch((err) => {
              console.error('[useUserPermissions] Email query failed:', err);
              setError(err instanceof Error ? err.message : 'Erro ao carregar permissões');
              setLoading(false);
            });
          }
        }
      },
      (err) => {
        console.error('[useUserPermissions] User-doc snapshot error:', err);
        setError(err instanceof Error ? err.message : 'Erro ao carregar permissões');
        setLoading(false);
      },
    );

    // Groups collection — real-time listener
    unsubGroups = onSnapshot(
      collection(db, 'groups'),
      (gSnap) => {
        setAllGroups(gSnap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            routes: (data.routes as string[]) ?? [],
          };
        }));
      },
      (err) => {
        console.error('[useUserPermissions] Groups snapshot error:', err);
        setError(err instanceof Error ? err.message : 'Erro ao carregar permissões');
      },
    );

    return () => {
      unsubUser?.();
      unsubGroups?.();
      unsubEmailFallback?.();
    };
  }, [user]);

  const baseRoutes = useMemo(() => {
    if (!userDoc) return [] as string[];
    const userGroupIds = new Set(userDoc.groups);
    const routes = new Set<string>();
    for (const g of allGroups) {
      if (userGroupIds.has(g.id)) {
        g.routes.forEach((r) => routes.add(r));
      }
    }
    return [...routes];
  }, [userDoc, allGroups]);

  const canAccessClient = useMemo(() => (clientId: string): boolean => {
    if (isAdmin) return true;
    if (!userDoc) return false;
    return userDoc.clientAccess.some((ca) => ca.clientId === clientId);
  }, [isAdmin, userDoc]);

  const canAccessRoute = useMemo(() => (clientId: string, route: string): boolean => {
    if (isAdmin) return true;
    if (!userDoc) return false;
    const ca = userDoc.clientAccess.find((c) => c.clientId === clientId);
    if (!ca) return false;
    if (Array.isArray(ca.routeOverrides)) return ca.routeOverrides.includes(route);
    return baseRoutes.includes(route);
  }, [isAdmin, userDoc, baseRoutes]);

  const accessibleClientIds = useMemo(() => (): string[] => {
    if (!userDoc) return [];
    return userDoc.clientAccess.map((ca) => ca.clientId);
  }, [userDoc]);

  const value = useMemo<PermissionsContextValue>(() => ({
    isAdmin, loading, error,
    canAccessClient, canAccessRoute, accessibleClientIds, baseRoutes,
    userDoc,
  }), [isAdmin, loading, error, canAccessClient, canAccessRoute, accessibleClientIds, baseRoutes, userDoc]);

  return (
    <PermissionsContext.Provider value={value}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function useUserPermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    // Fallback for usage outside provider (e.g., admin layout that doesn't use DashboardLayout)
    // This should not happen in production, but prevents crashes
    return {
      isAdmin: false,
      loading: true,
      error: null,
      canAccessClient: () => false,
      canAccessRoute: () => false,
      accessibleClientIds: () => [],
      baseRoutes: [],
      userDoc: null,
    };
  }
  return ctx;
}
