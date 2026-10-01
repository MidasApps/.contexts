"use client";

import { PROMPT_AGENT_IDS, type PromptActivation, type PromptAgentId, type PromptVersion } from "@core/contracts";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { usePlatformPermissions } from "#/entities/permission/index.ts";
import { activeVersionOf, usePromptActivations, usePromptVersions } from "#/entities/prompt-version/index.ts";
import { PromptActivationDialog, PromptEvalResultTable, useRunPromptEval, type PromptActivationRequest, type RunPromptEval } from "#/features/admin-prompt-activation/index.ts";
import { PromptVersionDialog } from "#/features/admin-prompt-version-editor/index.ts";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { useRouter } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Alert, AlertDescription, AlertTitle } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { AdminPageFrame, AdminQuerySection, useAdminSearch, type AdminQuery } from "#/widgets/admin-nav/index.ts";
import { PromptDiff } from "#/widgets/admin-prompt-diff/index.ts";
import { PageNotFound } from "#/widgets/page-state/index.ts";
import { PromptActivationHistory } from "./PromptActivationHistory.tsx";
import { PromptVersionsTable } from "./PromptVersionsTable.tsx";

const PATH = /^agents\/([^/]+)\/prompts$/u;
const isPromptAgentId = (value: string | undefined): value is PromptAgentId => value !== undefined && (PROMPT_AGENT_IDS as readonly string[]).includes(value);

type PromptData = { versions: PromptVersion[]; activations: PromptActivation[] };

/** Versions and activations as one query: the page needs both to say which version is active. */
const usePromptData = (agentId: PromptAgentId, enabled: boolean): AdminQuery<PromptData> => {
  const versions = usePromptVersions(agentId, { enabled });
  const activations = usePromptActivations(agentId, { enabled });
  const failed = versions.status === "error" ? versions : activations.status === "error" ? activations : null;
  return {
    status: failed !== null ? "error" : versions.status === "pending" || activations.status === "pending" ? "pending" : "success",
    data: versions.data === undefined || activations.data === undefined ? undefined : { versions: versions.data, activations: activations.data },
    error: failed?.error ?? null,
    isFetching: versions.isFetching || activations.isFetching,
    refetch: () => Promise.all([versions.refetch(), activations.refetch()]),
  };
};

/** Result or failure of the last eval run in this page; the failure is announced with its reference. */
function EvalOutcome({ evalRun }: { evalRun: RunPromptEval }) {
  const t = useTranslations("admin.prompts.eval");
  const tCommon = useTranslations("common.errorState");
  const describe = useDescribeError();
  if (evalRun.pendingId !== null) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("running")}
      </p>
    );
  }
  if (evalRun.error !== null) {
    const described = describe(evalRun.error.cause);
    return (
      <Alert variant="destructive">
        <AlertTitle>{t("failedTitle", { version: evalRun.error.version.version })}</AlertTitle>
        <AlertDescription>{described.requestId === undefined ? described.message : tCommon("messageWithReference", { message: described.message, requestId: described.requestId })}</AlertDescription>
      </Alert>
    );
  }
  if (evalRun.outcome !== null) return <PromptEvalResultTable outcome={evalRun.outcome} />;
  return <p className="text-sm text-muted-foreground">{t("idle")}</p>;
}

/** The versions picked for the diff, by version number in the URL (`?base=2&compare=3`). */
const useDiffSelection = (versions: readonly PromptVersion[], active: PromptVersion | undefined) => {
  const search = useAdminSearch(["base", "compare"]);
  const byNumber = (value: string | undefined): PromptVersion | undefined => versions.find((version) => String(version.version) === value);
  const newest = versions[0];
  const compare = byNumber(search.values.compare) ?? newest;
  const base = byNumber(search.values.base) ?? active ?? versions.find((version) => version.id !== compare?.id);
  const numberOf = (id: string): string | undefined => {
    const version = versions.find((candidate) => candidate.id === id);
    return version === undefined ? undefined : String(version.version);
  };
  return {
    baseId: base?.id,
    compareId: compare?.id,
    setBase: (id: string) => search.set({ base: numberOf(id) }),
    setCompare: (id: string) => search.set({ compare: numberOf(id) }),
  };
};

