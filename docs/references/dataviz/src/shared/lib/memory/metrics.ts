export interface MemoryMetric {
  event: string;
  durationMs: number;
  threadId?: string;
  ok?: boolean;
  error?: string;
}

export function recordMemoryMetric(m: MemoryMetric): void {
  const line = JSON.stringify({
    severity: 'INFO',
    component: 'memory-service',
    timestamp: new Date().toISOString(),
    ...m,
  });
  // Cloud Logging-friendly structured log (one JSON per line)
  console.log(line);
}

export async function withMetric<T>(
  event: string,
  fn: () => Promise<T>,
  ctx: { threadId?: string } = {},
): Promise<T> {
  const start = Date.now();
  try {
    const out = await fn();
    recordMemoryMetric({ event, durationMs: Date.now() - start, threadId: ctx.threadId, ok: true });
    return out;
  } catch (e) {
    recordMemoryMetric({
      event,
      durationMs: Date.now() - start,
      threadId: ctx.threadId,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
