"use client";

import { adminActivatePromptEndpoint, type PromptAgentId, type PromptVersion } from "@core/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useRef, useState } from "react";
import { useTranslations } from "use-intl";
import { promptVersionKeys } from "#/entities/prompt-version/index.ts";
import { useCallEndpoint } from "#/shared/api/api-context.tsx";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { useConfirmedAction } from "#/shared/lib/errors/use-confirmed-action.ts";
import { useOnlineStatus } from "#/shared/lib/network/use-online-status.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Textarea } from "#/shared/ui/atoms/Textarea/Textarea.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/shared/ui/molecules/Dialog/Dialog.tsx";
import { Field, FieldControl, FieldDescription, FieldError, FieldLabel } from "#/shared/ui/molecules/Field/Field.tsx";
import { OfflineNotice } from "#/shared/ui/molecules/OfflineNotice/OfflineNotice.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { ConfirmDialog } from "#/shared/ui/organisms/ConfirmDialog/ConfirmDialog.tsx";

/** What staff asked for: activate (eval passed) or force (no passing eval; needs a reason). */
export type PromptActivationRequest = { readonly version: PromptVersion; readonly force: boolean };

export type PromptActivationDialogProps = {
  agentId: PromptAgentId;
  agentName: string;
  /** `null` = closed. */
  request: PromptActivationRequest | null;
  /** Version in production now; an older target is worded as a rollback. */
  activeVersion: PromptVersion | undefined;
  onOpenChange: (open: boolean) => void;
};

const MIN_REASON = 1;
const MAX_REASON = 500;

/** Activation is eval-gated (decision 0038): only a version whose eval passed can be activated. */
export const canActivatePrompt = (version: Pick<PromptVersion, "evalVerdict">): boolean =>
  version.evalVerdict === "passed";

/** Activating a version older than the active one is a rollback (a new activation row). */
export const isPromptRollback = (
  version: Pick<PromptVersion, "version">,
  active: Pick<PromptVersion, "version"> | undefined,
): boolean => active !== undefined && version.version < active.version;

const useActivate = (agentId: PromptAgentId) => {
  const callEndpoint = useCallEndpoint();
  const queryClient = useQueryClient();
  return async (version: PromptVersion, forced?: { reason: string }): Promise<void> => {
    try {
      await callEndpoint(adminActivatePromptEndpoint, {
        params: { agentId },
        body: { versionId: version.id, ...(forced === undefined ? {} : { force: true, reason: forced.reason }) },
      });
    } finally {
      void queryClient.invalidateQueries({ queryKey: promptVersionKeys.agent(agentId) });
    }
  };
};

type ForceProps = {
  agentId: PromptAgentId;
  agentName: string;
  version: PromptVersion | null;
  onOpenChange: (open: boolean) => void;
};

function ForceForm({ agentId, agentName, version, onOpenChange }: ForceProps & { version: PromptVersion }) {
  const t = useTranslations("admin.prompts.activation");
  const tCommon = useTranslations("common");
  const activate = useActivate(agentId);
  const describe = useDescribeError();
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | undefined>();
  const [failure, setFailure] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const online = useOnlineStatus();
  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    // Offline it waits with the reason shown, like the plain confirmation.
    if (pending || !online) return;
    const trimmed = reason.trim();
    setFailure(undefined);
    setReasonError(trimmed.length < MIN_REASON ? t("reasonRequired") : undefined);
    if (trimmed.length < MIN_REASON) return void reasonRef.current?.focus();
    setPending(true);
    try {
      await activate(version, { reason: trimmed });
      notify.success(t("forcedDone", { version: version.version, agent: agentName }));
      onOpenChange(false);
    } catch (error: unknown) {
      const described = describe(error);
      setFailure(
        described.requestId === undefined
          ? described.message
          : tCommon("errorState.messageWithReference", { message: described.message, requestId: described.requestId }),
      );
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
      <Field invalid={reasonError !== undefined}>
        <FieldLabel>{t("reason")}</FieldLabel>
        <FieldControl>
          <Textarea
            ref={reasonRef}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            maxLength={MAX_REASON}
            rows={3}
          />
        </FieldControl>
        <FieldDescription>{t("reasonHint")}</FieldDescription>
        <FieldError>{reasonError}</FieldError>
      </Field>
      {online ? null : <OfflineNotice />}
      <DialogFooter>
        <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>
          {tCommon("actions.cancel")}
        </Button>
        <Button type="submit" variant="destructive" pending={pending} disabled={!online}>
          {t("forceConfirm")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Forced activation: skips the eval gate, so it needs a reason, which is kept and audited. */
function ForceActivationDialog({ agentId, agentName, version, onOpenChange }: ForceProps) {
  const t = useTranslations("admin.prompts.activation");
  const returnFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog open={version !== null} onOpenChange={onOpenChange}>
      <DialogContent
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
          <DialogTitle>{t("forceTitle", { version: version?.version ?? 0 })}</DialogTitle>
          <DialogDescription>{t("forceDescription", { agent: agentName })}</DialogDescription>
        </DialogHeader>
        {version === null ? null : (
          <ForceForm
            key={version.id}
            agentId={agentId}
            agentName={agentName}
            version={version}
            onOpenChange={onOpenChange}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Confirms putting a prompt version in production (`POST /v1/admin/agents/{id}/activations`,
 * platform.prompt.manage, audited): a plain confirmation for a version whose eval passed (worded
 * as a rollback for an older version), or the forced path with a required reason. On failure the
 * dialog stays open with the error copy (409 `EVAL_REQUIRED` included) and its reference.
 */
export function PromptActivationDialog({
  agentId,
  agentName,
  request,
  activeVersion,
  onOpenChange,
}: PromptActivationDialogProps) {
  const t = useTranslations("admin.prompts.activation");
  const activate = useActivate(agentId);
  const plain = request !== null && !request.force ? request.version : null;
  const rollback = plain !== null && isPromptRollback(plain, activeVersion);
  const action = useConfirmedAction(
    () => (plain === null ? Promise.resolve() : activate(plain)),
    () =>
      notify.success(
        rollback
          ? t("rollbackDone", { version: plain?.version ?? 0, agent: agentName })
          : t("done", { version: plain?.version ?? 0, agent: agentName }),
      ),
  );
  return (
    <>
      <ConfirmDialog
        open={plain !== null}
        onOpenChange={(open) => {
          if (!open) action.reset();
          onOpenChange(open);
        }}
        title={
          rollback ? t("rollbackTitle", { version: plain?.version ?? 0 }) : t("title", { version: plain?.version ?? 0 })
        }
        description={
          rollback
            ? t("rollbackDescription", { agent: agentName, active: activeVersion?.version ?? 0 })
            : t("description", { agent: agentName })
        }
        confirmLabel={rollback ? t("rollbackConfirm") : t("confirm")}
        destructive={rollback}
        onConfirm={action.confirm}
        error={action.error}
      />
      <ForceActivationDialog
        agentId={agentId}
        agentName={agentName}
        version={request !== null && request.force ? request.version : null}
        onOpenChange={onOpenChange}
      />
    </>
  );
}
