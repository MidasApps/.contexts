// Public API of shared/api (FSD segment): the typed /v1 caller and TanStack Query defaults.
export { ApiError, CLIENT_ERROR_CODES, isClientError, type ApiErrorInit, type ClientErrorCode } from "./api-error.ts";
export { createEndpointCaller, type CallEndpoint, type EndpointCallOptions } from "./call-endpoint.ts";
export {
  createHttpClient,
  type FetchLike,
  type GetIdToken,
  type HttpClient,
  type HttpClientOptions,
  type HttpRequest,
  type HttpResponse,
} from "./http-client.ts";
export { createQueryClient, shouldRetryQuery } from "./query-client.ts";
export { queryKeys, type QueryKey } from "./query-keys.ts";
export { ApiProvider, useCallEndpoint } from "./api-context.tsx";
export { accessContextQuery, meQuery, type NodeParams } from "./core-queries.ts";
export {
  COLLECT_PAGE_LIMIT,
  collectAllPages,
  cursorListQuery,
  isApiErrorStatus,
  MAX_COLLECTED_PAGES,
  mergePages,
  nextCursor,
  nullOnNotFound,
  pageQuery,
  type FetchPage,
  type ListPage,
} from "./cursor-list.ts";
export { patchCachedLists } from "./optimistic-list.ts";
export { useIdempotencyKey } from "./use-idempotency-key.ts";
