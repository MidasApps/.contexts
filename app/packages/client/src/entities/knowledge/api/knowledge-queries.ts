"use client";

import { type KnowledgeDocument, listKnowledgeDocumentsEndpoint } from "@core/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import type { CallEndpoint } from "#/shared/api/call-endpoint.ts";
import { cursorListQuery, pageQuery } from "#/shared/api/cursor-list.ts";
import { type QueryKey, queryKeys } from "#/shared/api/query-keys.ts";
import { useIsSignedIn } from "#/shared/lib/session/use-signed-in.ts";

export const KNOWLEDGE_PAGE_LIMIT = 20;
/** How often the list refetches while a document is still being indexed. */
export const KNOWLEDGE_PENDING_POLL_MS = 4_000;

/** Knowledge keys under the organization; adding or deleting a document invalidates `all`. */
export const knowledgeKeys = {
  all: (organizationId: string): QueryKey => queryKeys.organizationScoped(organizationId, "knowledge"),
  list: (organizationId: string, namespace: string | undefined): QueryKey =>
    queryKeys.organizationScoped(organizationId, "knowledge", "list", { namespace: namespace ?? null }),
};

/** `GET /v1/organizations/{id}/knowledge/documents` (core.knowledge.read), newest first, optionally one namespace. */
export const knowledgeDocumentsQuery = (
  callEndpoint: CallEndpoint,
  organizationId: string,
  namespace: string | undefined,
) =>
  cursorListQuery<KnowledgeDocument>({
    queryKey: knowledgeKeys.list(organizationId, namespace),
    fetchPage: async (cursor, signal) =>
      callEndpoint(listKnowledgeDocumentsEndpoint, {
        params: { organizationId },
        query: { ...pageQuery(cursor, KNOWLEDGE_PAGE_LIMIT), ...(namespace === undefined ? {} : { namespace }) },
        signal,
      }),
  });

/**
 * The organization's knowledge documents. Indexing runs in the background, so the list refetches
 * every few seconds while a loaded document is `pending` or the caller says a run was just started
 * (`poll`: the new document may not be registered yet).
 */
export const useKnowledgeDocuments = (
  organizationId: string,
  namespace: string | undefined,
  options: { poll?: boolean; enabled?: boolean } = {},
) => {
  const callEndpoint = useCallEndpoint();
  const signedIn = useIsSignedIn();
  return useInfiniteQuery({
    ...knowledgeDocumentsQuery(callEndpoint, organizationId, namespace),
    enabled: signedIn && organizationId !== "" && options.enabled !== false,
    refetchInterval: (query) => {
      const pending =
        query.state.data?.pages.some((page) => page.data.some((document) => document.status === "pending")) ?? false;
      return pending || options.poll === true ? KNOWLEDGE_PENDING_POLL_MS : false;
    },
  });
};
