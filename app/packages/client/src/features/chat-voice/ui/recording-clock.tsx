"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { MAX_RECORDING_MS } from "../model/push-to-talk.ts";

const MAX_SECONDS = MAX_RECORDING_MS / 1000;
/** Seconds left when the end of the recording is announced (once). */
export const ENDS_SOON_SECONDS = 10;

const clock = (seconds: number): string => `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, "0")}`;

/** Seconds since the recording started, counted by a 1 s tick (no wall clock: tests stay deterministic). */
const useElapsedSeconds = (): number => {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setElapsed((seconds) => Math.min(seconds + 1, MAX_SECONDS)), 1000);
    return () => clearInterval(timer);
  }, []);
  return elapsed;
};

/**
 * Elapsed time of a push-to-talk recording against its 60 s cap ("0:42 / 1:00"), so the
 * automatic stop does not come as a surprise. The ticking clock is hidden from screen readers
 * (a change every second would drown the page); the approaching end is announced once instead.
 * Mounted only while recording, so each recording starts at 0:00.
 */
export function RecordingClock() {
  const t = useTranslations("chat.voice");
  const elapsed = useElapsedSeconds();
  const endsSoon = MAX_SECONDS - elapsed <= ENDS_SOON_SECONDS;
  return (
    <>
      <span aria-hidden="true" data-slot="recording-clock" className={endsSoon ? "font-mono text-[12px] text-amber-foreground tabular-nums" : "font-mono text-[12px] text-muted-foreground tabular-nums"}>
        {`${clock(elapsed)} / ${clock(MAX_SECONDS)}`}
      </span>
      <span role="status" className="sr-only">
        {endsSoon ? t("endsSoon", { seconds: ENDS_SOON_SECONDS }) : ""}
      </span>
    </>
  );
}
