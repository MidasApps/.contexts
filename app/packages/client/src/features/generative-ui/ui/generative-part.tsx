"use client";

import { Component, Suspense, useEffect, type ReactNode } from "react";
import type { GenerativeUiView } from "#/entities/message/index.ts";
import { useReportError, type ErrorReporter } from "#/shared/lib/errors/error-reporter.tsx";
import { Skeleton } from "#/shared/ui/atoms/Skeleton/Skeleton.tsx";
import { useGenerativeUi } from "../model/generative-ui-context.tsx";
import { resolveGenerativeUi } from "../model/ui-registry.ts";

/** A generative component could not be shown; the chat rendered the generic tool view. */
export class GenerativeUiError extends Error {
  readonly code: "UNKNOWN_UI_COMPONENT" | "INVALID_UI_PROPS" | "UI_COMPONENT_FAILED";
  readonly component: string;
  constructor(code: GenerativeUiError["code"], component: string, options?: ErrorOptions) {
    // The message carries the component id only: props may hold user data and never reach a log.
    super(`${code}: ${component}`, options);
    this.name = "GenerativeUiError";
    this.code = code;
    this.component = component;
  }
}

const OPERATION = "chat_generative_ui";

type BoundaryProps = { component: string; fallback: ReactNode; reportError: ErrorReporter; children: ReactNode };

/**
 * A component that throws while rendering (a contract the form cannot draw, a chart with odd
 * data) must not take the conversation down. Class component because React exposes error
 * boundaries only through `getDerivedStateFromError`.
 */
class PartBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: unknown): void {
    this.props.reportError(new GenerativeUiError("UI_COMPONENT_FAILED", this.props.component, { cause: error }), { operation: OPERATION });
  }

  override render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export type GenerativePartProps = {
  /** `{ component, props }` of a tool output. */
  ui: GenerativeUiView;
  toolCallId: string;
  toolName: string;
  interactive: boolean;
  /** The generic view of the tool call: shown for an unknown component, invalid props or a render failure. */
  fallback: ReactNode;
};

/**
 * Renders the component a tool asked for (decision 0032, D4-03): looked up in the typed
 * registry, props validated with the contract schema. Unknown id, invalid props or a component
 * that fails → the generic tool view, plus one report to the app's logger (no props in it).
 */
export function GenerativePart({ ui, toolCallId, toolName, interactive, fallback }: GenerativePartProps) {
  const { registry } = useGenerativeUi();
  const reportError = useReportError();
  const resolution = resolveGenerativeUi(registry, ui);
  const problem = resolution.ok ? null : resolution.reason;
  const component = ui.component;

  useEffect(() => {
    if (problem === null) return;
    reportError(new GenerativeUiError(problem === "unknown-component" ? "UNKNOWN_UI_COMPONENT" : "INVALID_UI_PROPS", component), { operation: OPERATION });
  }, [problem, component, toolCallId, reportError]);

  if (!resolution.ok) return <>{fallback}</>;
  const { Component: Part } = resolution.entry;
  return (
    <PartBoundary component={component} fallback={fallback} reportError={reportError}>
      <Suspense fallback={<Skeleton className="h-24 w-full" />}>
        <div data-slot="generative-ui" data-component={component}>
          <Part props={resolution.props} toolCallId={toolCallId} toolName={toolName} interactive={interactive} fallback={fallback} />
        </div>
      </Suspense>
    </PartBoundary>
  );
}
