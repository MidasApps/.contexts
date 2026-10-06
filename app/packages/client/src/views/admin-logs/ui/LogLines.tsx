"use client";

import type { LogLine } from "@core/contracts";
import { useTranslations } from "use-intl";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "#/shared/ui/molecules/Collapsible/Collapsible.tsx";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";

const LEVEL_TONES: Record<LogLine["level"], StatusTone> = {
  debug: "neutral",
  info: "blue",
  warn: "amber",
  error: "danger",
};
const TRACE_ID = /^[0-9a-f]{32}$/u;

function Reference({ label, value, traceLink = false }: { label: string; value: string | null; traceLink?: boolean }) {
  const t = useTranslations("admin.logs");
  if (value === null) return null;
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1">
      <span className="text-muted-foreground">{label}</span>
      {traceLink && TRACE_ID.test(value) ? (
        <RouteLink
          to={{ id: "admin", rest: `traces/${value}` }}
          aria-label={t("openTrace", { id: value })}
          className="font-mono break-all underline underline-offset-4"
        >
          {value}
        </RouteLink>
      ) : (
        <span className="font-mono break-all select-all">{value}</span>
      )}
    </span>
  );
}

function Fields({ line, index }: { line: LogLine; index: number }) {
  const t = useTranslations("admin.logs");
  const count = Object.keys(line.fields).length;
  if (count === 0) return null;
  return (
    <Collapsible>
      <CollapsibleTrigger className="group inline-flex cursor-pointer items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground hover:text-foreground">
        <Icon name="chevron-right" className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
        {t("fields", { count })}
      </CollapsibleTrigger>
      <CollapsibleContent>
        {/* A scrollable region needs a tab stop so keyboard users can scroll it (WCAG 2.1.1). */}
        <pre
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see the comment above
          tabIndex={0}
          aria-label={t("fieldsOf", { message: line.message, position: index + 1 })}
          className="mt-1 max-h-64 overflow-auto rounded-sm bg-muted p-2 font-mono text-caption leading-relaxed"
        >
          {JSON.stringify(line.fields, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  );
}

/**
 * Log lines, newest first: time, level in words, the stable event name in mono, the service, the
 * request and trace references (a 32-hex trace id links to the trace) and the other structured
 * fields collapsed as pretty JSON. A list, not a table: every line reflows on a phone.
 */
export function LogLines({ lines }: { lines: readonly LogLine[] }) {
  const t = useTranslations("admin.logs");
  const formatDateTime = useFormatDateTime();
  return (
    <ol aria-label={t("listLabel")} className="flex flex-col gap-2">
      {lines.map((line, index) => (
        <li
          key={`${line.timestamp}-${String(index)}`}
          className="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3"
        >
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill tone={LEVEL_TONES[line.level]}>{t(`levels.${line.level}`)}</StatusPill>
            <time dateTime={line.timestamp} className="font-mono text-caption text-muted-foreground tabular-nums">
              {formatDateTime(line.timestamp, "precise")}
            </time>
            <span className="text-caption text-muted-foreground">
              {t("service", { service: line.service, env: line.env })}
            </span>
          </span>
          <span className="font-mono text-body break-all">{line.message}</span>
          {line.requestId === null && line.traceId === null ? null : (
            <span className="flex flex-col gap-0.5 text-caption sm:flex-row sm:flex-wrap sm:gap-x-4">
              <Reference label={t("requestId")} value={line.requestId} />
              <Reference label={t("traceId")} value={line.traceId} traceLink />
            </span>
          )}
          <Fields line={line} index={index} />
        </li>
      ))}
    </ol>
  );
}
