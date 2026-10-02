"use client";

import { SquareIcon, Volume2Icon } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslations } from "use-intl";
import { AudioPlayer } from "#/shared/ui/ai/audio-player.tsx";
import { MessageAction } from "#/shared/ui/ai/message.tsx";
import { useSpeechPlayback, type SpeechPlaybackSeams } from "../model/use-speech-playback.ts";

export type ReadAloudActionProps = {
  organizationId: string;
  /** The answer's text (markdown as written; the server reads it as text). */
  text: string;
  /** Start reading as soon as this mounts (the thread's "read answers aloud" preference). */
  autoPlay?: boolean | undefined;
  seams?: SpeechPlaybackSeams | undefined;
};

/**
 * "Ouvir resposta" under an assistant message (SP4 spec §4.5): fetches the speech when asked and
 * plays it with the native audio controls (pause, seek, volume — keyboard and screen-reader
 * operable); the message above is its transcript. A second press stops and frees the audio.
 */
export function ReadAloudAction({ organizationId, text, autoPlay = false, seams }: ReadAloudActionProps) {
  const t = useTranslations("chat.voice");
  const { playback, play, stop } = useSpeechPlayback({ organizationId, text, seams });
  const started = useRef(false);

  useEffect(() => {
    if (!autoPlay || started.current) return;
    started.current = true;
    play();
    // `play` is a new function every render; the latch above makes this run once per message.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one automatic start per mount
  }, [autoPlay]);

  const active = playback.status === "loading" || playback.status === "ready";
  return (
    <>
      <MessageAction label={active ? t("stopReading") : t("readAloud")} aria-pressed={active} onClick={active ? stop : play}>
        {active ? <SquareIcon aria-hidden="true" className="fill-current" /> : <Volume2Icon aria-hidden="true" />}
      </MessageAction>
      {playback.status === "ready" ? <AudioPlayer label={t("player")} src={playback.url} autoPlay onEnded={stop} className="basis-full" /> : null}
      <span role="status" className={playback.status === "error" ? "text-xs text-destructive-text" : "sr-only"}>
        {playback.status === "loading" ? t("loadingAudio") : ""}
        {playback.status === "error" ? t(playback.reason === "unavailable" ? "readUnavailable" : "readFailed") : ""}
      </span>
    </>
  );
}
