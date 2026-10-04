"use client";

import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { ChatSession } from "./use-chat-session.ts";

/**
 * The composer's draft and focus in a thread: the composer takes the focus on mount when asked
 * (a new conversation), after a stop and after a suggestion fills the draft; Esc anywhere in the
 * thread stops a busy answer. The keyboard flow never dead-ends.
 */
export const useComposerFocus = (session: Pick<ChatSession, "busy" | "stop">, focusOnMount: boolean | undefined) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (focusOnMount === true) inputRef.current?.focus();
  }, [focusOnMount]);

  const stop = () => {
    session.stop();
    inputRef.current?.focus();
  };

  // The draft is the composer's, kept here so a suggestion can fill it.
  const [draft, setDraft] = useState("");
  // A suggestion fills the draft for review instead of sending at once: the member can edit it.
  const suggest = (prompt: string) => {
    setDraft(prompt);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    // Popovers and the composer handle their own Esc first (they prevent the default).
    if (event.key !== "Escape" || event.defaultPrevented || !session.busy) return;
    event.preventDefault();
    stop();
  };

  return { inputRef, draft, setDraft, stop, suggest, onKeyDown };
};
