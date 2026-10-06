"use client";

import type { WorkflowRunStatus } from "@core/contracts";
import { useTranslations } from "use-intl";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";

const TONES: Record<WorkflowRunStatus, StatusTone> = {
  pending: "neutral",
  running: "blue",
  waiting: "cyan",
  suspended: "amber",
  paused: "amber",
  success: "emerald",
  failed: "danger",
  canceled: "neutral",
  tripwire: "danger",
};

/** A run status in words (the color is never the only signal). */
export function RunStatusPill({ status }: { status: WorkflowRunStatus }) {
  const t = useTranslations("common.runTimeline.status");
  return <StatusPill tone={TONES[status]}>{t(status)}</StatusPill>;
}
