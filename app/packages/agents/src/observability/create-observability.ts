import type { ObservabilityExporter } from "@mastra/core/observability";
import { MastraStorageExporter, Observability } from "@mastra/observability";

/**
 * Request-context keys copied into the metadata of every span (spec §13), so
 * traces filter by tenant and correlate with `/v1` logs. The uid and the
 * permissions stay out: spans are exported and are not the place for them.
 */
export const SPAN_CONTEXT_KEYS = ["tenantId", "projectId", "unitId", "requestId", "principalKind", "aiMode"] as const;

/**
 * Tracing of the agent runtime: spans go to Mastra storage (Studio reads them)
 * with `SensitiveDataFilter` on by default; OTLP export arrives with Task 17.
 * @param args.exporters replaces the storage exporter (tests).
 */
export const createObservability = (args: { serviceName: string; exporters?: ObservabilityExporter[] }): Observability =>
  new Observability({
    configs: {
      default: {
        serviceName: args.serviceName,
        exporters: args.exporters ?? [new MastraStorageExporter()],
        requestContextKeys: [...SPAN_CONTEXT_KEYS],
      },
    },
  });
