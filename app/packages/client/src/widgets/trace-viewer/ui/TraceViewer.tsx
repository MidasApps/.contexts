"use client";

import type { TraceDetail, TraceSpan } from "@core/contracts";
import { useMemo, useState } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { buildSpanTree, hasSpanPayload, TraceCost, TraceDuration, TraceStatusPill, type SpanNode } from "#/entities/trace/index.ts";
import type { Route } from "#/shared/lib/router/route-paths.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Badge } from "#/shared/ui/atoms/Badge/Badge.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/shared/ui/molecules/Collapsible/Collapsible.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";

export type TraceViewerProps = {
  /** The trace with its spans (parents before children), already redacted by the server. */
  detail: TraceDetail;
  /** Where the logs of this trace live, when the host has such a page. */
  logsRoute?: Route | undefined;
};

const pretty = (value: unknown): string => (typeof value === "string" ? value : JSON.stringify(value, null, 2));

/** One redacted payload in a labelled, keyboard-scrollable block. */
function Payload({ label, value }: { label: string; value: unknown }) {
  // Spread so the scroll container is a focusable, named region (axe `scrollable-region-focusable`).
  const scrollable = { tabIndex: 0, role: "region", "aria-label": label } as const;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11.5px] font-medium text-muted-foreground">{label}</span>
      <pre {...scrollable} className="max-h-64 overflow-auto rounded-md border border-border bg-muted p-2 font-mono text-[11.5px] leading-relaxed focus-visible:outline-offset-2">
        {pretty(value)}
      </pre>
    </div>
  );
}

/** Input and output of a span behind a disclosure: closed until someone asks for it. */
function SpanPayload({ span }: { span: TraceSpan }) {
  const t = useTranslations("admin.traceViewer");
  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="group -ml-2 h-7 px-2 text-xs" aria-label={t("payloadOf", { name: span.name })}>
          <Icon name="chevron-right" className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
          {t("payload")}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 pt-1 pb-2">
          {span.input === null || span.input === undefined ? null : <Payload label={t("inputOf", { name: span.name })} value={span.input} />}
          {span.output === null || span.output === undefined ? null : <Payload label={t("outputOf", { name: span.name })} value={span.output} />}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SpanMetrics({ span }: { span: TraceSpan }) {
  const t = useTranslations("admin.traceViewer");
  const format = useFormatter();
  return (
    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {span.model === null ? null : (
        <div className="flex gap-1">
          <dt>{t("model")}</dt>
          <dd className="font-mono text-foreground">{span.model}</dd>
        </div>
      )}
      <div className="flex gap-1">
        <dt>{t("duration")}</dt>
        <dd className="font-mono text-foreground tabular-nums">
          <TraceDuration durationMs={span.durationMs} />
        </dd>
      </div>
      <div className="flex gap-1">
        <dt>{t("tokens")}</dt>
        <dd className="font-mono text-foreground tabular-nums">{t("tokensValue", { input: format.number(span.inputTokens), output: format.number(span.outputTokens) })}</dd>
      </div>
      <div className="flex gap-1">
        <dt>{t("cost")}</dt>
        <dd className="font-mono text-foreground tabular-nums">
          <TraceCost costMicroUsd={span.costMicroUsd} />
        </dd>
      </div>
    </dl>
  );
}

function SpanItem({ node }: { node: SpanNode }) {
  const t = useTranslations("admin.traceViewer");
  const [open, setOpen] = useState(true);
  const { span, children } = node;
  return (
    <li data-slot="trace-span" className="flex flex-col gap-1">
      <div className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-2">
          {children.length === 0 ? null : (
            <Button variant="ghost" size="icon-xs" className="-ml-1" aria-expanded={open} aria-label={open ? t("collapse", { name: span.name }) : t("expand", { name: span.name })} onClick={() => setOpen(!open)}>
              <Icon name={open ? "chevron-down" : "chevron-right"} className="size-3.5" />
            </Button>
          )}
          <span className="min-w-0 font-medium break-words">{span.name}</span>
          <Badge variant="tag">{span.type}</Badge>
          <TraceStatusPill status={span.status} />
        </div>
        <SpanMetrics span={span} />
        {hasSpanPayload(span) ? <SpanPayload span={span} /> : null}
      </div>
      {children.length > 0 && open ? (
        <ul aria-label={t("childrenOf", { name: span.name })} className="ml-3 flex flex-col gap-1 border-l border-border pl-3 sm:ml-5 sm:pl-4">
          {children.map((child) => (
            <SpanItem key={child.span.spanId} node={child} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/**
 * The spans of one trace as a tree (SP5 spec §6, §8): each span with its type, status, model,
 * duration, tokens and cost, children nested under their parent and collapsible, and the redacted
 * input and output behind a disclosure that starts closed. It only renders what it is given, so
 * the staff console and the tenant settings share it.
 */
export function TraceViewer({ detail, logsRoute }: TraceViewerProps) {
  const t = useTranslations("admin.traceViewer");
  const tree = useMemo(() => buildSpanTree(detail.spans), [detail.spans]);
  return (
    <section aria-labelledby="trace-viewer-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="trace-viewer-title" className="text-sm font-medium">
          {t("title", { count: detail.spans.length })}
        </h2>
        {logsRoute === undefined ? null : (
          <Button variant="outline" size="sm" asChild>
            <RouteLink to={logsRoute}>
              <Icon name="list" />
              {t("logs")}
            </RouteLink>
          </Button>
        )}
      </div>
      {tree.length === 0 ? (
        <EmptyState headingLevel={3} icon="scroll-text" title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <ul aria-labelledby="trace-viewer-title" className="flex flex-col gap-1">
          {tree.map((node) => (
            <SpanItem key={node.span.spanId} node={node} />
          ))}
        </ul>
      )}
    </section>
  );
}
