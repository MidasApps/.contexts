// Public API of shared/api (FSD segment): the typed /v1 caller and TanStack Query defaults.

export { type ApiConnection, ApiProvider, useApiConnection, useCallEndpoint } from "./api-context.tsx";
export { ApiError, type ApiErrorInit, CLIENT_ERROR_CODES, type ClientErrorCode, isClientError } from "./api-error.ts";
export { type CallEndpoint, createEndpointCaller, type EndpointCallOptions } from "./call-endpoint.ts";
export { type ChatScope, type ChatTransportOptions, createChatTransport } from "./chat-transport.ts";
export { accessContextQuery, meQuery, type NodeParams } from "./core-queries.ts";
export {
  COLLECT_PAGE_LIMIT,
  type CollectedPages,
  collectAllPages,
  collectPages,
  cursorListQuery,
  type FetchPage,
  isApiErrorStatus,
  type ListPage,
  MAX_COLLECTED_PAGES,
  mergePages,
  nextCursor,
  nullOnNotFound,
  pageQuery,
} from "./cursor-list.ts";
export {
  createHttpClient,
  type FetchLike,
  type GetIdToken,
  type HttpClient,
  type HttpClientOptions,
  type HttpRequest,
  type HttpResponse,
} from "./http-client.ts";
export { patchCachedLists } from "./optimistic-list.ts";
export { createQueryClient, shouldRetryQuery } from "./query-client.ts";
export { type QueryKey, queryKeys } from "./query-keys.ts";
export { useIdempotencyKey } from "./use-idempotency-key.ts";
