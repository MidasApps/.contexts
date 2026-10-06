"use client";

import { type Conversation, MAX_TITLE_CHARS } from "@core/contracts";
import { type FormEvent, type KeyboardEvent, useId, useState } from "react";
import { useTranslations } from "use-intl";
import { useDescribeError } from "#/shared/lib/errors/describe-error.ts";
import { Input } from "#/shared/ui/atoms/Input/Input.tsx";
import { notify } from "#/shared/ui/molecules/Toaster/notify.ts";
import { useConversationActions } from "../model/use-conversation-actions.ts";

export type RenameConversationFormProps = {
  organizationId: string;
  conversation: Conversation;
  /** Saved or cancelled: the row shows its title again. */
  onDone: () => void;
};

/**
 * Inline rename of a conversation, in place of its title: Enter saves, Esc cancels. The field
 * takes the focus with the current title selected; a failure is said next to it and keeps what
 * was typed.
 */
export function RenameConversationForm({ organizationId, conversation, onDone }: RenameConversationFormProps) {
  const t = useTranslations("chat.history");
  const describe = useDescribeError();
  const actions = useConversationActions(organizationId);
  const current = conversation.title ?? "";
  const [title, setTitle] = useState(current);
  const [problem, setProblem] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const problemId = useId();
  const hintId = useId();

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = title.trim();
    if (next === "") return setProblem(t("rename.required"));
    if (next === current) return onDone();
    setSaving(true);
    try {
      await actions.rename(conversation, next);
      notify.success(t("rename.done"));
      onDone();
    } catch (error: unknown) {
      setProblem(describe(error).message);
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    onDone();
  };

  return (
    <form onSubmit={(event) => void save(event)} data-slot="rename-conversation" className="flex flex-col gap-1">
      <Input
        // The member just chose "rename": the field is the next thing they act on.
        // eslint-disable-next-line jsx-a11y/no-autofocus -- focus follows the member's own action (menu item → field)
        autoFocus
        onFocus={(event) => event.currentTarget.select()}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={onKeyDown}
        maxLength={MAX_TITLE_CHARS}
        disabled={saving}
        aria-label={t("rename.label", { title: conversation.title ?? t("untitled") })}
        aria-invalid={problem !== undefined || undefined}
        aria-describedby={problem === undefined ? hintId : `${problemId} ${hintId}`}
        className="h-7 text-body"
      />
      <p id={hintId} className="text-caption text-muted-foreground">
        {t("rename.hint")}
      </p>
      {problem === undefined ? null : (
        <p id={problemId} role="alert" className="text-caption text-destructive-text">
          {problem}
        </p>
      )}
    </form>
  );
}
