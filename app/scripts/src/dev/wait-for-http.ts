export type WaitForHttpResult = { ready: true; status: number } | { ready: false; lastStatus: number | undefined };

export type WaitForHttpArgs = {
  url: string;
  timeoutMs: number;
  intervalMs: number;
  /** Status of one GET, or `undefined` when the connection failed. */
  fetchStatus: (url: string) => Promise<number | undefined>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  signal?: AbortSignal;
};

const isSuccess = (status: number | undefined): status is number =>
  status !== undefined && status >= 200 && status < 300;

/**
 * Polls `url` until it answers 2xx, the timeout passes or `signal` aborts.
 * Clock and fetch are injected so the loop is deterministic under test.
 */
export const waitForHttp = async (args: WaitForHttpArgs): Promise<WaitForHttpResult> => {
  const deadline = args.now() + args.timeoutMs;
  let lastStatus: number | undefined;
  while (args.signal?.aborted !== true) {
    lastStatus = await args.fetchStatus(args.url);
    if (isSuccess(lastStatus)) return { ready: true, status: lastStatus };
    if (args.now() >= deadline) break;
    await args.sleep(args.intervalMs);
  }
  return { ready: false, lastStatus };
};

/** Real `fetchStatus`: one GET with a short timeout; connection errors become `undefined`. */
export const fetchHttpStatus = async (url: string): Promise<number | undefined> => {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    await response.body?.cancel();
    return response.status;
  } catch {
    // Not listening yet (ECONNREFUSED) or too slow: keep polling.
    return undefined;
  }
};
