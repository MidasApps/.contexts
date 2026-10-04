import "server-only";
import type { CookieJar } from "@core/services";
import { cookies } from "next/headers";
import { sessionCookieOptions } from "./session-cookie-options";

/**
 * The `CookieJar` of SP1's session actions and guards over Next `cookies()` (decision 0007).
 * Use it in Server Actions (set/delete) and Server Components (get only).
 * @example const jar = await createSessionCookieJar(); await getCoreServer().then((core) => core.sessionActions.signOut({ cookies: jar, origin }));
 */
export const createSessionCookieJar = async (): Promise<CookieJar> => {
  const { env } = await import("@/env");
  const store = await cookies();
  return {
    get: (name) => store.get(name)?.value,
    set: (name, value, { maxAgeSeconds }) =>
      void store.set(
        name,
        value,
        sessionCookieOptions({ appEnv: env.APP_ENV, appUrl: env.NEXT_PUBLIC_APP_URL, maxAgeSeconds }),
      ),
    delete: (name) => void store.delete(name),
  };
};
