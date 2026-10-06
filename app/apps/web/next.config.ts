import { existsSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import { buildSecurityHeaders } from "./src/config/security-headers";

/** Workspace root (`app/`): one `.env.local` and one lockfile for every app. */
const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../..");
const WORKSPACE_ENV_FILE = path.join(WORKSPACE_ROOT, ".env.local");

// Next only reads env files from this app's folder; the workspace keeps a single
// `.env.local` (copied from `.env.example`). Node's loader never overrides a
// variable that is already set, so a hosting platform's env always wins, and
// hosted builds simply have no file. `src/env.ts` validates the result at boot.
if (existsSync(WORKSPACE_ENV_FILE)) process.loadEnvFile(WORKSPACE_ENV_FILE);

const nextConfig: NextConfig = {
  cacheComponents: true,
  typedRoutes: true,
  poweredByHeader: false,
  reactStrictMode: true,
  // Workspace packages ship TypeScript sources (`exports` point at `src/*.ts`).
  transpilePackages: ["@core/contracts", "@core/services", "@core/client", "@core/i18n", "@core/module-example"],
  // libpg-query (SP3 SQL guard, via @core/services) loads its .wasm next to its own
  // module; bundled, it looks in the wrong folder, so Node loads it from node_modules.
  serverExternalPackages: ["libpg-query"],
  turbopack: { root: WORKSPACE_ROOT },
  // Static headers only; the CSP is set per request by src/proxy.ts (decision 0016).
  headers: () => Promise.resolve([{ source: "/:path*", headers: buildSecurityHeaders() }]),
};

// next-intl's plugin points `next-intl/config` at the request config (server-side messages).
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Next's config loader requires a default export.
export default withNextIntl(nextConfig);
