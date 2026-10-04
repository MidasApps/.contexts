"use client";

import type { OrganizationAdminSummary } from "@core/contracts";
import { useFormatter, useTranslations } from "use-intl";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { budgetUsage } from "../lib/budget-usage.ts";

/** `active` / `suspended` in words (color is never the only signal). */
export function OrganizationStatusPill({ status }: { status: OrganizationAdminSummary["status"] }) {
  const t = useTranslations("admin.organizations.status");
  return <StatusPill tone={status === "active" ? "emerald" : "amber"}>{t(status)}</StatusPill>;
}

/**
 * Cost month to date as a share of the cap: plain percentage while under 80 %, an alert pill from
 * 80 % and an over-budget pill from 100 % (governance "Custo").
 */
export function BudgetUsagePill({
  organization,
}: {
  organization: Pick<OrganizationAdminSummary, "budget" | "costMtdMicroUsd">;
}) {
  const t = useTranslations("admin.organizations.usage");
  const format = useFormatter();
  const usage = budgetUsage(organization);
  const percent =
    usage.ratio === null ? t("noCap") : format.number(usage.ratio, { style: "percent", maximumFractionDigits: 0 });
  if (usage.level === "ok") return <span className="font-mono tabular-nums">{percent}</span>;
  return (
    <StatusPill tone={usage.level === "over" ? "danger" : "amber"} icon="alert-triangle">
      {usage.level === "over" ? t("over", { percent }) : t("alert", { percent })}
    </StatusPill>
  );
}
