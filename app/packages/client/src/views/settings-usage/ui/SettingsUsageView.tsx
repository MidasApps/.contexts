"use client";

import type { AccessContext } from "@core/contracts";
import { useId, useState } from "react";
import { useFormatter, useTranslations } from "use-intl";
import { useTenantAgentSettings } from "#/entities/agent-settings/index.ts";
import { useMemberNames } from "#/entities/member/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { recentMonths, useUsageSummary } from "#/entities/usage/index.ts";
import { UsageCapForm } from "#/features/set-usage-cap/index.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage, QuerySection } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";
import { UsageSummaryPanel } from "./UsageSummaryPanel.tsx";

/** Months the picker offers: the current one and the eleven before it. */
const MONTHS_SHOWN = 12;

const systemNow = (): Date => new Date();

function MonthPicker({
  months,
  value,
  onChange,
}: {
  months: readonly string[];
  value: string;
  onChange: (month: string) => void;
}) {
  const t = useTranslations("settings.usage");
  const format = useFormatter();
  const id = useId();
  // The ledger buckets by UTC month, so the label is the UTC month too.
  const label = (month: string): string =>
    format.dateTime(new Date(`${month}-01T00:00:00.000Z`), { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{t("month")}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full sm:w-64">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {months.map((month, index) => (
            <SelectItem key={month} value={month}>
              {index === 0 ? t("currentMonth", { month: label(month) }) : label(month)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function OwnCap({ organizationId, disabled }: { organizationId: string; disabled: boolean }) {
  const t = useTranslations("settings.usage.ownCap");
  const settings = useTenantAgentSettings(organizationId);
  return (
    <SectionCard title={t("title")} description={t("description")}>
      <QuerySection query={settings} loadingLabel={t("loading")}>
        {/* Keyed by the caps in force and the own cap: after a save the form starts again from what the server enforces. */}
        {(data) => (
          <UsageCapForm
            key={JSON.stringify([data.budget, data.ownBudget])}
            organizationId={organizationId}
            caps={data.budget}
            ownBudget={data.ownBudget}
            disabled={disabled}
          />
        )}
      </QuerySection>
    </SectionCard>
  );
}

function SettingsUsage({ context, now }: { context: AccessContext; now: () => Date }) {
  const t = useTranslations("settings.usage");
  const online = useOnlineStatus();
  const { organization, permissions } = context;
  const [months] = useState(() => recentMonths(now(), MONTHS_SHOWN));
  const [month, setMonth] = useState(months[0] ?? "");
  const allowed = permissions.includes("core.usage.read");
  const summary = useUsageSummary(organization.id, month, { enabled: allowed });
  const canSetCap =
    permissions.includes("core.agent-settings.read") && permissions.includes("core.agent-settings.update");
  const memberName = useMemberNames({
    organizationId: organization.id,
    canReadMembers: allowed && permissions.includes("core.member.read"),
  });
  return (
    <SettingsPageFrame
      organizationId={organization.id}
      allowed={allowed}
      header={
        <PageHeader
          eyebrow={t("eyebrow", { organization: organization.name })}
          title={t("title")}
          description={t("description")}
        />
      }
    >
      {online ? null : <OfflineNotice />}
      <MonthPicker months={months} value={month} onChange={setMonth} />
      <QuerySection query={summary} loadingLabel={t("loading")}>
        {(data) => <UsageSummaryPanel summary={data} memberName={memberName} />}
      </QuerySection>
      {canSetCap ? <OwnCap organizationId={organization.id} disabled={!online} /> : null}
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/usage` (SP5 spec §7, core.usage.read): a month of model cost and
 * tokens, the state of the budget caps and the breakdowns per model, day, agent and user; holders of
 * core.agent-settings.update may lower the organization's own cap (never above its plan).
 * @param now clock for the month list (tests inject a fixed one).
 */
export function SettingsUsageView({ now = systemNow }: { now?: () => Date }) {
  const t = useTranslations("settings.usage");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsUsage context={data} now={now} />}
    </QueryPage>
  );
}
