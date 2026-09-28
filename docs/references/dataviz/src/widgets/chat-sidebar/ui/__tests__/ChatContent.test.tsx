/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useAppStore } from '@/shared/stores/app-store';

vi.mock('@/widgets/ai-sidebar', () => ({
  AISidebar: () => <div data-testid="ai-sidebar" />,
}));

import { ChatContent } from '../ChatContent';

/**
 * Corpo do chat, consumido pela ChatSidebar (desktop) e pelo Sheet mobile.
 *
 * Ele trocava de componente — e portanto de rota e de conjunto de tools —
 * conforme `editingReport`: era essa troca que fazia o assistente saber criar
 * páginas em uma tela e não saber na outra.
 */
describe('ChatContent', () => {
  beforeEach(() => {
    useAppStore.setState({ editingReport: false });
  });

  it('monta o mesmo assistente com e sem edição de relatório', () => {
    const { unmount } = render(<ChatContent />);
    expect(screen.getByTestId('ai-sidebar')).toBeInTheDocument();
    unmount();

    useAppStore.setState({ editingReport: true });
    render(<ChatContent />);
    expect(screen.getByTestId('ai-sidebar')).toBeInTheDocument();
  });

  it('não monta mais o chat separado de edição', () => {
    useAppStore.setState({ editingReport: true });
    render(<ChatContent />);
    expect(screen.queryByTestId('chat-panel')).not.toBeInTheDocument();
  });
});
