import type { ConsoleMessage, Page } from "@playwright/test";

export type ConsoleProblem = { readonly kind: "error" | "warning" | "pageerror"; readonly text: string };

export type ConsoleGuard = {
  /**
   * Declares console output this journey causes on purpose (a request the test makes fail logs
   * "Failed to load resource…"). Everything else stays a failure.
   */
  readonly allow: (pattern: RegExp) => void;
  /** Problems seen so far that no `allow` pattern covers. */
  readonly problems: () => readonly ConsoleProblem[];
};

const kindOf = (message: ConsoleMessage): "error" | "warning" | undefined => {
  const type = message.type();
  return type === "error" || type === "warning" ? type : undefined;
};

/**
 * Records what the page writes to the browser console as an error or a warning, and every
 * uncaught exception. A journey ends clean when `problems()` is empty.
 *
 * The e2e web is a production build: it shows runtime errors, failed requests, CSP violations and
 * hydration errors. React's development-only warnings (duplicate keys, act, prop types) are not
 * emitted by a production build; those are covered by the component tests in jsdom.
 */
export const watchConsole = (page: Page): ConsoleGuard => {
  const seen: ConsoleProblem[] = [];
  const allowed: RegExp[] = [];
  page.on("console", (message) => {
    const kind = kindOf(message);
    if (kind !== undefined) seen.push({ kind, text: message.text() });
  });
  page.on("pageerror", (error) => seen.push({ kind: "pageerror", text: error.message }));
  return {
    allow: (pattern) => void allowed.push(pattern),
    problems: () => seen.filter((problem) => !allowed.some((pattern) => pattern.test(problem.text))),
  };
};
