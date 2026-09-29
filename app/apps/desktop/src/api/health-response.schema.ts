import { z } from "zod";

/**
 * Body of `GET /v1/health` (app/docs/decisions/0003). Local to the desktop app
 * until the shared client and contracts land in SP2.
 */
export const HealthResponseSchema = z.object({
  data: z.object({ status: z.literal("ok") }),
});

export type HealthResponse = z.infer<typeof HealthResponseSchema>;
