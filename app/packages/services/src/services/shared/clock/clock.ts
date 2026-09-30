/** Time source injected into use cases, so tests control "now" (rule `testing`). */
export type Clock = { readonly now: () => Date };

/** The real clock; only composition roots use it. */
export const systemClock: Clock = { now: () => new Date() };

/**
 * A clock stuck at one instant, for tests.
 * @example const clock = fixedClock("2026-09-29T12:00:00.000Z");
 */
export const fixedClock = (iso: string): Clock => {
  const instant = new Date(iso);
  return { now: () => new Date(instant.getTime()) };
};

/**
 * Whether an ISO 8601 instant is at or before `now` (expired). An unparsable
 * instant counts as passed, so a corrupt expiry never keeps access open.
 */
export const isAtOrBefore = (iso: string, now: Date): boolean => !(Date.parse(iso) > now.getTime());
