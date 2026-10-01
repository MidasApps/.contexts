"use client";

import { createAddendumVersionEndpoint, type PromptAgentId } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { tenantAddendumKeys } from "#/entities/prompt-version/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

// Limits of `CreatePromptVersionInputSchema`; the server validates again.
const MAX_BODY = 50_000;
const MAX_NOTE = 500;

export type AddendumVersionDialogProps = {
  organizationId: string;
  agentId: PromptAgentId;
  agentName: string;
  /** Text the new version starts from (the active addendum); `""` for the first one. */
  initialBody: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

type FormProps = Omit<AddendumVersionDialogProps, "open" | "agentName">;

function AddendumVersionForm({ organizationId, agentId, initialBody, onOpenChange }: FormProps) {
  const t = useTranslations("settings.agents.instructions.dialog");
  const tCommon = useTranslations("common");
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  const describe = useDescribeError();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState(initialBody);
  const [note, setNote] = useState("");
  const [bodyError, setBodyError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | undefined>();
  const [pending, setPending] = useState(false);

  const validate = (): string | undefined => {
    const text = body.trim();
    if (text === "") return t("bodyRequired");
    if (text.length > MAX_BODY) return t("bodyTooLong", { maximum: MAX_BODY });
    if (initialBody !== "" && text === initialBody.trim()) return t("bodyUnchanged");
    return undefined;
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (pending) return;
    const invalid = validate();
    setBodyError(invalid);
    setFailure(undefined);
    if (invalid !== undefined) return void bodyRef.current?.focus();
    setPending(true);
    try {
      const trimmedNote = note.trim();
      const { data } = await callEndpoint(createAddendumVersionEndpoint, {
        params: { agentId },
        query: { organizationId },
        body: { body, ...(trimmedNote === "" ? {} : { note: trimmedNote }) },
      });
      await queryClient.invalidateQueries({ queryKey: tenantAddendumKeys.agent(organizationId, agentId) });
      notify.success(t("created", { version: data.version }));
      onOpenChange(false);
    } catch (error: unknown) {
      const described = describe(error);
      setFailure(described.requestId === undefined ? described.message : tCommon("errorState.messageWithReference", { message: described.message, requestId: described.requestId }));
    } finally {
      setPending(false);
    }
  };

  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(event) => void submit(event)}>
      {failure === undefined ? null : (
        <p role="alert" className="text-sm font-medium text-destructive-text">
          {failure}
        </p>
      )}
      <Field invalid={bodyError !== undefined}>
        <FieldLabel>{t("body")}</FieldLabel>
        <FieldControl>
          <Textarea ref={bodyRef} value={body} onChange={(event) => setBody(event.target.value)} required rows={10} className="max-h-[50vh] font-mono text-[12.5px]" />
        </FieldControl>
        <FieldDescription>{t("bodyHint")}</FieldDescription>
        <FieldError>{bodyError}</FieldError>
      </Field>
      <Field>
        <FieldLabel>{t("note")}</FieldLabel>
        <FieldControl>
          <Input value={note} onChange={(event) => setNote(event.target.value)} maxLength={MAX_NOTE} />
        </FieldControl>
        <FieldDescription>{t("noteHint")}</FieldDescription>
      </Field>
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
          {tCommon("actions.cancel")}
        </Button>
        <Button type="submit" pending={pending}>
          {t("submit")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Writes a new version of the organization's instructions for an agent
 * (`POST /v1/agents/{agentId}/prompt-addendum/versions`, core.prompt.write). The store is
 * append-only: the text is saved as a new version and changes nothing until it is evaluated and
 * activated.
 */
export function AddendumVersionDialog({ open, onOpenChange, agentName, ...form }: AddendumVersionDialogProps) {
  const t = useTranslations("settings.agents.instructions.dialog");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("title", { agent: agentName })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <AddendumVersionForm {...form} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}
