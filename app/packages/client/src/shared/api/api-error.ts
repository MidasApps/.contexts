import type { ErrorDetail } from "@core/contracts";

/**
 * Codes the client produces itself (no `/v1` answer to read). They are `errors.*` i18n keys like
 * the API's `CORE_ERROR_CODES`.
 */
export const CLIENT_ERROR_CODES = ["NETWORK_ERROR", "TIMEOUT", "INVALID_RESPONSE"] as const;
export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];

export type ApiErrorInit = {
  /** HTTP status; `0` when no response arrived (network failure, timeout). */
  status: number;
  code: string;
  message: string;
  details?: readonly ErrorDetail[] | undefined;
  requestId?: string | undefined;
};

/**
 * A failed `/v1` call (contracts/api.md §6): views program against `code` (and show
 * `errors.<code>` + `requestId`), never against `message`, which is English and generic.
 * Fits `SchemaFormFailure` structurally.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: readonly ErrorDetail[] | undefined;
  readonly requestId: string | undefined;
  constructor(init: ApiErrorInit, options?: ErrorOptions) {
    super(init.message, options);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId;
  }
}

/** Client errors (4xx) do not heal by retrying; network, timeout and 5xx may. */
export const isClientError = (error: unknown): boolean =>
  error instanceof ApiError && error.status >= 400 && error.status < 500;
