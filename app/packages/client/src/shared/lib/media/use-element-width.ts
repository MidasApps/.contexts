"use client";

import { useCallback, useState } from "react";

/**
 * The content width of an element, kept current with a `ResizeObserver`. `undefined` until the
 * element is measured (server render, first paint, or an environment without layout such as
 * jsdom, where widths are 0), so callers fall back to a viewport rule.
 * @example const [ref, width] = useElementWidth<HTMLDivElement>(); <div ref={ref} />
 */
export const useElementWidth = <E extends Element>(): [ref: (element: E | null) => (() => void) | undefined, width: number | undefined] => {
  const [width, setWidth] = useState<number | undefined>(undefined);
  const ref = useCallback((element: E | null) => {
    if (element === null || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => {
      const measured = entries.at(-1)?.contentRect.width;
      setWidth(measured === undefined || measured <= 0 ? undefined : Math.round(measured));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
};
