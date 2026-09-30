// Vitest setup for @core/client (vitest.config.ts `setupFiles`): Testing Library cleanup (globals are
// off, so it does not register itself) and the browser APIs Radix primitives call that jsdom lacks.
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

const noop = (): void => undefined;

const defineIfMissing = (target: object, name: string, value: unknown): void => {
  if (!(name in target)) Object.defineProperty(target, name, { value, configurable: true, writable: true });
};

if (typeof window !== "undefined") {
  defineIfMissing(window, "matchMedia", (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: noop,
    removeListener: noop,
    addEventListener: noop,
    removeEventListener: noop,
    dispatchEvent: () => false,
  }));
  defineIfMissing(
    globalThis,
    "ResizeObserver",
    class {
      observe = noop;
      unobserve = noop;
      disconnect = noop;
    },
  );
  defineIfMissing(Element.prototype, "scrollIntoView", noop);
  defineIfMissing(Element.prototype, "hasPointerCapture", () => false);
  defineIfMissing(Element.prototype, "releasePointerCapture", noop);
}
