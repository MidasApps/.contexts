"use client";

import type { AdminOverview, Permission } from "@core/contracts";
import type { ReactNode } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { useFormatDateTime } from "#/shared/lib/format/use-format-date-time.ts";
import { useFormatMicroUsd } from "#/shared/lib/format/use-format-micro-usd.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";

export type KpiCardProps = {
  label: string;
  /** The number, already formatted; rendered in mono tabular digits (dataviz.html). */
  value: ReactNode;
  /** One muted line under the value: the window or what the number means. */
  hint?: string | undefined;
  /** `/admin/<area>` the stat opens; the label becomes a link that covers the whole card. */
  area?: string | undefined;
};

/**
 * One stat of a `dl` of stats: term, value and a hint. Use inside `<dl>`. With an `area`, the
 * term is a link stretched over the card (a link cannot wrap `dt`/`dd`, so the card stays a `div`).
 */
export function KpiCard({ label, value, hint, area }: KpiCardProps) {
  return (
    <div
      data-slot="kpi-card"
      className="relative flex flex-col gap-1 rounded-xl border border-border bg-card p-4 has-[a:hover]:bg-accent has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring"
    >
      <dt className="text-xs font-medium text-muted-foreground">
        {area === undefined ? (
          label
        ) : (
          <RouteLink to={{ id: "admin", rest: area }} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
            {label}
          </RouteLink>
        )}
      </dt>
      <dd className="font-mono text-2xl leading-tight font-semibold tabular-nums">{value}</dd>
      {hint === undefined ? null : <dd className="text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}

const EVAL_TONES: Record<AdminOverview["evalStatus"], StatusTone> = { passed: "emerald", failed: "danger", unknown: "neutral" };
const EVAL_ICONS = { passed: "circle-check", failed: "circle-x", unknown: "info" } as const;

export type AdminKpiCardsProps = { overview: AdminOverview };

// The area each linked KPI opens, with the permission that area's page requires.
const AREAS = {
  organizations: { area: "organizations", permission: "platform.organization.read" },
  costMtd: { area: "costs", permission: "platform.usage.read" },
  evalStatus: { area: "evals", permission: "platform.eval.manage" },
} as const satisfies Record<string, { area: string; permission: Permission }>;

/** The `area` of a KPI when the viewer may open it; otherwise the card stays plain text. */
const useKpiArea = (): ((kpi: keyof typeof AREAS) => string | undefined) => {
  const permissions = usePlatformPermissions();
  return (kpi) => (permissions.can(AREAS[kpi].permission) ? AREAS[kpi].area : undefined);
};

/**
 * The platform numbers of `/admin` (SP5 spec §6): organizations, active users, cost month to date,
 * guardrail and approval rates, and the latest eval verdict. Money goes through
 * `{ amountMinor, currency }` and `Intl`; rates are percentages in the UI locale; the verdict is
 * a pill with words, never color alone.
 */
export function AdminKpiCards({ overview }: AdminKpiCardsProps) {
  const t = useTranslations("admin.overview.kpi");
  const format = useFormatter();
  const formatCost = useFormatMicroUsd();
  const formatDateTime = useFormatDateTime();
  const areaOf = useKpiArea();
  const percent = (rate: number): string => format.number(rate, { style: "percent", maximumFractionDigits: 1 });
  return (
    <section aria-labelledby="admin-kpi-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="admin-kpi-title" className="text-sm font-medium text-muted-foreground">
          {t("title")}
        </h2>
        <p className="text-xs text-muted-foreground">{t("generatedAt", { when: formatDateTime(overview.generatedAt) })}</p>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard label={t("organizations")} value={format.number(overview.organizations)} hint={t("organizationsHint")} area={areaOf("organizations")} />
        <KpiCard label={t("activeUsers")} value={format.number(overview.activeUsers7d)} hint={t("last7Days")} />
        <KpiCard label={t("costMtd")} value={formatCost(overview.costMtdMicroUsd)} hint={t("costMtdHint")} area={areaOf("costMtd")} />
        {/* Never shown as a measurement while the API lists it as unmeasured (follow-up 57). */}
        {overview.unmeasured.includes("tripwireRate") ? (
          <KpiCard label={t("tripwireRate")} value={<span className="font-sans text-base font-medium text-muted-foreground">{t("notMeasured")}</span>} hint={t("tripwireUnmeasuredHint")} />
        ) : (
          <KpiCard label={t("tripwireRate")} value={percent(overview.tripwireRate)} hint={t("tripwireHint")} />
        )}
        <KpiCard label={t("approvalRate")} value={percent(overview.approvalRate)} hint={t("approvalHint")} />
        <KpiCard
          label={t("evalStatus")}
          value={
            <StatusPill tone={EVAL_TONES[overview.evalStatus]} icon={EVAL_ICONS[overview.evalStatus]} className="font-sans">
              {t(`eval.${overview.evalStatus}`)}
            </StatusPill>
          }
          hint={t("evalHint")}
          area={areaOf("evalStatus")}
        />
      </dl>
    </section>
  );
}
