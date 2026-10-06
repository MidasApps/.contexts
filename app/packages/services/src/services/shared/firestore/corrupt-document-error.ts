/**
 * A stored document does not match its contract (bug or unmigrated data,
 * contracts/firebase-firestore.md §17–§18). Carries the document path and the
 * failing field paths only: values may be personal data and never reach logs.
 */
export class CorruptDocumentError extends Error {
  readonly code = "CORRUPT_DOCUMENT";
  readonly documentPath: string;
  readonly issuePaths: readonly string[];

  constructor(args: { documentPath: string; issuePaths: readonly string[] }, options?: ErrorOptions) {
    super(`document ${args.documentPath} does not match its contract at: ${args.issuePaths.join(", ")}`, options);
    this.name = "CorruptDocumentError";
    this.documentPath = args.documentPath;
    this.issuePaths = args.issuePaths;
  }
}
