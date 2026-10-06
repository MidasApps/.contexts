// Vitest setup (vitest.config.ts `setupFiles`): the @core/client setup (Testing Library cleanup and
// the browser APIs Radix calls that jsdom lacks), plus `scrollTo`, which TanStack Router's scroll
// handling calls on every navigation and jsdom only stubs with a "not implemented" warning.
import "@core/client/testing/setup";

if (typeof window !== "undefined") {
  Object.defineProperty(window, "scrollTo", { value: () => undefined, configurable: true, writable: true });
}
