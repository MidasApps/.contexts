/* @vitest-environment happy-dom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { StrictMode, useCallback } from 'react';
import { useFetchResource, type Fetcher } from '../useFetchResource';

/** Promessa resolvida à mão: é o que permite resolver respostas fora de ordem. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/**
 * Fetcher por chave que registra cada pedido (com seu signal) e só responde
 * quando o teste manda. `null` = sem parâmetro, hook desligado.
 */
function server(options?: { resetOnChange?: boolean }) {
  const requests: Array<{ key: string; signal: AbortSignal; d: ReturnType<typeof deferred<string>> }> = [];
  const render = (key: string | null) =>
    renderHook(
      ({ k }: { k: string | null }) => {
        const fetcher = useCallback<Fetcher<string>>(
          (signal) => {
            const d = deferred<string>();
            requests.push({ key: k!, signal, d });
            return d.promise;
          },
          [k],
        );
        return useFetchResource(k ? fetcher : null, 'inicial', options);
      },
      { initialProps: { k: key } },
    );
  return { requests, render };
}

describe('useFetchResource', () => {
  it('starts loading and exposes the data once the fetch resolves', async () => {
    const { requests, render } = server();
    const { result } = render('a');
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe('inicial');

    await act(async () => requests[0].d.resolve('dado-a'));
    expect(result.current.loading).toBe(false);
    expect(result.current.data).toBe('dado-a');
    expect(result.current.error).toBeNull();
  });

  it('keeps the latest response when an older one resolves after it', async () => {
    const { requests, render } = server();
    const { result, rerender } = render('a');
    rerender({ k: 'b' });
    expect(result.current.loading).toBe(true);

    await act(async () => requests[1].d.resolve('dado-b'));
    await act(async () => requests[0].d.resolve('dado-a'));

    expect(result.current.data).toBe('dado-b');
    expect(result.current.loading).toBe(false);
  });

  it('aborts the in-flight request when the params change', () => {
    const { requests, render } = server();
    const { rerender } = render('a');
    rerender({ k: 'b' });
    expect(requests[0].signal.aborted).toBe(true);
    expect(requests[1].signal.aborted).toBe(false);
  });

  it('aborts on unmount and ignores the late response', async () => {
    const { requests, render } = server();
    const { result, unmount } = render('a');
    unmount();
    expect(requests[0].signal.aborted).toBe(true);
    await act(async () => requests[0].d.resolve('tarde'));
    expect(result.current.data).toBe('inicial');
  });

  it('reports the error and keeps the previous data', async () => {
    const { requests, render } = server();
    const { result, rerender } = render('a');
    await act(async () => requests[0].d.resolve('dado-a'));

    rerender({ k: 'b' });
    await act(async () => requests[1].d.reject(new Error('HTTP 500')));

    expect(result.current.error).toBe('HTTP 500');
    expect(result.current.data).toBe('dado-a');
    expect(result.current.loading).toBe(false);
  });

  it('ignores the rejection of a request that became stale', async () => {
    const { requests, render } = server();
    const { result, rerender } = render('a');
    rerender({ k: 'b' });
    await act(async () => requests[1].d.resolve('dado-b'));
    await act(async () => requests[0].d.reject(new DOMException('aborted', 'AbortError')));
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe('dado-b');
  });

  it('with no fetcher, returns the initial data and is not loading', async () => {
    const { requests, render } = server();
    const { result, rerender } = render('a');
    await act(async () => requests[0].d.resolve('dado-a'));

    rerender({ k: null });
    expect(result.current.data).toBe('inicial');
    expect(result.current.loading).toBe(false);
    expect(requests).toHaveLength(1);
  });

  it('refetch reloads the current params and resolves after the data lands', async () => {
    const { requests, render } = server();
    const { result } = render('a');
    await act(async () => requests[0].d.resolve('v1'));

    let done!: Promise<void>;
    act(() => { done = result.current.refetch(); });
    expect(result.current.loading).toBe(true);
    expect(requests).toHaveLength(2);
    await act(async () => { requests[1].d.resolve('v2'); await done; });
    expect(result.current.data).toBe('v2');
    expect(result.current.loading).toBe(false);
  });

  it('refetch aborts the request it supersedes', async () => {
    const { requests, render } = server();
    const { result } = render('a');
    act(() => { void result.current.refetch(); });
    expect(requests[0].signal.aborted).toBe(true);
    await act(async () => requests[1].d.resolve('novo'));
    await act(async () => requests[0].d.resolve('velho'));
    expect(result.current.data).toBe('novo');
  });

  it('refetch never rejects: a failure lands in `error`', async () => {
    const { requests, render } = server();
    const { result } = render('a');
    await act(async () => requests[0].d.resolve('v1'));
    let done!: Promise<void>;
    act(() => { done = result.current.refetch(); });
    await act(async () => { requests[1].d.reject(new Error('falhou')); await done; });
    expect(result.current.error).toBe('falhou');
  });

  it('setData replaces the data locally without fetching', async () => {
    const { requests, render } = server();
    const { result } = render('a');
    await act(async () => requests[0].d.resolve('v1'));
    act(() => result.current.setData((prev) => `${prev}+local`));
    expect(result.current.data).toBe('v1+local');
    expect(requests).toHaveLength(1);
  });

  it('keeps the same refetch identity across param changes', () => {
    const { render } = server();
    const { result, rerender } = render('a');
    const first = result.current.refetch;
    rerender({ k: 'b' });
    expect(result.current.refetch).toBe(first);
  });

  it('under StrictMode, the aborted first mount does not win', async () => {
    const requests: Array<{ signal: AbortSignal; d: ReturnType<typeof deferred<string>> }> = [];
    const fetcher: Fetcher<string> = (signal) => {
      const d = deferred<string>();
      requests.push({ signal, d });
      return d.promise;
    };
    const { result } = renderHook(() => useFetchResource(fetcher, 'inicial'), { wrapper: StrictMode });
    expect(requests.length).toBe(2);
    expect(requests[0].signal.aborted).toBe(true);

    await act(async () => requests[1].d.resolve('vivo'));
    await act(async () => requests[0].d.resolve('morto'));
    expect(result.current.data).toBe('vivo');
    expect(result.current.loading).toBe(false);
  });
});

