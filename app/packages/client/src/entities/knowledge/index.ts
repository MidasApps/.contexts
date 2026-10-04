// Public API of the knowledge entity (SP5 Task 14): the organization's indexed documents and how
// their namespaces read as collections. Adding and deleting documents live in features and
// invalidate `knowledgeKeys.all(organizationId)`.
export {
  KNOWLEDGE_PAGE_LIMIT,
  KNOWLEDGE_PENDING_POLL_MS,
  knowledgeDocumentsQuery,
  knowledgeKeys,
  useKnowledgeDocuments,
} from "./api/knowledge-queries.ts";
export {
  collectionOfNamespace,
  isOwnCollection,
  type KnowledgeCollection,
  namespaceOfTarget,
  ORGANIZATION_NAMESPACE,
} from "./lib/collection.ts";
export { KnowledgeStatusPill } from "./ui/KnowledgeStatusPill.tsx";
