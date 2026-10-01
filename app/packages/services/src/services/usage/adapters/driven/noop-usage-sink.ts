import type { Logger } from "../../../shared/observability/logger.ts";
import type { UsageSink } from "../../application/ports/usage-sink.ts";

/** `UsageSink` of `local` (and `USAGE_SINK=none`): nothing leaves the machine; one log line per export. */
export const createNoopUsageSink = (logger: Logger): UsageSink => ({
  exportCalls: (calls) => {
    logger.info("usage_export_skipped", { rowCount: calls.length, sink: "none", table: "llm_calls" });
    return Promise.resolve();
  },
  exportRollups: (rollups) => {
    logger.info("usage_export_skipped", { rowCount: rollups.length, sink: "none", table: "daily_rollups" });
    return Promise.resolve();
  },
});
