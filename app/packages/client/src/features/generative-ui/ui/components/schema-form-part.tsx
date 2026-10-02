"use client";

import type { SchemaFormProps } from "@core/contracts";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { useCommandLabel } from "#/shared/lib/labels/use-catalog-labels.ts";
import { SchemaForm } from "#/shared/ui/organisms/SchemaForm/SchemaForm.tsx";
import type { SchemaFormResult } from "#/shared/ui/organisms/SchemaForm/server-errors.ts";
import { useGenerativeUi } from "../../model/generative-ui-context.tsx";
import type { GenerativeComponentProps } from "../../model/ui-registry.ts";

/**
 * `schema-form` (SP4 spec §5.2): the form of a command, drawn from its contract with the SP2
 * `SchemaForm`, prefilled with what the agent proposed. Submitting validates with the contract
 * schema and sends the values back to the conversation; the agent then calls the command, which
 * asks for confirmation — the form itself saves nothing. Without the contract on the client
 * (a module that did not register it) the generic tool view is shown. In the history it says
 * whether the next turn sent it, or that it is no longer active, instead of an empty card.
 */
export function SchemaFormPart({
  props,
  toolCallId,
  toolName,
  interactive,
  stale = false,
  answer,
  fallback,
}: GenerativeComponentProps<SchemaFormProps>) {
  const t = useTranslations("chat.ui.form");
  const { findContract, submit, can, defaultCurrency } = useGenerativeUi();
  const commandLabel = useCommandLabel();
  const [submitted, setSubmitted] = useState(false);
  // The command's input is what the form edits; the entity contract is the documented fallback.
  const contract = findContract(props.commandId) ?? findContract(props.contractId);
  if (contract === undefined) return <>{fallback}</>;

  const onSubmit = async (values: unknown): Promise<SchemaFormResult> => {
    await submit(
      {
        kind: "schema-form",
        commandId: props.commandId,
        contractId: props.contractId,
        mode: props.mode,
        values: values as Record<string, unknown>,
      },
      { toolCallId, toolName },
    );
    setSubmitted(true);
    return { ok: true };
  };

  const label = t("label", { command: commandLabel(props.commandId) });
  const answered = answer?.kind === "schema-form" && answer.commandId === props.commandId;
  const note = submitted ? t("submitted") : answered ? t("answered") : stale ? t("inactive") : "";
  const statusClass =
    submitted || answered
      ? "text-body text-emerald-foreground"
      : note === ""
        ? "sr-only"
        : "text-body-sm text-muted-foreground";
  return (
    <section
      data-slot="schema-form-part"
      aria-label={label}
      className="flex flex-col gap-3 rounded-md border border-border bg-card p-4"
    >
      <h3 className="text-body font-medium text-muted-foreground">{label}</h3>
      <p role="status" className={statusClass}>
        {note}
      </p>
      {submitted || answered || !interactive ? null : (
        <SchemaForm
          contract={contract}
          defaultValues={props.initialValues}
          onSubmit={onSubmit}
          can={can}
          defaultCurrency={defaultCurrency}
          submitLabelKey="chat.ui.form.submit"
          successMessageKey="chat.ui.form.submitted"
          aria-label={label}
        />
      )}
    </section>
  );
}
