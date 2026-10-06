import type { ObservabilityExporter } from "@mastra/core/observability";
import { MastraStorageExporter, Observability, SensitiveDataFilter } from "@mastra/observability";
import { OtelExporter, type OtelExporterConfig } from "@mastra/otel-exporter";
import { type ModelPrice, priceTableFor } from "../models/model-prices.ts";
import type { UsagePort } from "../runtime/runtime-ports.ts";
import { type SpanExportPolicy, sampleTraces, scrubSpanForExport } from "./span-export-policy.ts";
import { createUsageLedgerExporter } from "./usage-ledger-exporter.ts";

/**
 * Request-context keys copied into the metadata of every span (spec §13), so
 * traces filter by tenant and correlate with `/v1` logs. The uid and the
 * permissions stay out: spans are exported and are not the place for them.
 */
export const SPAN_CONTEXT_KEYS = [
  "tenantId",
  "projectId",
  "unitId",
  "requestId",
  "conversationId",
  "principalKind",
  "aiMode",
] as const;

/**
 * `SensitiveDataFilter` defaults of `@mastra/observability` 1.18.1, copied because
 * passing `sensitiveFields` replaces them (spec §13).
 */
export const DEFAULT_SENSITIVE_FIELDS = [
  "password",
  "token",
  "secret",
  "key",
  "apikey",
  "auth",
  "authorization",
  "bearer",
  "bearertoken",
  "jwt",
  "credential",
  "clientsecret",
  "privatekey",
  "refresh",
  "ssn",
] as const;

/** Fields of this runtime that carry credentials on top of the defaults. */
export const EXTRA_SENSITIVE_FIELDS = [
  "idToken",
  "cookie",
  "setCookie",
  "x-serverless-authorization",
  "x-api-key",
] as const;

export const SENSITIVE_FIELDS: readonly string[] = [...DEFAULT_SENSITIVE_FIELDS, ...EXTRA_SENSITIVE_FIELDS];

/** Share of traces exported to storage and OTLP outside `local`/`dev` (the ledger always sees all). */
export const REMOTE_TRACE_SAMPLE_RATIO = 0.2;

export type ObservabilityEnv = {
  readonly APP_ENV: "local" | "dev" | "staging" | "prod";
  readonly OTEL_EXPORTER_OTLP_ENDPOINT?: string | undefined;
};

export type CreateObservabilityArgs = {
  readonly serviceName: string;
  readonly env: ObservabilityEnv;
  /** `AI_MODE`: fake mode prices the fake models with nominal prices (`priceTableFor`); real by default. */
  readonly aiMode?: "fake" | "real";
  /** The live price table (staff prices over the code ones, decision 0072); default: `priceTableFor(aiMode)`. */
  readonly prices?: () => Readonly<Record<string, ModelPrice>>;
  /** The ledger port; without it no ledger exporter is registered. */
  readonly usage?: Pick<UsagePort, "recordLlmCalls" | "recordAgentRuns">;
  /** Replaces every exporter (tests). */
  readonly exporters?: ObservabilityExporter[];
  /** OTLP span exporter seam (tests); the default is http/protobuf to the endpoint. */
  readonly otlpSpanExporter?: NonNullable<OtelExporterConfig["exporter"]>;
};

const isLocalLike = (env: ObservabilityEnv): boolean => env.APP_ENV === "local" || env.APP_ENV === "dev";

/**
 * Exporters of the runtime (spec §13): Mastra storage (Studio, `/admin` traces),
 * OTLP http/protobuf when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (Cloud Trace or a
 * collector), both scrubbed (`span-export-policy.ts`) and sampled outside
 * local/dev; and the usage ledger, unscrubbed and unsampled, in-process only.
 * OTLP carries no prompts or answers outside local/dev (rules/observability.md).
 */
export const buildExporters = (args: CreateObservabilityArgs): ObservabilityExporter[] => {
  if (args.exporters !== undefined) return args.exporters;
  const ratio = isLocalLike(args.env) ? 1 : REMOTE_TRACE_SAMPLE_RATIO;
  const policy = (keepPayloads: boolean): SpanExportPolicy => ({ contextKeys: SPAN_CONTEXT_KEYS, keepPayloads });
  const storage = new MastraStorageExporter({ customSpanFormatter: (span) => scrubSpanForExport(span, policy(true)) });
  const endpoint = args.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const otlp =
    endpoint === undefined
      ? []
      : [
          new OtelExporter({
            provider: { custom: { endpoint, protocol: "http/protobuf" } },
            signals: { traces: true, logs: false },
            customSpanFormatter: (span) => scrubSpanForExport(span, policy(isLocalLike(args.env))),
            ...(args.otlpSpanExporter === undefined ? {} : { exporter: args.otlpSpanExporter }),
          }),
        ];
  const ledger =
    args.usage === undefined
      ? []
      : [createUsageLedgerExporter({ usage: args.usage, prices: args.prices ?? priceTableFor(args.aiMode ?? "real") })];
  return [...[storage, ...otlp].map((exporter) => sampleTraces(exporter, ratio)), ...ledger];
};

/**
 * Tracing of the agent runtime. The instance samples every trace and keeps internal
 * spans (the ledger needs each model call, detector calls included); exporters
 * sample for themselves. `SensitiveDataFilter` runs on
 * every span with the defaults plus this runtime's credential fields.
 */
export const createObservability = (args: CreateObservabilityArgs): Observability =>
  new Observability({
    configs: {
      default: {
        serviceName: args.serviceName,
        exporters: buildExporters(args),
        spanOutputProcessors: [new SensitiveDataFilter({ sensitiveFields: [...SENSITIVE_FIELDS] })],
        // Guardrail detectors call the fast model inside internal spans; the ledger must bill them too.
        includeInternalSpans: true,
        requestContextKeys: [...SPAN_CONTEXT_KEYS],
      },
    },
  });
