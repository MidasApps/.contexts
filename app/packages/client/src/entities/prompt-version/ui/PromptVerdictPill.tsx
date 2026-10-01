"use client";

import type { PromptVersion } from "@core/contracts";
import { useTranslations } from "use-intl";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";

/** Eval verdict of a prompt version in words: passed, failed or not evaluated yet. */
export function PromptVerdictPill({ verdict }: { verdict: PromptVersion["evalVerdict"] }) {
  const t = useTranslations("admin.prompts.verdict");
  if (verdict === "passed") return <StatusPill tone="emerald" icon="circle-check">{t("passed")}</StatusPill>;
  if (verdict === "failed") return <StatusPill tone="danger" icon="circle-x">{t("failed")}</StatusPill>;
  return <StatusPill tone="neutral">{t("none")}</StatusPill>;
}
