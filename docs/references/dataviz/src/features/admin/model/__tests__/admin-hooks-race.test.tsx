/* @vitest-environment happy-dom */
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { fetchTripwire, stubControlledFetch } from '@/test-stubs/controlled-fetch';

/**
 * Trocar de contrato (ou de entidade) rápido dispara dois GETs. Se o do
 * contrato anterior chega por último, ele sobrescrevia a lista do atual: o
 * picker da métrica mostrava entidades de outro contrato.
 */

vi.mock('@/shared/lib/firebase/config', () => ({
  getFirebaseAuth: () => ({ currentUser: null }),
}));

import { useAdminEntities } from '../useAdminEntities';
import { useAdminAttributes } from '../useAdminAttributes';
import { useContractSchema } from '../useContractSchema';

let net: ReturnType<typeof stubControlledFetch>;
// Nenhum pedido pode sair da suíte (ver fetchTripwire).
const trap = fetchTripwire();
beforeEach(() => { net = stubControlledFetch(); });
afterEach(() => { trap.arm(); });
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 50));
  vi.unstubAllGlobals();
  expect(trap.leaks).toEqual([]);
});

describe('useAdminEntities', () => {
  it('keeps the entities of the current contract when the old response lands last', async () => {
    const { result, rerender } = renderHook(({ c }) => useAdminEntities(c), {
      initialProps: { c: 'c1' as string | null },
    });
    await waitFor(() => expect(net.calls).toHaveLength(1));
    rerender({ c: 'c2' });
    await waitFor(() => expect(net.calls).toHaveLength(2));
    expect(net.calls[0].signal?.aborted).toBe(true);

    await act(async () => net.calls[1].respond({ data: [{ id: 'e-c2' }] }));
    await act(async () => net.calls[0].respond({ data: [{ id: 'e-c1' }] }));

    expect(result.current.entities.map((e) => e.id)).toEqual(['e-c2']);
    expect(result.current.loading).toBe(false);
  });

  it('keeps its public shape and clears without a contract', async () => {
    const { result, rerender } = renderHook(({ c }) => useAdminEntities(c), {
      initialProps: { c: 'c1' as string | null },
    });
    expect(Object.keys(result.current).sort()).toEqual(
      ['entities', 'error', 'loading', 'refetch', 'remove', 'save'],
    );
    await waitFor(() => expect(net.calls).toHaveLength(1));
    await act(async () => net.calls[0].respond({ data: [{ id: 'e1' }] }));
    expect(result.current.entities).toHaveLength(1);

    rerender({ c: null });
    expect(result.current.entities).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('surfaces an HTTP error', async () => {
    const { result } = renderHook(() => useAdminEntities('c1'));
    await waitFor(() => expect(net.calls).toHaveLength(1));
    await act(async () => net.calls[0].respond({ error: 'boom' }, 500));
    expect(result.current.error).toBe('boom');
  });
});

describe('useAdminAttributes', () => {
  it('keeps the attributes of the current entity when the old response lands last', async () => {
    const { result, rerender } = renderHook(({ e }) => useAdminAttributes('c1', e), {
      initialProps: { e: 'e1' as string | null },
    });
    await waitFor(() => expect(net.calls).toHaveLength(1));
    rerender({ e: 'e2' });
    await waitFor(() => expect(net.calls).toHaveLength(2));
    expect(net.calls[0].signal?.aborted).toBe(true);

    await act(async () => net.calls[1].respond({ data: [{ id: 'a-e2' }] }));
    await act(async () => net.calls[0].respond({ data: [{ id: 'a-e1' }] }));

    expect(result.current.attributes.map((a) => a.id)).toEqual(['a-e2']);
  });

  it('keeps its public shape', () => {
    const { result } = renderHook(() => useAdminAttributes(null, null));
    expect(Object.keys(result.current).sort()).toEqual(
      ['attributes', 'deprecate', 'error', 'loading', 'refetch', 'remove', 'rename', 'save'],
    );
    expect(result.current.attributes).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});

describe('useContractSchema', () => {
  it('keeps the schema of the current contract when the old response lands last', async () => {
    const { result, rerender } = renderHook(({ c }) => useContractSchema(c), {
      initialProps: { c: 'c1' as string | null },
    });
    await waitFor(() => expect(net.calls).toHaveLength(1));
    rerender({ c: 'c2' });
    await waitFor(() => expect(net.calls).toHaveLength(2));
    expect(net.calls[0].signal?.aborted).toBe(true);

    // c2: uma entidade, e o GET dos atributos dela.
    await act(async () => net.calls[1].respond({ data: [{ id: 'e-c2' }] }));
    await waitFor(() => expect(net.calls).toHaveLength(3));
    await act(async () => net.calls[2].respond({ data: [{ id: 'a-c2' }] }));
    // c1 chega por último — e precisa ser ignorado.
    await act(async () => net.calls[0].respond({ data: [] }));

    expect(result.current.schema.map((s) => s.entity.id)).toEqual(['e-c2']);
    expect(result.current.schema[0].attributes.map((a) => a.id)).toEqual(['a-c2']);
  });

  it('keeps its public shape', () => {
    const { result } = renderHook(() => useContractSchema(null));
    expect(Object.keys(result.current).sort()).toEqual(['error', 'loading', 'refetch', 'schema']);
    expect(result.current.schema).toEqual([]);
    expect(result.current.loading).toBe(false);
  });
});
