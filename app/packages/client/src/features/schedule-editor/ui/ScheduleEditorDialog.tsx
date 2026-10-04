"use client";

import { type Schedule, ScheduleSlugSchema, type WorkflowCatalogEntry } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { CircleAlertIcon } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useTranslations } from "use-intl";
import { tenantScheduleKeys } from "#/entities/schedule/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { ApiError } from "#/shared/api/api-error.ts";
import { useWorkflowInputLabel, useWorkflowLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { Alert, AlertDescription } from "#/shared/ui/molecules/Alert/Alert.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { useDialogDismissGuard } from "#/shared/ui/molecules/Dialog/dialog-dismiss-guard.tsx";
import { ApiErrorAlert } from "#/shared/ui/molecules/ErrorState/ApiErrorAlert.tsx";
import {
  Field,
  FieldControl,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#/shared/ui/molecules/Field/Field.tsx";
import { TimeZoneSelect } from "#/shared/ui/molecules/TimeZoneSelect/TimeZoneSelect.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { JsonSchemaFields } from "#/shared/ui/organisms/JsonSchemaFields/JsonSchemaFields.tsx";
import {
  type JsonSchemaInput,
  useJsonSchemaInput,
} from "#/shared/ui/organisms/JsonSchemaFields/use-json-schema-input.ts";
import { type CronDraft, cronOfDraft, DEFAULT_CRON_DRAFT, draftOfCron } from "../model/cron-presets.ts";
import { saveSchedule } from "../model/save-schedule.ts";
import { CronFields } from "./CronFields.tsx";
import { NextFires } from "./NextFires.tsx";

export type ScheduleEditorDialogProps = {
  organizationId: string;
  /** `null` creates a schedule; a schedule edits its cron, time zone and input. */
  schedule: Schedule | null;
  /** The organization's workflow catalog; only the schedulable ones are offered. */
  workflows: readonly WorkflowCatalogEntry[];
  /** Zone a new schedule starts in: the organization's resolved time zone. */
  defaultTimeZone: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type Draft = { workflowId: string | undefined; slug: string; cron: CronDraft; timezone: string };
type Problem = "workflow" | "slug" | "cron" | "timezone";

// Refusals the editor can explain better than the generic copy of the code.
const REFUSALS: Record<string, "slugTaken" | "tooFrequent" | "notSchedulable"> = {
  CONFLICT: "slugTaken",
  SCHEDULE_INTERVAL_TOO_SHORT: "tooFrequent",
  WORKFLOW_NOT_SCHEDULABLE: "notSchedulable",
};

const draftOf = (schedule: Schedule | null, defaultTimeZone: string): Draft =>
  schedule === null
    ? { workflowId: undefined, slug: "", cron: DEFAULT_CRON_DRAFT, timezone: defaultTimeZone }
    : { workflowId: schedule.workflowId, slug: "", cron: draftOfCron(schedule.cron), timezone: schedule.timezone };

const NO_INPUT: Readonly<Record<string, unknown>> = {};
// Any object, edited as JSON text.
const FREE_FORM_INPUT: Readonly<Record<string, unknown>> = { type: "object" };

/**
 * The JSON Schema the input is edited with. Editing a schedule whose workflow left the catalog (or
 * declares no schema) while it still sends input keeps that input editable as JSON instead of
 * silently dropping it.
 */
const inputSchemaOf = (
  workflow: WorkflowCatalogEntry | undefined,
  stored: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | null => {
  if (workflow !== undefined && workflow.inputSchema !== null) return workflow.inputSchema;
  return Object.keys(stored).length === 0 ? null : FREE_FORM_INPUT;
};

const problemsOf = (draft: Draft, creating: boolean): Set<Problem> => {
  const problems = new Set<Problem>();
  if (creating && draft.workflowId === undefined) problems.add("workflow");
  if (creating && !ScheduleSlugSchema.safeParse(draft.slug).success) problems.add("slug");
  if (cronOfDraft(draft.cron) === null) problems.add("cron");
  if (draft.timezone === "") problems.add("timezone");
  return problems;
};

function Refusal({ error }: { error: unknown }) {
  const t = useTranslations("settings.workflows.editor.errors");
  const known = error instanceof ApiError ? REFUSALS[error.code] : undefined;
  if (known === undefined) return <ApiErrorAlert error={error} />;
  return (
    <Alert variant="destructive">
      <CircleAlertIcon aria-hidden="true" />
      <AlertDescription className="text-inherit">{t(known)}</AlertDescription>
    </Alert>
  );
}

function IdentityFields({
  draft,
  setDraft,
  problems,
  schedulable,
}: {
  draft: Draft;
  setDraft: (draft: Draft) => void;
  problems: Set<Problem>;
  schedulable: readonly WorkflowCatalogEntry[];
}) {
  const t = useTranslations("settings.workflows.editor");
  const workflowLabel = useWorkflowLabel();
  const selected = schedulable.find((workflow) => workflow.id === draft.workflowId);
  return (
    <>
      <Field>
        <FieldLabel>{t("workflow")}</FieldLabel>
        <Select value={draft.workflowId ?? ""} onValueChange={(workflowId) => setDraft({ ...draft, workflowId })}>
          <FieldControl>
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t("workflowPlaceholder")} />
            </SelectTrigger>
          </FieldControl>
          <SelectContent>
            {schedulable.map((workflow) => (
              <SelectItem key={workflow.id} value={workflow.id}>
                {workflowLabel.name(workflow.id)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected === undefined || workflowLabel.description(selected.id, selected.description) === "" ? null : (
          <FieldDescription>{workflowLabel.description(selected.id, selected.description)}</FieldDescription>
        )}
        <FieldError errors={[problems.has("workflow") ? t("errors.workflow") : undefined]} />
      </Field>
      <Field>
        <FieldLabel>{t("slug")}</FieldLabel>
        <FieldControl>
          <Input
            required
            maxLength={60}
            autoCapitalize="none"
            spellCheck={false}
            value={draft.slug}
            onChange={(event) => setDraft({ ...draft, slug: event.target.value.trim().toLowerCase() })}
          />
        </FieldControl>
        <FieldDescription>{t("slugHint")}</FieldDescription>
        <FieldError errors={[problems.has("slug") ? t("errors.slug") : undefined]} />
      </Field>
    </>
  );
}

/** The IANA zone the cron is read in. */
function TimeZoneField({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (timezone: string) => void;
  invalid: boolean;
}) {
  const t = useTranslations("settings.workflows.editor");
  return (
    <Field>
      <FieldLabel>{t("timezone")}</FieldLabel>
      <FieldControl>
        <TimeZoneSelect className="w-full" value={value === "" ? undefined : value} onValueChange={onChange} />
      </FieldControl>
      <FieldDescription>{t("timezoneHint")}</FieldDescription>
      <FieldError errors={[invalid ? t("errors.timezone") : undefined]} />
    </Field>
  );
}

/** The input of every fire: fields from the workflow's JSON Schema, or JSON text. */
function ScheduleInputFields({
  workflowId,
  input,
  onEdited,
}: {
  workflowId: string;
  input: JsonSchemaInput;
  onEdited: () => void;
}) {
  const t = useTranslations("settings.workflows.editor");
  const inputLabel = useWorkflowInputLabel();
  return (
    <JsonSchemaFields
      plan={input.plan}
      draft={input.draft}
      onDraftChange={(next) => {
        input.setDraft(next);
        onEdited();
      }}
      problems={input.problems}
      labelOf={(field) => inputLabel(workflowId, field)}
      jsonHint={t("inputHint")}
    />
  );
}

function ScheduleEditorForm({
  organizationId,
  schedule,
  workflows,
  defaultTimeZone,
  onOpenChange,
}: ScheduleEditorDialogProps) {
  const t = useTranslations("settings.workflows.editor");
  const workflowLabel = useWorkflowLabel();
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const creating = schedule === null;
  const [draft, keepDraft] = useState<Draft>(() => draftOf(schedule, defaultTimeZone));
  // Typed work has no draft elsewhere: Esc, an outside click or the X ask before dropping it (decision 0048).
  const [dirty, setDirty] = useState(false);
  useDialogDismissGuard(dirty ? "confirmUnsaved" : "allow");
  const setDraft = (next: Draft): void => {
    keepDraft(next);
    setDirty(true);
  };
  const [problems, setProblems] = useState<Set<Problem>>(new Set());
  const [failure, setFailure] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const stored = schedule?.inputData ?? NO_INPUT;
  const input = useJsonSchemaInput(
    inputSchemaOf(
      workflows.find((workflow) => workflow.id === draft.workflowId),
      stored,
    ),
    stored,
  );

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const found = problemsOf(draft, creating);
    setProblems(found);
    setFailure(null);
    const cron = cronOfDraft(draft.cron);
    const inputData = input.read();
    if (found.size > 0 || cron === null || inputData === null) return;
    setPending(true);
    try {
      const workflow = await saveSchedule({
        callEndpoint,
        organizationId,
        schedule,
        workflowId: draft.workflowId,
        slug: draft.slug,
        cron,
        timezone: draft.timezone,
        inputData,
      });
      await queryClient.invalidateQueries({ queryKey: tenantScheduleKeys.all(organizationId) });
      notify.success(t(creating ? "created" : "updated", { workflow: workflowLabel.name(workflow) }));
      onOpenChange(false);
    } catch (error: unknown) {
      // Field refusals go next to their field; anything else is the form's alert.
      if (!input.applyFailure(error)) setFailure(error);
    } finally {
      setPending(false);
    }
  };

  return (
    <form noValidate onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
      {failure === null ? null : <Refusal error={failure} />}
      <FieldGroup>
        {creating ? (
          <IdentityFields
            draft={draft}
            setDraft={setDraft}
            problems={problems}
            schedulable={workflows.filter((workflow) => workflow.schedulable)}
          />
        ) : null}
        <CronFields
          draft={draft.cron}
          onChange={(cron) => setDraft({ ...draft, cron })}
          invalid={problems.has("cron")}
        />
        <TimeZoneField
          value={draft.timezone}
          onChange={(timezone) => setDraft({ ...draft, timezone })}
          invalid={problems.has("timezone")}
        />
        {draft.workflowId === undefined ? null : (
          <ScheduleInputFields workflowId={draft.workflowId} input={input} onEdited={() => setDirty(true)} />
        )}
      </FieldGroup>
      <NextFires organizationId={organizationId} cron={cronOfDraft(draft.cron)} timezone={draft.timezone} />
      <DialogFooter>
        <Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>
          {t("cancel")}
        </Button>
        <Button type="submit" pending={pending}>
          {t(creating ? "createSubmit" : "editSubmit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Creates or edits a tenant schedule (`POST /v1/schedules`, `PATCH /v1/schedules/{id}`,
 * core.schedule.write): a schedulable workflow, a slug (both fixed after creation: they are the
 * schedule's id), the cron from a preset or a 5-field expression, the IANA zone the cron is read
 * in, and the input of every fire (fields from the workflow's JSON Schema, or JSON text). The server owns the semantics: it refuses an interval
 * under its minimum, a workflow that is not schedulable and a slug in use, each with its own copy
 * here. The next five fires are the server's preview of the draft; this dialog computes none.
 */
export function ScheduleEditorDialog(props: ScheduleEditorDialogProps) {
  const t = useTranslations("settings.workflows.editor");
  const workflowLabel = useWorkflowLabel();
  const { schedule } = props;
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {schedule === null
              ? t("createTitle")
              : t("editTitle", { workflow: workflowLabel.name(schedule.workflowId) })}
          </DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <ScheduleEditorForm key={schedule?.id ?? "new"} {...props} />
      </DialogContent>
    </Dialog>
  );
}
