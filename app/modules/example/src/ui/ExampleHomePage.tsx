"use client";

import type { ModulePageProps } from "@core/client/app-shell";
import { useAccessContext, useCurrentNode } from "@core/client/entities/session";
import { PageHeader } from "@core/client/widgets/page-header";
import { QueryPage } from "@core/client/widgets/page-state";
import type { AccessContext } from "@core/contracts";
import { useTranslations } from "use-intl";
import { ExampleNotesCard } from "./ExampleNotesCard.tsx";
import { ExampleContextCard, ExampleSettingsCard } from "./ExampleSections.tsx";

const systemNow = (): Date => new Date();

function ExampleHome({ context, moduleId, now }: { context: AccessContext; moduleId: string; now: () => Date }) {
  const t = useTranslations("example.home");
  return (
    <>
      <PageHeader
        eyebrow={context.project?.name ?? context.organization.name}
        title={t("title")}
        description={t("description")}
      />
      <div className="flex flex-col gap-6">
        <ExampleContextCard context={context} now={now} />
        <ExampleSettingsCard organizationId={context.organization.id} moduleId={moduleId} />
        <ExampleNotesCard organizationId={context.organization.id} />
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
 * settings with the budget as money in the UI locale, "now" in the display time zone and the
 * organization's notes (read-only: agents, workflows and the chat create them, decision 0063).
 * The shell already gated the page with `example.item.read`.
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
