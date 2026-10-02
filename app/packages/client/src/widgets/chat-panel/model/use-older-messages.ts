"use client";

import type { UIMessage } from "ai";
import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { fetchMessagePage } from "./use-conversation-thread.ts";

export type OlderMessages = {
  /** `true` while more history exists before what is on screen. */
  readonly hasOlder: boolean;
  readonly loading: boolean;
  /** The last attempt failed: said next to the button, which stays as the retry. */
  readonly failed: boolean;
  readonly load: () => void;
  /** The scrolling log element (`Conversation` `scrollElementRef`). */
  readonly scrollElementRef: RefObject<HTMLDivElement | null>;
};

type Anchor = { readonly height: number; readonly top: number; readonly last: boolean };

/**
 * Loads the page of messages before the ones on screen and keeps the reader where they were:
 * prepending content above the viewport would otherwise push what they were reading down. The
 * scroll position is restored before paint by the height the log gained. When the last page
 * arrives the "load earlier" button goes away, so the focus moves to the log (never lost).
 */
export const useOlderMessages = (args: {
  conversationId: string | undefined;
  initialCursor: string | undefined;
  messages: readonly UIMessage[];
  prepend: (older: UIMessage[]) => void;
}): OlderMessages => {
  const callEndpoint = useCallEndpoint();
  const [cursor, setCursor] = useState(args.initialCursor);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const scrollElementRef = useRef<HTMLDivElement | null>(null);
  const anchor = useRef<Anchor | null>(null);

  useLayoutEffect(() => {
    const pending = anchor.current;
    const scroller = scrollElementRef.current;
    if (pending === null || scroller === null) return;
    anchor.current = null;
    scroller.scrollTop = pending.top + (scroller.scrollHeight - pending.height);
    if (pending.last) scroller.focus({ preventScroll: true });
  }, [args.messages]);

  const load = async (): Promise<void> => {
    if (cursor === undefined || args.conversationId === undefined || loading) return;
    setLoading(true);
    setFailed(false);
    try {
      const page = await fetchMessagePage(callEndpoint, args.conversationId, cursor);
      const scroller = scrollElementRef.current;
      if (scroller !== null)
        anchor.current = {
          height: scroller.scrollHeight,
          top: scroller.scrollTop,
          last: page.olderCursor === undefined,
        };
      args.prepend(page.messages);
      setCursor(page.olderCursor);
    } catch {
      // Shown next to the button, which stays as the retry; the conversation on screen is unaffected.
      // The thread reports nothing else: the failure is a read the member can repeat at once.
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  return { hasOlder: cursor !== undefined, loading, failed, load: () => void load(), scrollElementRef };
};
