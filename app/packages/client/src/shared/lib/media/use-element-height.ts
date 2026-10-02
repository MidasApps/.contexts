"use client";

import { useCallback, useState, type RefCallback } from "react";

/**
 * The rendered height of an element (border box, `offsetHeight`), kept up to date while it
 * resizes. Pass the ref to the element; the height is `0` until it mounts. Without
 * `ResizeObserver` it is measured once.
 * @example const [ref, height] = useElementHeight<HTMLDivElement>();
 */
export const useElementHeight = <T extends HTMLElement>(): readonly [RefCallback<T>, number] => {
  const [height, setHeight] = useState(0);
  const ref = useCallback((node: T | null) => {
    if (node === null) return undefined;
    const measure = () => setHeight(node.offsetHeight);
    measure();
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, height] as const;
};
