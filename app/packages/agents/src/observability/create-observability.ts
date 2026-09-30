import type { ObservabilityExporter } from "@mastra/core/observability";
import { MastraStorageExporter, Observability } from "@mastra/observability";
import type { UsagePort } from "../runtime/runtime-ports.ts";
import { createUsageLedgerExporter } from "./usage-ledger-exporter.ts";

/**
 * Request-context keys copied into the metadata of every span (spec §13), so
 * traces filter by tenant and correlate with `/v1` logs. The uid and the
 * permissions stay out: spans are exported and are not the place for them.
 */
export const SPAN_CONTEXT_KEYS = ["tenantId", "projectId", "unitId", "requestId", "principalKind", "aiMode"] as const;

/**
 * Tracing of the agent runtime: spans go to Mastra storage (Studio reads them)
 * with `SensitiveDataFilter` on by default, and every model call goes to the
 * usage ledger (decision 0026); OTLP export arrives with Task 17.
 * @param args.usage the ledger port; without it no ledger exporter is registered.
 * @param args.exporters replaces every exporter (tests).
 */
export const createObservability = (args: {
  serviceName: string;
  usage?: Pick<UsagePort, "recordLlmCalls">;
  exporters?: ObservabilityExporter[];
}): Observability =>
  new Observability({
    configs: {
      default: {
        serviceName: args.serviceName,
        exporters: args.exporters ?? [new MastraStorageExporter(), ...(args.usage === undefined ? [] : [createUsageLedgerExporter({ usage: args.usage })])],
        requestContextKeys: [...SPAN_CONTEXT_KEYS],
      },
    },
  });
