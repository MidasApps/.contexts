"use client";

import type { CustomAgentOptions, CustomSkill } from "@core/contracts";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { useCustomAgentOptions } from "#/entities/custom-agent/index.ts";
import { useCustomSkills } from "#/entities/custom-skill/index.ts";
import { CustomSkillEditorDialog, DeleteCustomSkillDialog, ToggleCustomSkillDialog } from "#/features/custom-skill-editor/index.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Icon } from "#/shared/ui/atoms/Icon/Icon.tsx";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "#/shared/ui/atoms/Table/Table.tsx";
import { EmptyState } from "#/shared/ui/molecules/EmptyState/EmptyState.tsx";
import { SectionCard } from "#/shared/ui/molecules/SectionCard/SectionCard.tsx";
import { StatusPill } from "#/shared/ui/molecules/StatusPill/StatusPill.tsx";
import { QuerySection } from "#/widgets/page-state/index.ts";

type RowActions = { edit: (skill: CustomSkill) => void; toggle: (skill: CustomSkill) => void; remove: (skill: CustomSkill) => void };

function SkillActions({ skill, actions }: { skill: CustomSkill; actions: RowActions }) {
  const t = useTranslations("settings.skills.custom.actions");
  const { name } = skill;
  return (
    <span className="flex flex-wrap gap-1.5">
      <Button variant="outline" size="sm" onClick={() => actions.edit(skill)} aria-label={t("editNamed", { name })}>
        {t("edit")}
      </Button>
      <Button variant="outline" size="sm" onClick={() => actions.toggle(skill)} aria-label={t(skill.enabled ? "disableNamed" : "enableNamed", { name })}>
        {t(skill.enabled ? "disable" : "enable")}
      </Button>
      <Button variant="outline" size="sm" onClick={() => actions.remove(skill)} aria-label={t("deleteNamed", { name })}>
        {t("delete")}
      </Button>
    </span>
  );
}

function OwnSkillsTable({ skills, organizationName, actions }: { skills: readonly CustomSkill[]; organizationName: string; actions: RowActions | null }) {
  const t = useTranslations("settings.skills.custom");
  const caption = t("caption", { organization: organizationName });
  return (
    <Table scrollLabel={caption}>
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>{t("columns.name")}</TableHead>
          <TableHead>{t("columns.status")}</TableHead>
          {actions === null ? null : <TableHead>{t("columns.actions")}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {skills.map((skill) => (
          <TableRow key={skill.id}>
            <TableHead scope="row" className="font-normal whitespace-normal">
              <span className="flex flex-col gap-0.5">
                <span className="font-mono text-[12.5px] font-medium">{skill.name}</span>
                <span className="text-xs text-muted-foreground">{skill.description}</span>
              </span>
            </TableHead>
            <TableCell>
              <StatusPill tone={skill.enabled ? "emerald" : "neutral"}>{skill.enabled ? t("enabled") : t("disabled")}</StatusPill>
            </TableCell>
            {actions === null ? null : (
              <TableCell>
                <SkillActions skill={skill} actions={actions} />
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

type SectionProps = { organizationId: string; organizationName: string; canUpdate: boolean; options: CustomAgentOptions };

function OwnSkills({ organizationId, organizationName, canUpdate, options }: SectionProps) {
  const t = useTranslations("settings.skills.custom");
  const online = useOnlineStatus();
  const skills = useCustomSkills(organizationId);
  const [editor, setEditor] = useState<{ skill: CustomSkill | null } | null>(null);
  const [toggling, setToggling] = useState<CustomSkill | null>(null);
  const [removing, setRemoving] = useState<CustomSkill | null>(null);
  const writable = canUpdate && online;
  const capReached = options.usage.skills >= options.limits.maxSkills;
  const actions: RowActions | null = writable ? { edit: (skill) => setEditor({ skill }), toggle: setToggling, remove: setRemoving } : null;
  const create = (): void => setEditor({ skill: null });
  return (
    <SectionCard
      title={t("title")}
      description={t("description")}
      actions={
        canUpdate ? (
          <Button onClick={create} disabled={!online || capReached}>
            <Icon name="plus" />
            {t("create")}
          </Button>
        ) : undefined
      }
    >
      <p className="text-sm text-muted-foreground">
        {t("usage", { used: options.usage.skills, maximum: options.limits.maxSkills })} {capReached ? t("capReached") : null} {canUpdate ? null : t("readOnly")}
      </p>
      <QuerySection query={skills} loadingLabel={t("loading")}>
        {(data) =>
          data.length === 0 ? (
            <EmptyState frame="plain" headingLevel={3} icon="sparkles" title={t("emptyTitle")} description={canUpdate ? t("emptyDescription") : t("emptyDescriptionNoPermission")} />
          ) : (
            <OwnSkillsTable skills={data} organizationName={organizationName} actions={actions} />
          )
        }
      </QuerySection>
      {canUpdate ? (
        <>
          <CustomSkillEditorDialog organizationId={organizationId} open={editor !== null} skill={editor?.skill ?? null} maxInstructionChars={options.limits.maxInstructionChars} onOpenChange={(open) => !open && setEditor(null)} />
          <ToggleCustomSkillDialog organizationId={organizationId} skill={toggling} onOpenChange={(open) => !open && setToggling(null)} />
          <DeleteCustomSkillDialog organizationId={organizationId} skill={removing} onOpenChange={(open) => !open && setRemoving(null)} />
        </>
      ) : null}
    </SectionCard>
  );
}

/**
 * The organization's own skills (decision 0046): list, create, edit, enable or disable and delete.
 * Writing needs core.agent-settings.update; a reader sees the list only. The options give the
 * plan's limits, so the section waits for them.
 */
export function OrganizationSkills(props: Omit<SectionProps, "options">) {
  const t = useTranslations("settings.skills.custom");
  const options = useCustomAgentOptions(props.organizationId);
  return (
    <QuerySection query={options} loadingLabel={t("loading")}>
      {(data) => <OwnSkills {...props} options={data} />}
    </QuerySection>
  );
}
