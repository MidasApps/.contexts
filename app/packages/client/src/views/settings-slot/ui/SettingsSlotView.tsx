"use client";

import type { AccessContext, Permission } from "@core/contracts";
import { useTranslations } from "use-intl";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { RouteLink, useRouter } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import type { IconName } from "#/shared/ui/atoms/Icon/icon-registry.ts";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { PageNotFound, QueryPage } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";

/** Settings sections reserved for later subprojects (SP2 spec §8): connectors, agents, usage. */
export const SETTINGS_SLOTS = ["connectors", "agents", "usage"] as const;
export type SettingsSlot = (typeof SETTINGS_SLOTS)[number];

const SLOTS: Record<SettingsSlot, { icon: IconName; permission: Permission }> = {
  connectors: { icon: "plug", permission: "core.connector.read" },
  agents: { icon: "bot", permission: "core.agent-settings.read" },
  usage: { icon: "chart", permission: "core.usage.read" },
};

const isSlot = (value: string | undefined): value is SettingsSlot => (SETTINGS_SLOTS as readonly string[]).includes(value ?? "");

function SettingsSlotPage({ context, slot }: { context: AccessContext; slot: SettingsSlot }) {
  const t = useTranslations("settings.slots");
  const { organization } = context;
  return (
    <SettingsPageFrame
      organizationId={organization.id}
      allowed={context.permissions.includes(SLOTS[slot].permission)}
      header={<PageHeader eyebrow={t("eyebrow", { organization: organization.name })} title={t(`${slot}.title`)} description={t(`${slot}.description`)} />}
    >
      <EmptyState
        icon={SLOTS[slot].icon}
        title={t(`${slot}.emptyTitle`)}
        description={t(`${slot}.emptyDescription`)}
        action={
          <Button variant="secondary" asChild>
            <RouteLink to={{ id: "settings", organizationId: organization.id, section: "general" }}>{t("backToGeneral")}</RouteLink>
          </Button>
        }
      />
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/{connectors|agents|usage}`: slots whose content arrives with the
 * agent runtime and the admin surface; until then an empty state with section-specific copy.
 */
export function SettingsSlotView() {
  const t = useTranslations("settings.slots");
  const node = useCurrentNode();
  const section = useRouter().useRouteParams()["section"];
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  if (!isSlot(section)) return <PageNotFound />;
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsSlotPage context={data} slot={section} />}
    </QueryPage>
  );
}
