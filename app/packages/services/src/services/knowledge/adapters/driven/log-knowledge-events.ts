import type { KnowledgeDocumentSource } from "@core/contracts";
import { ulid } from "ulid";
import type { Logger } from "#/services/shared/observability/logger.ts";

/** `KNOWLEDGE_DOCUMENT_INDEXED` (contracts/events.md naming): a document's chunks are searchable. */
export type KnowledgeDocumentIndexedEvent = {
  readonly tenantId: string;
  readonly documentId: string;
  readonly source: KnowledgeDocumentSource;
  readonly chunkCount: number;
  readonly requestId: string | null;
};

/**
 * Until the event bus exists (SP3 Task 25 / SP5), knowledge events are one structured
 * log line each, with a ULID `eventId` (ADR 0005). Matches `@core/agents` `KnowledgeEventsPort`.
 */
export const createLogKnowledgeEventPublisher = (logger: Logger) => ({
  documentIndexed: (event: KnowledgeDocumentIndexedEvent): Promise<void> => {
    const { requestId, ...fields } = event;
    logger.info("knowledge_document_indexed_event", {
      eventId: ulid(),
      eventName: "KNOWLEDGE_DOCUMENT_INDEXED",
      schemaVersion: 1,
      ...fields,
      ...(requestId === null ? {} : { requestId }),
    });
    return Promise.resolve();
  },
});
