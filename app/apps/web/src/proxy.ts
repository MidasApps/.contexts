import { createCorsPolicy } from "@core/services";
import createMiddleware from "next-intl/middleware";
import { buildPageContentSecurityPolicy } from "./config/security-headers";
import { env } from "./env";
import { createProxy } from "./http/create-proxy";
import { routing } from "./i18n/routing";

const isDevelopment = process.env.NODE_ENV === "development";
const authEmulatorOrigin = env.APP_ENV === "local" ? env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL : undefined;
// Local uploads go to the Storage Emulator instead of a signed URL (files context, `APP_ENV=local` only).
const storageEmulatorOrigin =
  env.APP_ENV === "local" && env.FIREBASE_STORAGE_EMULATOR_HOST !== undefined
    ? `http://${env.FIREBASE_STORAGE_EMULATOR_HOST}`
    : undefined;

/**
 * Next 16 proxy: request id on every request, CORS allowlist on `/v1`, locale routing and the
 * page CSP on everything else (see `createProxy`; CSP variant in decision 0016).
 */
export const proxy = createProxy({
  corsPolicy: createCorsPolicy(env.CORS_ALLOWED_ORIGINS),
  localeMiddleware: createMiddleware(routing),
  pageCsp: (nonce) =>
    buildPageContentSecurityPolicy({ isDevelopment, nonce, authEmulatorOrigin, storageEmulatorOrigin }),
  // Static fallback (decision 0016 §2): Cache Components prerenders the static shell at build time,
  // so its framework scripts can never carry a per-request nonce (verified in SP2 Task 18).
  cspMode: "static",
});

// Static assets carry no request context worth correlating; `/guide/` holds the user guide's
// screenshots (public files, decision 0073), served without a locale.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|guide/).*)"],
};
