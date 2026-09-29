'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  Suspense,
  type ReactNode,
} from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../model/useAuth';
import { setExternalToken } from '@/shared/lib/external-token';
import { isAllowedEmbedOrigin, getAllowedEmbedOrigins } from '../lib/embed-origin';
import type { UserProfile } from '../model/types';
import type { User } from 'firebase/auth';

interface AuthContextValue {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  embeddedMode: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  return (
    <Suspense fallback={null}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </Suspense>
  );
}

function AuthProviderInner({ children }: AuthProviderProps) {
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  // Embedded mode: receive auth token from parent shell via postMessage
  const [embeddedMode, setEmbeddedMode] = useState(false);

  useEffect(() => {
    // Only activate if running inside an iframe
    if (window.parent === window) return;

    const handler = (event: MessageEvent) => {
      if (!isAllowedEmbedOrigin(event.origin)) return; // fail-closed: origem não confiável
      if (event.data?.type === 'AUTH_TOKEN' && typeof event.data.token === 'string') {
        setExternalToken(event.data.token);
        setEmbeddedMode(true);
      }
    };

    window.addEventListener('message', handler);

    // Sinaliza prontidão apenas para origens confiáveis (nunca '*').
    for (const origin of getAllowedEmbedOrigins()) {
      window.parent.postMessage({ type: 'AUTH_READY' }, origin);
    }

    return () => window.removeEventListener('message', handler);
  }, []);

  // O bypass `?_pt=TOKEN` foi removido: existia para o Puppeteer navegar até a
  // página ao exportar PDF, mas o export passou a mandar um snapshot HTML para
  // /api/export-pdf (page.setContent). Nenhum código chamava createPrintToken,
  // então /verify nunca podia aprovar — bypass de auth morto, mas presente.

  useEffect(() => {
    if (embeddedMode) return; // Skip redirect in embedded mode (token from parent shell)
    if (auth.loading) return;
    const publicPaths = ['/login', '/'];
    if (!auth.user && !publicPaths.includes(pathname ?? '')) {
      router.replace('/login');
    }
  }, [auth.loading, auth.user, pathname, router, embeddedMode]);

  const value: AuthContextValue = {
    user: auth.user,
    profile: auth.profile,
    loading: embeddedMode ? false : auth.loading,
    error: auth.error,
    signOut: auth.signOut,
    embeddedMode,
  };

  // In embedded mode (iframe with external token), render immediately
  if (embeddedMode) {
    return (
      <AuthContext.Provider value={value}>
        {children}
      </AuthContext.Provider>
    );
  }

  // Block rendering while loading auth state
  if (auth.loading) {
    return (
      <AuthContext.Provider value={value}>
        <div className="flex h-dvh items-center justify-center bg-background" />
      </AuthContext.Provider>
    );
  }

  // Block rendering if not logged in and not on login page
  const publicPaths = ['/login', '/'];
  if (!auth.user && !publicPaths.includes(pathname ?? '')) {
    return (
      <AuthContext.Provider value={value}>
        <div className="flex h-dvh items-center justify-center bg-background" />
      </AuthContext.Provider>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    return {
      user: null,
      profile: null,
      loading: false,
      error: null,
      signOut: async () => {},

      embeddedMode: false,
    };
  }
  return ctx;
}
