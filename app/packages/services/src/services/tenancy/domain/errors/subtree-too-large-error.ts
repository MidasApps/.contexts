/** A move or delete would rewrite more units than the limit (SP1 spec §6.1) → 422 SUBTREE_TOO_LARGE. */
export class SubtreeTooLargeError extends Error {
  readonly code = "SUBTREE_TOO_LARGE";
  readonly limit: number;

  constructor(limit: number, options?: ErrorOptions) {
    super(`the subtree has more than ${limit} units`, options);
    this.name = "SubtreeTooLargeError";
    this.limit = limit;
  }
}
