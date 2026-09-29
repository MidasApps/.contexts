/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

/**
 * Abrir a KB "A", fechar e abrir a KB "B" dispara dois GETs de documentos. Se
 * o de "A" chegasse por último, a lista de "B" mostrava os documentos de "A"
 * — e o botão de excluir apontaria para o doc errado.
 */

type Doc = { id: string; name: string };
const requests = vi.hoisted(() => [] as Array<{
  kbId: string;
  signal: AbortSignal | undefined;
  resolve: (docs: Doc[]) => void;
}>);

vi.mock('../../model/api', () => ({
  listKbDocs: (kbId: string, signal?: AbortSignal) =>
    new Promise<Doc[]>((resolve) => { requests.push({ kbId, signal, resolve }); }),
  uploadKbDoc: vi.fn(),
  deleteKbDoc: vi.fn(),
}));

const ROWS = [
  { id: 'kb-a', name: 'KB A', origin: 'user' },
  { id: 'kb-b', name: 'KB B', origin: 'user' },
];
vi.mock('../../model/useAiStudioCrud', () => ({
  useAiStudioCrud: () => ({
    rows: ROWS, loading: false, error: null,
    save: vi.fn(), patch: vi.fn(), remove: vi.fn(), reset: vi.fn(),
  }),
}));

// Tabela e shell reduzidos ao essencial: um botão de editar por linha.
vi.mock('../AiStudioListShell', () => ({
  AiStudioListShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('../AiStudioTable', () => ({
  AiStudioTable: ({ rows, onEdit }: { rows: typeof ROWS; onEdit: (r: (typeof ROWS)[number]) => void }) => (
    <div>{rows.map((r) => <button key={r.id} onClick={() => onEdit(r)}>editar {r.id}</button>)}</div>
  ),
}));
vi.mock('../KbDocUploader', () => ({ KbDocUploader: () => null }));
vi.mock('../KbDocList', () => ({
  KbDocList: ({ docs }: { docs: Doc[] }) => (
    <ul data-testid="docs">{docs.map((d) => <li key={d.id}>{d.name}</li>)}</ul>
  ),
}));

import { KnowledgeBasesTab } from '../KnowledgeBasesTab';

beforeEach(() => { requests.length = 0; });

describe('<KnowledgeBasesTab> — documentos da KB', () => {
  it('shows the docs of the KB that is open when an older response lands last', async () => {
    render(<KnowledgeBasesTab />);

    fireEvent.click(screen.getByText('editar kb-a'));
    await waitFor(() => expect(requests).toHaveLength(1));
    fireEvent.click(screen.getByText('Cancelar'));
    fireEvent.click(screen.getByText('editar kb-b'));
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(requests[0].signal?.aborted).toBe(true);

    await act(async () => requests[1].resolve([{ id: 'd-b', name: 'doc de B' }]));
    await act(async () => requests[0].resolve([{ id: 'd-a', name: 'doc de A' }]));

    expect(screen.getByTestId('docs').textContent).toBe('doc de B');
  });

  it('asks for the docs of the KB being edited', async () => {
    render(<KnowledgeBasesTab />);
    fireEvent.click(screen.getByText('editar kb-a'));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].kbId).toBe('kb-a');
    await act(async () => requests[0].resolve([{ id: 'd1', name: 'manual.pdf' }]));
    expect(screen.getByTestId('docs').textContent).toBe('manual.pdf');
  });
});
