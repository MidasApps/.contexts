/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * Trocar de relatório é trocar o `groupId` do hook — e entre o pedido e a
 * resposta existe um render em que o groupId JÁ é o novo e a lista ainda é a
 * antiga. Quem lê esse render sem saber disso age sobre dados do relatório
 * errado: foi assim que a troca de relatório passou a abrir
 * `/g/<novo>/r/<página do anterior>`, uma rota que não existe — a tela em
 * branco que o usuário via.
 */

const fetchReportsMock = vi.fn();

vi.mock('@/shared/lib/firestore/reports', () => ({
  fetchReports: (...args: unknown[]) => fetchReportsMock(...args),
  createReport: vi.fn(),
  renameReport: vi.fn(),
  deleteReport: vi.fn(),
  duplicateReport: vi.fn(),
  moveReport: vi.fn(),
}));

vi.mock('@/shared/stores/app-store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ activeClientId: 'vila-rosa', reportsListVersion: 0, bumpReportsList: vi.fn() }),
}));

import { useReports } from '../useReports';

type Snapshot = { groupId: string; loading: boolean; ids: string[] };

function observe(initial: string) {
  const renders: Snapshot[] = [];
  const utils = renderHook(
    ({ g }: { g: string }) => {
      const r = useReports(g);
      renders.push({ groupId: g, loading: r.loading, ids: r.reports.map((x) => x.id) });
      return r;
    },
    { initialProps: { g: initial } },
  );
  return { ...utils, renders };
}

describe('useReports — troca de relatório', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('nenhum render entrega páginas de um relatório sob o id de outro', async () => {
    fetchReportsMock.mockResolvedValueOnce([{ id: 'a1', name: 'Página A', order: 0 }]);
    const { result, rerender, renders } = observe('grupo-a');
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.reports.map((r) => r.id)).toEqual(['a1']);

    fetchReportsMock.mockResolvedValueOnce([{ id: 'b1', name: 'Página B', order: 0 }]);
    const before = renders.length;
    rerender({ g: 'grupo-b' });

    // O render logo após a troca é o perigoso: groupId novo, dados antigos.
    // Ou ele diz "carregando", ou não entrega página nenhuma — nunca a de
    // outro relatório.
    const suspects = renders.slice(before).filter((r) => r.groupId === 'grupo-b');
    expect(suspects.length).toBeGreaterThan(0);
    for (const r of suspects) {
      if (r.ids.length > 0) expect(r.ids).toEqual(['b1']);
      else expect(r.loading).toBe(true);
    }

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.reports.map((r) => r.id)).toEqual(['b1']);
  });

  it('busca as páginas do grupo pedido, uma vez por grupo', async () => {
    fetchReportsMock.mockResolvedValue([]);
    const { rerender } = observe('grupo-a');
    await waitFor(() => expect(fetchReportsMock).toHaveBeenCalledWith('vila-rosa', 'grupo-a'));
    rerender({ g: 'grupo-b' });
    await waitFor(() => expect(fetchReportsMock).toHaveBeenCalledWith('vila-rosa', 'grupo-b'));
  });

  it('falha na busca devolve lista vazia, não a do relatório anterior', async () => {
    fetchReportsMock.mockResolvedValueOnce([{ id: 'a1', name: 'Página A', order: 0 }]);
    const { result, rerender } = observe('grupo-a');
    await waitFor(() => expect(result.current.reports).toHaveLength(1));

    fetchReportsMock.mockRejectedValueOnce(new Error('offline'));
    rerender({ g: 'grupo-b' });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.reports).toEqual([]);
  });
});
