import { createCorsPolicy } from "@core/services";
import { env } from "./env";
import { createProxy } from "./http/create-proxy";

/** Next 16 proxy: request id on every request, CORS allowlist on `/v1` (see `createProxy`). */
export const proxy = createProxy({ corsPolicy: createCorsPolicy(env.CORS_ALLOWED_ORIGINS) });

// Static assets carry no request context worth correlating.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
