'use client';

import { type ReactNode, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthContext } from '../providers/AuthProvider';
import { useUserPermissions } from '@/shared/hooks/useUserPermissions';
import { useAppStore } from '@/shared/stores/app-store';
import { EmptyState } from '@/shared/ui/empty-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { normalizeRoute } from '@/shared/lib/permissions/normalize-route';

interface ProtectedRouteProps {
  children: ReactNode;
  /** Override the pathname for access check */
  requiredPath?: string;
}

export function ProtectedRoute({ children, requiredPath }: ProtectedRouteProps) {
  const { user, embeddedMode } = useAuthContext();
  const { isAdmin, loading, canAccessRoute, baseRoutes } = useUserPermissions();
  const activeClientId = useAppStore((s) => s.activeClientId);
  const clientsStatus = useAppStore((s) => s.clientsStatus);
  const pathname = usePathname();
  const router = useRouter();

  const pathToCheck = normalizeRoute(requiredPath ?? pathname ?? '/');

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    if (isAdmin) return;
    if (!activeClientId) return;
    if (canAccessRoute(activeClientId, pathToCheck)) return;

    // Find first accessible route to redirect to.
    // `/g` é token de permissão para os relatórios dinâmicos, não URL: não
    // existe `app/(dashboard)/g/page.tsx`, então mandar o usuário para lá dá
    // 404. Quem cobre esse caso é `/dashboard`, que resolve a primeira página
    // do cliente e redireciona.
    const fallbackRoute = baseRoutes.find(
      (r) => r !== pathToCheck && r !== '/g' && canAccessRoute(activeClientId, r)
    );

    if (fallbackRoute) {
      router.replace(fallbackRoute);
    }
    // If no route accessible, EmptyState below will show
  }, [loading, user, isAdmin, canAccessRoute, activeClientId, pathToCheck, router, baseRoutes]);

  // If still loading permissions and user is logged in, show skeleton
  if (loading && user) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    );
  }

  // If user is not logged in, render nothing (AuthProvider handles redirect to /login)
  // Exceptions: print mode (Puppeteer PDF) and embedded mode (parent shell token)
  if (!user && !embeddedMode) return null;

  // In embedded mode, bypass all permission checks (parent shell handles auth)
  if (embeddedMode) return <>{children}</>;

  // If admin, pass through
  if (isAdmin) return <>{children}</>;

  // If user has access, pass through
  if (activeClientId && canAccessRoute(activeClientId, pathToCheck)) return <>{children}</>;

  if (!activeClientId && clientsStatus !== 'idle' && clientsStatus !== 'loading') {
    return (
      <div className="p-6">
        <EmptyState
          title="Nenhum cliente disponível"
          description="Não há cliente configurado ou acessível para o seu usuário neste ambiente."
        />
      </div>
    );
  }

  // No routes accessible at all — show permission error
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

  // Redirect will happen via useEffect; render nothing in the meantime
  return null;
}
