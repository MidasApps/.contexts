"use client";

import { useEffect, useState } from "react";

/**
 * The value once it stopped changing for `delayMs`: a search box that asks the server writes its
 * text at once and queries with this, so typing a word is one request.
 * @example const query = useDebouncedValue(text, 300);
 */
export const useDebouncedValue = <T>(value: T, delayMs: number): T => {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
};
