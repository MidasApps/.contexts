import { type AnyExportedSpan, SpanType, TracingEventType } from "@mastra/core/observability";
import { SensitiveDataFilter } from "@mastra/observability";
import { describe, expect, it } from "vitest";
import { createFakeUsagePort } from "../testing/index.ts";
import {
  buildExporters,
  DEFAULT_SENSITIVE_FIELDS,
  EXTRA_SENSITIVE_FIELDS,
  SENSITIVE_FIELDS,
  SPAN_CONTEXT_KEYS,
} from "./create-observability.ts";
import { hashResourceId, isTraceSampled } from "./span-export-policy.ts";

const ENDPOINT = "https://otel-collector.internal:4318/v1/traces";

type CapturedSpan = { attributes: Record<string, unknown>; name: string };

const capturingSpanExporter = () => {
  const spans: CapturedSpan[] = [];
  return {
    spans,
    exporter: {
      export: (batch: CapturedSpan[], done: (result: { code: number }) => void) => {
        spans.push(...batch);
        done({ code: 0 });
      },
      shutdown: () => Promise.resolve(),
      forceFlush: () => Promise.resolve(),
    },
  };
};

// A trace id kept by the remote 20 % sampler, so the remote export is observable.
const SAMPLED_TRACE_ID =
  Array.from({ length: 100 }, (_, index) => index.toString(16).padStart(32, "4")).find((id) =>
    isTraceSampled(id, 0.2),
  ) ?? "";

const rootSpan = (): AnyExportedSpan =>
  ({
    id: "0123456789abcdef",
    traceId: SAMPLED_TRACE_ID,
    name: "agent run: knowledge",
    type: SpanType.AGENT_RUN,
    entityType: "agent",
    entityId: "knowledge",
    startTime: new Date("2026-09-30T10:00:00.000Z"),
    endTime: new Date("2026-09-30T10:00:01.000Z"),
    isEvent: false,
    isRootSpan: true,
    metadata: { tenantId: "tenantA", resourceId: "tenantA:member-uid" },
    requestContext: { tenantId: "tenantA", userId: "member-uid", permissions: ["core.chat.use"] },
    input: "a prompt about the member",
    output: "an answer",
  }) as AnyExportedSpan;

describe("buildExporters", () => {
  it("exports to storage and the usage ledger, and to OTLP only when the endpoint is set", () => {
    const usage = createFakeUsagePort();
    expect(
      buildExporters({ serviceName: "mastra", env: { APP_ENV: "local" }, usage }).map((exporter) => exporter.name),
    ).toEqual(["mastra-storage-exporter", "usage-ledger"]);
    expect(
      buildExporters({
        serviceName: "mastra",
        env: { APP_ENV: "prod", OTEL_EXPORTER_OTLP_ENDPOINT: ENDPOINT },
        usage,
      }).map((exporter) => exporter.name),
    ).toEqual(["mastra-storage-exporter", "opentelemetry", "usage-ledger"]);
  });

  it("sends OTLP spans without the uid, the permissions or the prompt outside local/dev", async () => {
    const { spans, exporter } = capturingSpanExporter();
    const [, otlp] = buildExporters({
      serviceName: "mastra",
      env: { APP_ENV: "local", OTEL_EXPORTER_OTLP_ENDPOINT: ENDPOINT },
      otlpSpanExporter: exporter,
    });
    const [, remoteOtlp] = buildExporters({
      serviceName: "mastra",
      env: { APP_ENV: "prod", OTEL_EXPORTER_OTLP_ENDPOINT: ENDPOINT },
      otlpSpanExporter: exporter,
    });
    for (const target of [otlp, remoteOtlp]) {
      await target?.exportTracingEvent({ type: TracingEventType.SPAN_ENDED, exportedSpan: rootSpan() });
      await target?.flush();
    }
    const exported = JSON.stringify(spans.map((span) => span.attributes));
    expect(spans).toHaveLength(2);
    expect(exported).not.toContain("member-uid");
    expect(exported).not.toContain("core.chat.use");
    expect(exported).toContain(hashResourceId("tenantA:member-uid"));
    // Local keeps the prompt for debugging; the remote export never carries it.
    expect(JSON.stringify(spans[0]?.attributes)).toContain("a prompt about the member");
    expect(JSON.stringify(spans.at(-1)?.attributes)).not.toContain("a prompt about the member");
  });

  it("keeps the given exporters as they are (tests)", () => {
    const usage = createFakeUsagePort();
    expect(buildExporters({ serviceName: "mastra", env: { APP_ENV: "local" }, usage, exporters: [] })).toEqual([]);
  });
});

describe("sensitive data filter", () => {
  it("copies the defaults and adds the runtime's credential fields", () => {
    expect(SENSITIVE_FIELDS).toEqual(expect.arrayContaining([...DEFAULT_SENSITIVE_FIELDS, ...EXTRA_SENSITIVE_FIELDS]));
    expect(DEFAULT_SENSITIVE_FIELDS).toContain("authorization");
  });

  it("redacts both default and extra fields", () => {
    const filter = new SensitiveDataFilter({ sensitiveFields: [...SENSITIVE_FIELDS] });
    const span = {
      traceId: "t",
      attributes: { password: "p", idToken: "i", cookie: "c", "X-Serverless-Authorization": "s", model: "m" },
    };
    const filtered = filter.process(span as never) as unknown as typeof span;
    expect(filtered.attributes).toEqual({
      password: "[REDACTED]",
      idToken: "[REDACTED]",
      cookie: "[REDACTED]",
      "X-Serverless-Authorization": "[REDACTED]",
      model: "m",
    });
  });

  it("copies the tenant and conversation keys into span metadata", () => {
    expect(SPAN_CONTEXT_KEYS).toEqual(expect.arrayContaining(["tenantId", "projectId", "requestId", "conversationId"]));
    expect(SPAN_CONTEXT_KEYS).not.toContain("userId");
  });
});
