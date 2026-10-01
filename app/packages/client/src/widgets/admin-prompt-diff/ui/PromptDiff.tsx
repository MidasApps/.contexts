"use client";

import type { PromptVersion } from "@core/contracts";
import { useId, useMemo } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { diffLines, diffStats, type DiffLine } from "../lib/line-diff.ts";

export type PromptDiffProps = {
  /** Versions to choose from, newest first. */
  versions: readonly PromptVersion[];
  /** Version on the "before" side (usually the active one). */
  baseId: string | undefined;
  /** Version on the "after" side (the one under review). */
  compareId: string | undefined;
  onBaseChange: (versionId: string) => void;
  onCompareChange: (versionId: string) => void;
  /** Marks the active version in the pickers. */
  activeId?: string | undefined;
};

const MARKS = { same: " ", added: "+", removed: "−" } as const;
const ROW_TONES = { same: "", added: "bg-emerald/14", removed: "bg-destructive/14" } as const;

function VersionPicker({ label, versions, value, onChange, activeId }: { label: string; versions: readonly PromptVersion[]; value: string | undefined; onChange: (id: string) => void; activeId: string | undefined }) {
  const t = useTranslations("admin.prompts.diff");
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select {...(value === undefined ? {} : { value })} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full sm:w-56">
          <SelectValue placeholder={t("pick")} />
        </SelectTrigger>
        <SelectContent>
          {versions.map((version) => (
            <SelectItem key={version.id} value={version.id}>
              {version.id === activeId ? t("versionActive", { version: version.version }) : t("version", { version: version.version })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DiffRows({ lines }: { lines: readonly DiffLine[] }) {
  const t = useTranslations("admin.prompts.diff");
  return (
    <ol className="min-w-max font-mono text-[12.5px] leading-relaxed">
      {lines.map((line, index) => (
        <li key={index} data-kind={line.kind} className={cn("flex gap-2 px-3 whitespace-pre", ROW_TONES[line.kind])}>
          <span aria-hidden="true" className="w-3 shrink-0 text-muted-foreground select-none">
            {MARKS[line.kind]}
          </span>
          {line.kind === "same" ? null : <span className="sr-only">{t(line.kind)}</span>}
          <span>{line.text === "" ? " " : line.text}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Line diff between two versions of a prompt (SP5 spec §6 "versions, diff"). Added and removed
 * lines carry a `+`/`−` mark and a spoken label besides the tint, so color is never the only
 * signal; the diff scrolls inside a labelled region that takes keyboard focus.
 */
export function PromptDiff({ versions, baseId, compareId, onBaseChange, onCompareChange, activeId }: PromptDiffProps) {
  const t = useTranslations("admin.prompts.diff");
  const base = versions.find((version) => version.id === baseId);
  const compare = versions.find((version) => version.id === compareId);
  const lines = useMemo(() => (base === undefined || compare === undefined ? [] : diffLines(base.body, compare.body)), [base, compare]);
  const stats = diffStats(lines);
  return (
    <div data-slot="prompt-diff" className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <VersionPicker label={t("base")} versions={versions} value={base?.id} onChange={onBaseChange} activeId={activeId} />
        <VersionPicker label={t("compare")} versions={versions} value={compare?.id} onChange={onCompareChange} activeId={activeId} />
      </div>
      {base === undefined || compare === undefined ? (
        <p className="text-sm text-muted-foreground">{t("pickBoth")}</p>
      ) : base.id === compare.id || (stats.added === 0 && stats.removed === 0) ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("identical")}
        </p>
      ) : (
        <>
          <p role="status" className="text-xs text-muted-foreground">
            {t("summary", { added: stats.added, removed: stats.removed })}
          </p>
          {/* A scrollable region must be reachable by keyboard (WCAG 2.1.1), hence the tab stop. */}
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
          <div role="region" aria-label={t("regionLabel", { base: base.version, compare: compare.version })} tabIndex={0} className="max-h-96 overflow-auto rounded-lg border border-border bg-card py-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <DiffRows lines={lines} />
          </div>
        </>
      )}
    </div>
  );
}
