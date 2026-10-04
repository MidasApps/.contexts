import type { TraceSpan } from "@core/contracts";

export type SpanNode = { readonly span: TraceSpan; readonly children: readonly SpanNode[] };

/**
 * Nests the flat span list of a trace by `parentSpanId`, keeping the API order among siblings.
 * A span whose parent is not in the list (dropped or redacted upstream) becomes a root, so no
 * span is ever hidden.
 */
export const buildSpanTree = (spans: readonly TraceSpan[]): SpanNode[] => {
  const nodes = new Map<string, { span: TraceSpan; children: SpanNode[] }>(
    spans.map((span) => [span.spanId, { span, children: [] }]),
  );
  const roots: SpanNode[] = [];
  for (const span of spans) {
    const node = nodes.get(span.spanId);
    if (node === undefined) continue;
    const parent =
      span.parentSpanId === null || span.parentSpanId === span.spanId ? undefined : nodes.get(span.parentSpanId);
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
  }
  return roots;
};

/** Whether the span carries any (redacted) input or output worth a disclosure. */
export const hasSpanPayload = (span: TraceSpan): boolean =>
  (span.input !== null && span.input !== undefined) || (span.output !== null && span.output !== undefined);
