import { UpdateModelSettingsInputSchema } from "@core/contracts";
import type { Logger } from "@core/services";
import { type ApiRoute, registerApiRoute } from "@mastra/core/server";
import { z } from "zod";
import type { ModelSettingsService } from "../models/model-settings.ts";
import { withRequestId } from "./console-errors.ts";

const MODELS_ROUTE = "/console/models";

const UpdateBodySchema = z.strictObject({
  settings: UpdateModelSettingsInputSchema,
  actorId: z.string().min(1).max(128),
});

type HonoLike = {
  readonly req: { json: () => Promise<unknown>; header: (key: string) => string | undefined };
};

const json = (status: number, body: unknown): Response => Response.json(body, { status });
const fail = (status: number, code: string): Response => json(status, { error: { code, message: code } });

/**
 * `/console/models` (decision 0072): the model of each role and the model prices. Like the other
 * console routes it carries no user credential; `/v1/admin/models` requires staff first and audits.
 */
export const createModelConsoleRoutes = (deps: {
  readonly modelSettings: ModelSettingsService;
  readonly logger: Pick<Logger, "info" | "error">;
}): ApiRoute[] => {
  // Infrastructure errors answer 500 with no detail; the log keeps the cause.
  const guarded = (event: string, run: (c: HonoLike) => Promise<Response>) => async (c: HonoLike) => {
    const requestId = c.req.header("x-request-id");
    try {
      return await withRequestId(await run(c), requestId);
    } catch (error: unknown) {
      deps.logger.error(event, { ...(requestId === undefined ? {} : { requestId }), err: error });
      return withRequestId(fail(500, "INTERNAL_ERROR"), requestId);
    }
  };
  return [
    registerApiRoute(MODELS_ROUTE, {
      method: "GET",
      requiresAuth: false,
      handler: guarded("console_models_failed", async () => json(200, { data: await deps.modelSettings.view() })),
    }),
    registerApiRoute(MODELS_ROUTE, {
      method: "PUT",
      requiresAuth: false,
      handler: guarded("console_models_update_failed", async (c) => {
        const body = UpdateBodySchema.safeParse(await c.req.json().catch(() => null));
        if (!body.success) return fail(400, "VALIDATION_FAILED");
        const saved = await deps.modelSettings.update(body.data.settings, body.data.actorId);
        if (!saved.ok) {
          deps.logger.info("console_models_update_refused", { field: saved.error.field, issue: saved.error.issue });
          return fail(400, saved.error.code);
        }
        const requestId = c.req.header("x-request-id");
        deps.logger.info("console_models_updated", {
          ...(requestId === undefined ? {} : { requestId }),
          actorId: body.data.actorId,
          ...body.data.settings.roles,
        });
        return json(200, { data: saved.data });
      }),
    }),
  ];
};