function PromptSections({ agentId, agentName, data, online, onCreate }: { agentId: PromptAgentId; agentName: string; data: PromptData; online: boolean; onCreate: () => void }) {
  const t = useTranslations("admin.prompts");
  const active = activeVersionOf(data.versions, data.activations);
  const evalRun = useRunPromptEval(agentId);
  const diff = useDiffSelection(data.versions, active);
  const [request, setRequest] = useState<PromptActivationRequest | null>(null);
  return (
    <div className="flex flex-col gap-6">
      <SectionCard title={t("versions.title")} description={active === undefined ? t("versions.seedActive") : t("versions.description", { version: active.version })}>
        <PromptVersionsTable agentName={agentName} versions={data.versions} activeVersion={active} evalRun={evalRun} online={online} onActivate={setRequest} onCompare={(version) => diff.setCompare(version.id)} onCreate={onCreate} />
      </SectionCard>
      {data.versions.length === 0 ? null : (
        <SectionCard title={t("eval.title")} description={t("eval.description")}>
          <EvalOutcome evalRun={evalRun} />
        </SectionCard>
      )}
      {data.versions.length < 2 ? null : (
        <SectionCard title={t("diff.title")} description={t("diff.description")}>
          <PromptDiff versions={data.versions} baseId={diff.baseId} compareId={diff.compareId} onBaseChange={diff.setBase} onCompareChange={diff.setCompare} activeId={active?.id} />
        </SectionCard>
      )}
      <SectionCard title={t("history.title")} description={t("history.description")}>
        <PromptActivationHistory agentName={agentName} activations={data.activations} versions={data.versions} />
      </SectionCard>
      <PromptActivationDialog agentId={agentId} agentName={agentName} request={request} activeVersion={active} onOpenChange={(open) => !open && setRequest(null)} />
    </div>
  );
}

function AgentPrompts({ agentId }: { agentId: PromptAgentId }) {
  const t = useTranslations("admin");
  const online = useOnlineStatus();
  const permissions = usePlatformPermissions();
  const data = usePromptData(agentId, permissions.can("platform.prompt.manage"));
  const [creating, setCreating] = useState(false);
  const agentName = t(`agents.names.${agentId}`);
  const active = data.data === undefined ? undefined : activeVersionOf(data.data.versions, data.data.activations);
  return (
    <AdminPageFrame
      permission="platform.prompt.manage"
      title={t("prompts.title", { agent: agentName })}
      description={t("prompts.description")}
      back={{ rest: "agents", label: t("prompts.back") }}
      actions={
        <Button onClick={() => setCreating(true)} disabled={!online || data.status !== "success"}>
          <Icon name="plus" />
          {t("prompts.create")}
        </Button>
      }
    >
      <AdminQuerySection query={data} loadingLabel={t("prompts.loading")}>
        {(loaded) => <PromptSections agentId={agentId} agentName={agentName} data={loaded} online={online} onCreate={() => setCreating(true)} />}
      </AdminQuerySection>
      <PromptVersionDialog key={active?.id ?? "seed"} agentId={agentId} agentName={agentName} initialBody={active?.body ?? data.data?.versions[0]?.body ?? ""} open={creating} onOpenChange={setCreating} />
    </AdminPageFrame>
  );
}

/**
 * `/admin/agents/:agentId/prompts` (SP5 spec §6, platform.prompt.manage): the platform prompt of a
 * core agent — versions (append-only), eval runs, eval-gated activation, forced activation with a
 * reason, rollback (activating an older version), a line diff between two versions and the
 * activation history. An agent without a versioned prompt is not found.
 */
export function AdminAgentPromptsView() {
  const rest = useRouter().useRouteParams()["rest"] ?? "";
  const agentId = PATH.exec(rest)?.[1];
  if (!isPromptAgentId(agentId)) return <PageNotFound />;
  return <AgentPrompts key={agentId} agentId={agentId} />;
}
