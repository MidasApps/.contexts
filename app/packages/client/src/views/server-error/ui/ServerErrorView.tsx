"use client";

import { useEffect } from "react";
import { useReportError } from "#/shared/lib/errors/error-reporter.tsx";
import { PageRenderError } from "#/widgets/page-state/index.ts";

export type ServerErrorViewProps = {
  /** What the host's error boundary caught (logged once, never shown). */
  error: unknown;
  /** The server's error identifier (Next `error.digest`), to quote to support. */
  reference: string | undefined;
  /** Re-renders the failed segment (Next `retry()`). */
  onRetry: () => void;
};

/**
 * A page whose render failed on the server (UX review U-07): translated copy, the reference that
 * matches the server log, a retry and a way home, inside the design system instead of the
 * framework's default screen. Reports the error once.
 */
export function ServerErrorView({ error, reference, onRetry }: ServerErrorViewProps) {
  const reportError = useReportError();
  useEffect(() => {
    reportError(error, { operation: "server_render_failed" });
  }, [error, reportError]);
  return (
    <main id="main" className="px-6">
      <PageRenderError reference={reference} onRetry={onRetry} />
    </main>
  );
}
