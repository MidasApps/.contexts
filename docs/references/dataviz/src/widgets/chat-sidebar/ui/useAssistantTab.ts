'use client';

import { useEffect, useRef } from 'react';
import { useAppStore } from '@/shared/stores/app-store';
import { isDesktopViewport } from '@/shared/lib/viewport';

/**
 * Quem decide se a coluna está mostrando o assistente.
 *
 * Duas regras, herdadas do painel flutuante que existia antes:
 *
 * 1. `toggle-ai-sidebar` (⌘K, ⌘⇧A, ícone do AppHeader) alterna a aba — mas só
 *    a partir de 1024px. Abaixo disso quem responde é o Sheet de chat do
 *    `DashboardLayout`, e os dois brigariam pelo mesmo evento.
 * 2. Editar relatório é fluxo conversacional: entra na edição, abre o
 *    assistente; sai, devolve o estado anterior — a menos que a pessoa tenha
 *    fechado na mão durante a edição, caso em que a escolha dela vence.
 *
 * Mora num hook, e não dentro da `PagesSidebar`, porque é comportamento do
 * assistente e não da lista de páginas — e porque a coluna já é o arquivo
 * mais longo do widget.
 */
export function useAssistantTab(): void {
  const showing = useAppStore((s) => s.chatOpen);
  const setChatOpen = useAppStore((s) => s.setChatOpen);
  const toggleChatOpen = useAppStore((s) => s.toggleChatOpen);
  const isEditingReport = useAppStore((s) => s.editingReport);

  useEffect(() => {
    const toggle = () => {
      if (isDesktopViewport()) toggleChatOpen();
    };
    window.addEventListener('toggle-ai-sidebar', toggle);
    return () => window.removeEventListener('toggle-ai-sidebar', toggle);
  }, [toggleChatOpen]);

  const wasOpenBeforeEdit = useRef<boolean | null>(null);
  useEffect(() => {
    if (isEditingReport) {
      if (wasOpenBeforeEdit.current === null) {
        wasOpenBeforeEdit.current = showing;
        /* Não persiste: `editingReport` não é persistido, então um reload no
           meio da edição nunca roda a restauração abaixo — se isto gravasse
           em localStorage, a escolha manual seria sobrescrita para sempre por
           um estado transitório. */
        useAppStore.setState({ chatOpen: true });
      }
      return;
    }
    if (wasOpenBeforeEdit.current !== null) {
      if (showing) setChatOpen(wasOpenBeforeEdit.current);
      wasOpenBeforeEdit.current = null;
    }
  }, [isEditingReport, showing, setChatOpen]);
}
