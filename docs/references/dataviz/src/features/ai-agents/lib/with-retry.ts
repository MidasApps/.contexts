const TRANSIENT_STATUS_CODES = [429, 503, 529];
const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('econnreset') || msg.includes('epipe') || msg.includes('etimedout') || msg.includes('fetch failed')) {
      return true;
    }
    if (msg.includes('429') || msg.includes('503') || msg.includes('resource exhausted') || msg.includes('quota')) {
      return true;
    }
    const errWithStatus = error as { status?: unknown; statusCode?: unknown };
    const statusCode = errWithStatus.status ?? errWithStatus.statusCode;
    if (typeof statusCode === 'number' && TRANSIENT_STATUS_CODES.includes(statusCode)) {
      return true;
    }
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelay?: number; label?: string } = {},
): Promise<T> {
  const { maxRetries = MAX_RETRIES, baseDelay = BASE_DELAY_MS, label = 'operation' } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLast = attempt === maxRetries;
      if (isLast || !isTransientError(error)) {
        throw error;
      }
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`[withRetry] ${label} attempt ${attempt + 1}/${maxRetries + 1} failed, retrying in ${delay}ms`, error instanceof Error ? error.message : error);
      await sleep(delay);
    }
  }
  throw new Error('withRetry exhausted');
}
