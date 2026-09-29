import { vi } from 'vitest';

/**
 * `fetch` que só responde quando o teste manda — é o que permite resolver
 * respostas fora de ordem e exercer a corrida "resposta velha chega depois
 * da nova". Cada chamada fica em `calls`, com a URL e o `signal` recebido.
 */
export interface ControlledCall {
  url: string;
  signal: AbortSignal | undefined;
  respond: (body: unknown, status?: number) => void;
  fail: (err: unknown) => void;
}

export function stubControlledFetch() {
  const calls: ControlledCall[] = [];
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    let resolve!: (r: Response) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<Response>((res, rej) => { resolve = res; reject = rej; });
    calls.push({
      url: String(input),
      signal: init?.signal ?? undefined,
      respond: (body, status = 200) =>
        resolve(new Response(JSON.stringify(body), {
          status,
          headers: { 'content-type': 'application/json' },
        })),
      fail: reject,
    });
    return promise;
  });
  vi.stubGlobal('fetch', fn);
  return { calls, fn };
}

/**
 * Armadilha para `fetch` que escapa do teste: instale no `afterEach` (no lugar
 * de restaurar o `fetch` real) e confira `leaks` no `afterAll`. Um hook que
 * ainda estava a caminho do `fetch` quando o teste terminou cai aqui, em vez de
 * mandar um GET de verdade para `localhost`.
 */
export function fetchTripwire() {
  const leaks: string[] = [];
  const arm = () =>
    vi.stubGlobal('fetch', (input: RequestInfo | URL) => {
      leaks.push(String(input));
      return Promise.reject(new Error('fetch called after the test ended'));
    });
  return { leaks, arm };
}
