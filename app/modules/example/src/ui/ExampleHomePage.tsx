"use client";

import type { ModulePageProps } from "@core/client/app-shell";
import { Can } from "@core/client/entities/permission";
import { useAccessContext, useCurrentNode } from "@core/client/entities/session";
import { useOnlineStatus } from "@core/client/shared/lib/network";
import { Button } from "@core/client/shared/ui/atoms/Button/Button";
import { Icon } from "@core/client/shared/ui/atoms/Icon/Icon";
import { notify } from "@core/client/shared/ui/notify";
import { PageHeader } from "@core/client/widgets/page-header";
import { QueryPage } from "@core/client/widgets/page-state";
import type { AccessContext } from "@core/contracts";
import { useTranslations } from "use-intl";
import { ExampleContextCard, ExampleSettingsCard } from "./ExampleSections.tsx";

const systemNow = (): Date => new Date();

/**
 * Permission-gated write action. It only confirms with a toast: the example module has no item
 * store; a real module calls its `/v1` mutation here (the server authorizes again).
 */
function RecordItemAction() {
  const t = useTranslations("example.home");
  const online = useOnlineStatus();
  return (
    <Can permission="example.item.write">
      <Button disabled={!online} onClick={() => void notify.success(t("recorded"), { description: t("recordedDescription") })}>
        <Icon name="plus" />
        {t("recordItem")}
      </Button>
    </Can>
  );
}

function ExampleHome({ context, moduleId, now }: { context: AccessContext; moduleId: string; now: () => Date }) {
  const t = useTranslations("example.home");
  return (
    <>
      <PageHeader eyebrow={context.project?.name ?? context.organization.name} title={t("title")} description={t("description")} actions={<RecordItemAction />} />
      <div className="flex flex-col gap-6">
        <ExampleContextCard context={context} now={now} />
        <ExampleSettingsCard organizationId={context.organization.id} moduleId={moduleId} />
      </div>
    </>
  );
}

export type ExampleHomePageProps = ModulePageProps & {
  /** Clock for "now" (tests pass a fixed one). */
  now?: () => Date;
};

/**
 * `/o/:organizationId/p/:projectId/m/example` (SP2 spec §6): the resolved access context, the module
 * settings with the budget as money in the UI locale, "now" in the display time zone and a
 * permission-gated action. The shell already gated the page with `example.item.read`.
 */
export function ExampleHomePage({ moduleId, now = systemNow }: ExampleHomePageProps) {
  const t = useTranslations("example.home");
  const context = useAccessContext(useCurrentNode());
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <ExampleHome context={data} moduleId={moduleId} now={now} />}
    </QueryPage>
  );
}
