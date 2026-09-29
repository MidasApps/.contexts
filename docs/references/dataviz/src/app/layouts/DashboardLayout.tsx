'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { ChatContent, AgentPicker } from '@/widgets/chat-sidebar';
import { PagesSidebar } from '@/widgets/pages-sidebar';
import { AdminSidebar } from '@/features/admin/ui/AdminSidebar';
import { AppHeader } from '@/widgets/app-header';

import { Sheet, SheetContent, SheetTitle } from '@/shared/ui/sheet';
import { ProtectedRoute } from '@/features/auth/ui/ProtectedRoute';
import { ErrorBoundary } from '@/shared/ui/error-boundary';
import { useKeyboardShortcuts } from '@/shared/hooks/useKeyboardShortcuts';
import { UserPermissionsProvider } from '@/shared/hooks/useUserPermissions';
import { isDesktopViewport } from '@/shared/lib/viewport';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const pathname = usePathname();
  // Rotas de admin usam uma sidebar própria (menu de seções, sem chat de IA
  // nem PagesSidebar).
  const isAdmin = pathname?.startsWith('/admin') ?? false;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [chatSheetOpen, setChatSheetOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  useKeyboardShortcuts();

  useEffect(() => {
    const handleToggleNavSidebar = () => setSidebarOpen(v => !v);

    window.addEventListener('toggle-nav-sidebar', handleToggleNavSidebar);

    return () => {
      window.removeEventListener('toggle-nav-sidebar', handleToggleNavSidebar);
    };
  }, []);

  useEffect(() => {
    // Abaixo de 1024px é este Sheet quem abre/fecha o chat; a partir daí
    // quem reage é a ChatSidebar (painel do desktop) — ver
    // isDesktopViewport().
    const handleToggleAiSidebar = () => {
      if (!isDesktopViewport()) setChatSheetOpen(v => !v);
    };
    window.addEventListener('toggle-ai-sidebar', handleToggleAiSidebar);
    return () => window.removeEventListener('toggle-ai-sidebar', handleToggleAiSidebar);
  }, []);

  useEffect(() => {
    const handler = () => setShortcutsOpen(true);
    window.addEventListener('show-shortcuts', handler);
    return () => window.removeEventListener('show-shortcuts', handler);
  }, []);

  return (
    <UserPermissionsProvider>
    <div className="flex h-dvh overflow-hidden bg-[var(--color-chrome)] font-sans relative selection:bg-primary/30 selection:text-primary-foreground">
      {/*
       * Uma linha só: colunas de cromo à esquerda e à direita, papel no meio.
       *
       * O header era uma faixa de largura total ACIMA de tudo, e por isso
       * cortava a tela em dois blocos empilhados. Ele agora vive DENTRO do
       * painel de conteúdo, junto do que ele descreve — a trilha da página, os
       * filtros e a conta. O que separa as três regiões é a cor da superfície,
       * não um traço.
       */}
      <div className="relative flex flex-1 min-h-0">
        <div className="hidden lg:flex z-10 relative">
          {isAdmin ? (
            <AdminSidebar />
          ) : (
            <PagesSidebar />
          )}
        </div>

        <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent side="left" className="w-60 p-0 z-50 border-border bg-[var(--color-chrome)]">
              <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
              {isAdmin ? (
                <AdminSidebar />
              ) : (
                <PagesSidebar
                  className="w-full"
                  collapsible={false}
                  onNavigate={() => setSidebarOpen(false)}
                />
              )}
          </SheetContent>
        </Sheet>

        {/* Chat em overlay abaixo de 1024px (⌘K / ⌘⇧A, ou o ícone do
            AppHeader) — mesma paridade que o Sheet único pré-branch
            oferecia (NavSidebar com AISidebar embutido). Rotas de admin não
            têm chat de IA. */}
        {!isAdmin && (
          <Sheet open={chatSheetOpen} onOpenChange={setChatSheetOpen}>
            <SheetContent side="right" className="w-80 gap-0 p-0 z-50 border-border bg-[var(--color-chrome)]">
              <SheetTitle className="sr-only">Assistente de IA</SheetTitle>
              {/* Mesma linha de 56px do painel encaixado, e o mesmo seletor de
                  agente: a gaveta é o chat do mobile, não uma versão reduzida
                  dele. O `pr-12` abre espaço para o X do próprio Sheet. */}
              <div className="flex h-14 shrink-0 items-center px-3 pr-12">
                <AgentPicker className="flex-1" />
              </div>
              <ChatContent />
            </SheetContent>
          </Sheet>
        )}

        {/* Conteúdo dentro de um bloco contido (gutter + painel arredondado) */}
        {/*
         * Calha em cima, embaixo e à DIREITA — nunca à esquerda.
         *
         * A esquerda já tem a calha da coluna: o recuo interno dela (`px-2`)
         * é o que separa os ícones da borda do painel. Somar mais 8px aqui
         * dobrava esse vão de um lado só, e no trilho colapsado — onde os
         * ícones são centrados — a assimetria fica evidente: 8px à esquerda
         * do ícone contra 16px à direita.
         */}
        <div className="flex flex-1 min-w-0 overflow-hidden lg:py-2 lg:pr-2">
          <main className="flex flex-1 flex-col overflow-hidden relative z-10 min-w-0 bg-[var(--color-canvas)] lg:rounded-2xl lg:border lg:border-border/60">
            {!isAdmin && <AppHeader />}
            {/* A rolagem desceu um nível: era o `main` que rolava, e com o
                header dentro dele a trilha subiria para fora da tela junto com
                o conteúdo. */}
            <div className="flex flex-1 min-h-0 flex-col overflow-y-auto overflow-x-hidden">
              <ErrorBoundary>
                <ProtectedRoute>
                  {children}
                </ProtectedRoute>
              </ErrorBoundary>
            </div>
          </main>
        </div>


        {shortcutsOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShortcutsOpen(false)}>
            <div className="w-96 rounded-2xl border border-border bg-popover p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-foreground mb-4">Atalhos de Teclado</h3>
              <div className="space-y-2 text-xs">
                {[
                  ['⌘ K / ⌘ ⇧ A', 'Abrir/fechar assistente IA'],
                  ['?', 'Mostrar atalhos'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-muted-foreground">{desc}</span>
                    <kbd className="rounded bg-muted/50 border border-border px-2 py-0.5 text-[11px] font-mono text-foreground">{key}</kbd>
                  </div>
                ))}
              </div>
              <button onClick={() => setShortcutsOpen(false)} className="mt-4 w-full rounded-lg bg-muted/50 py-2 text-xs text-muted-foreground hover:bg-muted transition-colors">
                Fechar
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </UserPermissionsProvider>
  );
}
