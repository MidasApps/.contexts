import type { Logger } from "../../../shared/observability/logger.ts";
import type { UsageSink } from "../../application/ports/usage-sink.ts";

/** `UsageSink` of `local` (and `USAGE_SINK=none`): nothing leaves the machine; one log line per export. */
export const createNoopUsageSink = (logger: Logger): UsageSink => ({
  exportCalls: (calls) => {
    logger.info("usage_export_skipped", { rowCount: calls.length, sink: "none" });
    return Promise.resolve();
  },
});
