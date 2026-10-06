/**
 * A collection of the knowledge base as the settings page names it. The runtime has no named
 * collections: a document namespace is `tenant` (the whole organization), `project:<id>`,
 * `catalog` (platform content) or `module:<id>` (content shipped by a module), SP3 spec §11.
 */
export type KnowledgeCollection =
  | { readonly kind: "organization" }
  | { readonly kind: "project"; readonly projectId: string }
  | { readonly kind: "catalog" }
  | { readonly kind: "module"; readonly moduleId: string };

export const ORGANIZATION_NAMESPACE = "tenant";

/** The collection of a namespace; an unknown shape reads as the organization one (never throws on stored data). */
export const collectionOfNamespace = (namespace: string): KnowledgeCollection => {
  if (namespace === "catalog") return { kind: "catalog" };
  if (namespace.startsWith("project:")) return { kind: "project", projectId: namespace.slice("project:".length) };
  if (namespace.startsWith("module:")) return { kind: "module", moduleId: namespace.slice("module:".length) };
  return { kind: "organization" };
};

/** The namespace documents of a writable collection get: `tenant` or `project:<id>`. */
export const namespaceOfTarget = (projectId: string | undefined): string =>
  projectId === undefined ? ORGANIZATION_NAMESPACE : `project:${projectId}`;

/** Platform and module content is indexed by the platform; an organization cannot delete it. */
export const isOwnCollection = (collection: KnowledgeCollection): boolean =>
  collection.kind === "organization" || collection.kind === "project";
