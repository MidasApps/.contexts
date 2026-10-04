"use client";

import { type AdminAgent, PROMPT_AGENT_IDS } from "@core/contracts";
import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { useAdminAgentCatalog } from "#/entities/admin-agent/index.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { StatusPill, type StatusTone } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { AdminQuerySection } from "#/widgets/admin-nav/index.ts";

const ROLE_TONES: Record<AdminAgent["role"], StatusTone> = { supervisor: "violet", entry: "blue", subagent: "neutral" };
const hasPrompt = (id: string): boolean => (PROMPT_AGENT_IDS as readonly string[]).includes(id);

function IdList({ ids, empty, more }: { ids: readonly string[]; empty: string; more?: string | undefined }) {
  if (ids.length === 0 && more === undefined) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <span className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <code key={id} className="rounded bg-muted px-1.5 py-0.5 font-mono text-caption break-all">
          {id}
        </code>
      ))}
      {more === undefined ? null : <span className="text-body-sm text-muted-foreground">{more}</span>}
    </span>
  );
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

function AgentRow({ agent, canManagePrompts }: { agent: AdminAgent; canManagePrompts: boolean }) {
  const t = useTranslations("admin.agents");
  // Core agents have translated names and roles; a module agent shows what its code registered.
  const name = t.has(`names.${agent.id}`) ? t(`names.${agent.id}`) : agent.name;
  const description = t.has(`roles.${agent.id}`) ? t(`roles.${agent.id}`) : agent.description;
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <span className="flex min-w-0 items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Icon name="bot" className="size-4" />
          </span>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{name}</span>
              <span className="font-mono text-caption text-muted-foreground">{agent.id}</span>
              <StatusPill tone={ROLE_TONES[agent.role]}>{t(`catalog.role.${agent.role}`)}</StatusPill>
            </span>
            {description === "" ? null : <span className="text-sm text-muted-foreground">{description}</span>}
            <span className="text-body-sm text-muted-foreground">
              {t(agent.enablement === "always" ? "catalog.enablement.always" : "catalog.enablement.perOrganization")}
            </span>
          </span>
        </span>
        {canManagePrompts && hasPrompt(agent.id) ? (
          <Button variant="outline" size="sm" asChild className="self-start">
            <RouteLink
              to={{ id: "admin", rest: `agents/${agent.id}/prompts` }}
              aria-label={t("openPromptsNamed", { agent: name })}
            >
              {t("openPrompts")}
            </RouteLink>
          </Button>
        ) : null}
      </div>
      <dl className="grid gap-3 sm:grid-cols-2 sm:pl-12">
        {agent.role === "supervisor" ? (
          <Detail label={t("catalog.subagents")}>
            <IdList ids={agent.subagents} empty={t("catalog.none")} />
          </Detail>
        ) : null}
        <Detail label={t("catalog.tools")}>
          <IdList
            ids={agent.tools}
            empty={t("catalog.none")}
            more={agent.toolsVaryByOrganization ? t("catalog.toolsOfOrganization") : undefined}
          />
        </Detail>
        <Detail label={t("catalog.skills")}>
          <IdList ids={agent.skills} empty={t("catalog.none")} />
        </Detail>
        <Detail label={t("catalog.permissions")}>
          <IdList ids={agent.permissions} empty={t("catalog.none")} />
        </Detail>
      </dl>
    </li>
  );
}

/**
 * The agents the runtime registered (`GET /v1/admin/agents`, decision 0044): role, subagents,
 * tools, skills and permission ceiling of each, with a link to the prompt versions of the agents
 * that have one. Which organization enabled which subagent is the section below.
 */
export function AgentCatalogSection({ canManagePrompts }: { canManagePrompts: boolean }) {
  const t = useTranslations("admin.agents");
  const catalog = useAdminAgentCatalog();
  return (
    <SectionCard title={t("catalog.title")} description={t("catalog.description")}>
      <AdminQuerySection query={catalog} loadingLabel={t("catalog.loading")} rows={5}>
        {(agents) =>
          agents.length === 0 ? (
            <EmptyState
              frame="plain"
              headingLevel={3}
              icon="bot"
              title={t("catalog.emptyTitle")}
              description={t("catalog.emptyDescription")}
              action={
                <Button variant="secondary" onClick={() => void catalog.refetch()}>
                  {t("catalog.reload")}
                </Button>
              }
            />
          ) : (
            <ul aria-label={t("catalog.title")} className="divide-y divide-border">
              {agents.map((agent) => (
                <AgentRow key={agent.id} agent={agent} canManagePrompts={canManagePrompts} />
              ))}
            </ul>
          )
        }
      </AdminQuerySection>
    </SectionCard>
  );
}
