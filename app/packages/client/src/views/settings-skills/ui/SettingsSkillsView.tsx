"use client";

import type { AccessContext } from "@core/contracts";
import { useTranslations } from "use-intl";
import { skillsOfCatalog, useAgentCatalog, type CatalogSkill } from "#/entities/agent-catalog/index.ts";
import { useAccessContext, useCurrentNode } from "#/entities/session/index.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { RouteLink } from "#/shared/lib/router/router-context.tsx";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "#/shared/ui/atoms/Table/Table.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { PageHeader } from "#/widgets/page-header/index.ts";
import { QueryPage, QuerySection } from "#/widgets/page-state/index.ts";
import { SettingsPageFrame } from "#/widgets/settings-nav/index.ts";

function SkillsTable({ skills, organizationName }: { skills: readonly CatalogSkill[]; organizationName: string }) {
  const t = useTranslations("settings.skills");
  const caption = t("caption", { organization: organizationName });
  return (
    <Table scrollLabel={caption}>
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{t("columns.name")}</TableHead>
          <TableHead>{t("columns.source")}</TableHead>
          <TableHead>{t("columns.agents")}</TableHead>
          <TableHead>{t("columns.status")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {skills.map((skill) => (
          <TableRow key={skill.name}>
            <TableHead scope="row" className="font-normal whitespace-normal">
              <span className="flex flex-col gap-0.5">
                <span className="font-mono text-[12.5px] font-medium">{skill.name}</span>
                <span className="text-xs text-muted-foreground">{skill.description}</span>
              </span>
            </TableHead>
            <TableCell>{skill.source === "core" ? t("sourceCore") : t("sourceModule")}</TableCell>
            <TableCell className="whitespace-normal">
              <ul className="flex flex-col gap-0.5">
                {skill.agents.map((agent) => (
                  <li key={agent.key}>{agent.enabled ? agent.name : t("agentOff", { agent: agent.name })}</li>
                ))}
              </ul>
            </TableCell>
            <TableCell>
              <StatusPill tone={skill.active ? "emerald" : "neutral"}>{skill.active ? t("active") : t("inactive")}</StatusPill>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SettingsSkills({ context }: { context: AccessContext }) {
  const t = useTranslations("settings.skills");
  const online = useOnlineStatus();
  const { organization, permissions } = context;
  const allowed = permissions.includes("core.agent-settings.read");
  const catalog = useAgentCatalog(organization.id, { enabled: allowed });
  return (
    <SettingsPageFrame
      organizationId={organization.id}
      allowed={allowed}
      header={<PageHeader eyebrow={t("eyebrow", { organization: organization.name })} title={t("title")} description={t("description")} />}
    >
      <div className="flex flex-col gap-5">
        {online ? null : <OfflineNotice />}
        <Alert>
          <AlertDescription className="flex flex-col gap-2">
            <span>{t("limit")}</span>
            <Button variant="outline" size="sm" className="self-start" asChild>
              <RouteLink to={{ id: "settings", organizationId: organization.id, section: "agents" }}>{t("agentsLink")}</RouteLink>
            </Button>
          </AlertDescription>
        </Alert>
        <QuerySection query={catalog} loadingLabel={t("loading")}>
          {(data) => {
            const skills = skillsOfCatalog(data);
            return skills.length === 0 ? (
              <EmptyState frame="plain" headingLevel={2} icon="sparkles" title={t("emptyTitle")} description={t("emptyDescription")} />
            ) : (
              <SkillsTable skills={skills} organizationName={organization.name} />
            );
          }}
        </QuerySection>
      </div>
    </SettingsPageFrame>
  );
}

/**
 * `/o/:organizationId/settings/skills` (core.agent-settings.read): the Agent Skills of the
 * organization's agents (decision 0029), read only. Skills ship with the code of the platform and
 * of the installed modules, so the page lists them and says an organization cannot create one.
 */
export function SettingsSkillsView() {
  const t = useTranslations("settings.skills");
  const node = useCurrentNode();
  const context = useAccessContext(node === null ? null : { organizationId: node.organizationId });
  return (
    <QueryPage query={context} loadingLabel={t("loading")}>
      {(data) => <SettingsSkills context={data} />}
    </QueryPage>
  );
}
