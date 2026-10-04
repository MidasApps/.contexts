"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Which row of the list is being renamed. When the rename form leaves the row, the focus goes
 * back to that row's link, not to the page; `listRef` goes on the list that holds the rows.
 */
export const useRenamingRow = () => {
  const [renamingId, setRenamingId] = useState<string | undefined>();
  const listRef = useRef<HTMLUListElement>(null);
  const renamed = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (renamingId !== undefined) {
      renamed.current = renamingId;
      return;
    }
    if (renamed.current === undefined) return;
    listRef.current?.querySelector<HTMLElement>(`[data-conversation-id="${renamed.current}"] a`)?.focus();
    renamed.current = undefined;
  }, [renamingId]);
  return { renamingId, setRenamingId, listRef };
};
