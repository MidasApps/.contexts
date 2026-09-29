'use client';

import { type ReactNode } from 'react';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/shared/ui/tooltip';
import { Toaster } from '@/shared/ui/sonner';
import { DataProvider } from '@/shared/providers/DataProvider';
import { AuthProvider } from '@/features/auth/providers/AuthProvider';
import { useClients } from '@/shared/hooks/useClients';
import { useProducts } from '@/shared/hooks/useProducts';
import { useMetrics } from '@/shared/hooks/useMetrics';

interface ProvidersProps {
  children: ReactNode;
  /**
   * Nonce da requisição (ver `proxy.ts`). O `next-themes` injeta um script
   * inline para aplicar o tema ANTES da primeira pintura — sem ele a tela
   * pisca em claro antes de virar escura. É script da aplicação, não do
   * framework, então o Next não o carimba: o nonce precisa chegar por aqui ou
   * o CSP bloqueia justamente o script anti-flash.
   */
  nonce?: string;
}

/** Loads clients + products + metrics from Firestore into the app store. Renders nothing. */
function DomainLoader() {
  useClients();
  useProducts();
  useMetrics();
  return null;
}

export function Providers({ children, nonce }: ProvidersProps) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="dark"
      enableSystem={false}
      disableTransitionOnChange
      nonce={nonce}
    >
      <AuthProvider>
        <DataProvider>
          <TooltipProvider>
            <DomainLoader />
            {children}
            <Toaster />
          </TooltipProvider>
        </DataProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
