/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

/**
 * O hook já protegia a troca de CLIENTE: enquanto os dados carregados não são
 * os do cliente pedido, ele diz que está carregando e não entrega lista —
 * porque quem escolhe "o primeiro relatório" naquele instante escolhe o
 * relatório errado.
 *
 * Faltava a mesma proteção para a lista ficar velha SEM o cliente mudar, que é
 * o que acontece quando a IA cria um relatório: ela chama `bumpGroupsList()` e
 * existe um render em que `activeGroupId` já é o relatório novo e `groups` ainda
 * é a lista antiga. O fallback do `PagesSidebar` ("id que não está na lista?
 * volta para groups[0]") dispara nesse render e desfaz a navegação — o conteúdo
 * abria em "Teste X" e a barra lateral voltava para Covenants.
 */

const fetchGroupsMock = vi.fn();

vi.mock('@/shared/lib/firestore/groups', () => ({
  fetchGroups: (...args: unknown[]) => fetchGroupsMock(...args),
  createGroup: vi.fn(),
  renameGroup: vi.fn(),
  deleteGroup: vi.fn(),
}));

const state = { activeClientId: 'vila-rosa', groupsListVersion: 0 };

vi.mock('@/shared/stores/app-store', () => ({
  useAppStore: (selector: (s: typeof state) => unknown) => selector(state),
}));

import { useGroups } from '../useGroups';

type Snapshot = { loading: boolean; ids: string[] };

function observe() {
  const renders: Snapshot[] = [];
  const utils = renderHook(() => {
    const r = useGroups();
    renders.push({ loading: r.loading, ids: r.groups.map((g) => g.id) });
    return r;
  });
  return { ...utils, renders };
}

const covenants = { id: 'covenants', name: 'Covenants', order: 1 };
const testX = { id: 'teste-x', name: 'Teste X', order: 2 };

beforeEach(() => {
  vi.clearAllMocks();
  state.groupsListVersion = 0;
});

describe('useGroups — relatório criado fora do hook', () => {
  it('nenhum render entrega a lista antiga como definitiva depois do bump', async () => {
    fetchGroupsMock.mockResolvedValueOnce([covenants]);
    const { result, rerender, renders } = observe();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.groups.map((g) => g.id)).toEqual(['covenants']);

    // A IA criou o relatório e avisou a lista.
    fetchGroupsMock.mockResolvedValueOnce([covenants, testX]);
    state.groupsListVersion = 1;
    const before = renders.length;
    rerender();

    /*
     * O render logo depois do bump é o perigoso: ou ele diz "carregando", ou já
     * traz o relatório novo. O que ele NÃO pode fazer é entregar a lista antiga
     * como se fosse a definitiva — é nesse instante que o fallback do
     * PagesSidebar reescreve o escopo para `groups[0]`.
     */
    const suspects = renders.slice(before);
    expect(suspects.length).toBeGreaterThan(0);
    for (const r of suspects) {
      if (!r.loading) expect(r.ids).toContain('teste-x');
    }

    await waitFor(() => expect(result.current.groups.map((g) => g.id)).toContain('teste-x'));
    expect(result.current.loading).toBe(false);
  });

  it('bump refaz a busca — a lista nova chega sem trocar de cliente', async () => {
    fetchGroupsMock.mockResolvedValueOnce([covenants]);
    const { result, rerender } = observe();
    await waitFor(() => expect(result.current.loading).toBe(false));

    fetchGroupsMock.mockResolvedValueOnce([covenants, testX]);
    state.groupsListVersion = 1;
    rerender();

    await waitFor(() => expect(result.current.groups).toHaveLength(2));
    expect(fetchGroupsMock).toHaveBeenCalledTimes(2);
  });
});
