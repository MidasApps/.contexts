import "server-only";
import type { SupportedLocale } from "@core/i18n";
import type { StaffSessionGuardResult, WebSessionGuardResult } from "@core/services";
import type { Route } from "next";
import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { REQUEST_PATH_HEADER } from "@/http/create-proxy";
import { getCoreServer } from "./core";
import { enforceStaffSession, enforceWebSession, type GuardOutcomes } from "./guards";

const guardInputs = async (locale: SupportedLocale) => {
  const [store, requestHeaders, core] = await Promise.all([cookies(), headers(), getCoreServer()]);
  const jar = { get: (name: string) => store.get(name)?.value };
  const outcomes: GuardOutcomes = {
    locale,
    requestPath: requestHeaders.get(REQUEST_PATH_HEADER),
    // Typed routes cannot see built strings; `signInHref` only builds `/{locale}/sign-in[?next=]`.
    redirect: (href) => redirect(href as Route),
    notFound,
  };
  return { core, jar, outcomes };
};

/**
 * `(app)` layout guard (SP1 spec §3.3): the web session of the `__session` cookie, else a redirect
 * to `/{locale}/sign-in?next=`. Request-time (cookies): call it inside `<Suspense>`.
 */
export const requireWebSession = async (
  locale: SupportedLocale,
): Promise<Extract<WebSessionGuardResult, { kind: "session" }>> => {
  const { core, jar, outcomes } = await guardInputs(locale);
  return enforceWebSession(await core.sessionGuards.requireWebSession(jar), outcomes);
};

/** `/admin` layout guard (SP1 spec §3.4): staff with MFA; a non-staff user gets 404. */
export const requirePlatformStaffSession = async (
  locale: SupportedLocale,
): Promise<Extract<StaffSessionGuardResult, { kind: "staff" }>> => {
  const { core, jar, outcomes } = await guardInputs(locale);
  return enforceStaffSession(await core.sessionGuards.requirePlatformStaffSession(jar), outcomes);
};
