"use client";

import { useFormatter, useTranslations } from "use-intl";
import { PromptVerdictPill } from "#/entities/prompt-version/index.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/shared/ui/atoms/Table/Table.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import type { PromptEvalOutcome } from "../model/use-run-prompt-eval.ts";

/** Per-scorer result of an eval run: mean score and whether it met the baseline floor. */
export function PromptEvalResultTable({ outcome }: { outcome: PromptEvalOutcome }) {
  const t = useTranslations("admin.prompts.eval");
  const format = useFormatter();
  const caption = t("caption", { version: outcome.version.version });
  return (
    <div data-slot="prompt-eval-result" className="flex flex-col gap-3">
      <p className="flex flex-wrap items-center gap-2 text-sm">
        {t("verdictOf", { version: outcome.version.version })}
        <PromptVerdictPill verdict={outcome.result.verdict} />
        <RouteLink
          className="text-body font-medium underline underline-offset-4"
          to={{ id: "admin", rest: "evals", search: { a: outcome.result.experimentId } }}
        >
          {t("openExperiment")}
        </RouteLink>
      </p>
      <Table scrollLabel={caption}>
        <TableCaption className="sr-only">{caption}</TableCaption>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t("scorer")}</TableHead>
            <TableHead className="text-right">{t("mean")}</TableHead>
            <TableHead>{t("result")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {outcome.result.scorers.map((scorer) => (
            <TableRow key={scorer.scorerId}>
              <TableHead scope="row" className="font-mono text-body-sm font-normal">
                {scorer.scorerId}
              </TableHead>
              <TableCell className="text-right font-mono tabular-nums">
                {scorer.mean === null
                  ? t("noScore")
                  : format.number(scorer.mean, { style: "percent", maximumFractionDigits: 1 })}
              </TableCell>
              <TableCell>
                <StatusPill
                  tone={scorer.passed ? "emerald" : "danger"}
                  icon={scorer.passed ? "circle-check" : "circle-x"}
                >
                  {scorer.passed ? t("scorerPassed") : t("scorerFailed")}
                </StatusPill>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
