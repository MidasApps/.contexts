/**
 * Retry with exponential backoff for operations that fail on flaky networks,
 * such as BigQuery's multipart upload of a local file (`table.load`), which is
 * not resumable and has no retry of its own.
 *
 * Only retry operations that are safe to repeat — for a load job, one that
 * uses WRITE_TRUNCATE, so a second attempt replaces the table instead of
 * appending to it.
 */

const TRANSIENT_CODES = new Set(['EPIPE', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN', 'ESOCKETTIMEDOUT']);
const TRANSIENT_HTTP = new Set([408, 429, 500, 502, 503, 504]);
const TRANSIENT_MESSAGE = /\b(EPIPE|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up)\b/i;

/** True for network drops and server-side overload, false for anything the caller must fix. */
export const isTransientNetworkError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const { code } = error as Error & { code?: unknown };
  if (typeof code === 'string' && TRANSIENT_CODES.has(code)) return true;
  if (typeof code === 'number' && TRANSIENT_HTTP.has(code)) return true;
  return TRANSIENT_MESSAGE.test(error.message);
};

export interface RetryOptions {
  /** Total attempts, including the first. */
  attempts: number;
  /** Delay before the first retry; doubles on each later one. */
  baseDelayMs?: number;
  isRetryable?: (error: unknown) => boolean;
  /** Injected so tests do not wait. */
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: Readonly<{ attempt: number; delayMs: number; error: unknown }>) => void;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => { setTimeout(resolve, ms); });

export const withRetry = async <T>(operation: () => Promise<T>, options: Readonly<RetryOptions>): Promise<T> => {
  const {
    attempts,
    baseDelayMs = 2000,
    isRetryable = isTransientNetworkError,
    sleep = defaultSleep,
    onRetry,
  } = options;

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error: unknown) {
      if (attempt >= attempts || !isRetryable(error)) throw error;
      const delayMs = baseDelayMs * 2 ** (attempt - 1);
      onRetry?.({ attempt, delayMs, error });
      await sleep(delayMs);
    }
  }
};
