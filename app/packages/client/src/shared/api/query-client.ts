import { QueryClient } from "@tanstack/react-query";
import { isClientError } from "./api-error.ts";

const STALE_TIME_MS = 30_000;
const MAX_QUERY_RETRIES = 3;

/** Retry network, timeout and 5xx failures (up to three times); a 4xx never heals by retrying. */
export const shouldRetryQuery = (failureCount: number, error: unknown): boolean =>
  !isClientError(error) && failureCount < MAX_QUERY_RETRIES;

/**
 * The client's TanStack Query defaults (decision 0011): `staleTime` 30 s, no retry on 4xx, no
 * mutation retries (mutations are not idempotent unless they carry an Idempotency-Key, and the
 * caller decides). One client per app instance (and per request on the server, if ever used).
 */
export const createQueryClient = (): QueryClient =>
  new QueryClient({
    defaultOptions: {
      queries: { staleTime: STALE_TIME_MS, retry: shouldRetryQuery },
      mutations: { retry: false },
    },
  });
