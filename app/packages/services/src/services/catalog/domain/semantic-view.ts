/** Schema that holds the AI-readable views (owned by `semantic_owner`, decision 0024). */
export const SEMANTIC_SCHEMA = "semantic";

/** A view the AI may query: `semantic.<view>`, readable with the contract's permission. */
export type SemanticView = {
  readonly view: string;
  readonly contractId: string;
  readonly permission: string;
};

export type SemanticViewRegistry = {
  readonly list: () => readonly SemanticView[];
  /** View names the permissions allow (never a view without a registered permission). */
  readonly allowedFor: (permissions: ReadonlySet<string>) => ReadonlySet<string>;
};

const VIEW_NAME = /^[a-z][a-z0-9_]{0,62}$/;

/** Thrown at boot for a malformed or duplicated view entry (bug). */
export class InvalidSemanticViewError extends Error {
  readonly code = "INVALID_SEMANTIC_VIEW";
  readonly view: string;

  constructor(view: string, reason: string) {
    super(`semantic view ${view}: ${reason}`);
    this.name = "InvalidSemanticViewError";
    this.view = view;
  }
}

/**
 * View registry: view name → contract → permission (spec §8.3).
 * @throws {InvalidSemanticViewError} for a bad name or a duplicate.
 */
export const createSemanticViewRegistry = (views: readonly SemanticView[]): SemanticViewRegistry => {
  const byName = new Map<string, SemanticView>();
  for (const entry of views) {
    if (!VIEW_NAME.test(entry.view))
      throw new InvalidSemanticViewError(entry.view, "name must be a lower-case identifier");
    if (byName.has(entry.view)) throw new InvalidSemanticViewError(entry.view, "registered twice");
    byName.set(entry.view, entry);
  }
  return {
    list: () => [...byName.values()],
    allowedFor: (permissions) =>
      new Set([...byName.values()].filter((entry) => permissions.has(entry.permission)).map((entry) => entry.view)),
  };
};
