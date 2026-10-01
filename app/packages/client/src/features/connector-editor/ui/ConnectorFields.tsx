"use client";

import type { ConnectorType } from "@core/contracts";
import { useTranslations } from "use-intl";
import { Checkbox } from "#/shared/ui/atoms/Checkbox/Checkbox.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "#/shared/ui/molecules/Field/Field.tsx";
import { AUTH_MODES, CONNECTOR_TYPES, emptyConnectorDraft, splitList, type ConnectorAuth, type ConnectorDraft, type DraftField, type DraftProblems } from "../model/connector-draft.ts";

type FieldsProps = { draft: ConnectorDraft; setDraft: (draft: ConnectorDraft) => void; problems: DraftProblems };

const isConnectorType = (value: string): value is ConnectorType => (CONNECTOR_TYPES as readonly string[]).includes(value);

const useProblem = (problems: DraftProblems) => {
  const t = useTranslations("settings.connectors.editor.errors");
  return (field: DraftField): (string | undefined)[] => [problems[field] === true ? t(field) : undefined];
};

type TextField = "name" | "specUrl" | "url" | "apiKeyHeader";
type ListField = "allowedHosts" | "allowedRelations" | "allow";

function TextInput({ field, draft, setDraft, problems, type = "text" }: FieldsProps & { field: TextField; type?: "text" | "url" }) {
  const t = useTranslations("settings.connectors.editor");
  const problem = useProblem(problems);
  return (
    <Field>
      <FieldLabel>{t(`fields.${field}`)}</FieldLabel>
      <FieldControl>
        <Input type={type} required autoComplete="off" spellCheck={false} value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} />
      </FieldControl>
      <FieldDescription>{t(`hints.${field}`)}</FieldDescription>
      <FieldError errors={problem(field)} />
    </Field>
  );
}

function ListInput({ field, draft, setDraft, problems }: FieldsProps & { field: ListField }) {
  const t = useTranslations("settings.connectors.editor");
  const problem = useProblem(problems);
  return (
    <Field>
      <FieldLabel>{t(`fields.${field}`)}</FieldLabel>
      <FieldControl>
        <Textarea rows={3} spellCheck={false} className="font-mono text-[12.5px]" value={draft[field]} onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} />
      </FieldControl>
      <FieldDescription>{t(`hints.${field}`)}</FieldDescription>
      <FieldError errors={problem(field)} />
    </Field>
  );
}

function TypeSelect({ draft, setDraft, locked }: Pick<FieldsProps, "draft" | "setDraft"> & { locked: boolean }) {
  const t = useTranslations("settings.connectors");
  // Changing the type starts the type-specific fields over; the name and tools stay.
  const change = (value: string): void => {
    if (isConnectorType(value)) setDraft({ ...emptyConnectorDraft(value), name: draft.name, allow: draft.allow, readOnly: draft.readOnly });
  };
  return (
    <Field>
      <FieldLabel>{t("editor.fields.type")}</FieldLabel>
      <Select value={draft.type} onValueChange={change} disabled={locked}>
        <FieldControl>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
        </FieldControl>
        <SelectContent>
          {CONNECTOR_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {t(`types.${type}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{locked ? t("editor.hints.typeLocked") : t(`editor.typeHints.${draft.type}`)}</FieldDescription>
    </Field>
  );
}

function AuthSelect({ draft, setDraft, problems }: FieldsProps) {
  const t = useTranslations("settings.connectors.editor");
  const problem = useProblem(problems);
  const modes = AUTH_MODES[draft.type];
  if (modes.length === 0) return null;
  const change = (value: string): void => {
    const next = modes.find((mode): mode is ConnectorAuth => mode === value);
    if (next !== undefined) setDraft({ ...draft, auth: next });
  };
  return (
    <Field>
      <FieldLabel>{t("fields.auth")}</FieldLabel>
      <Select value={draft.auth} onValueChange={change}>
        <FieldControl>
          <SelectTrigger className="w-full sm:w-72">
            <SelectValue />
          </SelectTrigger>
        </FieldControl>
        <SelectContent>
          {modes.map((mode) => (
            <SelectItem key={mode} value={mode}>
              {t(`auth.${mode}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldDescription>{t("hints.auth")}</FieldDescription>
      <FieldError errors={problem("auth")} />
    </Field>
  );
}

/** Which allowed tools run without approval; every other allowed tool asks the user first. */
function ReadOnlyTools({ draft, setDraft, problems }: FieldsProps) {
  const t = useTranslations("settings.connectors.editor");
  const problem = useProblem(problems);
  const tools = splitList(draft.allow);
  if (tools.length === 0) return null;
  const toggle = (tool: string, checked: boolean): void =>
    setDraft({ ...draft, readOnly: checked ? [...draft.readOnly.filter((name) => name !== tool), tool] : draft.readOnly.filter((name) => name !== tool) });
  return (
    <FieldSet>
      <FieldLegend>{t("fields.readOnly")}</FieldLegend>
      <FieldDescription>{t("hints.readOnly")}</FieldDescription>
      {tools.map((tool) => (
        <Field key={tool} orientation="horizontal">
          <FieldControl>
            <Checkbox checked={draft.readOnly.includes(tool)} onCheckedChange={(checked) => toggle(tool, checked === true)} />
          </FieldControl>
          <FieldLabel className="font-mono text-[12.5px]">{tool}</FieldLabel>
        </Field>
      ))}
      <FieldError errors={problem("readOnly")} />
    </FieldSet>
  );
}

/**
 * Fields of a connector by type (`connector.schema.ts`): where it reaches, how it authenticates
 * and which tools agents may call. The secret is never a field here; it has its own write-only dialog.
 */
export function ConnectorFields({ draft, setDraft, problems, typeLocked }: FieldsProps & { typeLocked: boolean }) {
  const t = useTranslations("settings.connectors.editor");
  const shared = { draft, setDraft, problems };
  const hasHosts = draft.type !== "postgres";
  return (
    <FieldGroup>
      <TextInput field="name" {...shared} />
      <TypeSelect draft={draft} setDraft={setDraft} locked={typeLocked} />
      {draft.type === "openapi" ? <TextInput field="specUrl" type="url" {...shared} /> : null}
      {draft.type === "mcp" || draft.type === "browser" ? <TextInput field="url" type="url" {...shared} /> : null}
      {hasHosts ? <ListInput field="allowedHosts" {...shared} /> : <ListInput field="allowedRelations" {...shared} />}
      <AuthSelect {...shared} />
      {draft.type === "openapi" && draft.auth === "api-key" ? <TextInput field="apiKeyHeader" {...shared} /> : null}
      <ListInput field="allow" {...shared} />
      <p className="text-[13px] text-muted-foreground">{t("toolsLimit")}</p>
      <ReadOnlyTools {...shared} />
    </FieldGroup>
  );
}
