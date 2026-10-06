// `pnpm evals:publish` (root): uploads the eval reports of `app/.evals/` as experiments of the runtime
// at EVALS_TARGET_URL (decision 0040). A no-op without EVALS_TARGET_URL; EVALS_TARGET_AUTHORIZATION
// (optional) is sent as is, e.g. a Cloud Run ID token header for a private runtime.
import path from "node:path";
import { publishEvalRuns } from "./src/evals/publish-eval-runs.ts";

const REPORT_DIR = path.resolve(import.meta.dirname, "../.evals");

try {
  const authorization = process.env["EVALS_TARGET_AUTHORIZATION"];
  const result = await publishEvalRuns({
    dir: REPORT_DIR,
    targetUrl: process.env["EVALS_TARGET_URL"],
    ...(authorization === undefined ? {} : { authorization }),
  });
  process.stdout.write(
    `[evals:publish] published ${result.published.length}, skipped ${result.skipped.length}${process.env["EVALS_TARGET_URL"] === undefined ? " (EVALS_TARGET_URL not set)" : ""}\n`,
  );
} catch (error: unknown) {
  process.stdout.write(`[evals:publish] failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
