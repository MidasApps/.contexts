"use client";

import { Component, type ReactNode } from "react";
import { useTranslations } from "use-intl";
import { ApiError } from "#/shared/api/api-error.ts";
import { ErrorState } from "#/shared/ui/molecules/ErrorState/ErrorState.tsx";
import type { ReportError } from "./session/session-effects.ts";

function ShellErrorFallback({ requestId, onRetry }: { requestId: string | undefined; onRetry: () => void }) {
  const t = useTranslations("shell.errorBoundary");
  return <ErrorState title={t("title")} description={t("description")} requestId={requestId} onRetry={onRetry} />;
}

type BoundaryProps = { reportError: ReportError; children: ReactNode };
type BoundaryState = { error: unknown; failed: boolean };

/**
 * Last-resort boundary of the shell (SP2 Task 10): a render error shows the error state with the
 * `requestId` of an `ApiError` (never the message) and a retry that remounts the tree. Class
 * component because React exposes error boundaries only through `getDerivedStateFromError`.
 */
export class ShellErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { error: undefined, failed: false };

  static getDerivedStateFromError(error: unknown): BoundaryState {
    return { error, failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.reportError(error, { operation: "render_failed" });
  }

  private readonly retry = (): void => this.setState({ error: undefined, failed: false });

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const requestId = this.state.error instanceof ApiError ? this.state.error.requestId : undefined;
    return <ShellErrorFallback requestId={requestId} onRetry={this.retry} />;
  }
}
