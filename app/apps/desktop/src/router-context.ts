import type { HealthClient } from "@/api/health-client.ts";

/** Dependencies loaders receive through TanStack Router context (injected in main.tsx). */
export type RouterContext = { healthClient: HealthClient };
