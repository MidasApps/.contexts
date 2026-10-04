"use client";

import { useEffect, useRef } from "react";

export type ShortcutOptions = {
  /** Key compared case-insensitively with `KeyboardEvent.key` (`"k"`, `"b"`). */
  key: string;
  /** Requires ⌘ on macOS or Ctrl elsewhere (atalhos.html: macOS-first convention). */
  mod?: boolean;
  onTrigger: (event: KeyboardEvent) => void;
  enabled?: boolean;
  /** Also fire while typing in inputs, textareas and editable content (default true for mod shortcuts). */
  allowInEditable?: boolean;
};

const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT");

/** `true` when the event is ⌘/Ctrl + `key` without Alt/Shift. */
export const isModShortcut = (event: KeyboardEvent, key: string): boolean =>
  (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === key.toLowerCase();

/**
 * Registers a global keyboard shortcut on `window`. Single-key shortcuts (no `mod`) never fire in
 * editable fields, so they cannot hijack typing (WCAG 2.1.4); modifier shortcuts do by default.
 */
export const useShortcut = ({
  key,
  mod = true,
  onTrigger,
  enabled = true,
  allowInEditable = mod,
}: ShortcutOptions): void => {
  const handler = useRef(onTrigger);
  useEffect(() => {
    handler.current = onTrigger;
  }, [onTrigger]);

  useEffect(() => {
    if (!enabled) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      const matches = mod ? isModShortcut(event, key) : event.key.toLowerCase() === key.toLowerCase();
      if (!matches || (!allowInEditable && isEditableTarget(event.target))) return;
      event.preventDefault();
      handler.current(event);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [key, mod, enabled, allowInEditable]);
};
