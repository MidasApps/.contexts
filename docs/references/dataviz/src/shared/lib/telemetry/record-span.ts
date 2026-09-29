export interface SpanOptions {
  name: string;
  attributes?: Record<string, unknown>;
}

export async function recordSpan<T>(
  opts: SpanOptions,
  fn: () => T | Promise<T>,
): Promise<T> {
  const start = performance.now();
  const ts = new Date().toISOString();
  try {
    const result = await fn();
    console.log(
      JSON.stringify({
        event: 'span',
        name: opts.name,
        status: 'ok',
        durationMs: +(performance.now() - start).toFixed(2),
        attributes: opts.attributes ?? {},
        ts,
      }),
    );
    return result;
  } catch (err) {
    console.log(
      JSON.stringify({
        event: 'span',
        name: opts.name,
        status: 'error',
        durationMs: +(performance.now() - start).toFixed(2),
        attributes: opts.attributes ?? {},
        error: err instanceof Error ? err.message : String(err),
        ts,
      }),
    );
    throw err;
  }
}
