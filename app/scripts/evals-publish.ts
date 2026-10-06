// `pnpm evals:publish` (root): uploads the eval reports of `app/.evals/` as experiments of the runtime
// at EVALS_TARGET_URL (decision 0040). A no-op without EVALS_TARGET_URL; EVALS_TARGET_AUTHORIZATION
// (optional) is sent as is, e.g. a Cloud Run ID token header for a private runtime.
import path from "node:path";
import { z } from "zod";
import { publishEvalRuns } from "./src/evals/publish-eval-runs.ts";

const REPORT_DIR = path.resolve(import.meta.dirname, "../.evals");

// Validated once here (rules/validation.md): a malformed URL fails before any upload.
const PublishEnvSchema = z.object({
  EVALS_TARGET_URL: z.url().optional(),
  EVALS_TARGET_AUTHORIZATION: z.string().min(1).optional(),
});

try {
  const env = PublishEnvSchema.parse(process.env);
  const result = await publishEvalRuns({
    dir: REPORT_DIR,
    targetUrl: env.EVALS_TARGET_URL,
    ...(env.EVALS_TARGET_AUTHORIZATION === undefined ? {} : { authorization: env.EVALS_TARGET_AUTHORIZATION }),
  });
  const unset = env.EVALS_TARGET_URL === undefined ? " (EVALS_TARGET_URL not set)" : "";
  process.stdout.write(
    `[evals:publish] published ${result.published.length}, skipped ${result.skipped.length}${unset}\n`,
  );
} catch (error: unknown) {
  process.stdout.write(`[evals:publish] failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
