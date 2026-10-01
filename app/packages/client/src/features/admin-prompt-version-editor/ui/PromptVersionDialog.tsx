"use client";

import { adminCreatePromptVersionEndpoint, type PromptAgentId, type PromptVersion } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState, type FormEvent } from "react";
import { useTranslations } from "use-intl";
import { promptVersionKeys } from "#/entities/prompt-version/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";

const MAX_BODY = 50_000;
const MAX_NOTE = 500;

export type PromptVersionDialogProps = {
  agentId: PromptAgentId;
  /** Display name of the agent. */
  agentName: string;
  /** Text the new version starts from (the active version); `""` for the first version. */
  initialBody: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the written version (the page selects it for the diff). */
  onCreated?: ((version: PromptVersion) => void) | undefined;
};

type FormProps = Omit<PromptVersionDialogProps, "open">;

function PromptVersionForm({ agentId, initialBody, onOpenChange, onCreated }: FormProps) {
  const t = useTranslations("admin.prompts.editor");
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
    if (body.trim() === "") return t("bodyRequired");
    if (body.trim().length > MAX_BODY) return t("bodyTooLong", { maximum: MAX_BODY });
    if (body.trim() === initialBody.trim() && initialBody !== "") return t("bodyUnchanged");
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
      const { data } = await callEndpoint(adminCreatePromptVersionEndpoint, { params: { agentId }, body: { body, ...(trimmedNote === "" ? {} : { note: trimmedNote }) } });
      await queryClient.invalidateQueries({ queryKey: promptVersionKeys.agent(agentId) });
      notify.success(t("created", { version: data.version }));
      onCreated?.(data);
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
          <Textarea ref={bodyRef} value={body} onChange={(event) => setBody(event.target.value)} required rows={12} className="max-h-[50vh] font-mono text-[12.5px]" />
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
 * Writes a new platform prompt version of an agent (`POST /v1/admin/agents/{id}/prompt-versions`,
 * platform.prompt.manage). The store is append-only: the form starts from the active text and
 * saves a new version, which changes nothing in production until it is evaluated and activated.
 */
export function PromptVersionDialog({ open, onOpenChange, ...form }: PromptVersionDialogProps) {
  const t = useTranslations("admin.prompts.editor");
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl"
        onOpenAutoFocus={() => {
          returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          if (returnFocus.current === null || !returnFocus.current.isConnected) return;
          event.preventDefault();
          returnFocus.current.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t("title", { agent: form.agentName })}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        <PromptVersionForm {...form} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}
