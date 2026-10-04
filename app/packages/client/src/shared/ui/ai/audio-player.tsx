import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";

export type AudioPlayerProps = Omit<ComponentProps<"audio">, "aria-label" | "controls" | "children"> & {
  /** What is playing ("Resposta em áudio"). */
  label: string;
};

/**
 * AI Elements `audio-player` on the native element: upstream builds its controls with
 * `media-chrome` custom elements; the browser's own controls are already keyboard and
 * screen-reader operable, localized and need no dependency. Speech has no caption track here
 * because the text being read is the message right above the player.
 */
export function AudioPlayer({ label, className, ...props }: AudioPlayerProps) {
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- read-aloud of the visible message: the message text is the transcript
    <audio
      data-slot="audio-player"
      controls
      aria-label={label}
      preload="none"
      className={cn("h-9 w-full max-w-sm", className)}
      {...props}
    />
  );
}
