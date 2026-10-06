import type { SupportedLocale } from "@core/i18n";
import type { StaffSessionGuardResult, WebSessionGuardResult } from "@core/services";

/** What a guarded layout does when the guard refuses (Next's `redirect`/`notFound`, which throw). */
export type GuardOutcomes = {
  readonly locale: SupportedLocale;
  /** The requested path with the locale prefix (`x-request-path` from the proxy), if known. */
  readonly requestPath: string | null;
  readonly redirect: (href: string) => never;
  readonly notFound: () => never;
};

/**
 * `/{locale}/sign-in`, with `next` = the requested page without the locale (the sign-in view
 * honours it only when it parses as an internal route).
 */
export const signInHref = (locale: SupportedLocale, requestPath: string | null): string => {
  const prefix = `/${locale}`;
  const next = requestPath?.startsWith(prefix) === true ? requestPath.slice(prefix.length) : "";
  return next === "" || next === "/" ? `/${locale}/sign-in` : `/${locale}/sign-in?next=${encodeURIComponent(next)}`;
};

/** User area (decision 0012 §5): a valid web session, else sign in and come back. */
export const enforceWebSession = (
  result: WebSessionGuardResult,
  outcomes: GuardOutcomes,
): Extract<WebSessionGuardResult, { kind: "session" }> => {
  if (result.kind === "session") return result;
  return outcomes.redirect(signInHref(outcomes.locale, outcomes.requestPath));
};

/**
 * `/admin` (SP2 spec §7): platform staff with MFA on the session. A signed-in user who is not
 * staff (or lacks MFA) gets 404, not 403, so the surface does not reveal itself; without any
 * session the guard asks for a sign-in like the user area.
 */
export const enforceStaffSession = (
  result: StaffSessionGuardResult,
  outcomes: GuardOutcomes,
): Extract<StaffSessionGuardResult, { kind: "staff" }> => {
  if (result.kind === "staff") return result;
  if (result.kind === "not-found") return outcomes.notFound();
  return outcomes.redirect(signInHref(outcomes.locale, outcomes.requestPath));
};
