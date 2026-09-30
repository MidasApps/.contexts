import type { ApiKeyExpiryIssue } from "@core/contracts";

/** `expiresAt` must be after now and at most 365 days ahead (400 on field `expiresAt`). */
export class ApiKeyExpiryInvalidError extends Error {
  readonly code = "API_KEY_EXPIRY_INVALID";
  readonly issue: ApiKeyExpiryIssue;

  constructor(issue: ApiKeyExpiryIssue) {
    super(`invalid API key expiry: ${issue}`);
    this.name = "ApiKeyExpiryInvalidError";
    this.issue = issue;
  }
}

/** The key does not exist (404). */
export class ApiKeyNotFoundError extends Error {
  readonly code = "NOT_FOUND";

  constructor() {
    super("API key not found");
    this.name = "ApiKeyNotFoundError";
  }
}
