"use client";

import { useCallback, useRef } from "react";
import { ulid } from "ulid";

/**
 * One `Idempotency-Key` (ULID) per logical attempt (contracts/api.md §11.1): retrying the same body
 * reuses the key, so a create that reached the server once is not repeated; changed values get a
 * new key. Call `reset` after a success.
 * @example const idempotency = useIdempotencyKey(); callEndpoint(endpoint, { body, idempotencyKey: idempotency.keyFor(body) });
 */
export const useIdempotencyKey = (): { keyFor: (body: unknown) => string; reset: () => void } => {
  const attempt = useRef<{ key: string; body: string } | null>(null);
  const keyFor = useCallback((body: unknown): string => {
    const serialized = JSON.stringify(body);
    if (attempt.current?.body !== serialized) attempt.current = { key: ulid(), body: serialized };
    return attempt.current.key;
  }, []);
  const reset = useCallback(() => {
    attempt.current = null;
  }, []);
  return { keyFor, reset };
};
