"use client";

import { useId } from "react";
import { useTranslations } from "use-intl";
import { ASSISTANT_AGENT_ID, useChatAgents } from "#/entities/chat-agent/index.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";
import { Label } from "#/shared/ui/atoms/Label/Label.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "#/shared/ui/atoms/Select/Select.tsx";
import { Spinner } from "#/shared/ui/atoms/Spinner/Spinner.tsx";

export type AgentPickerProps = {
  organizationId: string;
  value: string;
  onChange: (agentId: string) => void;
  disabled?: boolean | undefined;
};

/**
 * Which agent answers a new conversation (decision 0046): the assistant or an enabled agent of the
 * organization. The choice is fixed once the conversation exists (the server keeps the agent of a
 * stored conversation). Loading, "only the assistant" and a failed read are said in words; the
 * assistant stays selectable in every state.
 */
export function AgentPicker({ organizationId, value, onChange, disabled = false }: AgentPickerProps) {
  const t = useTranslations("chat.agents");
  const id = useId();
  const hintId = useId();
  const agents = useChatAgents(organizationId);
  const custom = (agents.data ?? []).filter((agent) => agent.id !== ASSISTANT_AGENT_ID);
  const known = value === ASSISTANT_AGENT_ID || custom.some((agent) => agent.id === value);
  const selected = known ? value : ASSISTANT_AGENT_ID;
  const hint = agents.isPending ? t("loading") : agents.isError ? t("error") : custom.length === 0 ? t("onlyAssistant") : undefined;
  return (
    <div data-slot="agent-picker" className="flex min-w-0 items-center gap-2">
      <Label htmlFor={id} className="shrink-0 text-[12.5px] text-muted-foreground">
        {t("label")}
      </Label>
      <Select value={selected} onValueChange={onChange} disabled={disabled || custom.length === 0}>
        <SelectTrigger id={id} size="sm" className="max-w-[14rem] min-w-0" aria-describedby={hint === undefined ? undefined : hintId}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ASSISTANT_AGENT_ID}>{t("assistant")}</SelectItem>
          {custom.map((agent) => (
            <SelectItem key={agent.id} value={agent.id}>
              {agent.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {agents.isPending ? <Spinner decorative className="size-3.5" /> : null}
      <span id={hintId} role="status" className={hint === undefined || agents.isPending ? "sr-only" : "truncate text-[12px] text-muted-foreground"}>
        {hint ?? ""}
      </span>
      {agents.isError ? (
        <Button variant="ghost" size="sm" onClick={() => void agents.refetch()}>
          {t("retry")}
        </Button>
      ) : null}
    </div>
  );
}
