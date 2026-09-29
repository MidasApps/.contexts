'use client';

import { useEffect } from 'react';

/**
 * Atalhos globais de teclado.
 *
 * As teclas 1-0 navegavam para as páginas fixas do Play. Essas rotas saíram
 * na purga de clientes e cada tecla passou a levar para um 404 — as páginas
 * hoje são reports dinâmicos (`/g/{grupo}/r/{report}`), que um mapa estático
 * não tem como endereçar. O atalho foi removido em vez de reapontado: refazer
 * como "N-ésima página do cliente ativo" é feature nova, não limpeza.
 */
export function useKeyboardShortcuts() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't trigger in inputs/textareas
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const meta = e.metaKey || e.ctrlKey;

      // Cmd+K / Ctrl+K: Focus search (dispatch event for future search)
      // For now, just toggle AI sidebar as a quick command palette
      if (meta && e.key === 'k') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('toggle-ai-sidebar'));
        return;
      }

      // Cmd+Shift+A: Toggle AI sidebar
      if (meta && e.shiftKey && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('toggle-ai-sidebar'));
        return;
      }

      // ?: Show shortcuts dialog
      if (e.key === '?' && !meta) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('show-shortcuts'));
        return;
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);
}