describe('useFetchResource — unmemoised fetcher guard', () => {
  afterEach(() => { vi.unstubAllEnvs(); });

  it('in development, throws a clear message when the fetcher is recreated every render', () => {
    // Silencia o log de erro que o React imprime para erro de render.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // A primeira render não compara nada; o laço começa na primeira re-render.
    const { rerender } = renderHook(() =>
      useFetchResource((signal) => Promise.resolve(signal.aborted), false),
    );
    expect(() => rerender()).toThrow(/useFetchResource.*(useCallback|useMemo)/s);
  });

  it('in production, adds no check (React reports its own error)', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    let message = '';
    const { rerender } = renderHook(() =>
      useFetchResource((signal) => Promise.resolve(signal.aborted), false),
    );
    try {
      rerender();
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toMatch(/Too many re-renders/);
    expect(message).not.toMatch(/useFetchResource/);
  });

  it('does not fire for many legitimate param changes across commits', async () => {
    const { requests, render } = server();
    const { result, rerender } = render('k0');
    for (let i = 1; i <= 40; i += 1) rerender({ k: `k${i}` });
    await act(async () => requests[requests.length - 1].d.resolve('fim'));
    expect(result.current.data).toBe('fim');
  });
});

describe('useFetchResource — resetOnChange', () => {
  it('by default keeps the previous data while the next params load', async () => {
    const { requests, render } = server();
    const { result, rerender } = render('a');
    await act(async () => requests[0].d.resolve('dado-a'));
    rerender({ k: 'b' });
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe('dado-a');
  });

  it('with resetOnChange, returns initialData in the same render that starts loading', async () => {
    const { requests, render } = server({ resetOnChange: true });
    const seen: Array<{ data: string; loading: boolean }> = [];
    const { result, rerender } = render('a');
    await act(async () => requests[0].d.resolve('dado-a'));

    rerender({ k: 'b' });
    seen.push({ data: result.current.data, loading: result.current.loading });
    expect(seen).toEqual([{ data: 'inicial', loading: true }]);

    await act(async () => requests[1].d.resolve('dado-b'));
    expect(result.current.data).toBe('dado-b');
  });

  it('with resetOnChange, refetch of the same params keeps the data', async () => {
    const { requests, render } = server({ resetOnChange: true });
    const { result } = render('a');
    await act(async () => requests[0].d.resolve('dado-a'));
    act(() => { void result.current.refetch(); });
    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe('dado-a');
  });
});
