"use client";

import { CUSTOM_AGENT_KNOWLEDGE_SCOPES, type CustomAgentKnowledgeScope, type CustomAgentModel, type CustomAgentOptions, type CustomSkill } from "@core/contracts";
import type { ReactNode } from "react";
import { useTranslations } from "use-intl";
import { Badge } from "#/shared/ui/atoms/Badge/Badge.tsx";
import { Checkbox } from "#/shared/ui/atoms/Checkbox/Checkbox.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { Switch } from "#/shared/ui/atoms/Switch/Switch.tsx";
import { useToolLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "#/shared/ui/molecules/Field/Field.tsx";
import { toggleItem, type AgentDraft, type AgentDraftField, type AgentDraftProblems } from "../model/custom-agent-draft.ts";

export type CustomAgentFieldsProps = {
  draft: AgentDraft;
  setDraft: (draft: AgentDraft) => void;
  problems: AgentDraftProblems;
  options: CustomAgentOptions;
  /** The organization's own skills (enabled or not). */
  skills: readonly CustomSkill[];
};

type Shared = Pick<CustomAgentFieldsProps, "draft" | "setDraft" | "problems">;

const useProblem = (problems: AgentDraftProblems, maximum: number) => {
  const t = useTranslations("settings.agents.custom.editor.errors");
  return (field: AgentDraftField): (string | undefined)[] => {
    const kind = problems[field];
    return [kind === undefined ? undefined : t(kind === "tooLong" ? "instructionsTooLong" : field, { maximum })];
  };
};

function TextFields({ draft, setDraft, problems, maximum }: Shared & { maximum: number }) {
  const t = useTranslations("settings.agents.custom.editor");
  const problem = useProblem(problems, maximum);
  return (
    <>
      <Field>
        <FieldLabel>{t("fields.name")}</FieldLabel>
        <FieldControl>
          <Input required autoComplete="off" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
        </FieldControl>
        <FieldError errors={problem("name")} />
      </Field>
      <Field>
        <FieldLabel>{t("fields.description")}</FieldLabel>
        <FieldControl>
          <Textarea required rows={2} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
        </FieldControl>
        <FieldDescription>{t("hints.description")}</FieldDescription>
        <FieldError errors={problem("description")} />
      </Field>
      <Field>
        <FieldLabel>{t("fields.instructions")}</FieldLabel>
        <FieldControl>
          <Textarea required rows={8} className="font-mono text-body-sm" value={draft.instructions} onChange={(event) => setDraft({ ...draft, instructions: event.target.value })} />
        </FieldControl>
        <FieldDescription>
          {t("hints.instructions")} {t("counter", { count: draft.instructions.length, maximum })}
        </FieldDescription>
        <FieldError errors={problem("instructions")} />
      </Field>
    </>
  );
}

function ChoiceSelect<Value extends string>({ label, hint, value, values, labelOf, onChange }: { label: string; hint: string; value: Value; values: readonly Value[]; labelOf: (value: Value) => string; onChange: (value: Value) => void }) {
  const change = (next: string): void => {
    const found = values.find((candidate) => candidate === next);
    if (found !== undefined) onChange(found);
  };
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <Select value={value} onValueChange={change}>
        <FieldControl>
          <SelectTrigger className="w-full sm:w-80">
            <SelectValue />
          </SelectTrigger>
        </FieldControl>
        <SelectContent>
          {values.map((candidate) => (
            <SelectItem key={candidate} value={candidate}>
              {labelOf(candidate)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{hint}</FieldDescription>
    </Field>
  );
}

type Choice = { readonly value: string; readonly label: string; readonly detail?: string; readonly badge?: ReactNode };

/** A multi-select as a group of checkboxes: every option is visible, labelled and keyboard reachable. */
function CheckList({ legend, hint, empty, choices, selected, onChange, errors }: { legend: string; hint: string; empty: string; choices: readonly Choice[]; selected: readonly string[]; onChange: (next: string[]) => void; errors: (string | undefined)[] }) {
  return (
    <FieldSet>
      <FieldLegend>{legend}</FieldLegend>
      <FieldDescription>{hint}</FieldDescription>
      {choices.length === 0 ? <p className="text-sm text-muted-foreground">{empty}</p> : null}
      {choices.map((choice) => (
        <Field key={choice.value} orientation="horizontal" className="justify-start">
          <FieldControl>
            <Checkbox checked={selected.includes(choice.value)} onCheckedChange={(checked) => onChange(toggleItem(selected, choice.value, checked === true))} />
          </FieldControl>
          <FieldLabel className="flex flex-wrap items-center gap-2 font-normal">
            {/* A choice no catalog names shows its id, in mono; a named one reads as text. */}
            <span className={choice.label === choice.value ? "font-mono text-body-sm break-all" : "text-sm"}>{choice.label}</span>
            {choice.badge}
            {choice.detail === undefined ? null : <span className="basis-full text-xs text-muted-foreground">{choice.detail}</span>}
          </FieldLabel>
        </Field>
      ))}
      <FieldError errors={errors} />
    </FieldSet>
  );
}

/** A value the record holds but the options no longer offer (a removed tool, a deleted skill) stays visible so it can be unchecked. */
const withUnknown = (choices: readonly Choice[], selected: readonly string[], detail: string): Choice[] => [
  ...choices,
  ...selected.filter((value) => !choices.some((choice) => choice.value === value)).map((value) => ({ value, label: value, detail })),
];

function Selections({ draft, setDraft, problems, options, skills }: CustomAgentFieldsProps) {
  const t = useTranslations("settings.agents.custom.editor");
  const problem = useProblem(problems, options.limits.maxInstructionChars);
  const toolLabel = useToolLabel();
  const tools = options.tools.map((tool): Choice => ({
    value: tool.id,
    label: toolLabel(tool.id),
    detail: tool.description,
    // The kind is written out: color alone never tells a mutation from a read.
    badge: <Badge variant={tool.kind === "mutation" ? "default" : "secondary"}>{tool.kind === "mutation" ? t("toolMutation") : t("toolRead")}</Badge>,
  }));
  const coreSkills = options.coreSkills.map((skill): Choice => ({ value: skill.name, label: skill.name, detail: skill.description }));
  const ownSkills = skills.map((skill): Choice => ({ value: skill.id, label: skill.name, detail: skill.enabled ? skill.description : t("skillDisabled") }));
  return (
    <>
      <CheckList legend={t("fields.tools")} hint={t("hints.tools")} empty={t("empty.tools")} choices={withUnknown(tools, draft.tools, t("unavailable"))} selected={draft.tools} onChange={(next) => setDraft({ ...draft, tools: next })} errors={problem("tools")} />
      <Field orientation="horizontal">
        <span className="flex flex-col gap-1">
          <FieldLabel>{t("fields.connectorTools")}</FieldLabel>
          <FieldDescription>{t("hints.connectorTools")}</FieldDescription>
        </span>
        <FieldControl>
          <Switch checked={draft.connectorTools} onCheckedChange={(connectorTools) => setDraft({ ...draft, connectorTools })} />
        </FieldControl>
      </Field>
      <CheckList legend={t("fields.coreSkills")} hint={t("hints.coreSkills")} empty={t("empty.coreSkills")} choices={withUnknown(coreSkills, draft.coreSkills, t("unavailable"))} selected={draft.coreSkills} onChange={(next) => setDraft({ ...draft, coreSkills: next })} errors={problem("coreSkills")} />
      <CheckList legend={t("fields.customSkills")} hint={t("hints.customSkills")} empty={t("empty.customSkills")} choices={withUnknown(ownSkills, draft.customSkills, t("unavailable"))} selected={draft.customSkills} onChange={(next) => setDraft({ ...draft, customSkills: next })} errors={problem("customSkills")} />
    </>
  );
}

/**
 * Fields of an organization's agent (`custom-agent.schema.ts`): what it is, its instructions, the
 * model role, the tools and skills it selects, what it may search and whether members can use it.
 */
export function CustomAgentFields(props: CustomAgentFieldsProps) {
  const { draft, setDraft, problems, options } = props;
  const t = useTranslations("settings.agents.custom.editor");
  return (
    <FieldGroup>
      <TextFields draft={draft} setDraft={setDraft} problems={problems} maximum={options.limits.maxInstructionChars} />
      <ChoiceSelect<CustomAgentModel> label={t("fields.model")} hint={t("hints.model")} value={draft.model} values={options.models} labelOf={(model) => t(`models.${model}`)} onChange={(model) => setDraft({ ...draft, model })} />
      <ChoiceSelect<CustomAgentKnowledgeScope>
        label={t("fields.knowledgeScope")}
        hint={t(`knowledgeHints.${draft.knowledgeScope}`)}
        value={draft.knowledgeScope}
        values={CUSTOM_AGENT_KNOWLEDGE_SCOPES}
        labelOf={(scope) => t(`knowledgeScopes.${scope}`)}
        onChange={(knowledgeScope) => setDraft({ ...draft, knowledgeScope })}
      />
      <Selections {...props} />
      <Field orientation="horizontal">
        <span className="flex flex-col gap-1">
          <FieldLabel>{t("fields.enabled")}</FieldLabel>
          <FieldDescription>{t("hints.enabled")}</FieldDescription>
        </span>
        <FieldControl>
          <Switch checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} />
        </FieldControl>
      </Field>
    </FieldGroup>
  );
}
