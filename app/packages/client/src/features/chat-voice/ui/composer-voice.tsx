"use client";

import { AudioLinesIcon, Settings2Icon } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "use-intl";
import { cn } from "#/shared/lib/cn.ts";
import { PromptInputButton } from "#/shared/ui/ai/prompt-input.tsx";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "#/shared/ui/molecules/DropdownMenu/DropdownMenu.tsx";
import { usePushToTalk, type VoiceSeams } from "../model/use-push-to-talk.ts";
import { useRealtimeVoice, type RealtimeConnector } from "../model/use-realtime-voice.ts";
import { PushToTalkButton } from "./push-to-talk-button.tsx";
import { RecordingClock } from "./recording-clock.tsx";

/** Voice preferences of a chat thread (kept by the widget; both start off). */
export type VoicePreferences = {
  /** Send the transcript at once instead of leaving it in the draft for review. */
  readonly autoSend: boolean;
  readonly setAutoSend: (on: boolean) => void;
  /** Read each finished answer aloud. */
  readonly autoRead: boolean;
  readonly setAutoRead: (on: boolean) => void;
  /** The organization's realtime flag is on (the session route may still refuse). */
  readonly realtime: boolean;
};

export type ComposerVoiceProps = {
  organizationId: string;
  voice: VoicePreferences;
  disabled?: boolean | undefined;
  /** The transcript of a recording. */
  onTranscript: (text: string) => void;
  seams?: (Partial<VoiceSeams> & { readonly connectRealtime?: RealtimeConnector | undefined }) | undefined;
};

function RealtimeToggle({ organizationId, disabled, connect }: { organizationId: string; disabled: boolean; connect: RealtimeConnector | undefined }) {
  const t = useTranslations("chat.voice.realtime");
  const realtime = useRealtimeVoice({ organizationId, connect });
  // The session route said no (flag off, fake mode, no provider key): nothing to offer.
  if (realtime.status === "unavailable") return null;
  const live = realtime.status === "live" || realtime.status === "connecting";
  return (
    <>
      <PromptInputButton type="button" label={live ? t("stop") : t("start")} aria-pressed={live} disabled={disabled} onClick={live ? realtime.stop : realtime.start}>
        <AudioLinesIcon aria-hidden="true" />
      </PromptInputButton>
      {/* In words and visible: a failed start must not just put the button back to idle. */}
      <span role="status" data-slot="realtime-status" className={cn("flex items-center gap-1.5 truncate text-xs", realtime.status === "error" ? "text-destructive-text" : "text-muted-foreground")}>
        {realtime.status === "live" ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-destructive motion-safe:animate-pulse" /> : null}
        {realtime.status === "connecting" || realtime.status === "live" || realtime.status === "error" ? t(realtime.status) : ""}
      </span>
    </>
  );
}

/**
 * Voice tools of the composer (SP4 spec §4.5, decision 0034): push-to-talk, its state in words,
 * the voice options (auto-send, read answers aloud) and, with the realtime flag on, the
 * experimental voice conversation. The widget mounts it only when voice is on for the
 * organization, so none of it exists while the flag is off.
 */
export function ComposerVoice({ organizationId, voice, disabled = false, onTranscript, seams }: ComposerVoiceProps) {
  const t = useTranslations("chat.voice");
  // The budget refusal reads like the chat's (status line: `errors.<CODE>`).
  const tErrors = useTranslations("errors");
  const [inserted, setInserted] = useState(false);
  const talk = usePushToTalk({
    organizationId,
    seams,
    onTranscript: (text) => {
      setInserted(true);
      onTranscript(text);
    },
  });
  const start = (): void => {
    setInserted(false);
    talk.start();
  };
  const idle = inserted ? t("inserted") : "";
  const problem = talk.problem === "budget" ? tErrors("BUDGET_EXCEEDED") : talk.problem === undefined ? undefined : t(`problem.${talk.problem}`);
  const status = problem !== undefined ? problem : talk.phase === "idle" ? idle : t(talk.phase);
  return (
    <>
      <PushToTalkButton phase={talk.phase} onStart={start} onStop={talk.stop} onCancel={talk.cancel} disabled={disabled} />
      {voice.realtime ? <RealtimeToggle organizationId={organizationId} disabled={disabled} connect={seams?.connectRealtime} /> : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <PromptInputButton type="button" label={t("options")}>
            <Settings2Icon aria-hidden="true" />
          </PromptInputButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top">
          <DropdownMenuCheckboxItem checked={voice.autoSend} onCheckedChange={(checked) => voice.setAutoSend(checked === true)}>
            {t("autoSend")}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={voice.autoRead} onCheckedChange={(checked) => voice.setAutoRead(checked === true)}>
            {t("autoRead")}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {talk.phase === "recording" ? <RecordingClock /> : null}
      <span role="status" data-slot="voice-status" className={talk.problem === undefined ? "truncate text-xs text-muted-foreground" : "truncate text-xs text-destructive-text"}>
        {status}
      </span>
    </>
  );
}
