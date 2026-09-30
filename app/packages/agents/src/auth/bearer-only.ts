import { FORWARDED_HEADERS } from "@core/contracts";
import { getRequestHeader, getWebRequest, type MastraAuthRequest } from "@mastra/core/server";

const BEARER_PATTERN = /^Bearer ([^\s]+)$/;
const READ_METHODS = new Set(["GET", "HEAD"]);

/**
 * The Bearer token of the raw `Authorization` header, or `undefined`.
 * Mastra's adapter also accepts `?apiKey=<token>` (SP0 gotcha 2); reading the
 * header ourselves makes a query-string token count as absent (decision 0020).
 */
export const readBearerToken = (request: MastraAuthRequest): string | undefined => {
  const header = getRequestHeader(request, FORWARDED_HEADERS.authorization);
  const match = header === null ? null : BEARER_PATTERN.exec(header.trim());
  return match?.[1];
};

/** Reads skip the revocation round trip; everything else checks it (unknown method → check). */
export const requiresRevocationCheck = (request: MastraAuthRequest): boolean => {
  const method = getWebRequest(request)?.method.toUpperCase();
  return method === undefined || !READ_METHODS.has(method);
};

/** Path of the request (`/api/...`), or `undefined` when the adapter hides the URL. */
export const readRequestPath = (request: MastraAuthRequest): string | undefined => {
  const url = getWebRequest(request)?.url;
  return url === undefined ? undefined : new URL(url).pathname;
};

/** A forwarded header value, trimmed; empty counts as absent. */
export const readForwardedHeader = (request: MastraAuthRequest, name: string): string | undefined => {
  const value = getRequestHeader(request, name)?.trim();
  return value === undefined || value === "" ? undefined : value;
};
