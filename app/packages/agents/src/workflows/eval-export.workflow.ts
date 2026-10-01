import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";
import type { EvalExportPort } from "../runtime/runtime-ports.ts";
import { isPlatformRun, PLATFORM_ONLY } from "./platform-only.ts";

export const EVAL_EXPORT_WORKFLOW_ID = "eval-export";
/** Platform schedule (SP5 spec §3.2): daily at 05:00 UTC. */
export const EVAL_EXPORT_CRON = "0 5 * * *";
/** Window of each run: two days, so one missed daily fire is still covered (rows dedupe downstream). */
export const EVAL_EXPORT_WINDOW_MS = 48 * 3_600_000;

export const EvalExportResultSchema = z.strictObject({
  status: z.enum(["done", "failed"]),
  experiments: z.int().min(0),
  rows: z.int().min(0),
  code: z.string().nullable(),
});

/**
 * `eval-export` (SP5 spec §3.2, decision 0040): exports the summaries of experiments finished in the
 * last two days to BigQuery `ai_observability.eval_runs` (one row per scorer; a no-op sink in local).
 * Platform only.
 */
export const createEvalExportWorkflow = (deps: { readonly evalExport: EvalExportPort; readonly now?: () => Date }) =>
  createWorkflow({
    id: EVAL_EXPORT_WORKFLOW_ID,
    description: "Exports eval experiment summaries to the warehouse.",
    inputSchema: z.strictObject({}),
    outputSchema: EvalExportResultSchema,
  })
    .then(
      createStep({
        id: "export",
        inputSchema: z.strictObject({}),
        outputSchema: EvalExportResultSchema,
        execute: async ({ requestContext }) => {
          if (!isPlatformRun(requestContext)) return { status: "failed" as const, experiments: 0, rows: 0, code: PLATFORM_ONLY };
          const since = new Date((deps.now ?? (() => new Date()))().getTime() - EVAL_EXPORT_WINDOW_MS).toISOString();
          const summaries = await deps.evalExport.listFinishedSince({ since });
          const rows = summaries.length === 0 ? 0 : await deps.evalExport.exportSummaries(summaries);
          return { status: "done" as const, experiments: summaries.length, rows, code: null };
        },
      }),
    )
    .commit();
