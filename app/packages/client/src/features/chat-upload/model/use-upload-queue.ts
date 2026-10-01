"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { createUploadQueue, type UploadItem, type UploadQueue, type UploadQueueDeps } from "./upload-queue.ts";

export type UseUploadQueueArgs = {
  /** Organization the files belong to (the chat scope). */
  readonly organizationId: string;
  /** Test seams, passed through to the queue. */
  readonly seams?: Pick<UploadQueueDeps, "transfer" | "wait" | "previews" | "newId"> | undefined;
};

const NO_ITEMS: readonly UploadItem[] = [];

/** The organization the queue reads at upload time, kept outside React state: the queue outlives renders. */
const createScopeLink = (initial: string) => {
  let organizationId = initial;
  return {
    get: (): string => organizationId,
    set: (next: string): void => {
      organizationId = next;
    },
  };
};

/**
 * The composer's upload queue for one chat thread: created once, read through
 * `useSyncExternalStore`, and emptied (uploads in flight cancelled) when the thread unmounts.
 */
export const useUploadQueue = ({ organizationId, seams }: UseUploadQueueArgs): { readonly queue: UploadQueue; readonly items: readonly UploadItem[] } => {
  const callEndpoint = useCallEndpoint();
  const [scope] = useState(() => createScopeLink(organizationId));
  useEffect(() => scope.set(organizationId), [scope, organizationId]);
  const [queue] = useState(() => createUploadQueue({ callEndpoint, getOrganizationId: scope.get, ...seams }));
  useEffect(() => () => queue.clear(), [queue]);
  const items = useSyncExternalStore(queue.subscribe, queue.getSnapshot, () => NO_ITEMS);
  return { queue, items };
};
