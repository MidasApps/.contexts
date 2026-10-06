"use client";

import { MicIcon } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "#/shared/lib/cn.ts";
import { Button } from "#/shared/ui/atoms/Button/Button.tsx";

export type SpeechInputProps = Omit<ComponentProps<typeof Button>, "children" | "aria-label" | "aria-pressed"> & {
  /** Recording now: the button reads as pressed and shows a recording mark. */
  recording: boolean;
  /** Name of the control; say what a press does ("Segurar para falar"). */
  label: string;
};

/**
 * AI Elements `speech-input`, presentational: upstream transcribes with the browser's Web
 * Speech API (audio leaves through the browser vendor); here audio goes to `/v1/voice`
 * (decision 0034), so the recorder lives in the voice feature and this is only its button.
 */
export function SpeechInput({
  recording,
  label,
  variant = "ghost",
  size = "icon-sm",
  className,
  ...props
}: SpeechInputProps) {
  return (
    <Button
      data-slot="speech-input"
      data-recording={recording}
      variant={variant}
      size={size}
      aria-label={label}
      aria-pressed={recording}
      title={label}
      className={cn(
        "relative",
        recording && "bg-destructive/14 text-destructive-text hover:bg-destructive/14",
        className,
      )}
      {...props}
    >
      <MicIcon aria-hidden="true" />
      {recording ? (
        <span
          aria-hidden="true"
          className="absolute top-1 end-1 size-1.5 animate-pulse rounded-full bg-destructive motion-reduce:animate-none"
        />
      ) : null}
    </Button>
  );
}
