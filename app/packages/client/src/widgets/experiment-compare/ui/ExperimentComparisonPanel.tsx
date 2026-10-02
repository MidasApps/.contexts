"use client";

import { useId } from "react";
import type { ExperimentPairState } from "#/entities/eval-experiment/index.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { ApiErrorState } from "#/shared/ui/molecules/ErrorState/ApiErrorState.tsx";
import { ExperimentCompare } from "./ExperimentCompare.tsx";

/** The copy of the panel, from the page's own namespace (admin or settings). */
export type ExperimentComparisonCopy = {
  readonly title: string;
  readonly hint: string;
  readonly hintOne: string;
  readonly missing: string;
  readonly loading: string;
  readonly clear: string;
};

export type ExperimentComparisonPanelProps = {
  /** The chosen ids, A then B. */
  readonly ids: readonly string[];
  readonly pair: ExperimentPairState;
  readonly onClear: () => void;
  readonly copy: ExperimentComparisonCopy;
};

function PanelBody({ pair, copy }: Pick<ExperimentComparisonPanelProps, "pair" | "copy">) {
  switch (pair.status) {
    case "idle":
      return <p className="text-sm text-muted-foreground">{copy.hint}</p>;
    case "one":
      return <p className="text-sm text-muted-foreground">{copy.hintOne}</p>;
    case "pending":
      return (
        <p role="status" className="text-sm text-muted-foreground">
          {copy.loading}
        </p>
      );
    case "missing":
      return (
        <Alert variant="warning">
          <AlertDescription>{copy.missing}</AlertDescription>
        </Alert>
      );
    case "error":
      return <ApiErrorState error={pair.error} headingLevel={3} frame="plain" onRetry={pair.retry} retrying={pair.retrying} />;
    case "ready":
      return <ExperimentCompare a={pair.a} b={pair.b} />;
  }
}

/**
 * The comparison of two experiments, shown above the list they are chosen from so the result sits
 * next to the "Comparar" toggles (decision 0049). It names the chosen pair, offers to clear it and
 * keeps loading, gone and failed reads of an experiment from another page apart.
 */
export function ExperimentComparisonPanel({ ids, pair, onClear, copy }: ExperimentComparisonPanelProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={titleId} className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-medium">
          {copy.title}
          {ids.length === 0 ? null : <span className="font-mono text-xs font-normal break-all text-muted-foreground">{ids.join(" × ")}</span>}
        </h2>
        {ids.length === 0 ? null : (
          <Button variant="ghost" size="sm" onClick={onClear}>
            {copy.clear}
          </Button>
        )}
      </div>
      <PanelBody pair={pair} copy={copy} />
    </section>
  );
}
